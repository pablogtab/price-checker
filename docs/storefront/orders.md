# Pedidos por WhatsApp

La gestión `/store` permite guardar el destino de WhatsApp, en formato internacional
con 8–15 dígitos, sin `+`, espacios ni enlaces. El valor inicial está vacío: se debe
configurar el contacto real del negocio antes de usar el cierre. No hay un contacto
comercial predeterminado. Guardar la configuración no envía mensajes.

La tienda crea una solicitud pendiente y abre un mensaje preparado en WhatsApp.
El visitante debe enviarlo en la aplicación externa. El comprobante conserva el
resumen original, permite volver a abrir WhatsApp y copiar el mensaje (incluye un
campo de texto de respaldo). Una nueva compra requiere la acción explícita
**Nueva compra**. No se pide nombre, teléfono ni dirección.

## Contratos

- Privados: `GET /api/storefront/whatsapp`, `PUT /api/storefront/whatsapp`
  con `{number:string}`. Vacío deshabilita nuevas solicitudes.
- Público: `POST /api/public/storefront/orders` con
  `{requestKey:UUIDv4,lines:CartInput[]}`; usa las mismas identidades y composiciones
  que [el carrito](cart.md). Solo identidad, composición y cantidad forman la huella;
  precios, textos u otros campos enviados por el navegador no son autoridad.
- Recuperación pública acotada: `GET /api/public/storefront/orders/requests/:key`
  y `GET /api/public/storefront/orders/receipts/:token`. La clave UUIDv4 y el token
  aleatorio de 256 bits son secretos de acceso a esa solicitud. No hay búsqueda,
  lista ni acceso por número de pedido. Las respuestas tienen `no-store` y
  `Referrer-Policy: no-referrer` en el origen público.
- Respuesta segura: `{number,status:'pending',lines,total,currency:'ARS',message,
  whatsappUrl,receipt}`. Las líneas incluyen las identidades solicitadas y títulos,
  sabores por unidad, precio/subtotal e imagen públicos. Dinero como cadena decimal;
  mensaje/comprobante conservan toda la precisión aceptada por el catálogo.

El navegador guarda la clave y las líneas inmutables **antes** de enviar la solicitud,
serializando la elección de clave entre ventanas mediante Web Locks. Un fallo de
red mantiene esa referencia y el carrito; la recarga consulta primero la solicitud
propia. Los controles quedan congelados mientras la creación sea incierta. Una
respuesta definitiva 400 habilita corregir el carrito; un reintento incierto jamás
recibe una clave nueva automáticamente. Los totales pendientes de recuperación se
ocultan. La reapertura del comprobante no crea otro pedido.

## Persistencia y futura conversión privada

Migración `StorefrontOrders1760097600034`: configuración singleton y
`storefront_orders`. Cada fila contiene `id`, `request_key` único, `fingerprint`,
`request_payload`, `receipt_token` único, `status`, `snapshot`, `fulfillment`,
`destination`, `created_at`.

`snapshot` es el comprobante público inmutable. `fulfillment` es privado, alineado
por índice con las líneas del comprobante: identidad/cantidad/composición de la
línea y `components:[{componentProductId,quantity,variantGroup}]` para promos.
Incluye componentes fijos (`variantGroup:null`). Las selecciones conservan cada
`componentId,unitIndex,variantId` de una sola combinación repetible; `quantity` de
la línea indica cuántas veces repetirla. Las cantidades de componentes no están
multiplicadas por la cantidad de promos. Productos simples tienen `components:[]`.
No hay costos, contacto del cliente ni reservas en estos datos.

Creación adquiere un lock de sesión por clave **antes** de abrir la transacción
REPEATABLE READ. Dentro de ella consulta primero el pedido existente (409 si cambia
el payload), y solo para claves nuevas lee configuración, catálogo, elegibilidad,
precios y composición y guarda el pedido. `storefrontCartSnapshot(body, em)` reutiliza
el mismo EntityManager/transacción que la inserción: no validar en otra transacción
y luego insertar. Reintentos ya confirmados conservan sus importes aunque cambie el
catálogo. Los números legibles pueden tener huecos por rollback de secuencias.

Guardar no modifica stock, ventas, clientes, deuda, cobros o Caja. La futura
conversión debe usar el motor de venta existente y comparar esta composición
histórica con la actual dentro de sus locks; este módulo no registra ventas.

## Límite público y validación local

El listener público permite únicamente los nuevos métodos/rutas exactos. Alta y
carrito exigen JSON y máximo 64 KiB. Alta/recuperación/carrito están limitados a 120
solicitudes por minuto por dirección de socket y 3000 por proceso; los buckets se
vacían cada minuto y están acotados. El API también limita las altas directas.
No se confía en `Forwarded` ni `X-Forwarded-For`. Detrás de un proxy, varios visitantes
pueden compartir el bucket del peer; ajustar el límite y una política explícita de
proxy confiable corresponde a la preparación del despliegue, no inferir IPs de
cabeceras arbitrarias. No es un límite comercial de stock o cantidad.

Pruebas: `tests/api/storefront-orders.mjs`, `storefront-order-abuse.mjs`,
`storefront-boundary.mjs` y `tests/browser/storefront-orders.mjs`. Solo orígenes
locales y PostgreSQL descartable terminado `_test`; el test de rollback instala y
retira un trigger de fallo únicamente allí. Ejecutar las suites REST serialmente
(`--test-concurrency=1`); correr abuso al final o reiniciar los listeners antes de
las siguientes pruebas. Browser requiere `TEST_API_URL`, `PUBLIC_STOREFRONT_URL`,
`E2E_BASE_URL` privado y Playwright/Chrome. `STOREFRONT_FIXTURE_IMAGE` permite usar una
foto real de producto. Se usa un número ficticio reservado y se intercepta toda
navegación externa: no se envía WhatsApp. Reiniciar el listener público tras cada
build para renovar su inventario de archivos.

## Gestión privada y conversión

La gestión usa `/orders` (Pedidos de tienda). La bandeja privada expone
`GET /api/storefront/orders?status=pending|converted|discarded|all&q=GEVA-000001&page=1`
con `{rows,total,page,pageSize:25}`. `GET /api/storefront/orders/:id` devuelve la
solicitud original, su composición de preparación, estado operativo y `sale_id`.
Estas rutas nunca son públicas ni incorporan identidad/contacto inferidos.
`POST /api/storefront/orders/:id/discard` solo admite pendientes y no toca stock,
clientes ni Caja. Guardar el pedido no acredita que se haya enviado WhatsApp.

Preparar abre **Nueva venta**, conserva precios, cantidades, variantes y cada
combinación repetida del pedido. Un borrador ajeno exige elegir expresamente si
conservarlo o descartarlo; cualquier envío incierto se verifica antes. Cancelar
la preparación deja pendiente el pedido. La referencia original es inmutable y
permanece visible mientras se corrigen cantidades, componentes o precios y se
elige cliente/consumidor final y cobro. Un artículo archivado o una composición
modificada bloquea el registro: quitar y agregar de nuevo permite revisar la
selección actual. Un importe histórico con más de dos decimales se muestra exacto
y exige acordar expresamente un precio ARS con hasta dos decimales; no se redondea
ni se altera la precisión del libro de ventas/Caja.

Cada línea de promo del pedido conserva una combinación de sabores y su cantidad:
se revisa una sola combinación y se envía un ítem con esa cantidad, sin crear
controles o ítems por cada copia. Corregir la cantidad mantiene los sabores y el
precio histórico acordado. Distintas combinaciones siguen siendo líneas separadas;
los borradores privados anteriores con sabores distintos por unidad se conservan.

`POST /api/sales` acepta `source_order_id` opcional. Los ítems de una preparación
incluyen `expected_components: [{componentProductId,quantity,variantGroup}]`,
una firma revisada de todos los componentes, incluidos los fijos. Si se omite,
solo se permite la composición histórica del ítem original. Una corrección puede
usar una nueva firma explícita; el servidor la vuelve a comprobar bajo el bloqueo
de catálogo, para detectar cambios entre revisión y POST o peticiones directas.
Se conserva el motor existente de costos actuales, stock negativo, descuento,
cliente, deuda y cobro parcial/total.

La misma transacción de `createSale` adquiere los bloqueos `713450 → 713453`,
bloquea la fila del pedido, valida composición, registra venta/stock/Caja/deuda y
actualiza `status='converted',sale_id`. La migración
`StorefrontConversion1760097600035` agrega FK única y CHECK de consistencia entre
estado/vínculo. El descarte respeta el mismo orden de bloqueos. Un fallo de cobro
o de actualización final revierte también todos los efectos anteriores.

La identidad de origen y firmas forman parte de la huella de idempotencia de la
venta. Un reintento con la clave original recupera la venta antes de revalidar el
pedido/catálogo, incluso tras editar/anular. Otra clave para un pedido convertido
recibe `409 {code:'ORDER_ALREADY_CONVERTED',sale_id,message}`; la interfaz cierra
expresamente esa preparación sin nuevo registro ni envío congelado. Un descarte
concurrente devuelve `ORDER_DISCARDED` y también resuelve la preparación. Editar
o anular una venta no elimina su vínculo ni reabre/reconvierte el pedido.

Validación local adicional: `tests/api/storefront-conversion.mjs` usa
`TEST_API_URL` y `TEST_CONVERSION_DATABASE_URL` (localhost y DB terminada en
`_test`); `tests/browser/storefront-conversion.mjs` y
`tests/browser/storefront-repeat-quantity.mjs` usan `E2E_BASE_URL`,
`E2E_ALLOW_FIXTURES=1` y opcionalmente `PLAYWRIGHT_MODULE`/`CHROME_EXECUTABLE`.
Ejecutar suites con `--test-concurrency=1` y servicios locales dedicados. Los
triggers/ediciones SQL de prueba solo se crean en la DB descartable; no se inicia
worker/scraper ni se envía WhatsApp.
