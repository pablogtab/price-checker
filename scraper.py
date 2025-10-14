"""Read Disfit's Coverweb catalog and export a complete price snapshot."""

import argparse
import fcntl
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import http.cookiejar
import json
import os
from pathlib import Path
import re
import random
from email.utils import parsedate_to_datetime
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

from bs4 import BeautifulSoup
from dotenv import load_dotenv

BASE_URL = "https://app.coverweb.com.ar"
ROOT = Path(__file__).resolve().parent
SESSION_FILE = ROOT / ".auth/session.json"
CATALOG_PATH = "/pages/registrar_pedido_externo.php"
ENDPOINT = BASE_URL + "/pages/ajaxs/registrarpedidoexterno-ajax.php"


class ScraperError(Exception):
    pass


def atomic_json(path, value, private=False):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if private:
        path.parent.chmod(0o700)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         prefix="." + path.name, delete=False) as f:
            temporary = Path(f.name)
            json.dump(value, f, ensure_ascii=False, indent=2, allow_nan=False)
            f.write("\n")
        os.replace(temporary, path)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def number(value, localized=False):
    value = value.strip()
    if localized:
        value = value.replace(".", "").replace(",", ".")
    try:
        result = Decimal(value)
    except InvalidOperation:
        raise ScraperError("Invalid numeric value in catalog.") from None
    if not result.is_finite():
        raise ScraperError("Non-finite numeric value in catalog.")
    return format(result, "f")


@dataclass
class CatalogPage:
    products: list
    total: int
    current: int
    last: int


def image_url(value):
    if not value or not value.strip():
        return None
    url = urllib.parse.urljoin(BASE_URL + CATALOG_PATH, value.strip())
    parsed = urllib.parse.urlsplit(url)
    # Only public image paths; never export session-bearing URLs.
    if (parsed.scheme != "https" or parsed.netloc != "app.coverweb.com.ar"
            or parsed.query or parsed.fragment or not parsed.path.startswith("/imagenes_url/")
            or not re.fullmatch(r"/imagenes_url/[A-Za-z0-9_./-]+", parsed.path)
            or ".." in parsed.path.split("/")):
        return None
    return url


def image_type(data):
    if data.startswith(b"\xff\xd8\xff"): return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"): return "image/png"
    if data[:6] in (b"GIF87a", b"GIF89a"): return "image/gif"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP": return "image/webp"
    raise ScraperError("Unsupported image response.")


def _download_image(url, output):
    output = Path(output)
    # Successful files are immutable: no HTTP request on subsequent invocations.
    if output.exists():
        image_type(output.read_bytes())
        return
    if image_url(url) != url:
        raise ScraperError("Invalid image URL.")
    session = json.loads(SESSION_FILE.read_text(encoding="utf-8")) if SESSION_FILE.exists() else {"token":"", "cookies":[]}
    client = Client(session)
    class ImageRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, request, fp, code, msg, headers, newurl):
            if image_url(newurl) is None: raise ScraperError("Unexpected image redirect.")
            return super().redirect_request(request, fp, code, msg, headers, newurl)
    client.opener.add_handler(ImageRedirect())
    for attempt in range(3):
        client.wait_for_request()
        request = urllib.request.Request(url, headers={"User-Agent":"PriceChecker/1.0"})
        try:
            with client.opener.open(request, timeout=30) as response:
                if image_url(response.url) is None:
                    raise ScraperError("Unexpected image redirect.")
                data = response.read(10 * 1024 * 1024 + 1)
            if len(data) > 10 * 1024 * 1024: raise ScraperError("Image exceeds size limit.")
            image_type(data)
            output.parent.mkdir(parents=True, exist_ok=True)
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(dir=output.parent, prefix=".image-", delete=False) as f:
                    temporary = Path(f.name); f.write(data)
                # No overwrite, even if another process completed the same image.
                try: os.link(temporary, output)
                except FileExistsError: pass
            finally:
                if temporary: temporary.unlink(missing_ok=True)
            return
        except urllib.error.HTTPError as error:
            if error.code not in (429,500,502,503,504) or attempt == 2:
                raise ScraperError("Image HTTP request failed.") from None
            time.sleep(client.retry_delay(error,attempt))
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2: raise ScraperError("Image network request failed.") from None
            time.sleep(5 * (2 ** attempt))


def download_image(url, output):
    output = Path(output)
    if output.exists():
        image_type(output.read_bytes())
        return
    if image_url(url) != url: raise ScraperError("Invalid image URL.")
    output.parent.mkdir(parents=True, exist_ok=True)
    with (output.parent / ("." + output.name + ".lock")).open("a+b") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        _download_image(url, output)


def parse_page(html):
    soup = BeautifulSoup(html, "html.parser")

    def hidden(name):
        tag = soup.find(id=name)
        if tag is None or not tag.has_attr("value"):
            raise ScraperError("Catalog response is missing metadata; session may have expired.")
        return tag["value"]

    if hidden("resultado_ajax_dibujar_grilla_articulos") != "0":
        raise ScraperError("Coverweb rejected the catalog request. Run the login command again.")
    total = int(hidden("hid-cantidad-resultados-busqueda"))
    current = int(hidden("hid-numero-pagina-actual"))
    pages = [int(a["numero-pagina"]) for a in soup.select(".cambiar-paginacion-articulos[numero-pagina]")
             if "disabled" not in a.parent.get("class", [])]
    last = max([current] + pages)
    table = soup.find(id="tabla-articulos-horizontal")
    if table is None:
        raise ScraperError("Catalog table missing; refusing to overwrite the previous snapshot.")
    products = []
    body = table.find("tbody", recursive=False)
    if body is None:
        raise ScraperError("Catalog table body missing.")
    # Some products include nested tables for size/color stock.
    for row in body.find_all("tr", recursive=False):
        cells = row.find_all("td", recursive=False)
        article = row.select_one("a.boton-agregar-articulo[art-id]")
        if len(cells) != 7 or article is None:
            raise ScraperError("Unexpected product row structure.")
        attrs = article.attrs
        symbol = attrs.get("simbolo-moneda", "").strip()
        currency = {"$": "ARS", "ARS": "ARS", "USD": "USD", "U$S": "USD"}.get(symbol)
        if currency is None:
            raise ScraperError("Unknown product currency; refusing to guess.")
        # Only direct text: nested fonts contain hidden margin text and ARS conversions.
        displayed = " ".join(str(t).strip() for t in cells[6].find_all(string=True, recursive=False)).strip()
        match = re.fullmatch(r"(?:USD|U\$S|ARS|\$)\s*([\d.,]+)", displayed)
        if not match:
            raise ScraperError("Unexpected displayed price format.")
        text = lambda index: cells[index].get_text(" ", strip=True)
        name = attrs.get("art-nombre", "").strip()
        if not name:
            raise ScraperError("Product name missing.")
        products.append({
            "id": attrs["art-id"],
            "name": name,
            "description": attrs.get("art-descripcion", ""),
            "image_url": image_url(attrs.get("art-url-imagen-principal", "")),
            "internal_code": text(2) or None,
            "barcode": attrs.get("cod-barra") or None,
            "category": text(3),
            "brand": text(4),
            "stock": number(attrs["stock-total"]),
            "is_pack": attrs.get("es-pack") == "1",
            "has_variants": attrs.get("variacion-articulo") == "1",
            "price": {
                "currency": currency,
                "amount": number(match.group(1), localized=True),
                "display": displayed,
                "source_amount": number(attrs["art-precio"]),
            },
            "last_updated_at_source": attrs.get("ultima-actualizacion") or None,
        })
    if total > 0 and not products:
        raise ScraperError("Catalog returned no products despite a nonzero total.")
    return CatalogPage(products, total, current, last)


def login():
    # The site's normal reCAPTCHA login runs in a visible, isolated browser.
    # The user handles any challenge; passwords are never saved by this script.
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

    print("Sign in to Coverweb in the browser window. Complete any CAPTCHA yourself.", flush=True)
    print("The authenticated session will be saved locally in .auth/session.json.", flush=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        try:
            context = browser.new_context()
            page = context.new_page()
            page.goto(BASE_URL + CATALOG_PATH, wait_until="domcontentloaded")
            try:
                page.locator("#token-logueado").wait_for(state="attached", timeout=300_000)
            except PlaywrightTimeout:
                raise ScraperError("Login timed out. Run the login command again.") from None
            token = page.locator("#token-logueado").input_value()
            if not re.fullmatch(r"[a-f0-9]{32}", token):
                raise ScraperError("Unexpected login token.")
            atomic_json(SESSION_FILE, {"token": token, "cookies": context.cookies(BASE_URL)}, private=True)
            print("Session saved. Run: python scraper.py scrape", flush=True)
        finally:
            browser.close()


class Client:
    def __init__(self, session):
        self.minimum_interval = 2.0
        self.last_request_at = None
        self.token = session["token"]
        jar = http.cookiejar.CookieJar()
        for c in session["cookies"]:
            if c["domain"].lstrip(".") != "app.coverweb.com.ar":
                continue
            expiry = c.get("expires", -1)
            jar.set_cookie(http.cookiejar.Cookie(
                version=0, name=c["name"], value=c["value"], port=None, port_specified=False,
                domain=c["domain"], domain_specified=True, domain_initial_dot=c["domain"].startswith("."),
                path=c.get("path", "/"), path_specified=True, secure=c.get("secure", True),
                expires=int(expiry) if expiry > 0 else None, discard=expiry <= 0,
                comment=None, comment_url=None, rest={}, rfc2109=False,
            ))
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def wait_for_request(self):
        if self.last_request_at is not None:
            interval = self.minimum_interval + random.uniform(0.25, 0.75)
            time.sleep(max(0, interval - (time.monotonic() - self.last_request_at)))
        self.last_request_at = time.monotonic()

    @staticmethod
    def retry_delay(error, attempt):
        fallback = (30 if error.code == 429 else 5) * (2 ** attempt)
        header = error.headers.get("Retry-After") if error.headers else None
        if header:
            try:
                seconds = float(header)
            except ValueError:
                try:
                    seconds = (parsedate_to_datetime(header) - datetime.now(timezone.utc)).total_seconds()
                except (ValueError, TypeError, OverflowError):
                    seconds = 0
            # Do not retry sooner than the provider requests. Long cooldowns abort
            # this run instead of sleeping past the worker's time limit.
            if seconds > 600:
                raise ScraperError("Provider requested a long cooldown. Retry later; previous catalog preserved.")
            fallback = max(fallback, seconds)
        return fallback

    def check_session(self):
        # Coverweb sometimes returns HTTP 500 from AJAX after its session expires.
        # Check the normal catalog redirect before treating that as a server outage.
        try:
            self.wait_for_request()
            with self.opener.open(BASE_URL + CATALOG_PATH + "?t=" + self.token, timeout=45) as response:
                path = urllib.parse.urlsplit(response.url).path
                html = response.read().decode("utf-8")
            if path != CATALOG_PATH and BeautifulSoup(html, "html.parser").select_one('form[action*="comprobar_login"] input[type="password"]'):
                raise ScraperError("Coverweb session expired. Run the login command again.")
        except (urllib.error.URLError, TimeoutError):
            pass

    def fetch(self, page):
        # These are the catalog's existing read-only AJAX parameters.
        payload = urllib.parse.urlencode({
            "funcion": "dibujar_grilla_articulos", "param1": "", "param2": "",
            "param3": str(page), "param4": self.token, "param5": "listado", "param6": "",
        }).encode()
        for attempt in range(3):
            self.wait_for_request()
            request = urllib.request.Request(ENDPOINT, data=payload, headers={
                "User-Agent": "PriceChecker/1.0", "X-Requested-With": "XMLHttpRequest",
                "Referer": BASE_URL + CATALOG_PATH + "?t=" + self.token,
            })
            try:
                with self.opener.open(request, timeout=45) as response:
                    html = response.read().decode("utf-8")
                try:
                    return parse_page(html)
                except ScraperError as error:
                    raise ScraperError(f"Page {page}: {error}") from None
            except urllib.error.HTTPError as e:
                if e.code == 500:
                    self.check_session()
                if e.code not in (429, 500, 502, 503, 504) or attempt == 2:
                    raise ScraperError("Catalog HTTP error " + str(e.code)) from None
                backoff = self.retry_delay(e, attempt)
            except (urllib.error.URLError, TimeoutError):
                if attempt == 2:
                    raise ScraperError("Catalog network request failed after three attempts.") from None
                backoff = 5 * (2 ** attempt)
            time.sleep(backoff)


def scrape(output, delay):
    if not SESSION_FILE.exists():
        raise ScraperError("No authenticated session. Run: python scraper.py login")
    session = json.loads(SESSION_FILE.read_text(encoding="utf-8"))
    client = Client(session)
    if not isinstance(delay, (float, int)) or not 0 <= delay <= 60:
        raise ScraperError("Delay must be between 0 and 60 seconds.")
    client.minimum_interval = max(2.0, delay)
    started = datetime.now(timezone.utc).isoformat()
    first = client.fetch(1)
    products = first.products[:]
    print(f"Page 1/{first.last}: {len(products)}/{first.total} products", flush=True)
    for page in range(2, first.last + 1):
        result = client.fetch(page)
        if result.current != page or result.total != first.total or result.last != first.last:
            raise ScraperError("Catalog pagination or total changed during export. Please retry.")
        products.extend(result.products)
        print(f"Page {page}/{first.last}: {len(products)}/{first.total} products", flush=True)
    if first.current != 1:
        raise ScraperError("Incomplete catalog; previous JSON was preserved.")
    ids = [p["id"] for p in products]
    if len(set(ids)) != len(ids):
        raise ScraperError("Duplicate product IDs across pages; previous JSON was preserved.")
    currencies = dict(sorted(Counter(p["price"]["currency"] for p in products).items()))
    snapshot = {
        "schema_version": 1,
        "provider": "Disfit",
        "source": BASE_URL + CATALOG_PATH,
        "started_at": started,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "price_type": "final",
        "product_count": len(products),
        "catalog_reported_total": first.total,
        "pages_scraped": first.last,
        "reported_total_matches_export": len(products) == first.total,
        "currencies": currencies,
        "products": products,
    }
    atomic_json(output, snapshot)
    print(f"Saved {len(products)} products to {output} ({currencies})", flush=True)
    if len(products) != first.total:
        print(f"Note: Coverweb reports {first.total} results but renders {len(products)} product rows across all {first.last} pages.", flush=True)


def main():
    load_dotenv(ROOT / ".env")
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("login", help="Open a browser for login and save the session")
    export = sub.add_parser("scrape", help="Export every catalog page to JSON")
    export.add_argument("--output", type=Path, default=Path(os.getenv("COVERWEB_OUTPUT", str(ROOT / "data/disfit-prices.json"))))
    export.add_argument("--delay", type=float, default=float(os.getenv("COVERWEB_DELAY", "2")), help="Minimum seconds between requests (floor: 2s, plus random spacing)")
    image = sub.add_parser("image", help="Download an image once to an immutable local cache")
    image.add_argument("--url", required=True)
    image.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "login":
            login()
        elif args.command == "image":
            download_image(args.url, args.output)
        else:
            if args.delay < 0:
                raise ScraperError("Delay must be nonnegative.")
            scrape(args.output, args.delay)
    except (ScraperError, ValueError, KeyError, OSError) as e:
        # Avoid dumping request URLs, cookies or login tokens in a traceback.
        message = str(e) if isinstance(e, ScraperError) else "Invalid configuration or unexpected catalog data."
        print("Error: " + message, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
