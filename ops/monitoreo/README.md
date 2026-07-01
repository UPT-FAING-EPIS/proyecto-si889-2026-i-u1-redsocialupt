# Stack de Monitoreo monitoreorevivir

Este directorio agrupa el stack del proyecto de monitoreo para que pueda levantarse en una VPS nueva sin tocar el proyecto web principal ni uptconnect.

El despliegue final se realizara bajo `/opt/monitoreorevivir` y el dominio publico de este stack sera `nuevotunel.ddns.net`.

## Contenido

- `docker-compose.ome.yml`: contenedor aislado de OvenMediaEngine.
- `nginx/`: configuraciones de Nginx para proxy y publicacion.
- `systemd/`: unidades para dejar corriendo los scripts Python 24/7.
- `scripts/`: scripts de instalacion, arranque y verificacion.

## Puertos usados por este stack

- `1935` RTMP
- `3333` WebRTC signaling
- `3478` STUN/TURN
- `8080` panel/servicio web de Oven
- `5000` `Verclips.py`
- `5001` `upload_server.py`
- `5002` `stats_websocket_server.py`
- `10000-10005` UDP para WebRTC

## Estructura sugerida en la VPS nueva

```text
/opt/monitoreorevivir/
  ome/
    conf/
    logs/
    docker-compose.yml
    index.html
    credenciales.json
    notificacionestest-7c1c8-firebase-adminsdk-fbsvc-dd0bdcf125.json
    stats_websocket_server.py
    upload_server.py
    Verclips.py
  nginx/
  systemd/
```

## Orden recomendado de despliegue

1. Copiar `Detalles/ome` a `/opt/monitoreorevivir/ome`.
2. Copiar las configs de `Detalles/sites-available` a `nginx/` y adaptarlas al dominio nuevo.
3. Levantar `ovenmediaengine` con `docker compose up -d`.
4. Registrar los servicios `systemd` para `5000`, `5001` y `5002`.
5. Probar que `index.html` puede hablar con `5001` y `3333`.
6. Ejecutar un smoke test simple que solo confirme `200 OK` en el endpoint elegido.

## Notas de seguridad

- No reutilizar la configuracion del proyecto principal.
- No reiniciar contenedores existentes de produccion.
- Cambiar las IPs viejas (`161.132.38.250`) por `nuevotunel.ddns.net` o por la IP real de la VPS nueva antes de publicar.
- La base de datos ya existe y solo debe reutilizarse bajo el nombre operativo `monitoreorevivir-db`; no debe recrearse ni vaciarse.
- Mantener las credenciales fuera del control de versiones en el runtime real.
