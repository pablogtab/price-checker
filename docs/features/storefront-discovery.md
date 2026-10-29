# Tienda pública · definición en curso

Definición de negocio confirmada el 29/10/2026. Autorizado el prototipo visual
local; la implementación funcional y el despliegue requieren su etapa posterior.

## Decisiones confirmadas

- Tienda pública para clientes, administrada desde la aplicación actual.
- Catálogo web independiente de las listas de WhatsApp: selección propia de
  productos y promos, conservando los precios y stock del negocio.
- Finalizar el carrito guarda un pedido pendiente y abre WhatsApp con productos,
  sabores, cantidades y total. El cliente todavía debe enviar el mensaje.
- Crear ese pedido no registra una venta ni descuenta stock. La confirmación
  posterior queda a cargo del negocio.
- Pedidos como invitado, sin cuenta ni contraseña, nombre, teléfono ni datos de
  envío. El cierre consiste en revisar el carrito y continuar por WhatsApp.
  El pedido guardado tendrá un número para identificarlo en el chat.
- Envíos limitados a Córdoba capital. No pedir ubicación ni dirección en la web.
  Costo/fecha se coordinan por WhatsApp. Texto público confirmado en el cierre;
  no se incluye retiro en la primera versión ni cobertura nacional.
- Publicar productos con stock propio y los habilitados manualmente sin stock. No
  mostrar «Por encargo» al cliente. Sin stock propio, exigir internamente stock
  positivo conocido del proveedor; ocultar si informa cero o no se conoce. El
  mensaje público de coordinación de entrega quedó confirmado en el cierre; no confundir esta decisión
  de presentación con una promesa de entrega inmediata.
- Una ficha pública por presentación, con selección de sabor y cantidad. El precio
  común de catálogo y la disponibilidad correspondiente al sabor elegido; no
  duplicar tarjetas por sabor.
- Bandeja privada de pedidos: Pendiente, Convertido en venta y Descartado.
  Abrir/corregir y precargar Nueva venta para revisión. Solo registrar la venta
  afecta stock y, según cobro, Caja. Pendiente no prueba envío del WhatsApp.
- Conservar el carrito en el navegador. Los productos que dejen de ofrecerse se
  quitan silenciosamente, reemplazando la propuesta de avisar por cada eliminación.
  No sustituir sabores; si una combinación de promo deja de ser ofrecible, retirar
  esa línea completa.
- Preparar selección y contenido (fotos, textos y banners), previsualizar y publicar
  explícitamente. Los precios y la visibilidad por stock usan los datos actuales
  del negocio, independientemente del borrador de contenido.
- El carrito usa precios actuales y presenta el total actualizado antes de
  continuar, sin confirmaciones adicionales por cambios de precio. El pedido
  guardado conserva los importes con los que fue generado.
- Títulos, descripciones, marcas y categorías comerciales propios, separados
  del contenido del proveedor. Mantener vínculos a productos y sabores para
  precios, stock y ventas.
- Navegación inicial: inicio con destacados y promos, buscador, filtros de marca
  y categoría, orden por precio y enlaces para compartir cada producto. Categorías
  personalizadas de la tienda: un producto puede estar en varias, con orden
  manual de categorías y productos y sin subcategorías inicialmente.
  Favoritos, reseñas y puntos quedan fuera de la propuesta inicial.
- Si falla la actualización del proveedor, conservar el último catálogo exitoso
  para elegibilidad. Avisar únicamente en la gestión, sin ocultar automáticamente
  por el fallo o antigüedad. Sin stock propio siguen siendo obligatorios la
  habilitación manual y stock positivo conocido en ese catálogo.
- Convertir a venta precarga los precios históricos del pedido; el responsable
  puede corregirlos y elegir cliente y cobro antes de registrar. Marcar el pedido
  convertido solo al registrar correctamente la venta.
- Precio único entre los sabores de cada presentación y entre las combinaciones
  de una misma promo. No usar «Desde» ni rangos ni una tarifa web separada.
  Editar el precio de una presentación actualiza todos sus sabores en GevaFit,
  incluidas listas y nuevas ventas. Conservar ventas históricas y permitir precios
  negociados en una venta. Ante diferencias existentes, pedir elegir el precio
  común antes de publicar, sin deducirlo automáticamente.
- Seleccionar explícitamente sabores actuales para publicación. Los sabores nuevos
  requieren revisión/publicación y no se publican al crearlos en la gestión.
- Biblioteca de imágenes reutilizable, carga múltiple, portada y orden de galería
  por arrastre. Una imagen puede servir en varios productos/banners; quitarla de
  una galería no la elimina de otros lugares donde se usa.
- Sección Tienda en la gestión: varias fotos por producto, portada elegible,
  descripción, categorías, destacados y banners de inicio.
- Las promos requieren elegir el sabor de cada unidad al agregarlas. Otra
  combinación se agrega como una línea distinta; aumentar cantidad repite la
  combinación elegida.
- No limitar cantidades solicitadas por el cliente. Se confirmarán existencias,
  cantidad y entrega por WhatsApp. El stock determina la visibilidad inicial, no
  una reserva ni una garantía de cubrir toda la cantidad pedida. Esta decisión
  reemplaza la propuesta de limitar cantidades por stock propio más proveedor.
- Galería compartida por presentación, con portada y foto específica por sabor
  opcional. Al elegir sabor, usar su foto si existe y la común en caso contrario.

## Referencia visual aportada

https://dribbble.com/shots/27697694-Health-Nutrition-E-Commerce-Mobile-App

Adaptar la dirección a GEVA. Contexto de marca consultado en
`/Users/pablogtab/Documents/dev/personal/gevafit/.agents/design-context.md`:
verde oscuro #11261F, lima #9DFF48 y blanco #FFFFFF, tonos aproximados del logo.
Dirección confirmada: base clara para catálogo y fichas, verde oscuro en cabecera
y banners y lima en acciones y destacados. La variante A fue seleccionada.

### Captura de referencia revisada

El usuario adjuntó la captura del diseño de Dribbble. Se pudo inspeccionar
visualmente: inicio con buscador, banner, categorías horizontales y tarjetas
con fotos; listado/carrito con imagen y controles de cantidad; pantalla adicional
de gift cards. Esta última no agrega gift cards al alcance confirmado.

Variante A seleccionada como base de implementación: banner compacto verde
oscuro con acentos lima, tarjetas claras, jerarquía de foto/precio/sabor y carrito
con controles ± y resumen/acción de WhatsApp fijo al pie. Reducir la cantidad de
contenido promocional antes del catálogo. Aplicar el cierre sin cuentas, ubicación
ni formulario de datos personales ya confirmado.

## Hechos revisados en el proyecto

- Actualmente hay una imagen propia por producto/promo; falta una galería.
- Marca, categoría y descripción provienen del proveedor; hace falta definir
  el contenido comercial propio y su relación con variantes.
- No existe una entidad de pedido público ni bandeja de pedidos.
- Las reglas existentes distinguen disponibilidad propia y por encargo.
- El acceso privado protege hoy toda la gestión/API. La tienda debe exponer
  solamente contenido público sin publicar costos, márgenes ni datos privados.

## Cierre confirmado

- Información pública de entrega: «Envíos en Córdoba capital. Costo y entrega a
  coordinar por WhatsApp». El total de productos no incluye un costo de envío
  calculado. No hay formularios de entrega ni opción de retiro definida para esta
  primera versión.
- Número de WhatsApp administrable desde Tienda. El número real y el dominio público
  se cargarán/definirán antes de desplegar, no se inventan durante la definición.
- La gestión se mantiene privada; el acceso público expone solo información de la
  tienda y permite preparar pedidos. Nunca expone costos, márgenes, movimientos,
  clientes ni Caja. La separación técnica se concretará en la especificación.
- Sin pagos online, cuentas de compradores, reseñas, puntos, favoritos, gift cards
  ni subcategorías en la primera versión.
- Siguiente paso propuesto: prototipo visual móvil y escritorio de inicio, ficha,
  selección de sabores/promos, carrito y edición/publicación en la gestión.
  Todavía no se implementa ni despliega la funcionalidad.

La definición completa y la propuesta de cierre fueron confirmadas por el usuario.
Variante A del prototipo visual elegida el 29/10/2026. Pendiente pulir detalles
y preparar especificación de implementación; todavía sin autorización de despliegue.

## Criterio de textos confirmado durante el prototipo

Usar títulos y acciones directos y funcionales. Evitar slogans y frases de branding
vacías (por ejemplo «Tu próxima elección» o «Tu ritmo»); priorizar Productos, Promos,
Categorías, Carrito y explicaciones concretas del flujo.

La revisión de la variante A incluye incorporar el ícono de WhatsApp y pulir
espaciados, textos, imágenes, controles y adaptación móvil antes de implementar.

## Especificación

La definición se sintetizó en `storefront-spec.md`, con el formato de to-spec.
El usuario confirmó validación por agente en navegador real, escritorio y móvil,
más los contratos REST sobre PostgreSQL descartable. El prototipo no sustituye
la implementación funcional ni esas pruebas.

Especificación publicada: https://github.com/pablogtab/price-checker/issues/22
