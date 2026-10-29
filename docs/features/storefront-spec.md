## Problem Statement

Los clientes de GEVA hoy deben consultar listas o conversar para descubrir productos, elegir sabores y armar una compra. No hay una tienda pública que permita navegar el catálogo y preparar un pedido completo para continuar por WhatsApp. El responsable necesita administrar esa tienda desde GevaFit, con buenas fotos y contenido propio, sin duplicar precios ni cargar nuevamente los productos de cada pedido al vender.

La gestión actual guarda precios por variante y una imagen propia por producto, y su acceso completo es privado. Publicar directamente esa interfaz o su API expondría información del negocio. Además, presentar una tarjeta por sabor o rangos de precio complicaría la experiencia buscada.

## Solution

Construir una tienda pública basada en la variante A elegida del prototipo: fondo claro, cabecera y banners verde oscuro, acentos lima, buscador, categorías propias, tarjetas con fotos y ficha única por presentación. Cada presentación tendrá un precio común para todos sus sabores en todo GevaFit; cada promo tendrá un único precio para cualquier combinación.

El cliente elige productos, sabores y cantidades, revisa un carrito y continúa por WhatsApp sin cuenta ni formulario personal. Se guarda un pedido pendiente con número e importes históricos; el cliente debe enviar el mensaje en WhatsApp. No se reserva stock, registra una venta ni cobra dinero en ese momento. Desde una bandeja privada, el responsable revisa el pedido y prepara una venta usando el flujo existente.

La sección Tienda de GevaFit administra catálogo, categorías, textos, imágenes, destacados y banners mediante borrador, vista previa y publicación. Precios y elegibilidad siguen los datos actuales del negocio. La entrega es en Córdoba capital y se coordina por WhatsApp, sin cálculo de envío.

## User Stories

1. Como cliente, quiero abrir una tienda pública sin la contraseña de gestión, para conocer los productos de GEVA.
2. Como cliente, quiero navegar sin crear cuenta ni iniciar sesión, para preparar una compra rápidamente.
3. Como cliente, quiero ver la tienda cómodamente en el teléfono y en computadora, para comprar desde cualquiera de mis dispositivos.
4. Como cliente, quiero encontrar productos destacados y promos en el inicio, para explorar la selección del negocio.
5. Como cliente, quiero un banner compacto que no oculte el catálogo, para llegar pronto a los productos.
6. Como cliente, quiero buscar productos por su contenido comercial y sabores, para encontrar lo que necesito.
7. Como cliente, quiero filtrar por marca y categoría, para reducir la selección.
8. Como cliente, quiero combinar búsqueda y filtros, para encontrar una presentación concreta.
9. Como cliente, quiero ordenar por precio o consultar el orden preparado por la tienda, para comparar alternativas.
10. Como cliente, quiero abrir enlaces directos a una ficha, para recibir o compartir un producto.
11. Como cliente, quiero volver del producto al catálogo conservando el contexto de navegación, para seguir eligiendo.
12. Como cliente, quiero ver una tarjeta por presentación, para no recorrer tarjetas casi idénticas de cada sabor.
13. Como cliente, quiero ver el nombre, presentación, marca, foto y precio de cada producto, para decidir si abrirlo.
14. Como cliente, quiero que todos los sabores de una presentación cuesten lo mismo, para elegir sin rangos ni «Desde».
15. Como cliente, quiero consultar varias fotos y una descripción, para reconocer el producto que estoy pidiendo.
16. Como cliente, quiero elegir sabor mediante controles claros, para agregar la variante correcta.
17. Como cliente, quiero que la foto cambie al sabor elegido cuando tenga imagen propia, para identificarlo.
18. Como cliente, quiero que se use la foto común si falta la del sabor, para que la ficha siga siendo útil.
19. Como cliente, quiero que los productos sin sabores no exijan una elección innecesaria, para agregarlos fácilmente.
20. Como cliente, quiero consultar solamente productos publicados que el negocio puede ofrecer, para evitar opciones retiradas.
21. Como cliente, quiero pedir lo que el negocio habilite aunque no tenga stock propio, para coordinar su entrega por WhatsApp.
22. Como cliente, quiero conocer la cobertura y cómo se coordina la entrega, para no interpretar el catálogo como una promesa de entrega inmediata.
23. Como cliente, quiero elegir el sabor de cada unidad de una promo al agregarla, para armar mi combinación.
24. Como cliente, quiero agregar otra combinación de la misma promo como una línea diferente, para distinguirlas.
25. Como cliente, quiero aumentar la cantidad de una combinación para repetirla, para no volver a seleccionarla.
26. Como cliente, quiero un precio único por promo independientemente de sus sabores, para saber cuánto cuesta.
27. Como cliente, quiero agregar y quitar productos y cambiar cantidades desde el carrito, para corregir mi pedido.
28. Como cliente, quiero poder solicitar cantidades superiores al stock informado, para confirmar la compra por WhatsApp sin límites comerciales automáticos.
29. Como cliente, quiero ver cantidad, sabores, precio y subtotal de cada línea, para revisar lo que voy a pedir.
30. Como cliente, quiero ver el total de productos y una acción de WhatsApp accesible, para terminar sin buscar controles.
31. Como cliente, quiero recuperar el carrito después de recargar o cerrar la tienda, para continuar más tarde.
32. Como cliente, quiero que se retiren silenciosamente los productos que ya no se ofrecen, para no atravesar avisos adicionales.
33. Como cliente, quiero que nunca se sustituya mi sabor por otro al recuperar el carrito, para no pedir algo distinto.
34. Como cliente, quiero ver los precios y el total actuales al revisar el carrito, para enviar importes vigentes.
35. Como cliente, quiero continuar sin ventanas adicionales por cambios de precio, para mantener un cierre simple.
36. Como cliente, quiero que el pedido vacío no se envíe, para no generar solicitudes sin productos.
37. Como cliente, quiero continuar por WhatsApp sin ingresar nombre, teléfono, localidad ni dirección en la web, para conversar esos datos en el chat.
38. Como cliente, quiero que el mensaje incluya el número de pedido, productos, sabores, cantidades y total, para que el negocio pueda identificarlo.
39. Como cliente, quiero poder volver a abrir el mensaje si WhatsApp no se abre o cierro la ventana, para completar el contacto sin duplicar el pedido.
40. Como responsable, quiero una sección Tienda dentro de GevaFit, para administrar la web desde la gestión existente.
41. Como responsable, quiero un catálogo web independiente de las listas de WhatsApp, para publicar una selección sin alterar otras listas.
42. Como responsable, quiero elegir expresamente qué presentaciones, sabores y promos se publican, para controlar la oferta.
43. Como responsable, quiero que los sabores nuevos queden pendientes de revisión, para no publicarlos al crear productos internos.
44. Como responsable, quiero títulos y descripciones comerciales propios, para no depender de los textos del proveedor.
45. Como responsable, quiero marcas y categorías propias de la tienda, para organizar el contenido comercial.
46. Como responsable, quiero asignar un producto a varias categorías, para incluirlo en selecciones distintas.
47. Como responsable, quiero ordenar manualmente categorías y productos de la tienda, para preparar su navegación.
48. Como responsable, quiero gestionar destacados y banners, para cambiar el contenido del inicio.
49. Como responsable, quiero preparar cambios como borrador y previsualizarlos, para revisar antes de publicar.
50. Como responsable, quiero publicar el conjunto de cambios de contenido de forma consistente, para no mostrar una edición a medio completar.
51. Como responsable, quiero que actualizar precios o stock no exija republicar el contenido, para mantener información vigente.
52. Como responsable, quiero una biblioteca de imágenes reutilizable, para usar recursos en productos y banners sin cargarlos repetidamente.
53. Como responsable, quiero subir varias imágenes en una operación, para preparar el catálogo más rápido.
54. Como responsable, quiero elegir portada y ordenar una galería arrastrando, para decidir cómo se muestran las fotos.
55. Como responsable, quiero una galería común por presentación y una foto opcional por sabor, para gestionar variantes sin duplicar todo el material.
56. Como responsable, quiero quitar una imagen de una galería sin afectar sus otros usos, para editar con seguridad.
57. Como responsable, quiero aprovechar las imágenes de proveedor o propias existentes al preparar contenido, para no empezar de cero.
58. Como responsable, quiero que un cambio de foto o texto no sea sustituido por un refresco del proveedor, para conservar mi edición.
59. Como responsable, quiero editar un precio común que alcance a todos los sabores de la presentación, para mantener coherencia en tienda, listas y nuevas ventas.
60. Como responsable, quiero resolver expresamente las diferencias de precio existentes, para no elegir automáticamente un precio incorrecto.
61. Como responsable, quiero conservar precios de ventas registradas y permitir acuerdos particulares en una venta, para no reescribir mi historia comercial.
62. Como responsable, quiero que un sabor nuevo adopte el precio común de su presentación, para evitar nuevas diferencias.
63. Como responsable, quiero habilitar internamente productos sin stock propio solo con stock positivo conocido del proveedor, para controlar qué ofrezco.
64. Como responsable, quiero conservar el último catálogo exitoso ante fallos del refresco, para no vaciar la tienda por una actualización fallida.
65. Como responsable, quiero ver advertencias del proveedor en mi gestión, para revisar su vigencia sin mostrar esos diagnósticos al cliente.
66. Como responsable, quiero una bandeja de pedidos pendientes, convertidos y descartados, para gestionar las solicitudes de la web.
67. Como responsable, quiero reconocer un pedido por su número al recibir el WhatsApp, para encontrarlo sin datos personales precargados.
68. Como responsable, quiero distinguir un pedido guardado de un WhatsApp efectivamente enviado, para no dar por confirmado un contacto que no ocurrió.
69. Como responsable, quiero revisar y corregir lo solicitado al preparar una venta, para acordar cantidades y entrega con el cliente.
70. Como responsable, quiero precargar productos, sabores y precios del pedido en Nueva venta, para evitar cargarlos otra vez.
71. Como responsable, quiero que un pedido conserve sus importes originales aunque cambie el catálogo, para revisar lo que recibió el cliente.
72. Como responsable, quiero elegir cliente y cobro en el flujo de venta existente, para conservar el funcionamiento de Caja y cuenta corriente.
73. Como responsable, quiero que el pedido se marque convertido solo después de registrar correctamente la venta, para no perder solicitudes ante errores.
74. Como responsable, quiero que un doble clic, reintento o dos ventanas no dupliquen pedidos ni ventas, para no duplicar stock, deuda o cobros.
75. Como responsable, quiero descartar una solicitud sin efectos sobre stock ni Caja, para cerrar pedidos que no se concretan.
76. Como responsable, quiero configurar el número de WhatsApp de destino, para dirigir los pedidos al contacto correcto.
77. Como responsable, quiero mantener privada la gestión y sus datos sensibles, para que los visitantes solo accedan a la tienda y a su propia solicitud.
78. Como responsable, quiero una revisión visual de espaciados, textos, fotos, controles y estados antes de la entrega, para recibir una tienda consistente con la variante A.
79. Como cliente, quiero textos directos y el ícono de WhatsApp en la acción correspondiente, para entender el flujo sin slogans ni instrucciones innecesarias.
80. Como responsable, quiero validación local con datos descartables antes de publicar en el servidor, para conservar la información real del negocio.

## Implementation Decisions

### Superficies y límites

- Mantener el stack existente de frontend, API y PostgreSQL, con módulos distinguibles para tienda pública, administración de contenido, medios, precios comunes y pedidos. La tienda tiene layout y estilos propios; no montar el escritorio administrativo dentro de la experiencia pública ni copiar directamente el código desechable del prototipo.
- Separar explícitamente los contratos públicos de los privados. El dominio/origen público debe servir únicamente la tienda, recursos publicados y operaciones públicas acotadas de carrito/pedido; no reenviar indiscriminadamente las rutas actuales de gestión. Mantener la protección privada vigente para productos internos, ventas, compras, clientes, Caja, proveedor y configuración.
- Usar respuestas públicas con campos permitidos explícitamente. No serializar objetos completos de productos internos, vínculos, ofertas, costos, márgenes, stock exacto, credenciales, sesiones, clientes ni movimientos. Tampoco exponer una lista o búsqueda pública de pedidos, datos de otros visitantes o la vista previa privada.
- Ofrecer consultas públicas paginadas para catálogo/búsqueda, categorías y ficha con enlace estable; validación del carrito y creación/reintento de pedido. La gestión ofrece consulta/edición de borrador, publicación, biblioteca, categorías y bandeja/conversión de pedidos. Los contratos usarán IDs estables y errores recuperables; la implementación concretará nombres de rutas sin romper los consumidores existentes.

### Presentaciones y precio común

- Persistir una identidad estable de presentación, sus variantes y su precio común; no usar el título comercial público como identificador. Los productos sin grupo se representan individualmente. Al incorporar datos existentes, respetar los grupos exactos actuales y sus IDs de producto: no inventar asociaciones por semejanza de nombres, marca, envase o sabor.
- La igualdad de precio se aplica al negocio completo, no solo a la web. Centralizar las operaciones que crean variantes, cambian pertenencia o editan precio para garantizar que toda alta y edición, incluida la tabla privada, observe la regla. Cambiar el precio común actualiza todos los sabores en una transacción y las lecturas de tienda, listas y precios sugeridos de nuevas ventas devuelven el mismo valor. Incorporar un sabor a una presentación resuelta adopta ese precio común.
- Las migraciones deben ser aditivas y conservar IDs, stocks, códigos/barcodes como texto, vínculos, imágenes, componentes y registros históricos. Ante grupos con distintos precios, preservar los importes existentes hasta que el responsable elija expresamente el precio común; impedir su publicación y explicar qué falta resolver. No tomar automáticamente mínimo, máximo, promedio ni último editado. Resolver un grupo no reescribe ventas ni pedidos existentes.
- Mantener precio final y descuento de las promos actuales. Cada promo publicada debe producir un solo precio para sus combinaciones de sabores aprobadas; no usar rangos ni «Desde». Una configuración inconsistente debe resolverse antes de publicarla, no elegir una combinación representativa. Los cambios dinámicos de precios deben seguir garantizando esta regla.
- Calcular dinero con precisión decimal y persistir valores numéricos exactos; retornar importes monetarios como cadenas decimales y presentar ARS. No convertir costos del proveedor en una tarifa pública adicional. Mantener las reglas actuales de descuento y redondeo de promos y los precios particulares negociados en una venta. Los costos pueden variar por sabor y seguir siendo privados.

### Catálogo, contenido y publicación

- Persistir selección web independiente, contenido comercial propio, marcas, categorías planas, asignaciones múltiples y órdenes de categorías/productos, destacados, banners, galerías y foto específica por variante. El orden manual es de la tienda y sus categorías; no restaura el orden personalizado en la tabla general de productos de la gestión.
- Elegir variantes expresamente para publicar. Crear otro sabor en el negocio no lo publica automáticamente. Las promos permiten elegir los sabores aprobados y elegibles de sus componentes; no añadir alternativas silenciosamente ni exponer nuevas variantes internas mediante una promo.
- Separar borrador y versión publicada de selección/contenido. La vista previa privada representa el borrador completo con reglas y datos de negocio actuales. Publicar valida referencias, precios y configuración y activa una revisión consistente en una transacción; un fallo no reemplaza parcialmente la revisión pública anterior. Editar no modifica el contenido público hasta publicar.
- Los precios y la elegibilidad son datos dinámicos, fuera de la congelación del contenido. Un cambio de precio resuelto o stock se refleja sin republicar textos/fotos. El refresco del proveedor no reemplaza textos, marcas, categorías ni fotos comerciales propios. Las consultas públicas deben mantener orden estable y coherencia de la revisión publicada para evitar mezclas entre páginas.
- Para cada variante aprobada, stock propio positivo la hace elegible. Con stock propio cero, negativo o sin cargar, exigir habilitación manual para ofrecer sin stock y una oferta vinculada vigente con stock conocido positivo del último catálogo exitoso; puede ser individual o pack. Conservar el comportamiento compartido actual de la habilitación de encargos, sin introducir otra política contradictoria. La publicación web sigue siendo una selección independiente.
- Si no hay stock elegible o el producto está archivado, retirado o sin un precio positivo/resuelto, no ofrecerlo. Si no queda ningún sabor elegible, ocultar la presentación. Las promos dependen de sus componentes y sabores elegibles. Reutilizar la clasificación de ofertas vigentes y presentaciones existentes, sin importar al carrito los límites de cantidad de las listas de WhatsApp.
- Stock es un criterio de elegibilidad, no un límite de unidades solicitadas. No rechazar una cantidad por superar stock propio, stock del proveedor o capacidad calculada de armado de una promo. Una combinación puede repetir un sabor elegible sin comprobar que alcanza para toda la cantidad pedida. Las existencias reales se acuerdan por WhatsApp y se resuelven al registrar la venta. No prometer reserva ni entrega inmediata; mantener los límites técnicos de números válidos y tamaño de solicitud, distintos de un tope comercial por stock.
- Conservar el último catálogo exitoso si falla el refresco o envejece. Mostrar advertencias solo en gestión, sin ocultar automáticamente lo publicado por antigüedad o fallo ni publicar estados de sesión del proveedor. Sin stock propio, siguen siendo necesarios habilitación manual y stock positivo conocido de una oferta vigente de ese catálogo. Nunca lanzar un scrape desde una consulta pública.

### Imágenes

- Incorporar biblioteca persistente con carga múltiple, recursos reutilizables, metadatos de uso, galerías ordenadas, portada y foto opcional por sabor. Al elegir variante, usar su imagen o la portada común. Los banners pueden reutilizar recursos de la biblioteca.
- Aprovechar el almacenamiento persistente y las validaciones de imágenes existentes; conservar las imágenes ya descargadas y las propias. Asociar recursos existentes mediante selección explícita, sin sobreescribir galerías elegidas. Validar los archivos realmente recibidos, respetar los tipos/tamaños soportados y generar versiones adecuadas de entrega para móvil/escritorio sin alterar el original.
- Quitar una asignación no borra el archivo ni sus otros usos. Una carga fallida no elimina las fotos válidas ni publica un borrador. Servir públicamente solo recursos asociados a contenido publicado mediante el contrato público; mantener privada la biblioteca y los borradores. Evitar depender de enlaces remotos del proveedor durante la navegación del comprador.

### Carrito y WhatsApp

- Carrito persistido en el navegador con IDs estables de producto/variante/composición y cantidades. Una línea de promo conserva el sabor de cada unidad; combinaciones distintas son líneas distintas y aumentar cantidad repite esa composición. No guardar costos, sesiones ni datos privados en el carrito.
- Revalidar contra el catálogo publicado al recuperar/revisar y antes de crear un pedido. Retirar silenciosamente las líneas que ya no son elegibles o publicadas; no sustituir variantes. Si falta un componente/sabor de una promo, retirar esa línea completa. Si no queda nada, mostrar carrito vacío y deshabilitar continuar.
- Usar precios actuales calculados por servidor y mostrar el total actualizado sin otra confirmación por diferencias de precio. El comprador revisa un resumen con líneas, cantidades, sabores, precios y subtotales. La creación devuelve el resumen definitivo y el mensaje debe usar exactamente ese pedido guardado, incluso si el precio cambia durante la solicitud; la UI muestra los importes efectivamente preparados.
- No pedir nombre, teléfono, cuenta, localidad, barrio, dirección, forma de pago ni datos de entrega. Informar «Envíos en Córdoba capital. Costo y entrega a coordinar por WhatsApp». Mostrar total de productos sin sumar un costo de envío inventado ni presentarlo como un total con envío incluido.
- Crear el pedido pendiente y sus líneas/composiciones/importes originales en una transacción, sin reserva, movimientos de stock, cliente automático, venta, deuda o ingreso en Caja. Reintentar una misma solicitud, incluido después de respuesta perdida, recupera el mismo pedido: una clave de idempotencia no puede crear otro pedido ni reutilizarse con un payload diferente.
- Responder con un número legible y una referencia de acceso impredecible para que ese navegador pueda recuperar su solicitud/reabrir WhatsApp sin consultar pedidos ajenos por enumeración. No afirmar que el WhatsApp se envió: el usuario debe pulsar Enviar en la aplicación externa y no habrá integración que lo confirme.
- Configurar el número de destino en gestión, normalizado y validado para el enlace de WhatsApp. Construir y codificar el texto desde datos del servidor con número de pedido, nombres comerciales, presentación, sabores por unidad de promo, cantidades, precios/subtotales y total de productos. Incorporar el ícono de WhatsApp en la acción, según A revisada. Si no abre la app, permitir reabrir el enlace o copiar el texto; no duplicar el pedido.
- Una creación fallida conserva el carrito y permite reintentar. Tras crear el pedido, conservar su resumen y opción de reabrir el mensaje; empezar otra compra es una acción explícita. Proteger el alta pública contra abuso y entradas inválidas sin convertir los controles técnicos en límites de cantidad basados en stock ni introducir cuentas de compradores.

### Bandeja y conversión

- Persistir estados Pendiente, Convertido en venta y Descartado, fechas y vínculo con la venta resultante. Ofrecer consulta privada paginada, búsqueda por número, filtros de estado y detalle de las líneas originales. La bandeja no inventa identidad ni contacto para solicitudes anónimas.
- Revisar/corregir el pedido al preparar Nueva venta, precargando productos, sabores, cantidades e importes guardados. Mantener la solicitud original como referencia; las correcciones acordadas se reflejan en la venta. El responsable elige cliente o consumidor final y cobro mediante los componentes existentes. Cancelar la preparación o fallar al guardar deja el pedido pendiente y no cambia stock/Caja.
- Un pedido se convierte una sola vez. Coordinar registro de venta y transición/vínculo del pedido en la misma transacción, con bloqueo y unicidad que resistan dos ventanas o reintentos. Reutilizar el registro de venta existente y sus reglas de cobro, cuenta corriente, costos históricos y advertencia de stock negativo. Calcular costos según las reglas de venta vigentes al registrar; no inventar un costo histórico cuando se creó la solicitud sin venta.
- Descartar actúa solo sobre un pedido pendiente y no tiene efectos de venta. Una solicitud ya convertida conserva su vínculo con la venta y no puede convertirse o descartarse por segunda vez. Las ediciones y anulaciones de esa venta siguen los flujos existentes; no reabren ni reconvierten el pedido automáticamente. Si un producto archivado o una composición cambiada impide registrar la solicitud original, resolverlo explícitamente en la revisión privada, sin sustituirlo por otra variante.

### Experiencia y acabado

- Usar A como composición validada: buscador visible, banner compacto, categorías en botones, tarjetas claras, fotos protagonistas, selección de sabores y carrito legible con acción accesible. Colores GEVA: verde oscuro #11261F, lima #9DFF48 y base clara. Adaptar escritorio y móvil; no reproducir literalmente todas las medidas del prototipo.
- Pulir espaciados, jerarquía, tamaños, contraste, foco/teclado, fotos con proporciones consistentes y controles táctiles. Reutilizar los componentes propios de gestión; no introducir selectores nativos y reservar buscador en selectores para listas largas. Priorizar botones visibles para sabores y acciones cortas.
- Incorporar estados de carga, catálogo/búsqueda vacíos, carrito vacío, fallos de carga/publicación/creación y recuperación sin perder el trabajo válido. Textos funcionales y concretos: Productos, Promos, Categorías, Carrito; evitar slogans, frases vacías y diagnósticos técnicos del proveedor en el flujo del cliente. No añadir estrellas, descuentos, beneficios de salud ni afirmaciones comerciales inventadas.

## Testing Decisions

- Enfoque integrado confirmado por el usuario: frontend y API reales con PostgreSQL descartable, navegador real en escritorio/móvil, capturas e inspección visual por el agente. Es el punto principal de validación; complementar mediante los contratos REST del mismo sistema para concurrencia, errores y conservación de datos. Evitar crear una capa de pruebas nueva por cada componente.
- Probar comportamiento observable, invariantes de datos y efectos de negocio, no detalles de implementación, nombres de funciones ni una copia del algoritmo usado. Las pruebas de dinero comparan cadenas/importes exactos y efectos finales, no aproximaciones de coma flotante.
- Prior art existente: los escenarios de ventas recorren navegador → REST → PostgreSQL, con fixtures creados por API, puertos propios, Chrome/Playwright y recuperación de respuestas perdidas; las regresiones de listas validan selección, proveedor, promos y copiado exacto; imágenes tienen validaciones propias. Reutilizar esos patrones y la suite de cálculo de precios/promos y ventas, ampliando solo lo necesario para el precio común y los nuevos contratos públicos.
- Usar exclusivamente una base terminada en `_test`, servicios locales independientes y fixtures conocidos; no la base normal de trabajo, una copia operativa en uso ni producción. No iniciar el worker/scraper real ni contactar al proveedor para generar fixtures.
- Recorrer creación de categorías/contenido y carga múltiple de imágenes → galería/portada/foto por sabor → vista previa → publicación → navegación pública → producto/promo → carrito → pedido → bandeja → preparación de venta → registro. Verificar una sola venta y los efectos esperados en stock/Caja al final; comprobar que no hay esos efectos en ninguno de los pasos anteriores.
- Verificar que borradores y cargas fallidas no alteran la versión publicada; publicación fallida revierte completamente. Comprobar galerías compartidas, orden y portada, reutilización y eliminación de una asignación, foto de sabor con fallback e imágenes existentes preservadas. Los recursos no publicados no deben quedar accesibles mediante la superficie pública.
- Cubrir búsqueda y filtros combinados, orden manual/precio con desempate estable, paginación, enlace directo y atrás/adelante, tarjetas por presentación, selección de nuevos sabores pendiente, productos sin sabor, productos archivados y categorías vacías. Comprobar que un nuevo sabor no se filtra a una promo publicada.
- Probar migración repetible con grupos consistentes/inconsistentes y productos individuales. Resolver un precio actualiza todos los sabores, lecturas privadas, listas y sugeridos de nuevas ventas; altas, edición rápida/completa y pertenencia a grupo mantienen la regla. Verificar que pedidos y ventas previos, precios negociados, stocks, vínculos, códigos/barcodes e imágenes no se reescriben. Publicación impide grupos/promos con precios no resueltos o variables.
- Probar elegibilidad con stock propio positivo, cero, negativo y desconocido; permiso manual, alternativas individual/pack vigentes, stock del proveedor positivo/cero/desconocido, ausencia de catálogo exitoso, refresco fallido y datos antiguos. Fallo/antigüedad no ocultan por sí solos y las advertencias quedan privadas. Las cantidades mayores que existencias y las promos que repiten un sabor elegible deben poder solicitarse sin reservarlo.
- Probar restauración del carrito, retiro silencioso de líneas no ofrecibles, retiro completo de una combinación inválida, ausencia de sustitución de sabores y aplicación automática de precios actuales. Comprobar que el último elemento retirado deja un carrito vacío sin crear pedido. Una actualización concurrente debe producir un pedido/mensaje consistente con el resumen devuelto.
- Verificar texto exacto y enlace de WhatsApp, destino configurable, codificación de acentos/símbolos/sabores, subtotales y total. Interceptar la navegación externa en navegador: validar enlace y mensaje con un número de prueba, sin enviar WhatsApp ni contactar a terceros. Probar reapertura/fallback sin pedido duplicado y creación fallida sin perder carrito.
- Probar idempotencia de pedido y conversión con doble clic, respuesta perdida, payload distinto para la misma clave y peticiones concurrentes. Probar descarte, cancelación de la revisión, error durante registro y rollback completo; las solicitudes sin datos personales no crean clientes. Conversión mantiene precios originales del pedido y usa el flujo actual de venta/cobro y costos de venta.
- Probar la frontera real de acceso local con la misma configuración de entrada prevista para despliegue: las rutas/activos públicos funcionan sin acceso privado; desde ese origen las operaciones de gestión, biblioteca/borrador, productos internos, clientes, pedidos ajenos, stock exacto, costos, márgenes, proveedor y Caja no quedan expuestos. Verificar ausencia de escrituras de negocio por simples consultas públicas y ausencia de scrape.
- El agente captura y revisa A en escritorio y móvil: inicio, filtros, ficha, sabores de promo, carrito, resumen, biblioteca, edición, publicación y bandeja. Incluir estados vacíos/carga/error, textos largos, foco y navegación por teclado, imágenes con fondos/proporciones distintos y pantallas estrechas. Corregir problemas y repetir las capturas afectadas; no entregar solo un build exitoso o capturas sin inspección.
- Ejecutar builds de frontend/API y regresiones relevantes de listas, imágenes, precios, promos, ventas, clientes y Caja. Registrar qué escenarios se comprobaron realmente y sus límites; no presentar la simulación del prototipo como evidencia funcional de la implementación.

## Out of Scope

- Pagos online, pasarela de cobro, cobro automático o confirmación de recepción/envío de mensajes por una API de WhatsApp.
- Cuentas de compradores, login público, formulario de nombre/teléfono/dirección, historial público de clientes, exposición de cuenta corriente o identidad inferida automáticamente desde WhatsApp.
- Cálculo de envío, geolocalización, transportistas, opción de retiro y cobertura fuera de Córdoba capital.
- Reservas de stock y límites comerciales de cantidad basados en existencias; promesas automáticas de entrega inmediata o plazo individual por producto.
- Reseñas, estrellas, favoritos, puntos, gift cards, cupones, recomendaciones personalizadas y nuevas campañas/descuentos no definidos. Se conservan las promos existentes y se administra su presentación.
- Subcategorías, editor libre de páginas o constructor de sitios sin restricciones, múltiples tiendas/negocios o tarifas web independientes.
- Publicación automática de sabores recién creados, unificación arbitraria de precios discrepantes y modificaciones retroactivas de ventas, pedidos originales o costos históricos.
- Borrado definitivo de archivos compartidos desde una galería, sustitución automática de imágenes propias por el scraper y rediseño general de pantallas ajenas a esta funcionalidad.
- Copiar/promover directamente el código desechable del prototipo, integrar sus variantes B/C o desplegar su barra de comparación a clientes.
- Deploy de producción, DNS, elección del dominio real, carga del número real de WhatsApp, importación/reemplazo de la base de producción o backups como parte de escribir esta spec. Cualquier despliegue posterior sigue la skill y el runbook del proyecto, con la autorización correspondiente y conservando los datos existentes.

## Further Notes

- Definición de negocio confirmada el 29/10/2026. Variante A elegida por el usuario y después revisada para usar textos directos e ícono de WhatsApp. La validación de navegador real + API/PostgreSQL descartable fue confirmada expresamente al convertir a spec.
- Fuente primaria del prototipo: [rama prototype/storefront-ui](https://github.com/pablogtab/price-checker/tree/prototype/storefront-ui), capturada en [8d8586a](https://github.com/pablogtab/price-checker/commit/8d8586a) y revisión de selección A/WhatsApp [9d3d1cf](https://github.com/pablogtab/price-checker/commit/9d3d1cf). Sus datos, pedidos y acciones son simulados; solo valida dirección visual y flujo exploratorio.
- Antecedente y conversación de definición/prototipo: [issue #21](https://github.com/pablogtab/price-checker/issues/21). Referencia visual aportada por el usuario: [Health & Nutrition E-Commerce Mobile App](https://dribbble.com/shots/27697694-Health-Nutrition-E-Commerce-Mobile-App); la captura fue inspeccionada, pero las funciones adicionales de esa referencia no amplían el alcance.
- El ADR de precio de catálogo común por presentación registra la decisión de aplicar la igualdad en todo GevaFit. El glosario compartido distingue presentación, variante, precio de catálogo, pedido pendiente y venta registrada; la implementación debe mantener ese vocabulario.
- Dominio público y número de WhatsApp son valores operativos a definir/configurar antes del despliegue. No inventarlos ni reutilizar credenciales privadas en la tienda. La definición de la separación pública/privada no autoriza desactivar la protección del backoffice.
- Esta spec no implementa, despliega ni constituye evidencia de pruebas de la funcionalidad. El siguiente trabajo es descomponerla en tickets e implementarla con el ciclo de revisión visual acordado.
