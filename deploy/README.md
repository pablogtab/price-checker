# Contabo

Instancia: https://gevafit.mpsistemas.ar en `167.86.89.240`, directorio `/opt/gevafit`.
Usa el proyecto Compose `gevafit`, PostgreSQL 17 y volumen propios.
Nginx Proxy Manager publica `gevafit_web:80` mediante la red existente
`axenda-network`, con HTTPS y una lista de acceso privada para toda la app y API.
No se publican puertos de API ni PostgreSQL. La contraseña de acceso se administra
en Nginx Proxy Manager; no está en el código ni en la configuración del frontend.

## Actualizar

Transferir el código preservando `/opt/gevafit/.env`, `.auth`, `data` y el volumen
de PostgreSQL; ejecutar `bash deploy/deploy.sh`. Las migraciones se aplican al
iniciar la API. Este script no genera backups y no reemplaza la base existente.
Nunca importar otra vez la base local después de empezar a operar en el servidor.

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

El worker actualiza diariamente a las 08:00 de Argentina y respeta el límite
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
