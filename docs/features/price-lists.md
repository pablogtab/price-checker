# Listas de precios para WhatsApp

Definición acordada con el usuario el 22 de octubre de 2026 mediante
`grill-with-docs`. Especificación publicada en el issue #11 y en
[price-lists-spec.md](price-lists-spec.md). Implementada y validada localmente en
la rama `feat/price-lists`, sin despliegue.

## Objetivo

Generar texto para copiar y pegar en WhatsApp, destinado a clientes. Mostrar
precios de venta y disponibilidad, nunca costos, márgenes ni cantidades de stock.
No enviar mensajes automáticamente.

## Listas y selección

- Varias listas guardadas, cada una con nombre/título editable y selección propia.
- Marcar productos y promos del catálogo propio. Al seleccionar una presentación,
  incluir todos sus sabores actuales, permitiendo desmarcarlos.
- Los sabores nuevos requieren revisión y selección explícita.
- Usar los precios de venta actuales de Mis productos, en ARS.
- El permiso de ofrecer por encargo se configura por producto y es común a las
  listas. El plazo de encargo también es común, editable e inicialmente de 7 días.

## Disponibilidad

- Stock propio positivo: disponible, aunque el proveedor no tenga stock.
- Stock propio cero, negativo o sin cargar: sin disponibilidad propia.
- Para ofrecer sin stock propio, exigir permiso de encargo y stock positivo
  informado en alguna oferta vinculada y vigente del proveedor.
- Puede servir la oferta individual aunque no haya stock del pack, o viceversa;
  la disponibilidad para encargo es independiente de la base del costo.
- Omitir encargos con stock del proveedor cero o desconocido.
- Evaluar con el último catálogo actualizado: no constituye reserva del proveedor.
- Promos disponibles cuando puedan armarse con stock propio. Para encargo, exigir
  permiso en la promo y poder conseguir los componentes faltantes según las reglas
  anteriores; detallar los sabores elegibles.
- Excluir promos que no tengan un único precio de venta.

## Texto y vista previa

- Título editable, fecha de generación y precios finales en ARS.
- Agrupar por marca y nombre, agrupando sabores por presentación; separar sabores
  con distintos precios. Productos sin marca al final del bloque de productos.
- Promos al final, con sus sabores y disponibilidad según componentes.
- Distinguir disponibilidad y encargos. Mostrar sabores sin repetir el nombre
  del producto; omitir «Disponible» para una única variante disponible solo si ese grupo no
  incluye sabores por encargo. Incluir
  solamente el plazo estimado cuando haya encargos.
- Omitir productos archivados o sin precio de venta positivo.
- Antes de copiar, mostrar el texto y un resumen de omisiones con sus motivos,
  incluyendo falta de stock, precio variable de promo o precio no válido.
- Mostrar fecha de actualización del proveedor. Si la última actualización falló
  o los datos tienen más de 24 horas, mostrar un toast de advertencia sin
  bloquear la copia ni exigir una casilla de confirmación.
- Botón para copiar el texto completo. No se requiere PDF, imagen ni Excel.

## Entrega

Tickets #12–#15 implementados en una rama de integración. Validación: 12 pruebas
de listas (8 REST/PostgreSQL y 4 de navegador real), más 67 regresiones existentes,
todas aprobadas sin omisiones; compilaciones API/frontend aprobadas. Se revisaron
capturas de escritorio y móvil y se corrigieron los hallazgos de las revisiones
independientes de estándares y especificación. Producción permanece intacta.

## Ajustes de experiencia del 22 de octubre de 2026

La política compartida de encargos se edita junto a la selección de productos:
permiso por presentación o sabor, con guardado automático y plazo compacto.
Los sabores comienzan colapsados y hay filtros combinables de marca, stock y tipo.
No se repite el catálogo en un panel separado. El mensaje omite los avisos genéricos
sobre límites compartidos de promos y disponibilidad del proveedor; se conservan
las restricciones concretas de combinaciones. La antigüedad del proveedor genera
solo un toast; el servidor sigue verificando que el texto copiado corresponde
a una vista previa vigente.

El texto de promos usa etiquetas breves de componentes (Proteína/Creatina o
Sabores si hay uno solo). Los sabores por encargo se mencionan como opciones
adicionales, sin repetir los disponibles. Si se necesita encargar más unidades
de un sabor que ya tiene stock, se indica por separado. Se mantienen los límites
concretos por sabor y packs compartidos; dos presentaciones del mismo tipo
conservan sus nombres para evitar confundirlas.
