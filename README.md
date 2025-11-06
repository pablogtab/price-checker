# Personal price dashboard

A local Angular 21 + NestJS 11 + PostgreSQL 17 app for your own product list and
Disfit / Coverweb supplier prices, own stock, purchases, sales and cash accounts. No user accounts or Sheet sync.

## Start locally

Docker Desktop must be running. From this directory:

```sh
docker compose up -d --build db api
docker compose exec -T api node apps/api/dist/seed.js
docker compose up -d --build web worker
```

Open **http://localhost:4215**. The API is at `http://localhost:3215/api`.
All published ports bind to `127.0.0.1` only. PostgreSQL data persists in the
`price_checker_db` Docker volume. The seed imports the existing JSON snapshot;
running it again updates supplier items without duplicating them or changing your
selling prices. Do not run a seed concurrently with a refresh.

Your product list starts empty. Create products manually or from supplier rows,
then use **Vincular** to select an individual offer and its exact matching x7 kit.
Confirm presentation and flavor before saving a kit. Other pack sizes are displayed
in the supplier catalog but are not treated as single-unit offers.

Costs use a linked x7 kit divided by seven; otherwise they use the individual offer.
Zero stock does not affect this choice. If both offers disappear, the previous cost
is shown as stale. For multiple providers, select the main provider when editing
your product; the schema supports several links, while Disfit is the only adapter
configured in this version. Set your manual USD → ARS rate in **Configuración**.
Margins are gross selling-price margins, without other expenses or taxes.

Product tables start sorted by name and use pagination. Click a sortable column
header to change the order; click it again to reverse the direction. Filters have searchable
checkbox selectors: choices within one filter use OR; different filters use AND.
Your current product list can be matched and imported after you supply it; there is
no file-upload/import interface or speculative automatic matching in this version.

## Supplier refreshes

The worker runs daily at **08:00 America/Argentina/Buenos_Aires** and processes the
**Actualizar precios** button. If started after 08:00, it catches up that day's run.
Requests are spaced at least 2 seconds apart, with an additional random 0.25–0.75
seconds. The scraper honors `Retry-After`, backs off on throttling/server errors,
and stops after three failed attempts. Set `COVERWEB_DELAY` to increase the interval;
values below 2 cannot disable the safety floor. Expect roughly 10–15 minutes for
229 pages, longer if Coverweb asks for a cooldown. Runs are stored in PostgreSQL;
active jobs are deduplicated and interrupted jobs resume after worker restart.

During a refresh, the app shows completed pages, products read, and an approximate
remaining time based on observed page speed. The percentage reserves the final
step for transactional validation/import. Older runs without progress telemetry
show elapsed time and the usual 10–15 minute duration instead.

Failed or incomplete scrapes preserve the last successful catalog. The supplier
reported 2,741 items while returning 2,688 in the original seed. A subsequent live
refresh returned 2,687 across 229 pages. This discrepancy
is recorded as a warning, not treated as an incomplete scrape.

If Coverweb requests a new session, open **Configuración → Renovar sesión aquí**.
The app opens a temporary server-side browser and shows it inside the dashboard.
Click a field in the image, enter text below, and use **Escribir**; you can also use
the image's keyboard controls. Complete any CAPTCHA yourself. When Coverweb
confirms login, click **Guardar sesión**, then request a refresh. The browser closes
after saving, cancellation, or 10 minutes. Passwords stay in memory only and are
neither saved nor logged. Cookies/tokens remain server-side in `.auth/session.json`.
The API mounts `.auth/` writable; the worker mounts it read-only.

The existing interactive local command remains available:

```sh
.venv/bin/python scraper.py login
```

Complete the login and CAPTCHA yourself, then request another refresh in the app.
For npm development, install Chromium once with
`.venv/bin/python -m playwright install chromium`. Docker installs the browser and
its Linux dependencies in the API image automatically.

Useful commands:

```sh
docker compose ps
docker compose logs --tail=30 api worker
docker compose stop
docker compose start
```

Stopping or rebuilding containers preserves the database. Do not use
`docker compose down -v` unless you intend to delete your database.

## Develop outside Docker

```sh
npm ci
docker compose up -d db
npm run seed
npm run dev:api
# In another terminal:
npm run dev:web
# In another terminal:
npm run worker -w apps/api
```

Stop the Docker API/web/worker before using the same local ports and worker locally.
Defaults are frontend 4215, API 3215, and PostgreSQL 5442. `.env.example` documents
Docker port/password overrides. For npm execution, export `DATABASE_URL` when using
a non-default database and `PYTHON` when using a non-default Python environment.
The local worker defaults to `.venv/bin/python`. Existing JSON CLI commands remain
supported:

```sh
.venv/bin/python scraper.py scrape
```

## Verify

```sh
npm run build
npm test
.venv/bin/python -m unittest -v
```

Database integration tests run only against an explicitly supplied disposable
PostgreSQL database whose name ends in `_test`:

```sh
docker compose exec -T db createdb -U price_checker price_checker_test
TEST_DATABASE_URL=postgres://price_checker:local_price_checker@127.0.0.1:5442/price_checker_test npm test
```

The integration test clears data only in that test database. It checks repeatable
catalog imports, linked pricing, missing offers, failed imports, filters, order,
settings persistence, concurrent requests, and expired-session handling.

## API

- `GET /api/health`, `/api/facets`, `/api/catalog`, `/api/products`, `/api/settings`, `/api/refresh-runs`
- `POST /api/products`, `/api/providers/:id/refresh`
- `PUT /api/products/:id`, `/api/products/order`, `/api/products/:id/links`, `/api/settings`
- `DELETE /api/products/:id`, `/api/products/:id/links/:provider`
- `GET /api/supplier-login/status`, `/api/supplier-login/frame`
- `POST /api/supplier-login/start`, `/api/supplier-login/action`, `/api/supplier-login/complete`, `/api/supplier-login/cancel`

Catalog query parameters: `search`, `provider`, `brand`, `category`, `currency`,
`stock=in|out`, `linked=yes|no`, `kind=kit|individual`, `sort=name|price|stock|brand`,
`direction=asc|desc`, `page`, `size` (maximum 100). Price sorting groups currencies;
raw USD and ARS amounts are not compared as if they were the same currency.
Repeat `provider`, `brand`, `category`, `currency`, `stock`, or `linked` to select
multiple values, for example `category=Proteina&category=Creatina`.
Monetary values are decimal strings. Selling prices are ARS; the exchange-rate
setting is `usd_ars` (positive decimal string or null).
Saving an individual + x7 pair requires `matches_confirmed: true` after manually
checking the product, presentation, and flavor. No uncertain matches are automatic.

## Later deployment

Contabo deployment, DNS, HTTPS, and the agreed single reverse-proxy password are
pending local acceptance. Keep this unauthenticated app on local-only ports until
the proxy protection is configured. No server deployment has been performed.

---

# JSON scraper reference

Exports the authenticated Disfit / Coverweb product catalog to `data/disfit-prices.json`.
Includes all catalog pages, out-of-stock items, packs, product IDs, internal codes,
barcodes, category, brand, stock, and final prices in their original ARS or USD currency.
It only requests the catalog; it does not add products to the cart or submit orders.

The initial verified export on 2026-10-10 contains 2,688 products: 2,242 in ARS and
446 in USD, across all 229 pages. Coverweb reports 2,741 results but returns only
2,688 product rows; both counts are recorded in the JSON.

## Run here

The virtual environment and the currently authenticated session have been prepared:

```sh
.venv/bin/python scraper.py scrape
```

The session eventually expires. Renew it with:

```sh
.venv/bin/python scraper.py login
```

Sign in in the browser window and complete any CAPTCHA yourself. The script waits
up to five minutes, saves the authenticated session, and closes that window. Then
run `scrape` again. The password is not stored. Session cookies and tokens are stored
in `.auth/session.json` with restricted file permissions; `.auth/`, `.env`, and generated
data are ignored by Git. The token from an old shared URL is not used for future logins.

## Fresh setup

Python 3.9 or newer:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/playwright install chromium
.venv/bin/python scraper.py login
.venv/bin/python scraper.py scrape
```

## JSON format

```json
{
  "schema_version": 1,
  "provider": "Disfit",
  "source": "https://app.coverweb.com.ar/pages/registrar_pedido_externo.php",
  "started_at": "2026-10-10T14:00:00+00:00",
  "scraped_at": "2026-10-10T14:03:00+00:00",
  "price_type": "final",
  "product_count": 1,
  "catalog_reported_total": 1,
  "pages_scraped": 1,
  "reported_total_matches_export": true,
  "currencies": { "USD": 1 },
  "products": [
    {
      "id": "285391",
      "name": "Amino Gold X 280 Gr. Sabor Grapefruit - GOLD NUTRITION",
      "description": "",
      "internal_code": "aminogold",
      "barcode": "606110365642",
      "category": "Aminoácido - BCAA",
      "brand": "GOLD NUTRITION",
      "stock": "35",
      "is_pack": false,
      "has_variants": false,
      "price": {
        "currency": "USD",
        "amount": "11.3198",
        "display": "USD 11,3198",
        "source_amount": "11.3197898825"
      },
      "last_updated_at_source": "09/10/2026"
    }
  ]
}
```

Amounts and stock quantities are decimal strings to preserve precision. `price.amount`
is the final price displayed in the catalog; `price.source_amount` keeps Coverweb's
unrounded underlying final price. There is no currency conversion. The additional
ARS reference shown underneath some USD prices is not a separate product price.
Blank internal codes and barcodes become `null`. Source update dates retain the
site's `DD/MM/YYYY` format; snapshot timestamps use UTC ISO 8601.

The export reflects the catalog and price list available to the logged-in account.
Variant entries are exported as shown in the catalog; the scraper does not open
each product's size/color selection modal.

## Options and checks

```sh
.venv/bin/python scraper.py scrape --output data/prices.json --delay 0.5
.venv/bin/python -m unittest -v
```

Optional settings can be copied from `.env.example` to `.env`. Requests are sequential
with a 0.25-second pause by default and limited retries for temporary network/server
errors. Existing JSON is replaced atomically only after every reported page has been
read and pagination and unique product IDs have been verified. Coverweb sometimes
renders fewer product rows than its reported result count. The JSON records both
counts and `reported_total_matches_export`; the scraper also prints a notice when
they differ. An expired session, unexpected
currency, or incomplete catalog fails without replacing the previous snapshot.

Run the scrape command whenever you need a refresh. No recurring schedule is configured.

## Google Sheet

The initial snapshot was imported and verified in
[Disfit - Precios de proveedor](https://docs.google.com/spreadsheets/d/1HUpAC-Fe4_1mmPOuSaFln_Qa1IfGuJ2U9jNfvFaTlIs/edit),
in the `Disfit` tab. It has filters, frozen headers, separate ARS/USD currency values,
numeric prices and stock, text identifiers and barcodes, and source update dates.
The first complete catalog scrape took 3 minutes 40 seconds.

The current CLI updates the JSON only. Automatic Google Sheets synchronization and
scheduled refreshes are not configured yet.

## Fast creation from supplier offers

In Catálogo de proveedores, choose Agregar, enter the ARS selling price directly
in the row, then Crear producto (or Enter). The app copies the supplier name, code
and barcode and links that exact offer. Editar detalles opens the complete form
and preserves the selling price already entered. Kits x7 use kit price divided
by seven; other packs require presentation review.

The current 11-item list is preserved in `proposals/current-products.json`, with
review notes and live supplier candidates in `proposals/current-products-review.md`.
These proposals are not imported or linked automatically. Original costs, stock
and markup percentages are reference data, not live supplier costs or inventory.

## Own kits

Mis productos → Armar kit lets you select products and positive whole-unit
quantities, set a kit name and a percentage discount, and edit the composition
later. Each component keeps its supplier links and x7-first unit cost. Kit cost
is the exact sum of component unit costs times quantities; USD conversion uses
the manual exchange rate. Missing costs/rates leave the total unavailable; stale
component costs propagate the stale warning. The kit selling price is the sum of
component selling prices times quantities, reduced by `kit_discount_percent`
(0–100, decimal string), then rounded to the nearest ARS 100, halfway upward.
It recalculates when component prices, quantities or the discount change.
The migration derives equivalent discounts for existing kits to preserve their
current rounded prices. Supplier refreshes do not change retail prices.
Product deletion is prevented while it belongs to a kit.
Own kits currently contain individual products; nested kits are not supported.

## Stock propio

En Dashboard y Mis productos, pulsá el valor de **Stock propio**, ingresá el
stock real y guardá. La corrección reemplaza la cantidad; no crea movimientos
ni requiere notas. Admite cero y cantidades enteras hasta 1.000.000.000.
`PUT /api/products/:id/stock` recibe `{quantity: 3}`.

Los kits muestran únicamente la disponibilidad calculada con sus componentes;
no tienen lápiz ni permiten corregir su stock directamente. Los productos por
sabor se cuentan individualmente. Si falta un recuento, la disponibilidad del
kit permanece sin cargar. Las cajas y barras individuales tienen recuentos separados.
Las actualizaciones del proveedor no modifican tu stock.

## Compras recibidas

La pantalla **Compras** registra proveedor, fecha, nota/comprobante opcional y
filas de tus productos vinculados a ese proveedor. Elegí cada sabor, unidades
recibidas, costo unitario y moneda (ARS/USD). El costo sugerido usa la oferta
vinculada; podés corregirlo según la compra. Un kit x7 recibido corresponde a
7 unidades del producto. Primero cargá el stock real, aunque sea cero, si aparece
“Sin cargar”. Guardar suma todas las filas en una transacción y conserva un
historial de la recepción con importes y cantidades; no cambia precios de venta.
Las últimas 100 compras se muestran con su detalle.

`POST /api/purchases` usa un `request_key` UUID para evitar duplicar una recepción
si se reintenta. `GET /api/purchases` devuelve el historial;
`GET /api/purchases/summary` calcula totales de todas las compras y últimos 30 días,
separados por moneda. El costo histórico de la compra no cambia con el scraper.

## Métricas del Dashboard

Muestra stock a costo del proveedor, stock a precio de venta, ganancia potencial,
unidades, productos sin stock, compras recibidas y sus importes en los últimos
30 días. Cuenta solo productos individuales; las promos no duplican inventario.
Los recuentos o costos faltantes se excluyen y se informa valoración parcial.
El Dashboard muestra ventas de los últimos 30 días, cobros, saldo pendiente de clientes y ganancia con el costo guardado al vender.

For box/pack offers, the link dialog includes Buscar caja / pack and an explicit
selling-units field. Use 1 for a whole box or 16 for individual bars from a 16-bar
box. Confirm the presentation, flavor and units before saving. The box price is
divided by that count; a linked matching x7 offer still takes precedence.

## Kits con sabores a elección

Un kit puede contener una presentación completa, sin fijar un sabor. En **Armar
kit**, elegí la opción “Elegir sabores al salir”; la cantidad corresponde a las
unidades de esa presentación por kit. También podés conservar un sabor fijo.
En la edición de un producto, **Presentación para kits** agrupa sus variantes:
usá exactamente la misma presentación, tamaño y envase; las cajas y las barras
individuales pertenecen a grupos diferentes. No se agrupan nuevas ofertas del
proveedor automáticamente.

Las promos permiten elegir Precio final (por defecto, fijo para todos los sabores)
o Descuento % (se recalcula con los precios de sus componentes). Ambos redondean
al múltiplo de $100 más cercano. La tabla muestra total sin descuento, ganancia y
margen; si hay distintas combinaciones, muestra rangos. La disponibilidad se
calcula con el stock de las variantes. La pantalla de Ventas permite elegir los sabores al vender.

La API de stock acepta `selections` para componentes por presentación:
`[{component_product_id, product_id, quantity}]`, con cantidades por kit cuya
suma debe coincidir con cada componente. Rechaza sabores de otra presentación,
cantidades incompletas y stock insuficiente. Los movimientos guardan los productos
por sabor elegidos. La pantalla de Ventas registra los sabores elegidos y descuenta sus cantidades.

La conversión local revisada (`npx tsx scripts/group-kits.ts`) dejó 35 productos y
3 kits, conservando descuentos, precios, vínculos y stock. Las 36 combinaciones
anteriores están archivadas en la base, conservando historial. El proceso es
transaccional e idempotente y se detiene si cambian las presentaciones/composiciones
o hay descuentos diferentes. Se guardó un respaldo previo en
`data/before-variant-kits.dump`.


## Precio de venta desde la tabla

En Dashboard o Mis productos, pulsá el precio de venta o su lápiz. Escribí el
nuevo importe en ARS y presioná **Guardar** o Enter; **Cancelar** o Escape descarta
el cambio. Admite cero; rechaza importes vacíos, negativos o fuera de rango. Se
actualizan ganancia, margen y precios de los kits que incluyan esa presentación.
El editor selecciona todo el valor al abrirse. Para promos, el selector permite
cambiar entre Precio final y Descuento %; el total sin descuento queda visible.
`PUT /api/products/:id/kit-pricing` recibe `kit_pricing_mode: "final"` y
`selling_price`, o `kit_pricing_mode: "discount"` y `kit_discount_percent`.
El modo y valor quedan persistidos; Precio final no cambia al editar los componentes.
La ruta
`PUT /api/products/:id/selling-price` recibe `{selling_price: "1250"}` y modifica
únicamente ese precio; preserva nombre, vínculos, códigos, stock y composición.

## Fotos guardadas una sola vez

El scraper exporta `image_url` cuando Coverweb informa una foto principal. Después
de importar un catálogo completo, el worker descarga las fotos pendientes una por
vez, con pausas de 2,5–3 segundos, priorizando las ofertas vinculadas a tus productos.
Las actualizaciones de precios tienen prioridad sobre la cola de fotos.

Las fotos se guardan en `data/images`, compartida por el worker y la API, y se
muestran en ambas tablas. Los kits muestran fotos de sus componentes. Una URL
compartida usa un único archivo; los archivos completos no se reemplazan ni se
vuelven a descargar, incluso si cambia la foto anunciada para ese producto. Se
mantienen tras reinicios y la app sirve los archivos locales, sin solicitudes del
navegador a Coverweb. Al mover la app al servidor, copiá `data/images` junto con
la base de datos. Configuración muestra fotos guardadas, pendientes y no disponibles.

Una descarga fallida no afecta el catálogo ni genera un archivo completo. Se
reintenta después de 30 minutos, hasta cinco intentos. Solo se aceptan imágenes
JPEG/PNG/GIF/WebP de hasta 10 MB en las rutas de imágenes de Coverweb, sin tokens
ni parámetros de sesión. Las ofertas sin foto siguen mostrando su información.
La carga inicial de URLs requiere una actualización completa; luego las fotos
aparecen automáticamente mientras se completa la cola en segundo plano.

## Caja y cuentas

En **Caja y cuentas** están Efectivo y Transferencia, ambas en ARS. Cargá el saldo
real inicial de cada cuenta antes de registrar operaciones. El saldo inicial se
puede corregir mientras la cuenta no tenga movimientos. Podés agregar otras
cuentas en ARS o USD.

Registrá ingresos, egresos y transferencias entre cuentas de la misma moneda,
indicando importe, fecha y concepto. El saldo se calcula a partir del saldo
inicial y los movimientos. Los egresos requieren saldo suficiente; las
transferencias quedan registradas en ambas cuentas en una sola operación.

Recibir una compra suma stock. Su pago se registra por separado desde el historial
de **Compras**, con **Registrar pago**. Se admiten pagos parciales y se muestran
los importes pagados y pendientes por moneda. Elegí la cuenta desde la que pagaste;
si su moneda difiere de la factura, indicá también el importe aplicado a la compra.
Registrar un pago actualiza la cuenta y la deuda de forma conjunta y conserva el
stock recibido. Los reintentos de una misma operación no duplican movimientos.


## Ventas y clientes

En **Clientes**, pulsá **Nuevo cliente** para abrir el popup y cargar nombre, teléfono, Instagram y una nota opcional. El nombre es obligatorio;
el teléfono, Instagram y la nota son opcionales. Podés editar esos datos y consultar su cuenta
corriente, con ventas, cobros y saldo pendiente en ARS. El historial muestra las
últimas 100 ventas; el saldo incluye todas.

En **Ventas**, elegí cliente o consumidor final, productos, cantidades y fecha.
**Nuevo cliente** abre el mismo popup; al crearlo queda seleccionado en la venta.
Con un cliente seleccionado, **Editar cliente** permite corregir sus datos sin
perder el borrador de venta. El selector muestra nombre (teléfono / Instagram)
cuando esos datos están cargados.
El precio sugerido se puede corregir para esa venta. Para una promo elegí un sabor
por unidad de sus componentes, agrupados por promo. Por ejemplo, 3 promos x2
muestran 6 selectores; cada promo admite una combinación distinta. Al aumentar
la cantidad se conservan los sabores ya elegidos y las nuevas promos quedan por elegir.
El descuento configurado del kit se calcula con los sabores de cada promo;
el precio final fijo conserva el precio de la promo. El campo **Descuento de venta (%)**
aplica un descuento adicional entre 0 y 100 sobre el precio unitario de esa fila,
redondeado a dos decimales. El subtotal, cobro y ganancia usan el precio descontado.
Se admiten hasta 100 filas finales por venta (cada promo con sabores cuenta como una). Se muestran el stock actual y el que quedaría por producto/sabor,
agrupando todas las filas de la venta.

Por defecto se elige Cobrar ahora, la cuenta Transferencia (si tiene saldo inicial cargado)
y el total de la venta, que acompaña los cambios de productos y cantidades.
Podés corregir el importe para un cobro parcial; Cobrar el total restaura el cálculo automático.
Podés cobrar el total o una parte en una cuenta ARS con saldo inicial cargado, o
registrar la venta en cuenta corriente. Se necesita un cliente para dejar saldo
pendiente. Los cobros posteriores se cargan desde la venta o desde su historial
en Clientes; suman dinero a la cuenta elegida y reducen la deuda sin volver a
descontar stock. Los cobros no pueden superar lo pendiente.

Las ventas permiten stock negativo y avisan antes de registrar y al guardarse.
Las promos muestran disponibilidad mínima de cero; los saldos negativos de sus
sabores siguen visibles. La valoración del Dashboard usa solo unidades positivas
y muestra un aviso por los productos negativos. El stock sin recuento cargado
requiere cargar primero su cantidad real.

Cada venta guarda los nombres, precios y costos de ese momento. Los cambios
posteriores en precios o proveedores no modifican su ganancia histórica. Cuando
falta un costo, el Dashboard indica que esa ganancia es parcial. Stock, venta y
cobro inicial se guardan en una sola transacción; reintentar no duplica registros.

## Servidor e instalación como app

La instancia de Contabo está en https://gevafit.mpsistemas.ar, protegida por
HTTPS y acceso privado de Nginx Proxy Manager. Ver [operación del servidor](deploy/README.md).
La app es instalable desde el navegador; **Configuración → Instalar app** muestra
el botón cuando el navegador lo ofrece o las instrucciones para Android, iOS y Mac.
El manifiesto abre la app como ventana independiente. Las operaciones requieren conexión.

## Diferencias entre actualizaciones

Cada actualización exitosa compara la lista nueva con el catálogo anterior y
conserva su resumen y detalle en la base de datos. El Dashboard muestra la última
comparación y Configuración permite consultar las de las últimas 30 ejecuciones.
El detalle incluye precio anterior, nuevo, diferencia y variación porcentual;
permite buscar por nombre/código/barcode, filtrar subas, bajas y cambios de moneda,
y paginar los resultados. Se compara en la moneda original del proveedor, sin
confundir cambios de cotización manual con cambios de precio. Un cambio de moneda
o un precio anterior cero no tiene porcentaje calculable. Los precios de venta
no se reemplazan. También se cuentan productos nuevos/recuperados, faltantes y
cambios de stock. La primera lista sirve de referencia; las ejecuciones anteriores
a esta funcionalidad no tienen diferencias registradas. Las actualizaciones
fallidas conservan la última lista y no generan una comparación parcial.
