# 📚 Diccionario de Datos: UPT Connect

Este documento detalla el esquema de base de datos de cada microservicio dentro del ecosistema UPT Connect, obtenido mediante el análisis de las migraciones y modelos ORM.

---

## 1. Auth Service

Gestiona la identidad centralizada y los datos del perfil académico.

### Tabla: `users`
| Campo | Tipo de Dato | Llave | Nulo | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `id` | Integer | PK | No | Identificador único del usuario (Usado en todos los servicios). |
| `google_id` | String | | No | ID único devuelto por Google OAuth. |
| `email` | String | | No | Correo institucional (`@virtual.upt.pe`). |
| `name` | String | | Sí | Nombre devuelto por Google. |
| `avatar_url` | String | | Sí | Enlace a la foto de perfil del usuario. |
| `banner_url` | String | | Sí | Enlace a la foto de portada del perfil. |
| `full_name` | String | | Sí | Nombre completo rellenado en el Onboarding. |
| `user_type` | Enum | | No | Rol académico (`student`, `teacher`). |
| `faculty` | String | | Sí | Facultad a la que pertenece (Ej: FAING). |
| `career` | String | | Sí | Carrera que estudia (Ej: Ing. Sistemas). |
| `area` | String | | Sí | Área de especialidad (Opcional). |
| `position_title` | String | | Sí | Cargo o puesto (Opcional). |
| `academic_cycle` | String | | Sí | Ciclo académico actual (Ej: 2026-I). |
| `student_code` | String | | Sí | Código de estudiante UPT. |
| `bio` | Text | | Sí | Breve descripción para el perfil social. |
| `role` | Enum | | No | Rol del sistema (`user`, `admin`). |
| `is_active` | Boolean | | No | Indica si la cuenta no está baneada (Por defecto `true`). |
| `is_profile_complete`| Boolean | | No | Indica si completó el formulario de primer acceso. |
| `last_seen_at` | Timestamp | | Sí | Última vez que el usuario estuvo activo en el sistema. |
| `blocked_reason` | Text | | Sí | Razón ingresada por un admin al bloquear. |
| `blocked_until` | Timestamp | | Sí | Fecha hasta la que dura un bloqueo temporal. |
| `created_at` / `updated_at` | Timestamp | | Sí | Fechas de auditoría de creación y última actualización. |



## 2. Posts Service

Gestiona todo el contenido publicado, reacciones, comentarios, reportes y transmisiones en vivo.

### Tabla: `posts`
| Campo | Tipo de Dato | Llave | Nulo | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `id` | Integer | PK | No | ID de la publicación. |
| `user_id` | Integer | FK | No | Usuario que realiza el post. |
| `group_id` | Integer | FK | Sí | Grupo en el que se realizó (Nulo si es en el Feed general). |
| `post_type` | String | | No | Tipo de post (`text`, `image`, `video`, `livestream`). |
| `user_name` / `user_avatar` / `user_faculty` | String | | Sí | Caché de los datos del autor para optimizar consultas. |
| `group_name` | String | | Sí | Caché del nombre del grupo si aplica. |
| `content` | Text | | Sí | Texto de la publicación. |
| `image_url` | String | | Sí | Ruta de la imagen adjunta. |
| `media_type` | String | | Sí | Tipo de multimedia adjunta. |
| `video_url` | String | | Sí | Ruta del video adjunto. |
| `visibility` | String | | Sí | Nivel de privacidad (`all`, `friends`, `faculty`). |
| `live_status` | Enum | | Sí | Estado del stream (`active`, `ended`). |
| `live_title` | String | | Sí | Título para transmisiones en vivo. |
| `stream_key` / `playback_url` | String | | Sí | Credenciales HLS/RTMP para el stream. |
| `live_source` | String | | Sí | Fuente (`camera`, `screen`). |
| `stream_aspect_ratio` | Enum | | Sí | Relación de aspecto (`16:9`, `9:16`). |
| `duration_seconds` | Integer | | Sí | Duración final del stream guardado. |
| `created_at` / `updated_at`| Timestamp| | Sí | Fechas de creación y actualización. |

### Tabla: `likes` / `comment_likes`
| Campo | Tipo de Dato | Llave | Nulo | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `id` | Integer | PK | No | ID de la reacción. |
| `user_id` | Integer | FK | No | Usuario que reacciona. |
| `post_id` / `comment_id` | Integer | FK | No | Elemento al que se reacciona. |
| `reaction_type` | Enum | | No | Tipo (`me_gusta`, `me_encanta`, `me_divierte`, `me_sorprende`, `me_enoja`). |

### Tabla: `comments`
| Campo | Tipo de Dato | Llave | Nulo | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `id` | Integer | PK | No | ID del comentario. |
| `user_id` | Integer | FK | No | Autor del comentario. |
| `post_id` | Integer | FK | No | Publicación comentada. |
| `content` | Text | | No | Texto del comentario. |
| `user_name` / `user_avatar` / `user_faculty`| String | | Sí | Caché de datos del autor para vistas rápidas. |
| `created_at`| Timestamp| | Sí | Fecha de creación (No usa updated_at). |

### Tabla: `content_reports`
| Campo | Tipo de Dato | Llave | Nulo | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `id` | Integer | PK | No | ID del reporte. |
| `reporter_id` | Integer | FK | No | Usuario que denuncia. |
| `target_type` | Enum | | No | Qué se reporta (`post`, `comment`). |
| `target_id` | Integer | FK | No | ID del post o comentario reportado. |
| `reason` | String | | No | Motivo de la denuncia. |
| `status` | Enum | | No | Estado (`pending`, `reviewed`, `dismissed`, `sanctioned`). |
| `reviewed_by` | Integer | FK | Sí | Admin que lo resolvió. |
| `reviewed_at` | Timestamp | | Sí | Cuándo fue revisado. |
| `resolution_notes`| Text | | Sí | Notas del admin sobre la acción tomada. |



---

## 3. Profile Social Service

Responsable de la red de contactos, bloqueos y grupos de estudio.

### Tabla: `friend_requests`
| Campo | Tipo de Dato | Llave | Nulo | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `id` | Integer | PK | No | ID de la solicitud. |
| `sender_id` | Integer | FK | No | Usuario que envía la solicitud. |
| `receiver_id` | Integer | FK | No | Usuario que recibe la solicitud. |
| `status` | Enum | | No | Estado (`pending`, `accepted`, `rejected`). |
| `created_at` / `updated_at` | Timestamp | | Sí | Auditoría. |

### Tabla: `user_blocks`
| Campo | Tipo de Dato | Llave | Nulo | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `id` | Integer | PK | No | ID del bloqueo de contacto. |
| `blocker_id` | Integer | FK | No | Usuario que aplica el bloqueo. |
| `blocked_id` | Integer | FK | No | Usuario que ha sido bloqueado. |
| `created_at` / `updated_at` | Timestamp | | Sí | Fechas de registro de la acción. |

### Tabla: `groups`
| Campo | Tipo de Dato | Llave | Nulo | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `id` | Integer | PK | No | ID del grupo. |
| `creator_id` | Integer | FK | No | Usuario fundador del grupo. |
| `name` | String | | No | Nombre del grupo. |
| `description` | Text | | Sí | Descripción o normas del grupo. |
| `cover_url` | String | | Sí | Imagen de portada. |
| `privacy` | Enum | | No | Privacidad (`public`, `private`). |

### Tabla: `group_memberships`
| Campo | Tipo de Dato | Llave | Nulo | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `id` | Integer | PK | No | ID de la membresía. |
| `group_id` | Integer | FK | No | ID del grupo al que se une. |
| `user_id` | Integer | FK | No | Estudiante que solicita o es miembro. |
| `role` | Enum | | No | Rol interno (`creator`, `admin`, `member`). |
| `status` | Enum | | No | Estado (`pending`, `approved`, `rejected`). |
| `reviewed_by` | Integer | FK | Sí | Admin del grupo que aceptó/rechazó. |



---

## 4. Chat Service

Almacena el historial de mensajes de texto, reportes internos de chat, y la información de la sesión WebRTC.

### Tabla: `messages`
| Campo | Tipo de Dato | Llave | Nulo | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `id` | Integer | PK | No | ID del mensaje directo. |
| `sender_id` | Integer | FK | No | Remitente. |
| `receiver_id` | Integer | FK | No | Destinatario. |
| `content` | Text | | Sí | Texto enviado. |
| `image_url` | String | | Sí | Imagen o archivo adjunto. |
| `is_read` | Boolean | | No | Marca de leído (check azul). |
| `created_at` / `updated_at` | Timestamp | | Sí | Tiempos del mensaje. |

### Tabla: `message_reports`
| Campo | Tipo de Dato | Llave | Nulo | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `id` | Integer | PK | No | ID del reporte. |
| `reporter_id` | Integer | FK | No | Usuario que reporta el mensaje. |
| `message_id` | Integer | FK | No | ID del mensaje reportado. |
| `reason` | String | | No | Motivo de la denuncia al admin. |
| `status` | Enum | | No | Estado de moderación (`pending`, `reviewed`...). |

### Tabla: `call_sessions`
| Campo | Tipo de Dato | Llave | Nulo | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `id` | BigInt | PK | No | ID de la sesión de llamada. |
| `caller_id` | BigInt | FK | No | Quien inicia la llamada. |
| `receiver_id` | BigInt | FK | No | Quien recibe la llamada. |
| `mode` | String | | No | Tipo (`audio`, `video`). |
| `status` | String | | No | Estado (`ringing`, `ongoing`, `ended`, `missed`). |
| `duration_seconds`| Integer | | No | Duración final (Por defecto `0`). |

### Tabla: `call_signals`
| Campo | Tipo de Dato | Llave | Nulo | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `id` | BigInt | PK | No | ID de la señal WebRTC. |
| `call_session_id`| BigInt | FK | No | Sesión a la que pertenece esta señal. |
| `sender_id` | BigInt | FK | No | El peer que emite la señal. |
| `signal_type` | String | | No | ICE Candidate, Offer, Answer. |
| `payload` | LongText | | Sí | JSON con el payload cifrado de la señal WebRTC. |

