# GEVA · Prototipo de tienda

Pregunta: ¿qué composición hace más simple navegar suplementos, elegir sabores y
armar un pedido por WhatsApp, con la identidad de GEVA?

Tres variantes desechables en una superficie pública nueva, separada de la gestión
real. Usa la convención manual de rutas del proyecto; el bootstrap de desarrollo
monta `/prototype/storefront`. Ninguna variante consulta la API ni persiste datos.

```sh
npm run prototype:storefront
```

- `/prototype/storefront?variant=A`: tienda visual, banner compacto, categorías y tarjetas.
- `/prototype/storefront?variant=B`: compra directa, categorías laterales, filas y carrito lateral.
- `/prototype/storefront?variant=C`: editorial, portada dividida, colecciones y listado tipográfico.

La barra inferior cambia variante con flechas o teclado ←/→ y abre Tienda/Gestión.
No captura las flechas al escribir ni dentro de un diálogo. «{ }» muestra todo el
estado simulado; cada cambio de variante también lo imprime en consola. La ruta
no se monta en builds de producción y su barra está condicionada a desarrollo.

Para recorrer: elegir un producto, seleccionar sabor, agregar; elegir una promo
y sus dos sabores; abrir carrito, cambiar cantidad y continuar por WhatsApp.
Este último botón muestra el mensaje **simulado**: no abre WhatsApp ni envía nada.
El pedido de prueba puede verse en Gestión/Pedidos y simular su conversión.

Gestión incluye borrador de nombre/descripción, elegir portada, ordenar fotos
arrastrando, carga múltiple de archivos locales y biblioteca. Vista previa muestra
el borrador y Publicar actualiza solo la memoria del prototipo. Las listas del
editor, marcas/categorías y navegación lateral son una muestra visual; no son una
implementación funcional completa de la administración.

Se utilizaron el logo original y fotos ya descargadas localmente del proveedor.
Los nombres/precios son ejemplos estáticos, no información actual del negocio.
No se copiaron sesiones, credenciales ni datos de clientes. No se inició un scraper.

Verificación visual: capturas en 1440 px y 390 px de las tres variantes, ficha,
promo, carrito y gestión. Se verificó selección y agregado, preparación de pedido
simulado y navegación a su gestión. Cero solicitudes a `/api` y sin desbordamiento
horizontal en las tres variantes. Capturas locales en
`/tmp/gevafit-storefront-preview/`; código fuente preservado en
`prototype/storefront-ui`. La variante A fue elegida por el usuario el 29/10/2026.

Definición de negocio confirmada: `docs/features/storefront-discovery.md`.
No promover este código directamente a producción: reimplementar la variante
validada con la especificación, persistencia y pruebas correspondientes.

## Resultado de la revisión

Variante A seleccionada. Se conserva la referencia completa de A/B/C para
trazabilidad, pero la implementación futura se basará en A. El usuario pidió
pulir detalles y usar el ícono de WhatsApp. Se incorporó al botón de continuar,
con revisión de capturas en escritorio y móvil. Fuente del SVG: Simple Icons,
`https://github.com/simple-icons/simple-icons/blob/develop/icons/whatsapp.svg`.

Antes de implementar, revisar espaciados, tipografía, fotos, accesibilidad de
controles, estados vacíos/carga/errores y comportamiento móvil en el prototipo
validado. La elección de la composición no convierte este código en producción.
