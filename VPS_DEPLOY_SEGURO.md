# Guia breve de despliegue seguro a VPS

Esta guia resume las precauciones practicas para actualizar la VPS sin romper el sistema ni apuntar a una base de datos incorrecta.

## 1. Stack productivo correcto

En produccion, el stack correcto es:

- `uptconnect-*`

El repo correcto en la VPS es:

- `/opt/uptconnect/repo`

El compose correcto para produccion es:

- `/opt/uptconnect/repo/docker-compose.server.yml`

## 2. Comando correcto de despliegue

Siempre usar `-p uptconnect` para evitar que Docker Compose cree otro proyecto por el nombre de la carpeta (`repo`).

Si existe el script de despliegue, preferir usarlo:

```bash
cd /opt/uptconnect/repo
bash actualizar-vps.sh
```

Ejemplo:

```bash
cd /opt/uptconnect/repo
docker compose -p uptconnect -f docker-compose.server.yml build frontend auth-service posts-service profile-social-service chat-service
docker compose -p uptconnect -f docker-compose.server.yml up -d frontend auth-service posts-service profile-social-service chat-service
```

Si hay cambios de infraestructura del proxy:

```bash
docker compose -p uptconnect -f docker-compose.server.yml up -d caddy
```

## 3. Nunca hacer esto

- No ejecutar `docker compose up` sin `-p uptconnect`.
- No desplegar UPT desde `/opt/examenu1/repo`.
- No asumir que cualquier contenedor `repo-*` es basura sin revisar.
- No borrar volumenes de Docker sin confirmar primero que no pertenecen a produccion.
- No cambiar aliases o redes publicas sin verificar quien publica `uptconnect.duckdns.org`.

## 4. Proxy publico correcto

Ahora el proxy publico de UPT vive dentro del stack `uptconnect-*`.

Archivo:

- `/opt/uptconnect/repo/infrastructure/caddy/Caddyfile`

Servicio:

- `uptconnect-caddy-1`

Dominio:

- `https://uptconnect.duckdns.org/`

## 5. Bases de datos productivas

Los volumenes productivos correctos son:

- `uptconnect_auth_db_data`
- `uptconnect_posts_db_data`
- `uptconnect_social_db_data`
- `uptconnect_chat_db_data`

Antes de tocar contenedores o limpiar cosas, recordar:

- los contenedores se pueden recrear
- los volumenes contienen los datos reales

## 6. Error real que ya paso y no debe repetirse

Ya ocurrio este problema:

- se levanto otro stack por no fijar `-p uptconnect`
- Docker creo contenedores `repo-*`
- ese stack apunto a otra base de datos
- el sistema mandaba al onboarding porque el usuario existia en otra BD o con datos incompletos

Conclusion:

- si aparece un stack `repo-*` mientras se despliega UPT, eso es una alerta
- detenerse y verificar antes de seguir

## 7. Verificaciones rapidas despues del deploy

Revisar contenedores:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

Revisar stacks compose:

```bash
docker compose ls
```

Debe existir el stack:

- `uptconnect`

Y no deberian reaparecer stacks accidentales como:

- `repo`
- `proyecto-si889-2026-i-u1-redsocialupt`

Probar el dominio:

```bash
curl -I https://uptconnect.duckdns.org/
```

Debe responder algo como:

- `HTTP/2 200`

## 8. Si algo sale mal

Si despues de un deploy:

- te manda al onboarding sin sentido
- desaparecen usuarios
- el dominio no responde
- aparecen contenedores `repo-*`

hacer estas comprobaciones antes de tocar datos:

1. Ver que el dominio este entrando al `uptconnect-caddy-1`.
2. Ver que el frontend activo sea `uptconnect-frontend-1`.
3. Ver que el stack levantado sea `uptconnect`.
4. Ver que los volumenes en uso sean `uptconnect_*`.
5. No modificar la base de datos hasta confirmar que no se esta usando otro stack.

## 9. Limpieza segura

Si algun dia reaparece un stack incorrecto, primero confirmar que no publica el dominio y que no es infraestructura compartida.

La limpieza segura es:

1. identificar stack correcto
2. mover el trafico al stack correcto si hiciera falta
3. apagar contenedores incorrectos
4. dejar los volumenes como respaldo hasta estar totalmente seguro

## 10. Recordatorio corto

Para produccion, pensar siempre asi:

- repo correcto: `/opt/uptconnect/repo`
- compose correcto: `docker-compose.server.yml`
- proyecto correcto: `uptconnect`
- dominio correcto: `uptconnect.duckdns.org`
- volumenes correctos: `uptconnect_*`

## 11. Script recomendado

Archivo:

- `actualizar-vps.sh`

Objetivo:

- hacer `git pull`
- hacer build de los servicios principales
- levantar de nuevo el stack correcto
- verificar rapido que el dominio siga respondiendo

Uso esperado:

```bash
cd /opt/uptconnect/repo
bash actualizar-vps.sh
```
