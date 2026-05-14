# Contexto para continuar con Codex

Este archivo resume el estado util del proyecto para poder continuar desde otra maquina o desde la VPS sin depender de la conversacion completa.

## Proyecto

- Repo local original: `C:\Users\Win\Desktop\proyecto-si889-2026-i-u1-redsocialupt`
- Repo en VPS: `/opt/uptconnect/repo`
- Dominio desplegado: `https://uptconnect.duckdns.org`
- VPS: `152.53.46.127`
- Rama de trabajo actual: `main`
- Remoto Git: `origin/main`

## Servicios principales

- Frontend: servido por Docker, puerto web normal.
- Backend/auth/posts: servicios del `docker-compose.server.yml`.
- WebRTC llamadas: usa senalizacion del sistema y TURN/coturn en VPS.
- Livestream: arquitectura actual `OvenMediaEngine + WHIP + HLS`.
- OME en VPS debe estar levantado como contenedor y expuesto detras de `/ome`.

## Comandos utiles

Local:

```powershell
docker compose up -d --build frontend
docker compose ps
node --check frontend/js/app.js
node --check frontend/js/app-shared.js
node --check frontend/js/app-live-media.js
git status --short --branch
```

Subir cambios:

```powershell
git add frontend/app.html frontend/js/app.js frontend/js/app-shared.js frontend/js/app-live-media.js CONTEXTO_CODEX.md
git commit -m "mensaje"
git push origin main
```

Actualizar VPS:

```bash
cd /opt/uptconnect/repo
git checkout main
git pull origin main
docker compose -p uptconnect -f docker-compose.server.yml up -d --build frontend
docker compose -p uptconnect -f docker-compose.server.yml ps
```

Si se cambian servicios backend u OME, reconstruir tambien los servicios afectados:

```bash
docker compose -p uptconnect -f docker-compose.server.yml up -d --build frontend posts-service auth-service ovenmediaengine
```

## Estado Git reciente

Commits relevantes recientes:

- `464227e extraer utilidades app y contexto codex` esta en `origin/main`.
- `ae50a0c optimizar live` esta incluido debajo de ese commit.
- `ac8f89e estable v1.3.0` es la base estable anterior.
- Antes hubo fixes de live: transicion, OME, proxy `/ome`, scroll movil, cierre WHIP, layout movil.

Importante: evitar `git add .` porque hay muchos archivos temporales y recursos locales sin versionar. Stagear solo archivos necesarios.

## Cambios locales no confirmados actuales

La primera refactorizacion de utilidades compartidas ya esta commiteada en `464227e`.

Continuacion actual iniciada:

- Nuevo archivo `frontend/js/app-live-media.js` con helpers de media live:
  - `getLiveAudioConstraints()`
  - `getLiveVideoConstraints(source, overrides)`
  - `applyLiveTrackHints(stream, source)`
  - `createMixedAudioTrack(displayAudioTrack, micAudioTrack)`
- `frontend/app.html` carga `/js/app-live-media.js?v=1` despues de `app-shared` y antes de `/js/app.js?v=51`.
- `frontend/js/app.js` importa esos helpers desde `window.UPTLiveMedia`.
- `frontend/js/app.js` bajo de 10,024 a 9,927 lineas.

Validaciones ya ejecutadas:

- `node --check frontend/js/app.js`
- `node --check frontend/js/app-shared.js`
- `node --check frontend/js/app-live-media.js`
- `docker compose -p uptconnect -f docker-compose.server.yml up -d --build frontend`
- Dentro de `uptconnect-frontend-1`, Nginx responde `200 OK` para `/js/app-live-media.js`.
- Dentro de `uptconnect-frontend-1`, Nginx responde `200 OK` para `/js/app.js`.

Pendiente antes de publicar:

- Commit/push stageando solo los archivos necesarios.

## Live / livestream

Objetivo actual del live:

- Mantener `OvenMediaEngine + WHIP + HLS`.
- No cambiar arquitectura a WebRTC viewer directo ni multi-bitrate por ahora.
- Mejorar audio, fluidez, recuperacion y estabilidad sin romper comentarios, reacciones, finalizar live ni cambio de fuente.

Optimizacion ya aplicada en live (helpers ahora en `frontend/js/app-live-media.js` y usados por `frontend/js/app.js`):

- `getLiveAudioConstraints()`
- `getLiveVideoConstraints(source, overrides)`
- `createMixedAudioTrack(displayAudioTrack, micAudioTrack)`
- `applyLiveTrackHints(stream, source)`
- Audio con `echoCancellation`, `noiseSuppression`, `autoGainControl`, `channelCount`, `sampleRate` y `sampleSize`.
- Mezcla PC pantalla + microfono con Web Audio, `GainNode` y `DynamicsCompressorNode`.
- `track.contentHint`: pantalla `detail`, camara `motion`, audio `speech`.
- Pantalla intenta usar hasta 1080p/60fps.
- Camara usa perfil mas estable, especialmente en movil.
- HLS viewer ajustado para no perseguir el live edge de forma tan agresiva.

Comportamiento deseado:

- El blur solo debe aparecer cuando hay cambio real de fuente/camara, no al iniciar el directo.
- Ante cortes breves normales, mantener ultimo frame visible y mostrar spinner, no pantalla negra.
- El boton de cambiar fuente en host PC debe mantenerse visible aunque se abra/cierre DevTools o cambie el ancho.
- Si el host cambia de pagina o cierra navegador, el stream debe finalizar.
- En movil, host y viewer deben poder escribir comentario y reaccionar.
- El scroll de chat movil ya fue corregido y no debe romperse.

Problemas historicos ya tratados:

- Viewer no cargaba HLS por 404 o timeout de manifiestos.
- Cambio de fuente/camara congelaba viewer.
- Cambio de camara movil fallaba por no liberar la camara anterior.
- Chat movil no permitia scroll.
- Layout inmersivo PC en media pantalla deformaba chat.

## Llamadas y videollamadas

Estado general:

- Llamadas y videollamadas funcionan con ventana flotante movible.
- La llamada debe seguir activa fuera de Mensajes.
- Al recargar pagina se debe cortar la llamada.
- Se arreglo audio/video, mute, colgar, camara remota, nuevas llamadas sin F5, y falsos mensajes de llamada no disponible.
- TURN/coturn se monto en VPS para mejorar conectividad.

## Refactorizacion de `app.js`

Meta:

- Reducir cantidad de texto y complejidad de `frontend/js/app.js` sin quitar funcionalidades.
- No minificar manualmente ni hacer cambios opacos.
- Preferir modularizar en archivos claros.

Primera etapa hecha:

- Extraidas utilidades puras a `frontend/js/app-shared.js`.
- `app.js` bajo de aproximadamente 10,386 lineas a unas 10,024 lineas.

Segunda etapa iniciada:

- Extraidos helpers de media live a `frontend/js/app-live-media.js`.
- `app.js` bajo a 9,927 lineas.

Siguientes etapas recomendadas:

- Extraer mas piezas pequenas del live cuando esten suficientemente estables (por ejemplo helpers de viewer HLS o UI de comentarios/reacciones), evitando mover el mount completo de golpe.
- Extraer modulo de llamadas/videollamadas.
- Extraer helpers de rutas/render solo si no dependen de estado interno complejo.
- Evitar mover vistas grandes sin pruebas, porque `app.js` tiene mucho estado compartido.

## Conversacion completa

El respaldo crudo de la conversacion esta en:

```text
C:\Users\Win\Desktop\rollout-2026-05-12T22-42-31-019e1f6d-d3b8-7250-928e-f228733ce500.jsonl
```

Pesa aproximadamente 165 MB. Sirve como respaldo, pero para trabajar en la VPS es mejor usar este resumen.
