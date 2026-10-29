# Inicio de la tienda

El inicio usa la revisión de contenido del catálogo: `home` se guarda junto con
`entries`, categorías y marcas. Guardar crea una revisión inmutable y publicar
cambia el puntero completo; una revisión obsoleta devuelve 409.

`home.featuredIds` es una lista ordenada de identidades públicas: ID numérico de
presentación o `promo-<id>`. `home.banners` es una lista ordenada (máximo 8) de
`{id,title,mediaId,destination:{type:'product'|'category',id}}`. El ID del banner
permanece estable al editarlo y los recursos vienen de la biblioteca privada.
Un destino producto usa la identidad pública, una categoría su ID estable.
No se permiten enlaces externos ni referencias a fichas fuera de la selección.

El catálogo público y la vista previa devuelven `home.featured` con DTOs públicos
calculados desde precios/elegibilidad actuales y `home.banners` con título,
imagen responsive, destino y enlace interno. Se resuelven sobre el catálogo
completo de esa revisión, antes de filtrar o paginar. Las categorías vacías o
fichas sin opciones elegibles retiran el banner dinámicamente. No se congelan
precios en los banners ni hace falta republicar después de actualizar stock.
La vista previa es privada y usa rendiciones privadas de la biblioteca.

Guardar valida destinos y ambas rendiciones; publicar repite la validación.
Los fallos conservan revisión y publicación. Si un editor antiguo omite `home`,
se conservan las referencias válidas y se retiran las que su selección acaba de
quitar. Una edición explícita inválida devuelve 400.

Los usos de medios tienen dueño `storefront_draft` o `storefront_published`, ID
del banner y slot `banner`. Solo se reemplazan los usos de banners propios de
la revisión anterior; las galerías y referencias independientes se conservan.
La ruta pública de rendiciones solo admite recursos referidos por la revisión
publicada. La biblioteca, el original y la vista previa siguen privados.

Las fichas de promo usan `/promos/<id>` y las presentaciones `/products/<id>`.
La identidad `promo-<id>` se conserva en destacados y destinos, sin crear una
presentación ficticia ni mezclar su ID con el de una presentación.
