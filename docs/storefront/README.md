# Tienda local y frontera pública

La tienda tiene un frontend y un listener público separados de la gestión. El
listener público es `apps/web/server/public-entry.mjs`; su lista explícita de
rutas es la frontera de acceso. Exponer el puerto de la API o el servidor de
gestión como si fueran la tienda permitiría acceder a datos privados.

## Arranque local reproducible

Desde la raíz del repositorio, con dependencias instaladas (`npm ci`) y PostgreSQL
local disponible, crear una base **descartable** nueva terminada en `_test`.
Estos ejemplos usan el contenedor de desarrollo y sus credenciales locales:

```sh
docker exec price-checker-db-1 createdb -U price_checker storefront_preview_test
npm run build
```

Iniciar cada proceso en una terminal diferente, desde la raíz:

```sh
DATABASE_URL=postgres://price_checker:local_price_checker@127.0.0.1:5442/storefront_preview_test \
IMAGE_ROOT=/tmp/gevafit-storefront-preview-images PORT=3273 \
node apps/api/dist/main.js
```

La API aplica migraciones al arrancar. No iniciar `worker`, scraper ni refrescos
para revisar la tienda. Una base nueva comienza sin selección pública. Conservar
`IMAGE_ROOT` entre reinicios; contiene originales y rendiciones de biblioteca.

```sh
printf '%s\n' '{"/api":{"target":"http://127.0.0.1:3273","secure":false}}' > /tmp/gevafit-preview-proxy.json
cd apps/web
../../node_modules/.bin/ng serve web --host 127.0.0.1 --port 4273 --proxy-config /tmp/gevafit-preview-proxy.json
```

```sh
STOREFRONT_API_URL=http://127.0.0.1:3273 PORT=4373 npm run start:storefront -w apps/web
```

Gestión: `http://127.0.0.1:4273/store`; biblioteca: `/media`; bandeja: `/orders`.
Tienda: `http://127.0.0.1:4373/`. Cargar productos/precios/stock en gestión,
seleccionar expresamente sabores, preparar contenido/fotos/categorías/inicio,
guardar, previsualizar y publicar. Para pruebas de pedidos usar exclusivamente
el número ficticio reservado `12025550123` e interceptar la navegación externa;
no enviar mensajes. Inicializar las cuentas de prueba en Caja antes de convertir
un pedido en venta.

Después de modificar código: reconstruir API y reiniciarla; reconstruir la tienda
con `npm run build:storefront -w apps/web` y **reiniciar el listener público**.
Este captura el inventario de archivos compilados al arrancar. El servidor de
Angular privado recarga sus cambios automáticamente.

## Qué queda publicado

El listener permite páginas de catálogo, ficha y carrito; DTOs públicos de
catálogo/categorías/ficha; rendiciones publicadas; validación de carrito y
creación/recuperación secreta de un pedido propio. Rechaza gestión, borradores,
biblioteca/originales, clientes, ventas, Caja, costos, stock exacto, proveedor y
bandeja/conversión. Los tokens de recuperación son secretos: no publicarlos.
La API interna y el servidor privado permanecen en loopback. Este arranque es
local; no configura autenticación, dominios, TLS ni un proxy de producción.

La publicación valida referencias, pertenencia, archivos y precios positivos
resueltos, incluidos todos los sabores aprobados de cada promo. Un sabor
aprobado temporalmente sin stock no bloquea publicar texto/fotos y conserva su
selección. La lectura pública filtra disponibilidad en vivo; también retira
fichas, destacados y banners sin destinos disponibles. Al reponer reaparecen
sin republicar. Un sabor nuevo continúa fuera hasta seleccionarlo expresamente.

Consultar catálogo/carrito no genera escrituras de negocio. Guardar un pedido
pendiente tampoco reserva ni descuenta stock, crea cliente, deuda o cobro. El
WhatsApp requiere que el visitante envíe su mensaje. Solo registrar la venta en
el flujo privado existente genera efectos de stock, deuda y Caja.

## Verificación local y límites

Pruebas REST: `tests/api/storefront-*.mjs`. Requieren listeners locales y las
variables declaradas al comienzo de cada archivo; ejecutarlas con
`--test-concurrency=1` al compartir el borrador único. Las pruebas con fixtures
requieren una base local descartable. El test integrado
`tests/browser/storefront-final.mjs` necesita `TEST_API_URL`, `E2E_BASE_URL`,
`PUBLIC_STOREFRONT_URL`, `E2E_ALLOW_FIXTURES=1`, `PLAYWRIGHT_MODULE` si Playwright
no está instalado como módulo, y `STOREFRONT_FINAL_PHOTOS` con los archivos
`whey-chocolate-908g.png`, `whey-banana-908g.jpg`, `creatina-300g.jpg`.
Escribe capturas en `STOREFRONT_FINAL_EVIDENCE` (por defecto `/tmp/gevafit-storefront-context`)
y deja fixtures de muestra; correrlo sobre una base nueva sin datos operativos.

Las suites centrales opcionales truncan datos: usar **otra** base descartable
para `TEST_DATABASE_URL`, `TEST_CUSTOMER_DATABASE_URL`, `TEST_REPORT_DATABASE_URL`
y ejecutarlas desde `apps/api` con `--test-concurrency=1`. El fixture original
`data/disfit-prices.json` debe estar disponible; no descargar ni refrescar el
proveedor para obtenerlo durante esta validación.

La evidencia local cubre navegador Chromium, REST y PostgreSQL local. No acredita
publicación en servidor, WhatsApp enviado, dispositivos físicos, autenticación
remota, capacidad productiva o configuración de proxy/TLS. Para publicar GevaFit,
seguir la skill del repositorio y `deploy/README.md` como trabajo separado.
