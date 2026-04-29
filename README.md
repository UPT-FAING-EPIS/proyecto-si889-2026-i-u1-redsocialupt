# Red Social UPT

Plataforma social universitaria para la comunidad de la Universidad Privada de Tacna. El acceso se realiza con cuenta institucional `@virtual.upt.pe` mediante Google OAuth.

Dominio productivo usado:

- [https://uptconnect.duckdns.org](https://uptconnect.duckdns.org)

## 1. Objetivo del proyecto

El sistema permite:

- iniciar sesion con Google
- completar onboarding academico
- publicar texto e imagenes
- controlar visibilidad de publicaciones
- reaccionar y comentar
- gestionar amistades
- chatear entre amigos
- administrar usuarios y moderar contenido

## 2. Stack tecnologico

| Parte | Tecnologia |
|---|---|
| Frontend | HTML, CSS, JavaScript, Nginx |
| Backend | PHP + Lumen |
| Arquitectura | Microservicios |
| Base de datos | MySQL, una por servicio |
| Autenticacion | Google OAuth + JWT |
| Contenedores | Docker + Docker Compose |
| Infraestructura | Terraform |
| CI | GitHub Actions |
| Calidad | SonarCloud |
| Seguridad | Snyk |

## 3. Arquitectura

El sistema se divide en 5 servicios:

| Servicio | Puerto local | Base de datos | Funcion principal |
|---|---:|---|---|
| `frontend` | `80` | - | Interfaz web |
| `auth-service` | `8001` | `auth_db` | login, JWT, perfil, admin |
| `posts-service` | `8002` | `posts_db` | publicaciones, comentarios, likes |
| `profile-social-service` | `8003` | `social_db` | amistades, directorio |
| `chat-service` | `8004` | `chat_db` | mensajes e imagenes en chat |

Bases de datos locales expuestas:

| Base | Puerto local |
|---|---:|
| `auth_db` | `3306` |
| `posts_db` | `3307` |
| `social_db` | `3308` |
| `chat_db` | `3309` |

## 4. Requisitos

Para desarrollo local:

- Docker Desktop
- Docker Compose
- Git
- cuenta de Google Cloud con OAuth configurado

Para despliegue en VPS:

- Debian o Linux similar
- Docker y Docker Compose
- dominio o subdominio apuntando a la VPS
- acceso root o sudo
- reverse proxy con Caddy o Nginx

## 5. Google OAuth

En Google Cloud Console, el cliente OAuth debe tener agregado el origen del frontend.

Para local:

- `http://localhost`
- `http://127.0.0.1`

Para VPS:

- `https://uptconnect.duckdns.org`

En este proyecto el punto clave es **Authorized JavaScript origins**.

## 6. Procedimiento de despliegue local

### 6.1 Clonar el proyecto

```bash
git clone https://github.com/UPT-FAING-EPIS/proyecto-si889-2026-i-u1-redsocialupt.git
cd proyecto-si889-2026-i-u1-redsocialupt
```

### 6.2 Levantar contenedores

```bash
docker compose up --build
```

### 6.3 Accesos locales

- Frontend: [http://localhost](http://localhost)
- Auth Service: [http://localhost:8001](http://localhost:8001)
- Posts Service: [http://localhost:8002](http://localhost:8002)
- Profile Social Service: [http://localhost:8003](http://localhost:8003)
- Chat Service: [http://localhost:8004](http://localhost:8004)

### 6.4 Reinicio recomendado cuando cambian archivos de infraestructura

Si cambias:

- `docker-compose.yml`
- `frontend/nginx.conf`
- configuraciones internas de contenedores

conviene recrear servicios:

```bash
docker compose up -d --build
```

o solo reiniciar lo necesario:

```bash
docker compose up -d --build frontend chat-service
```

## 7. Procedimiento de despliegue en VPS

### 7.1 Idea general

El proyecto puede convivir con otro sistema en la misma VPS si:

- no reutiliza `80/443` directamente
- usa su propio stack Docker
- usa sus propias bases de datos
- el reverse proxy principal redirige por dominio

### 7.2 Estructura recomendada

```text
/opt/uptconnect/repo
```

### 7.3 Despliegue

1. subir el proyecto a la VPS
2. ubicarlo en `/opt/uptconnect/repo`
3. usar un compose propio del stack `uptconnect`
4. levantar servicios sin bajar otros stacks
5. conectar el frontend del nuevo stack a la red publica del reverse proxy
6. agregar el dominio nuevo al proxy

### 7.4 Ejemplo de stack

Nombre del proyecto Docker:

- `uptconnect`

Contenedores esperados:

- `uptconnect-frontend-1`
- `uptconnect-auth-service-1`
- `uptconnect-posts-service-1`
- `uptconnect-profile-social-service-1`
- `uptconnect-chat-service-1`
- `uptconnect-auth-db-1`
- `uptconnect-posts-db-1`
- `uptconnect-social-db-1`
- `uptconnect-chat-db-1`

## 8. GitHub Actions, SonarCloud y Snyk

El pipeline actual hace:

1. pruebas de `auth-service`
2. pruebas de `posts-service`
3. pruebas de `profile-social-service`
4. pruebas de `chat-service`
5. subida de reportes de cobertura
6. analisis en SonarCloud
7. analisis en Snyk

Importante:

- SonarCloud analiza calidad y lee la cobertura
- PHPUnit genera la cobertura
- GitHub Actions pasa esos reportes a SonarCloud

En el fork:

- `docker-build` y `docker-publish` no deben ejecutarse

En el repo principal:

- si pueden ejecutarse segun la condicion del workflow

## 9. Base de datos

Cada microservicio tiene su propia base.

Eso ayuda a:

- separar responsabilidades
- evitar acoplar demasiado los servicios
- desplegar y mantener cada parte con mas orden

Las tablas de control `migrations` existen para que Lumen/Laravel sepa que cambios de base ya se aplicaron.


## 10. Requerimientos Funcionales
### RF-01 — Autenticación Institucional con Google OAuth
El sistema permite el inicio de sesión exclusivamente mediante cuentas institucionales con dominio `@virtual.upt.pe` a través de Google OAuth 2.0. Al autenticarse por primera vez, el usuario es redirigido a un formulario de onboarding donde debe completar su información académica: nombre completo, tipo de usuario (estudiante/docente), facultad, escuela profesional, ciclo y código institucional. El sistema valida el dominio del correo en el backend antes de emitir el JWT. La sesión puede cerrarse desde cualquier página, invalidando el token localmente.

### RF-02 — Creación de Publicaciones con Control de Visibilidad
Los usuarios pueden crear publicaciones que combinan texto libre e imágenes subidas al servidor. Cada publicación incluye un selector de visibilidad con tres opciones: **Toda la comunidad UPT** (cualquier usuario autenticado puede verla), **Solo amigos** (solo usuarios con quienes existe una relación de amistad aceptada), y **Solo mi facultad** (solo usuarios que pertenecen a la misma facultad). Las publicaciones se almacenan con los metadatos del autor, como nombre, avatar y facultad, para ser mostradas sin consultas adicionales al servicio de autenticación.

### RF-03 — Feed Cronológico con Filtrado por Relaciones y Visibilidad
La pantalla principal muestra un feed de publicaciones ordenado cronológicamente, de la más reciente a la más antigua. El contenido que aparece se filtra dinámicamente según las relaciones del usuario y la configuración de visibilidad de cada publicación: el usuario ve sus propias publicaciones, las públicas de todos, las visibles para amigos confirmados y las de su misma facultad. El feed se carga al iniciar sesión y puede refrescarse manualmente. Se muestra el nombre, avatar, facultad y fecha relativa del autor en cada publicación.

### RF-04 — Sistema de Likes en Publicaciones
Los usuarios pueden dar o quitar "me gusta" a cualquier publicación visible en el feed. El contador de likes se actualiza en tiempo real en la interfaz sin recargar la página. Cada usuario solo puede dar un like por publicación. El botón cambia visualmente de estado para reflejar si el usuario ya reaccionó a esa publicación.

### RF-05 — Comentarios en Publicaciones con Likes en Comentarios
Los usuarios pueden escribir y publicar comentarios en cualquier publicación visible. Los comentarios se muestran debajo de la publicación con el nombre, avatar y fecha del autor. Adicionalmente, cada comentario puede recibir likes de forma independiente, con su propio contador visible. Los comentarios se cargan junto con la publicación y se añaden en tiempo real al enviarlos, sin recargar la página.

### RF-06 — Gestión de Perfil de Usuario
Cada usuario cuenta con una página de perfil que muestra su información académica, foto de perfil, foto de portada, biografía personal, número de publicaciones y número de amigos. Desde el perfil propio, el usuario puede editar su biografía, subir o cambiar su foto de perfil y su foto de portada. Las imágenes se almacenan en el servidor y la URL queda registrada en el servicio de autenticación para ser utilizada en publicaciones y comentarios.

### RF-07 — Directorio de Amigos con Sistema de Solicitudes
La sección de Amigos ofrece un directorio de usuarios de la plataforma con opciones de filtrado por facultad y escuela, y búsqueda por nombre. Los usuarios pueden enviar solicitudes de amistad a otros usuarios. El destinatario recibe la solicitud y puede aceptarla o rechazarla. Una vez aceptada, ambos usuarios se agregan mutuamente como amigos. Se muestra un badge con el número de solicitudes pendientes en el ícono de navegación. La lista de amigos confirmados es visible en el perfil de cada usuario.

### RF-08 — Chat Privado entre Amigos
Los usuarios con relación de amistad confirmada pueden iniciar conversaciones de chat privado. La pantalla de mensajes muestra la lista de conversaciones activas y el hilo del chat seleccionado. Soporta envío de mensajes de texto e imágenes. Los nuevos mensajes se cargan automáticamente mediante polling cada 3 segundos para simular tiempo real. Los mensajes propios y del interlocutor se distinguen visualmente por alineación y color.

### RF-09 — Panel de Administración
Los usuarios con rol de administrador tienen acceso a un panel de control exclusivo con dos módulos: **Gestión de Usuarios**, donde pueden ver el listado completo de cuentas, editar la información académica de cualquier usuario, cambiar roles entre usuario y administrador, y bloquear o desbloquear cuentas con motivo opcional de bloqueo; y **Moderación de Contenido**, donde pueden visualizar todas las publicaciones y comentarios de la plataforma y eliminarlos si incumplen las normas de la comunidad universitaria. El acceso al panel está protegido por verificación de rol en el backend.



## ⚙️ Requerimientos No Funcionales

| # | Descripción |
|---|---|
| RNF-01 | Acceso exclusivo mediante dominio `@virtual.upt.pe` con Google OAuth |
| RNF-02 | Autenticación delegada a Google (sin almacenamiento de contraseñas) |
| RNF-03 | Comunicación entre servicios autenticada con JWT |
| RNF-04 | Código sin vulnerabilidades Critical/Blocker en SonarCloud |
| RNF-05 | Dependencias sin vulnerabilidades críticas según Snyk |
| RNF-06 | Pipeline CI/CD funcional en GitHub Actions |
| RNF-07 | Sistema desplegado en VPS Debian con Docker |
| RNF-08 | Infraestructura provisionada con Terraform |
| RNF-09 | README con procedimiento completo de despliegue |
| RNF-10 | Wiki de GitHub con características del producto y roadmap |


## 🚫 Restricciones

| # | Descripción |
|---|---|
| RE-01 | Solo usuarios con cuenta `@virtual.upt.pe` pueden autenticarse |
| RE-02 | El sistema requiere conexión a Internet para funcionar |
| RE-03 | El almacenamiento de imágenes está limitado al espacio de la VPS |

## 11. Integrantes

| Nombre | Codigo |
|---|---|
| Ricardo Daniel Cutipa Gutierrez | 2021069827 |
| Ivan Malaga Espinoza | 2021071086 |
| Angel Chino Rivera | 2021069830 |

## 12. Curso

- Curso: Patrones de Software
- Universidad: Universidad Privada de Tacna
- Periodo: 2026-I
