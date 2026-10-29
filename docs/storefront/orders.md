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
