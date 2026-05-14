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
git status --short --branch
```

Subir cambios:

```powershell
git add frontend/app.html frontend/js/app.js frontend/js/app-shared.js CONTEXTO_CODEX.md
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

- `ae50a0c optimizar live` esta localmente encima de `origin/main`.
- `ac8f89e estable v1.3.0` esta en `origin/main`.
- Antes hubo fixes de live: transicion, OME, proxy `/ome`, scroll movil, cierre WHIP, layout movil.

Importante: evitar `git add .` porque hay muchos archivos temporales y recursos locales sin versionar. Stagear solo archivos necesarios.

## Cambios locales no confirmados al crear este contexto

Hay una refactorizacion iniciada para reducir `frontend/js/app.js`:

- `frontend/app.html` ahora carga `/js/app-shared.js?v=1` antes de `/js/app.js?v=50`.
- Nuevo archivo `frontend/js/app-shared.js` con utilidades puras compartidas.
- `frontend/js/app.js` importa esas utilidades desde `window.UPTAppShared`.

Validaciones ya ejecutadas:

- `node --check frontend/js/app.js`
- `node --check frontend/js/app-shared.js`
- `docker compose up -d --build frontend`
- `http://localhost/js/app-shared.js` responde `200`
- `http://localhost/js/app.js` responde `200`

Esta refactorizacion todavia no estaba commiteada al crear este archivo.

## Live / livestream

Objetivo actual del live:

- Mantener `OvenMediaEngine + WHIP + HLS`.
- No cambiar arquitectura a WebRTC viewer directo ni multi-bitrate por ahora.
- Mejorar audio, fluidez, recuperacion y estabilidad sin romper comentarios, reacciones, finalizar live ni cambio de fuente.

Optimizacion ya aplicada en `frontend/js/app.js`:

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

Siguientes etapas recomendadas:

- Extraer modulo live cuando este suficientemente estable.
- Extraer modulo de llamadas/videollamadas.
- Extraer helpers de rutas/render solo si no dependen de estado interno complejo.
- Evitar mover vistas grandes sin pruebas, porque `app.js` tiene mucho estado compartido.

## Conversacion completa

El respaldo crudo de la conversacion esta en:

```text
C:\Users\Win\Desktop\rollout-2026-05-12T22-42-31-019e1f6d-d3b8-7250-928e-f228733ce500.jsonl
```

Pesa aproximadamente 165 MB. Sirve como respaldo, pero para trabajar en la VPS es mejor usar este resumen.

