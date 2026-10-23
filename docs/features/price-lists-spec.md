## Problem Statement

GevaFit necesita compartir listas de precios por WhatsApp sin escribirlas a mano,
revisar todos los sabores ni confundir stock propio con disponibilidad del proveedor.
El negocio también ofrece productos por encargo, con entrega estimada. Hoy no hay
selecciones persistentes ni un texto que distinga esas situaciones y evite ofrecer
sabores o promos que no se puedan conseguir.

## Solution

Agregar una pantalla Listas de precios para crear varias listas con nombre/título y
selección guardada de productos, variantes y promos del catálogo propio. Generar una
vista previa de texto para WhatsApp con precios actuales en ARS, disponibilidad y
encargos habilitados. Mostrar las exclusiones y advertencias antes de copiar.

Las listas comparten el permiso de encargo de cada producto/promo y un plazo general
editable, inicialmente 7 días. Cada lista conserva su título y selección independiente.
No se envían mensajes automáticamente.

## User Stories

1. Como responsable del negocio, quiero crear varias listas con nombre para compartir selecciones diferentes.
2. Como responsable, quiero editar el título de cada lista para identificar el mensaje que envío.
3. Como responsable, quiero marcar productos del catálogo propio para elegir qué ofrezco.
4. Como responsable, quiero incluir promos para compartir mis ofertas.
5. Como responsable, quiero buscar productos y presentaciones para seleccionarlos sin recorrer todo el catálogo.
6. Como responsable, quiero seleccionar una presentación con todos sus sabores actuales para cargarla rápidamente.
7. Como responsable, quiero desmarcar sabores individuales para no ofrecer variantes que no me interesan.
8. Como responsable, quiero que los nuevos sabores requieran selección explícita para no publicarlos sin revisar.
9. Como responsable, quiero conservar las listas al recargar o reiniciar servicios para reutilizarlas.
10. Como responsable, quiero que la lista use los precios actuales de Mis productos para evitar mantener precios duplicados.
11. Como cliente, quiero ver precios finales en ARS para saber cuánto cuesta cada producto.
12. Como cliente, quiero ver juntos los sabores con el mismo precio para leer un mensaje corto.
13. Como cliente, quiero que sabores con distinto precio aparezcan separados para evitar confusiones.
14. Como responsable, quiero habilitar encargos por producto o promo, de forma común a todas las listas, para controlar qué ofrezco sin stock.
15. Como responsable, quiero un plazo de encargo editable común a todas las listas para mantener una promesa coherente.
16. Como cliente, quiero distinguir Disponible de Por encargo para conocer la modalidad de entrega.
17. Como responsable, quiero ofrecer mi stock positivo aunque el proveedor esté sin stock para vender lo que tengo.
18. Como responsable, quiero tratar stock cero, negativo o sin cargar como ausencia de stock propio para no prometer disponibilidad inmediata.
19. Como responsable, quiero ofrecer encargos solamente con stock positivo informado en una oferta vinculada y vigente para evitar ofertas sin respaldo.
20. Como responsable, quiero aceptar tanto la oferta individual como el pack vinculado para no depender de la oferta usada para calcular el costo.
21. Como responsable, quiero omitir encargos con stock desconocido, cero o negativo para no asumir disponibilidad.
22. Como responsable, quiero que una promo evalúe las cantidades y sabores de todos sus componentes para no ofrecer combinaciones imposibles.
23. Como cliente, quiero conocer los sabores elegibles de una promo y su disponibilidad para poder elegir una combinación válida.
24. Como responsable, quiero omitir promos con precios variables para no publicar un precio ambiguo.
25. Como responsable, quiero omitir productos archivados o sin precio positivo para evitar mensajes incorrectos.
26. Como responsable, quiero ver motivos de omisión para entender y corregir lo que falta en la lista.
27. Como responsable, quiero ver cuándo se actualizó el proveedor para evaluar la vigencia de los encargos.
28. Como responsable, quiero recibir un aviso breve si los encargos se basan en datos desactualizados o una actualización fallida, sin bloquear la copia.
29. Como cliente, quiero un título, fecha, productos ordenados por marca/nombre y promos al final para encontrar lo que busco.
30. Como cliente, quiero ver el plazo estimado de entrega de los encargos.
31. Como responsable, quiero copiar exactamente el texto de la vista previa para pegarlo en WhatsApp.
32. Como responsable, quiero un error claro y una alternativa de selección manual si el portapapeles falla para poder compartir igualmente.
33. Como responsable, quiero usar la pantalla en computadora y móvil sin controles nativos discordantes ni desbordes.
34. Como responsable, quiero generar y copiar sin cambiar stock, precios, ventas, cobros ni reservas para no alterar la operación del negocio.
35. Como responsable, quiero que costos, márgenes y cantidades exactas de stock queden fuera del texto para no compartir información interna.

## Implementation Decisions

### Persistencia y límites

- Mantener el catálogo propio como origen de productos y precios; no exportar directamente el catálogo completo del proveedor ni crear productos implícitamente.
- Añadir listas persistentes con identidad, nombre/título y selección explícita de IDs de productos/variantes/promos. La selección es un conjunto: guardar repetidamente no duplica elementos.
- La selección de una presentación se expande a los IDs actuales. No guardar una regla dinámica que incluya automáticamente sabores futuros. Desmarcar una variante no afecta otras listas.
- Añadir permiso global de encargo por producto/promo, inicialmente deshabilitado, y configuración compartida del plazo estimado, inicialmente 7 días. Cambiar esos valores afecta la generación de todas las listas, sin cambiar sus selecciones.
- Usar migraciones aditivas; preservar productos, vínculos, stock, precios, ventas, cobros y configuración existente. Sin seeds ni reemplazo de base de datos.
- No cambiar los contratos existentes de catálogo, ventas o cálculo de costos. Mantener la semántica de variantes y promos del glosario.

### Evaluación y precios

- Resolver selección, precios, stock, vínculos y estado de actualización desde un estado coherente del servidor al generar la vista previa. Centralizar allí las reglas y el texto; no duplicar el cálculo en el navegador.
- Para productos individuales: stock propio mayor que cero implica Disponible. Cero, negativo y nulo no aportan unidades disponibles.
- Por encargo exige permiso en el producto y una oferta vinculada vigente con stock numérico conocido mayor que cero. Una oferta ausente, no vigente o sin stock conocido nunca sirve. Aceptar individual o pack, de cualquier vínculo válido, independientemente de la oferta elegida para el costo.
- Usar el último catálogo exitoso; un fallo posterior no borra sus datos, pero activa la advertencia de vigencia. No lanzar scrapes al abrir o copiar una lista.
- Para una promo, evaluar al menos una unidad completa, respetando cantidades y elecciones de sabor. Sumar la demanda del mismo componente aunque aparezca en varios lugares: una unidad propia no puede cubrir dos unidades requeridas. No reutilizar el stock agregado actual de una promo si oculta variantes con stock desconocido.
- La disponibilidad se refiere a poder armar una unidad de la oferta, no a reservar stock simultáneamente para todas las líneas publicadas. No publicar cantidades disponibles.
- Si una combinación puede cubrirse con stock propio, es Disponible. Si requiere conseguir componentes, exigir permiso en la promo y en los productos faltantes ofrecidos por encargo, con una oferta válida para cada faltante. Considerar las unidades informadas del pack al evaluar si alcanza para el faltante; no tratar un pack como una unidad individual ni reservarlo.
- Incluir únicamente sabores y combinaciones viables. No presentar listas independientes de sabores si implican que cualquier combinación es posible cuando no lo es; expresar restricciones o combinaciones cuando sea necesario. No truncar posibilidades silenciosamente ni enumerar todo el producto cartesiano si puede representarse por grupos y restricciones.
- El permiso de encargo de la promo no es necesario cuando toda la combinación sale de stock propio. Un componente puede formar parte de una promo aunque no esté seleccionado como línea individual de esa lista.
- Reutilizar precios y redondeo actuales de promos. Las promos de precio final tienen un único precio; para modo descuento, comparar precios resultantes de las combinaciones elegibles. Si difieren, omitir la promo con motivo precio variable; no publicar un rango ni elegir un mínimo.
- Omitir productos archivados, faltantes o sin precio de venta finito y positivo. Los productos sin vínculo pueden publicarse como disponibles si tienen stock propio y precio válido.
- Calcular dinero con precisión decimal y devolver importes de API como cadenas. Formatear importes ARS para Argentina con dos decimales. No convertir el costo USD del proveedor en precio de venta ni modificar precios.

### Vigencia y copia

- Por proveedor relevante, mostrar última actualización exitosa y resultado del intento posterior más reciente. Datos de más de 24 horas o un último intento fallido/con sesión vencida requieren advertencia; un intento en curso no equivale por sí solo a fallo.
- Si no hay catálogo exitoso para justificar una oferta, no habilitar el encargo. La advertencia de antigüedad no permite ignorar stock cero/desconocido u ofertas no vigentes.
- Si la vista previa incluye encargos con advertencia, mostrar un toast temporal sin exigir confirmación ni bloquear la copia. Editar la lista o regenerar sus datos invalida la vista previa anterior.
- La copia corresponde exactamente a la vista previa vigente y muestra su momento de generación; si se regenera, no actualizar el texto silenciosamente durante la copia.

### Interfaces y experiencia

- Añadir un módulo de listas con operaciones REST para consultar, crear y actualizar listas/selecciones; consultar y actualizar la política global de encargos; generar vista previa y validar la copia de la vista previa vigente. Validar IDs, título y plazo; responder errores de forma consistente con la API actual. La implementación concretará nombres y rutas sin romper interfaces existentes.
- La vista previa devuelve texto apto para clientes, omisiones con motivos, estado de proveedores y presencia de advertencias. Separar esos diagnósticos internos del texto copiable. Nunca incluir credenciales ni sesiones del proveedor.
- Pantalla accesible desde el menú, con listado de listas y editor de selección buscable por nombre/código/sabor, selección por presentación y por variante. Mostrar claramente qué está seleccionado y qué permiso de encargo es compartido por todas las listas.
- Reutilizar componentes visuales del proyecto y convenciones de Gym. Sin selectores nativos; buscador solo en listas largas. Carga, errores, lista vacía y selección sin elementos exportables deben ser explícitos. No permitir copiar un mensaje vacío como si hubiera productos.
- Texto: título editable, fecha de generación de Argentina, agrupación por marca/nombre/presentación/precio, sabores por disponibilidad y promos al final. Sin marca: al final del bloque de productos. Tomar marca de los vínculos del catálogo siguiendo la oferta seleccionada/preferida existente; no inferirla del nombre ni crear una marca si falta.
- Si hay encargos, incluir solamente el plazo estimado. Omitir esa aclaración si no se publican encargos. Escapar contenido de catálogo que pueda romper la agrupación o el formato del mensaje.
- Botón Copiar texto con confirmación visible de éxito solo cuando el portapapeles acepta el contenido. Si falla, conservar texto seleccionable e indicar cómo copiarlo manualmente. No abrir conversaciones ni enviar WhatsApp.

## Testing Decisions

Enfoque confirmado por el usuario: navegador real en escritorio/móvil más API con PostgreSQL descartable. El agente realiza el recorrido, las capturas y la revisión visual; no se delega esa validación al usuario.

- Probar comportamiento externo y resultados observables; no detalles privados, estructura de componentes ni mocks que repitan el cálculo.
- Reutilizar la infraestructura de pruebas REST y de navegador de Ventas y Clientes, con frontend/API reales y bases independientes terminadas en `_test`. Ninguna escritura de prueba en producción ni en la base local de uso habitual.
- API/PostgreSQL: crear/editar varias listas, selecciones independientes, guardados repetidos, expansión de sabores actuales, sabores nuevos no incluidos, archivados/faltantes, reinicio y persistencia. Verificar que cambiar precio o política global afecta una nueva generación sin sobrescribir el catálogo.
- Matriz de disponibilidad: stock propio positivo/cero/negativo/nulo, sin vínculo, proveedor positivo/cero/negativo/desconocido/no vigente, pack positivo e individual cero y viceversa, varios vínculos y ausencia de catálogo exitoso.
- Promos: componentes repetidos, cantidades mayores a uno, sabores distintos con stock desigual, mezcla de stock propio/encargo, permisos de promo/componentes, unidades de pack, combinaciones inviables y precio fijo frente a descuento con uno o varios precios resultantes. No reutilizar la misma unidad propia dos veces.
- Comparar el texto completo esperado en ejemplos representativos: marcas, ausencia de marca, precios distintos por sabor, ARS, fecha Argentina, promos al final, aclaración solo si hay encargos y omisiones explicadas. Asegurar ausencia de costos, márgenes, cantidades y datos internos.
- Vigencia: menos de 24 horas, exactamente 24 horas y más de 24 horas; fallo o sesión vencida posterior a éxito, intento en curso, varios proveedores. Confirmar/cancelar y comprobar invalidación al regenerar o editar. Controlar el tiempo desde el arnés de prueba, sin esperar un día ni cambiar el reloj del servidor.
- Navegador: creación y edición de listas, búsqueda, selección de presentación y desmarcado de sabor, política compartida, vista previa/omisiones, toast de advertencia no bloqueante y portapapeles real. Probar fallo del portapapeles, vacíos, carga y errores recuperables.
- Capturar y revisar escritorio y móvil: legibilidad del mensaje, grupos de sabores, controles, foco/teclado y ausencia de desbordes; iterar sobre los problemas encontrados.
- Verificar que generar/confirmar/copiar no modifica stock, precios, ventas, cobros ni dispara una consulta al proveedor. Ejecutar compilaciones frontend/API y regresiones pertinentes de productos/promos.

## Out of Scope

- Envío automático o integración con WhatsApp, selección de destinatarios y automatizaciones.
- PDF, imágenes, Excel, catálogo público o tienda online.
- Precios alternativos por lista, costos/márgenes visibles y cantidades exactas de stock en el texto.
- Plazos o permisos diferentes por lista, inclusión automática de sabores nuevos y orden manual personalizado.
- Reservas, toma o seguimiento de pedidos, garantías de stock del proveedor o fechas garantizadas.
- Scrapes disparados por exportación, nuevos proveedores y cambios al cálculo de compra.
- Rediseño de ventas/caja, eliminación de productos o registros de negocio.
- Despliegue, backups o sustitución de la base de producción en esta etapa.

## Further Notes

Definición de negocio confirmada el 22 de octubre de 2026. Esta especificación desarrolla la definición ya guardada en el issue #11; no constituye implementación ni publicación de la app. No hubo un prototipo para esta funcionalidad. La implementación debe mantener un ciclo de capturas, inspección y ajustes visuales.
