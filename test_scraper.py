import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scraper import CatalogPage, Client, ScraperError, parse_page, scrape


def catalog(price="USD 11,3198", symbol="USD", extra="", stock="0"):
    # The layout and attribute names match the live Coverweb response.
    return f'''<input id="resultado_ajax_dibujar_grilla_articulos" value="0">
    <input id="hid-cantidad-resultados-busqueda" value="1">
    <input id="hid-numero-pagina-actual" value="1">
    <table id="tabla-articulos-horizontal"><tbody><tr>
    <td></td><td><a class="boton-agregar-articulo" art-id="285391"
    art-nombre="Amino Gold" art-precio="11.3197898825" simbolo-moneda="{symbol}"
    stock-total="{stock}" cod-barra="00606110365642" es-pack="0">Amino Gold</a></td>
    <td>aminogold</td><td>Aminoácido - BCAA</td><td>GOLD NUTRITION</td>
    <td>S: {stock}</td><td>{price} {extra}</td></tr></tbody></table>'''


class ParserTests(unittest.TestCase):
    def test_throttled_request_waits_before_retrying(self):
        from urllib.error import HTTPError
        from unittest.mock import MagicMock
        client = Client({"token": "test", "cookies": []})
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = catalog().encode()
        client.opener.open = MagicMock(side_effect=[HTTPError("https://example.test", 429, "Too many requests", {"Retry-After":"90"}, None), response])
        with patch.object(client, "wait_for_request") as limiter, patch("scraper.time.sleep") as sleep:
            result = client.fetch(1)
        self.assertEqual(result.products[0]["id"], "285391")
        self.assertEqual(limiter.call_count, 2)
        sleep.assert_called_once_with(90)

    def test_rate_limiter_spaces_all_requests(self):
        client = Client({"token": "test", "cookies": []})
        with patch("scraper.time.monotonic", side_effect=[10, 10.5, 13]), patch("scraper.random.uniform", return_value=0.5), patch("scraper.time.sleep") as sleep:
            client.wait_for_request()
            client.wait_for_request()
        sleep.assert_called_once_with(2.0)

    def test_provider_retry_after_is_respected(self):
        from urllib.error import HTTPError
        error = HTTPError("https://example.test", 429, "Too many requests", {"Retry-After": "90"}, None)
        self.assertEqual(Client.retry_delay(error, 0), 90)
        self.assertEqual(Client.retry_delay(error, 2), 120)
        error.headers["Retry-After"] = "3600"
        with self.assertRaisesRegex(ScraperError, "cooldown"):
            Client.retry_delay(error, 0)

    def test_http_date_retry_after_and_invalid_header(self):
        from urllib.error import HTTPError
        from datetime import datetime, timezone, timedelta
        from email.utils import format_datetime
        header = format_datetime(datetime.now(timezone.utc) + timedelta(seconds=120), usegmt=True)
        error = HTTPError("https://example.test", 503, "Unavailable", {"Retry-After": header}, None)
        self.assertGreater(Client.retry_delay(error, 0), 118)
        error.headers["Retry-After"] = "invalid"
        self.assertEqual(Client.retry_delay(error, 1), 10)

    def test_image_url_is_public_and_normalized(self):
        from scraper import image_url
        self.assertEqual(image_url("../imagenes_url/171447.jpg"), "https://app.coverweb.com.ar/imagenes_url/171447.jpg")
        for url in ["", "https://other.test/photo.jpg", "../imagenes_url/a.jpg?t=secret", "../login.php", "../imagenes_url/../login.php"]:
            self.assertIsNone(image_url(url))
        # Fixture id may differ: inject directly on the existing article anchor.
        html = catalog().replace('class="boton-agregar-articulo"', 'class="boton-agregar-articulo" art-url-imagen-principal="../imagenes_url/171447.jpg"')
        self.assertEqual(parse_page(html).products[0]["image_url"], "https://app.coverweb.com.ar/imagenes_url/171447.jpg")

    def test_download_image_is_immutable_and_rejects_html(self):
        import scraper
        from unittest.mock import MagicMock
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)/"photo"
            data = b"\x89PNG\r\n\x1a\nfixture"
            output.write_bytes(data)
            with patch.object(scraper, "Client") as client:
                scraper.download_image("https://app.coverweb.com.ar/imagenes_url/a.png", output)
                client.assert_not_called()
            output.unlink()
            client = MagicMock()
            response = client.opener.open.return_value.__enter__.return_value
            response.url = "https://app.coverweb.com.ar/imagenes_url/a.png"
            response.read.return_value = b"<html>login</html>"
            with patch.object(scraper,"Client",return_value=client):
                with self.assertRaises(ScraperError): scraper.download_image(response.url,output)
            self.assertFalse(output.exists())
            response.read.return_value=data
            with patch.object(scraper,"Client",return_value=client): scraper.download_image(response.url,output)
            self.assertEqual(output.read_bytes(),data)
            client.reset_mock()
            with patch.object(scraper,"Client",return_value=client): scraper.download_image(response.url,output)
            client.opener.open.assert_not_called()

    def test_usd_precision_and_hidden_conversion(self):
        page = parse_page(catalog(extra='<font style="display:none">20.5% Uti.</font><br><font>$ 17.319,28</font>'))
        product = page.products[0]
        self.assertEqual(product["price"], {
            "currency": "USD", "amount": "11.3198", "display": "USD 11,3198",
            "source_amount": "11.3197898825",
        })
        self.assertEqual(product["stock"], "0")
        self.assertEqual(product["barcode"], "00606110365642")

    def test_argentine_separators(self):
        price = parse_page(catalog(price="$ 124.719,22", symbol="$", stock="1.5")).products[0]
        self.assertEqual(price["price"]["amount"], "124719.22")
        self.assertEqual(price["price"]["currency"], "ARS")
        self.assertEqual(price["stock"], "1.5")

    def test_login_page_rejected(self):
        with self.assertRaises(ScraperError):
            parse_page('<form id="form-login"></form>')

    def test_expired_session_redirect_is_classified(self):
        from unittest.mock import MagicMock
        client = Client({"token": "test", "cookies": []})
        response = MagicMock()
        response.url = "https://app.coverweb.com.ar/landing/index.php"
        response.read.return_value = b'<form action="../comprobar_login.php"><input type="password"></form>'
        response.__enter__.return_value = response
        client.opener.open = MagicMock(return_value=response)
        with self.assertRaisesRegex(ScraperError, "session expired"):
            client.check_session()

    def test_unknown_currency_rejected(self):
        with self.assertRaises(ScraperError):
            parse_page(catalog(symbol="EUR"))

    def test_failed_export_keeps_previous_snapshot(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "prices.json"
            output.write_text('{"previous":true}')
            session = Path(folder) / "session.json"
            session.write_text(json.dumps({"token": "test", "cookies": []}))
            incomplete = CatalogPage([{"id": "1"}], 2, 1, 2)
            with patch("scraper.SESSION_FILE", session), patch("scraper.Client.fetch", side_effect=[incomplete, ScraperError("Session expired")]):
                with self.assertRaises(ScraperError):
                    scrape(output, 0)
            self.assertEqual(json.loads(output.read_text()), {"previous": True})

    def test_duplicate_ids_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "prices.json"
            session = Path(folder) / "session.json"
            session.write_text(json.dumps({"token": "test", "cookies": []}))
            duplicate = CatalogPage([{"id": "1"}, {"id": "1"}], 2, 1, 1)
            with patch("scraper.SESSION_FILE", session), patch("scraper.Client.fetch", return_value=duplicate):
                with self.assertRaises(ScraperError):
                    scrape(output, 0)
            self.assertFalse(output.exists())

    def test_nested_stock_tables_are_not_products(self):
        html = catalog().replace('<td>S: 0</td>', '<td>S: 0<table><tbody><tr><td>XS</td><td>S</td></tr><tr><td>0</td><td>0</td></tr></tbody></table></td>')
        self.assertEqual(len(parse_page(html).products), 1)

    def test_site_count_discrepancy_is_recorded(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "prices.json"
            session = Path(folder) / "session.json"
            session.write_text(json.dumps({"token": "test", "cookies": []}))
            page = parse_page(catalog())
            page.total = 2
            with patch("scraper.SESSION_FILE", session), patch("scraper.Client.fetch", return_value=page):
                scrape(output, 0)
            snapshot = json.loads(output.read_text())
            self.assertEqual(snapshot["product_count"], 1)
            self.assertEqual(snapshot["catalog_reported_total"], 2)
            self.assertFalse(snapshot["reported_total_matches_export"])

    def test_disabled_next_link_does_not_add_a_page(self):
        html = catalog() + '''<ul><li class="active"><a class="cambiar-paginacion-articulos" numero-pagina="1">1</a></li>
        <li class="disabled"><a class="cambiar-paginacion-articulos" numero-pagina="2" title="Siguiente">Next</a></li></ul>'''
        self.assertEqual(parse_page(html).last, 1)


if __name__ == "__main__":
    unittest.main()
