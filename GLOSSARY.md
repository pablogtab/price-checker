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
