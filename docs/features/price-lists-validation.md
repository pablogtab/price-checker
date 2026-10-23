# Validación y publicación · 22/10/2026

- Compilación de API/frontend correcta; 14 regresiones REST/PostgreSQL/navegador
  y 5 pruebas de formato y promos correctas. Escritorio y móvil validados localmente.
- Publicado mediante `deploy/deploy.sh`; API, web y PostgreSQL sanos, un worker.
  Migraciones PriceLists1760097600023 y PriceListOrders1760097600024 aplicadas.
- Sincronización selectiva solicitada desde la copia local de producción:
  89 productos totales, 53 activos (incluidas 3 promos), 6 productos nuevos,
  50 vínculos y 67 componentes de kits activos/archivados. Una lista guardada
  con 44 productos seleccionados; plazo y permisos compartidos incluidos.
- Stock local incluido por pedido expreso. El stock existente coincidía con
  producción; los productos nuevos tenían cero. Se conservaron IDs y secuencias.
- Importación ensayada en PostgreSQL local descartable; aplicada en una transacción
  con bloqueo y comprobación de cambios concurrentes, sin reemplazar la base.
  Verificación posterior de configuración, stock, vínculos, kits y selección correcta.
- Conteos y hashes idénticos antes/después en las 13 tablas de ventas, clientes,
  compras, cobros, Caja y movimientos de stock: 9 ventas, 9 clientes y 7 cobros
  de ventas conservados. Catálogo de proveedores y configuración de acceso preservados.
- HTTPS público verificado en Chrome con el acceso privado existente: enlace
  directo, lista guardada, productos agrupados, permisos y generación del texto.
  Confirmado «Disponible» para un solo sabor cuando también existen encargos,
  y el texto compacto de promos. Captura pública inspeccionada.
- Sin backups ni reinicialización de producción.
