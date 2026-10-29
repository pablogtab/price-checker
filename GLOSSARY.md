# GevaFit

Gestión de productos, ventas y cobros del negocio.

## Language

**Lista de precios**:
Una selección guardada y con nombre de productos y promos ofrecidos a clientes,
con sus precios de venta actuales. Pueden coexistir varias listas y se comparten
como texto por WhatsApp, sin costos ni márgenes.

**Disponible**:
Un producto o sabor que se puede entregar con stock propio positivo. En una promo,
la disponibilidad depende de poder reunir sus componentes con stock propio.

**Por encargo**:
Un producto o promo habilitado para ofrecer sin stock propio suficiente, con un
plazo estimado de entrega. Los componentes faltantes deben tener stock positivo
informado en alguna oferta vinculada y vigente del proveedor; el stock desconocido
no alcanza para ofrecerlos por encargo.

**Plazo de encargo**:
La estimación de tiempo de entrega comunicada para los encargos, común a todas
las listas de precios. No es una reserva de stock ni una fecha garantizada.

**Variante**:
Una presentación concreta de un producto con un sabor determinado. Dos sabores
distintos son variantes distintas, aunque compartan nombre y presentación.

**Promo**:
Un conjunto de productos vendido como una oferta. Los sabores se eligen para cada
unidad de sus componentes; dos promos iguales pueden tener combinaciones distintas.
_Avoid_: Pack del proveedor

**Carrito**:
Los productos, variantes, promos y cantidades que se están preparando para una
venta todavía no registrada. Agregar productos al carrito no confirma la venta.
_Avoid_: Venta registrada

**Venta registrada**:
Una venta confirmada, con sus productos, cantidades y precios acordados. Puede estar
cobrada por completo, cobrada parcialmente o pendiente de cobro.
_Avoid_: Carrito

**Descuento de venta**:
Una reducción sobre la suma de los precios de los productos y promos de la venta.
Se expresa como un importe en ARS o como un porcentaje y se aplica al conjunto.
_Avoid_: Descuento por producto

**Cobro**:
Dinero recibido del cliente y registrado en una cuenta del negocio. Un cobro puede
cancelar total o parcialmente una o varias ventas del cliente.
_Avoid_: Pago al proveedor

**Aplicación de cobro**:
La parte de un cobro que cancela una venta concreta. Un cobro repartido entre varias
ventas tiene una aplicación para cada una de ellas.

**Anulación de venta**:
Corrección que deja sin efecto una venta registrada, devuelve sus unidades al stock
actual y revierte su deuda y cobros, conservando constancia de la venta anulada.
Las aplicaciones de cobro correspondientes a otras ventas permanecen intactas.
_Avoid_: Borrado de venta

**Ganancia bruta de ventas**:
El importe de las ventas registradas menos el costo de sus productos al momento
de vender, independientemente de si ya se cobraron. No descuenta gastos del
negocio ni impuestos.
_Avoid_: Ganancia neta, Ganancia potencial del stock

**Margen bruto de ventas**:
La ganancia bruta expresada como porcentaje del importe de las mismas ventas.
Solo considera ventas con costo completo conocido, tanto para la ganancia como
para el importe vendido.

**Tienda pública**:
El espacio de GevaFit donde los clientes navegan productos y promos y preparan
sus pedidos para continuar la compra por WhatsApp.

**Catálogo web**:
La selección de productos y promos publicados en la tienda, con sus precios y
stock del negocio. Su selección es independiente de las listas de precios.

**Pedido pendiente**:
La solicitud de compra preparada por un cliente y recibida por el negocio antes
de confirmar una venta. No implica un cobro ni un descuento de stock.
_Avoid_: Venta registrada

**Presentación**:
Un producto en un formato y tamaño determinados, cuyos sabores son variantes
con stock separado y un mismo precio de catálogo.

**Precio de catálogo**:
El precio de venta común a todos los sabores de una presentación, utilizado en
la tienda, listas y nuevas ventas. No sustituye los importes históricos ni un
precio acordado específicamente en una venta.

**Categoría de tienda**:
Una agrupación comercial propia para organizar el catálogo web. Un producto
puede pertenecer a varias, independientemente de los rubros del proveedor.
