# Tienda GEVA · propuesta de tickets

Fuente: spec #22. Estado: **desglose aprobado y tickets publicados el 29/10/2026**.
11 tickets publicados con `ready-for-agent`, relaciones nativas de sub-issues y
bloqueos. El título, contenido, estado y etiquetas del padre #22 se conservaron;
únicamente se agregaron las relaciones de sub-issues solicitadas.

Cada ticket entrega un comportamiento vertical y verificable por interfaz y REST
con persistencia real en PostgreSQL descartable. Capturas e inspección visual
acompañan cada pantalla afectada; no se posponen todas las pruebas al cierre.
El código del prototipo es referencia, no base para copiar a producción.

1. **Precio común por presentación en toda la gestión**
   - Bloqueado por: ninguno.
   - Entrega: migración conservadora a identidad de presentación; revisión de
     diferencias, elección del precio común y edición/alta de sabores coherentes
     desde la gestión. Listas y nuevas ventas leen el precio común; historia,
     stocks, vínculos y precios negociados no se alteran.
   - Incluye: centralizar primero las escrituras del precio dentro de esta misma
     entrega. Mantener contratos existentes compatibles; sin un refactor horizontal
     independiente ni borrado prematuro de datos antiguos.
   - Validación: resolver grupos consistentes/inconsistentes en UI/REST, edición
     rápida/completa, nuevo sabor, pertenencia y regresiones de listas/promos/ventas.

2. **Publicar una primera ficha en una tienda pública aislada**
   - Bloqueado por: 1.
   - Entrega: desde Tienda seleccionar una presentación/sabores con stock propio,
     editar contenido comercial básico, previsualizar borrador y publicar. La ficha
     pública y catálogo inicial basados en A muestran solo la revisión publicada,
     con precio actual e imagen existente, sin exponer gestión ni datos privados.
   - Incluye: publicación atómica, IDs/enlaces estables, selección independiente de
     listas, nuevos sabores sin publicar y entrada pública acotada verificada
     localmente desde el inicio. No requiere biblioteca nueva para usar una imagen
     ya existente de un producto seleccionado.
   - Validación: publicación/fallo/rollback, cambios de precio/stock, resolución de
     precios obligatoria, borrador privado, recursos referenciados y rutas privadas
     inaccesibles desde el origen público. Sin despliegue.

3. **Biblioteca reutilizable con carga múltiple**
   - Bloqueado por: ninguno.
   - Entrega: administrar imágenes desde la gestión, subir varias, consultar y
     reutilizar recursos persistentes y ver sus usos, conservando originales e
     imágenes existentes. No depende de publicar una ficha ni de nuevas categorías.
   - Validación: carga real por UI/API, tipos/tamaños, fallos parciales recuperables,
     conservación de archivos, privacidad de biblioteca y borradores, sin efectos
     en imágenes asignadas. La integración de galerías llega en 5.

4. **Categorías propias y navegación del catálogo**
   - Bloqueado por: 2.
   - Entrega: crear categorías planas y marcas comerciales, asignaciones múltiples
     y orden manual; previsualizar/publicar y navegar con búsqueda, filtros
     combinados, orden por precio, paginación y enlaces directos/atrás/adelante.
   - Validación: independencia del proveedor y de listas, orden estable entre
     páginas, categorías vacías, búsquedas sin resultados, persistencia y móvil.

5. **Galerías por presentación y foto por sabor**
   - Bloqueado por: 2, 3.
   - Entrega: asignar imágenes de biblioteca a una presentación, elegir portada,
     arrastrar para ordenar y definir foto opcional por sabor. Revisar en borrador
     y publicar para ver la galería y el cambio de imagen al elegir sabor.
   - Validación: fallback común, recurso compartido, quitar una asignación sin
     borrar otros usos, persistencia, publicación atómica y privacidad de imágenes
     no publicadas. No depende de categorías ni del carrito.

6. **Inicio con destacados y banners administrables**
   - Bloqueado por: 3, 4.
   - Entrega: gestionar destacados, banners y su orden con recursos de biblioteca,
     previsualizar/publicar y recorrer el inicio A hacia categorías y fichas.
     Precios/stock siguen vigentes sin republicar el contenido.
   - Validación: banner compacto y responsive, destinos válidos, orden, versión
     publicada coherente y textos funcionales sin promociones inventadas. Puede
     usar recursos de biblioteca sin depender de la galería de una ficha.

7. **Ofrecer productos sin stock propio y promos con sabores**
   - Bloqueado por: 2.
   - Entrega: gestionar habilitación compartida para ofrecer sin stock y publicar
     variantes/promos elegibles usando stock propio o proveedor; seleccionar los
     sabores por unidad de promo con precio único y sin etiqueta pública «Por
     encargo». Todavía no necesita guardar un carrito para demostrar la ficha.
   - Validación: ofertas individuales/pack, cero/desconocido, archivados, fallos y
     último catálogo exitoso, ausencia de scrape, variantes nuevas no expuestas,
     precios final/descuento uniformes y posibilidad de repetir un sabor elegible
     sin comprobar existencias para toda la cantidad solicitada.

8. **Carrito persistente con productos y combinaciones de promos**
   - Bloqueado por: 7.
   - Entrega: agregar variantes/promos, repetir o separar combinaciones, editar
     cantidades sin límites por stock, quitar y recuperar el carrito. Revalidar por
     servidor, quitar líneas no ofrecibles silenciosamente y mostrar precios y
     total actuales. Resumen de productos/envío a coordinar, sin formulario personal.
   - Validación: persistencia del navegador, cantidades superiores al stock, retiro
     completo de una promo inválida sin sustituir sabores, precios decimales,
     cambios concurrentes y carrito vacío. Pedido/WhatsApp reales llegan en 9.

9. **Pedido pendiente y continuación por WhatsApp**
   - Bloqueado por: 8.
   - Entrega: configurar el destino en gestión, convertir el resumen en pedido
     pendiente persistido y abrir el mensaje con número, sabores, cantidades e
     importes exactos. Permitir recuperar/reabrir el enlace o copiar el texto sin
     duplicar; mantener el resumen después de crear el pedido.
   - Validación: UI → API → PostgreSQL → enlace externo interceptado, idempotencia,
     doble clic, respuesta perdida, payload distinto, acceso opaco al pedido propio,
     límites técnicos/abuso y fallos sin perder carrito. Cero cambios en stock,
     ventas, clientes, deuda o Caja. Sin enviar WhatsApp real.

10. **Bandeja de pedidos y conversión revisada a venta**
    - Bloqueado por: 9.
    - Entrega: buscar/filtrar/paginar Pendiente/Convertido/Descartado, ver solicitud
      original, descartar o preparar Nueva venta con sabores e importes del pedido.
      Revisar/corregir, elegir cliente/cobro y registrar con el flujo actual; solo
      entonces marcar convertido y vincular una única venta.
    - Validación: cancelar/fallar mantiene pendiente; conversión transaccional con
      bloqueo, reintentos/dos ventanas y rollback completo. Efectos de stock/Caja
      solo de la venta registrada, costos al vender, stock negativo con aviso,
      precios del pedido conservados y sin reconversión automática por anulación.

11. **Cerrar el recorrido completo y pulir la variante A**
    - Bloqueado por: 5, 6, 10.
    - Entrega: recorrido coherente de edición/fotos/publicación → catálogo → promo
      y carrito → WhatsApp → venta, con acabado responsive y recuperación de
      errores/estados vacíos. Eliminar cualquier residuo de la interfaz del
      prototipo e incorporar el ícono de WhatsApp.
    - Validación: capturas inspeccionadas en escritorio/móvil de todo el flujo,
      teclado/foco/contraste, imágenes reales y textos largos, preservación de
      estado y pruebas de acceso usando la entrada pública prevista. Completar
      builds/regresiones relevantes y documentar evidencias locales. No desplegar
      ni reemplazar datos operativos.

## Dependencias mínimas

Inicio: **1 y 3**. Luego 2 habilita 4, 5 (cuando 3 esté listo) y 7;
3+4 habilitan 6; 7 → 8 → 9 → 10. Cierre: **5+6+10 → 11**.
Las dependencias transitivas no se repiten como bloqueos directos.

## Cobertura

- Precio común y migración: 1; elegibilidad/precio publicado: 2 y 7.
- Selección, contenido propio y publicación: 2; categorías/navegación: 4;
  fotos: 3 y 5; inicio/banners: 6.
- Carrito/precios actuales: 8; pedido/WhatsApp/idempotencia: 9;
  bandeja/venta/efectos transaccionales: 10.
- Seguridad pública básica: 2, medios: 3/5, pedido propio: 9;
  prueba de frontera integrada completa y revisión A: 11.
- Criterios transversales de la spec aplican desde cada entrega, no solo en 11.

## Tickets publicados

| Entrega | Issue | Bloqueado por |
| --- | --- | --- |
| 1. Tienda: Precio común por presentación en toda la gestión | [#23](https://github.com/pablogtab/price-checker/issues/23) | Ninguno |
| 2. Tienda: Publicar una primera ficha en una tienda pública aislada | [#24](https://github.com/pablogtab/price-checker/issues/24) | [#23](https://github.com/pablogtab/price-checker/issues/23) |
| 3. Tienda: Biblioteca reutilizable de imágenes con carga múltiple | [#25](https://github.com/pablogtab/price-checker/issues/25) | Ninguno |
| 4. Tienda: Categorías propias y navegación del catálogo | [#26](https://github.com/pablogtab/price-checker/issues/26) | [#24](https://github.com/pablogtab/price-checker/issues/24) |
| 5. Tienda: Galerías por presentación y foto específica por sabor | [#27](https://github.com/pablogtab/price-checker/issues/27) | [#24](https://github.com/pablogtab/price-checker/issues/24), [#25](https://github.com/pablogtab/price-checker/issues/25) |
| 6. Tienda: Inicio con destacados y banners administrables | [#28](https://github.com/pablogtab/price-checker/issues/28) | [#25](https://github.com/pablogtab/price-checker/issues/25), [#26](https://github.com/pablogtab/price-checker/issues/26) |
| 7. Tienda: Productos sin stock propio y promos con sabores | [#29](https://github.com/pablogtab/price-checker/issues/29) | [#24](https://github.com/pablogtab/price-checker/issues/24) |
| 8. Tienda: Carrito persistente con productos y combinaciones de promos | [#30](https://github.com/pablogtab/price-checker/issues/30) | [#29](https://github.com/pablogtab/price-checker/issues/29) |
| 9. Tienda: Pedido pendiente y continuación por WhatsApp | [#31](https://github.com/pablogtab/price-checker/issues/31) | [#30](https://github.com/pablogtab/price-checker/issues/30) |
| 10. Tienda: Bandeja de pedidos y conversión revisada a venta | [#32](https://github.com/pablogtab/price-checker/issues/32) | [#31](https://github.com/pablogtab/price-checker/issues/31) |
| 11. Tienda: Cerrar el recorrido completo y pulir la variante A | [#33](https://github.com/pablogtab/price-checker/issues/33) | [#27](https://github.com/pablogtab/price-checker/issues/27), [#28](https://github.com/pablogtab/price-checker/issues/28), [#32](https://github.com/pablogtab/price-checker/issues/32) |

Verificados: 11 sub-issues y 13 bloqueos nativos. Frente inicial: #23 y #25.
Cada ticket incluye sus propios criterios y validación integrada; el ticket de
cierre no sustituye las pruebas de cada entrega. No se inició implementación.
