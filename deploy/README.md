# Contabo

Instancia: https://gevafit.mpsistemas.ar en `167.86.89.240`, directorio `/opt/gevafit`.
Usa el proyecto Compose `gevafit`, PostgreSQL 17 y volumen propios.
Nginx Proxy Manager publica `gevafit_web:80` mediante la red existente
`axenda-network`, con HTTPS y una lista de acceso privada para toda la app y API.
No se publican puertos de API ni PostgreSQL. La contraseña de acceso se administra
en Nginx Proxy Manager; no está en el código ni en la configuración del frontend.

## Actualizar

Este es el procedimiento para agentes cuando se pide publicar GevaFit. Una petición
como «subirlo a gevafit» autoriza este despliegue; crear o modificar esta documentación
no lo autoriza. Continuar hasta verificar la app publicada, sin pedir otra confirmación
para los pasos comprendidos en esa petición.

### 1. Preparar el cambio

- Confirmar la raíz del checkout y el remoto `pablogtab/price-checker`. Revisar
  `git status`, el diff y los archivos nuevos: el árbol local puede tener cambios
  válidos sin commit. Identificar lo que se va a publicar y preservar trabajo ajeno.
- Leer `compose.prod.yaml`, los Dockerfiles y `deploy/deploy.sh`. Usar los comandos
  de compilación y pruebas del proyecto para validar el cambio; las suites de base
  de datos requieren bases descartables distintas terminadas en `_test`, como
  documenta `README.md`. Reutilizar comprobaciones recientes si corresponden al mismo
  código; registrar su resultado y ejecutar las que falten.
- Revisar cada migración pendiente y su efecto sobre datos existentes. La API
  aplica las migraciones al iniciar; un build exitoso todavía no demuestra que se
  hayan aplicado en producción.

Completo cuando el conjunto de cambios está identificado y sus comprobaciones
relevantes pasan. Si hay archivos de propósito incierto, resolver ese alcance antes
de transferirlos.

### 2. Comprobar producción y transferir

Usar SSH existente; obtener cualquier credencial que falte por un canal seguro.
Mantener contraseñas, tokens y contenido de `.env`/`.auth` fuera de documentos,
comandos registrados y logs compartidos.

```sh
DEPLOY_HOST=root@167.86.89.240
DEPLOY_DIR=/opt/gevafit
ssh -o BatchMode=yes "$DEPLOY_HOST" \
  "cd '$DEPLOY_DIR' && docker compose -f compose.prod.yaml ps"
```

Confirmar que es la instancia prevista y comprobar migraciones aplicadas, jobs
activos y almacenamiento disponible. Registrar conteos y, cuando el cambio lo
requiera, hashes de los datos de negocio afectados mediante consultas de lectura.
Conservar esos resultados para compararlos después; no son un dump ni un backup.

Transferir únicamente código y configuración versionable. Esta lista incluye la
documentación de agentes; adaptarla solo si los Dockerfiles necesitan otro archivo
de código. Primero revisar el dry-run:

```sh
rsync -az --itemize-changes --dry-run \
  --exclude='node_modules/' --exclude='dist/' --exclude='.angular/' \
  --exclude='.env' --exclude='.env.*' --exclude='.auth/' \
  --exclude='__pycache__/' --exclude='.DS_Store' \
  apps deploy docs .agents AGENTS.md package.json package-lock.json \
  compose.prod.yaml .dockerignore requirements.txt scraper.py remote_login.py README.md \
  "$DEPLOY_HOST:$DEPLOY_DIR/"
```

Ejecutar el mismo comando sin `--dry-run` cuando la lista coincida con el cambio.
La transferencia usa una lista explícita y no elimina archivos remotos. Preservar
`.env`, `.auth`, `data` —incluidas imágenes manuales— y el volumen PostgreSQL.
Nunca importar la base local, ejecutar seeds ni reinicializar producción durante
una actualización. No generar backups: es una decisión explícita del usuario.

Completo cuando el dry-run fue revisado y los archivos necesarios están transferidos,
sin reemplazar los datos ni los secretos del servidor.

### 3. Publicar

```sh
ssh -o BatchMode=yes "$DEPLOY_HOST" \
  "cd '$DEPLOY_DIR' && bash deploy/deploy.sh"
```

El script mantiene el bloqueo de despliegue, valida Compose, compila y espera la
salud de los servicios. Conservar el resultado y revisar errores antes de reintentar.
Si falla, diagnosticar el paso concreto con logs acotados y redactados; corregir
dentro del alcance autorizado. Mantener la base y los volúmenes intactos. Cualquier
reparación que requiera destruir datos, revertir una migración con pérdida o cambiar
otra aplicación requiere una decisión del usuario.

Completo cuando el script termina correctamente y los servicios previstos están
sanos. El script no altera los proyectos Gym, phone-sale ni otras aplicaciones.

### 4. Verificar el resultado publicado

- Confirmar la migración esperada y comparar los datos protegidos con la lectura
  anterior. Para migraciones que cambian columnas, comparar valores conservados,
  no hashes de filas con distinto esquema. Si hubo operaciones reales concurrentes,
  distinguir esos cambios de los efectos del despliegue.
- Comprobar la URL HTTPS pública con el acceso privado vigente, la API y la pantalla
  o flujo modificado en navegador. Verificar recarga de enlaces directos y móvil si
  se modificó UI. Una prueba dentro del contenedor no sustituye esta comprobación.
- Usar operaciones de lectura en producción. Probar escrituras de negocio en la
  base descartable; registrar ventas, cobros o compras reales solo si se pidió.
- Mantener un solo worker de producción consultando al proveedor; no iniciar un
  scraper local paralelo como parte de la verificación.

Completo cuando hay evidencia de servicios sanos, migración aplicada, datos
preservados y flujo público funcionando. Si falta acceso para una comprobación,
informar exactamente qué está verificado y qué sigue pendiente, sin afirmar éxito
completo. Responder con el enlace publicado y un resumen breve del resultado.

La instalación inicial recibió una copia completa y transaccional de la base
local, incluyendo tablas, IDs y secuencias, más las imágenes ya descargadas y la
sesión del proveedor. Se compararon conteos y hashes de todas las tablas antes
de iniciar el worker. El dump temporal de transferencia se eliminó.
No hay backups automáticos configurados para esta app, por pedido del usuario.

## Operación

```sh
cd /opt/gevafit
docker compose -f compose.prod.yaml ps
docker compose -f compose.prod.yaml logs --tail=100 api worker
```

El worker actualiza diariamente a las 11:00 de Argentina y respeta el límite
configurado de solicitudes. El worker local quedó detenido para evitar que
ambas instalaciones consulten al proveedor simultáneamente. Renovar la sesión
desde Configuración si Coverweb la vence o rechaza desde el servidor.

## Instalar

La app incluye un manifiesto con modo standalone e iconos 192/512 px y para iOS.
Configuración incluye la opción/instrucciones de instalación. En Android/Chrome:
menú → Instalar app. En iPhone: Compartir → Agregar a inicio. En Safari para Mac:
Archivo → Agregar al Dock. El acceso privado se solicita cuando sea necesario.
Las consultas y operaciones requieren conexión; no se cachean datos de negocio
ni se registran ventas/compras sin conexión.
