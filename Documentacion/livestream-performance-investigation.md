# Investigacion de rendimiento en livestream

## Alcance

Revision enfocada en los dos sintomas reportados:

- Viewer movil con imagen tipo diapositivas cuando el host mueve la camara.
- Caidas de rendimiento cuando se spamean reacciones flotantes.

No se modifica la logica de transmision ni el transporte WebRTC/OME. Los cambios aplicados se limitan a metadata, UI y gestion de DOM.

## Hallazgos

### Viewer movil con movimiento

El flujo actual publica con OvenLiveKit/WebRTC y OvenMediaEngine en perfil `bypass_stream`, por lo que OME no transcodifica ni reescala el video: entrega lo que recibe del navegador. Eso descarta que el salto visual venga de un perfil ABR/transcoder interno de OME.

En el host movil, las restricciones actuales usan hasta 1280x720 con 24-30 fps y `contentHint = "motion"`. Cuando hay movimiento brusco, el cuello probable esta entre la captura/encoder del navegador Android y la capacidad de decodificacion/red del viewer, no en un re-render de React ni en un polling del feed. Como no se toca la logica de transmision en este punto, la solucion propuesta es medir stats WebRTC (`framesDropped`, `framesDecoded`, `jitter`, `packetsLost`, `bytesReceived`, `framesPerSecond`) y ajustar perfiles adaptativos por dispositivo si los drops vienen del encoder/decoder.

### Reacciones flotantes

El problema si tenia origen DOM/animacion: cada reaccion generaba nodos animados sin limite estricto y con intervalos muy cortos. Bajo spam, varios viewers y host podian acumular demasiadas animaciones simultaneas, aumentando layout/paint y compitiendo con la decodificacion del video.

## Cambios aplicados

- Las reacciones flotantes ahora se espacian mas entre si.
- Se limita el numero de burbujas activas por contenedor.
- Las burbujas usan `contain: layout paint style` para reducir impacto de layout/paint.

## Siguiente mejora recomendada

Para el problema de movimiento en viewer movil, el siguiente paso correcto es instrumentar `RTCPeerConnection.getStats()` durante una prueba real host movil -> viewer movil. Con esos datos se puede decidir si conviene:

- Bajar resolucion pero mantener fps para fluidez.
- Mantener resolucion y limitar fps si el encoder del host se satura.
- Agregar perfiles por dispositivo/conexion.
- Ajustar bitrate hints solo si hay perdida o jitter, no a ciegas.
