# 🎓 Red Social UPT

Plataforma social universitaria exclusiva para la comunidad de la Universidad Privada de Tacna (UPT). Solo accesible con cuenta institucional `@virtual.upt.pe` mediante Google OAuth.wtre

---

## 🛠️ Stack Tecnológico

| Parte | Tecnología |
|---|---|
| Backend | PHP + Lumen (microservicios) |
| Frontend | HTML + CSS + JavaScript |
| Base de datos | MySQL (una por microservicio) |
| Autenticación | Google OAuth + JWT |
| Contenedores | Docker + Docker Compose |
| Infraestructura | Terraform (Hetzner) |
| CI/CD | GitHub Actions |
| Calidad de código | SonarCloud |
| Seguridad | Snyk |

---

## 🏗️ Arquitectura

El sistema está construido con arquitectura de **microservicios**. Cada servicio es independiente, tiene su propia base de datos MySQL y corre en su propio contenedor Docker.

| Microservicio | Puerto | Base de datos | Descripción |
|---|---|---|---|
| **Auth Service** | 8001 | `auth_db` | Google OAuth, validación `@virtual.upt.pe`, JWT |
| **Posts Service** | 8002 | `posts_db` | Feed, historias, imágenes |
| **Profile & Social Service** | 8003 | `social_db` | Perfiles, likes, comentarios, compartir |
| **Frontend** | 80 | — | HTML + CSS + JS servido con Nginx |

---

## 🚀 Despliegue Local

```bash
# Clonar el repositorio
git clone https://github.com/UPT-FAING-EPIS/proyecto-si889-2026-i-u1-redsocialupt.git
cd proyecto-si889-2026-i-u1-redsocialupt

# Levantar todos los servicios
docker compose up --build

# Acceder a la aplicación
# Frontend:       http://localhost
# Auth Service:   http://localhost:8001
# Posts Service:   http://localhost:8002
# Social Service:  http://localhost:8003
```

---

## 👥 Integrantes

| Nombre | Código | Servicio asignado |
|---|---|---|
| Cutipa Gutierrez, Ricardo | 2021069827 | Auth Service + Setup |
| Malaga Espinoza, Ivan | 2021071086 | Posts Service |
| Chino Rivera, Angel | 2021069830 | Profile & Social Service |

**Curso:** Patrones de Software  
**Docente:** Mag. Ing. Patrick Cuadros Quiroga  
**Universidad:** Universidad Privada de Tacna — 2026-I

---

## ✅ Requerimientos Funcionales

### RF-01 — Autenticación Institucional con Google OAuth
El sistema permite el inicio de sesión exclusivamente mediante cuentas institucionales con dominio `@virtual.upt.pe` a través de Google OAuth 2.0. Al autenticarse por primera vez, el usuario es redirigido a un formulario de onboarding donde debe completar su información académica: nombre completo, tipo de usuario (estudiante/docente), facultad, escuela profesional, ciclo y código institucional. El sistema valida el dominio del correo en el backend antes de emitir el JWT. La sesión puede cerrarse desde cualquier página, invalidando el token localmente.

### RF-02 — Creación de Publicaciones con Control de Visibilidad
Los usuarios pueden crear publicaciones que combinan texto libre e imágenes (subidas al servidor). Cada publicación incluye un selector de visibilidad con tres opciones: **Todos** (cualquier usuario autenticado puede verla), **Compañeros** (solo usuarios con quienes existe una relación de compañero aceptada), y **Mi Facultad** (solo usuarios que pertenecen a la misma facultad). Las publicaciones se almacenan con los metadatos del autor (nombre, avatar, facultad) para ser mostradas sin consultas adicionales al servicio de autenticación.

### RF-03 — Feed Cronológico con Filtrado por Relaciones y Visibilidad
La pantalla principal muestra un feed de publicaciones ordenado cronológicamente (más reciente primero). El contenido que aparece se filtra dinámicamente según las relaciones del usuario y la configuración de visibilidad de cada publicación: el usuario ve sus propias publicaciones, las públicas de todos, las de compañeros confirmados y las de su misma facultad. El feed se carga al iniciar sesión y puede refrescarse manualmente. Se muestra el nombre, avatar, facultad y fecha relativa del autor en cada publicación.

### RF-04 — Sistema de Likes en Publicaciones
Los usuarios pueden dar o quitar "me gusta" a cualquier publicación visible en el feed. El contador de likes se actualiza en tiempo real en la interfaz sin recargar la página. Cada usuario solo puede dar un like por publicación. El botón cambia visualmente de estado (activo/inactivo) para reflejar si el usuario ya reaccionó a esa publicación.

### RF-05 — Comentarios en Publicaciones con Likes en Comentarios
Los usuarios pueden escribir y publicar comentarios en cualquier publicación visible. Los comentarios se muestran debajo de la publicación con el nombre, avatar y fecha del autor. Adicionalmente, cada comentario puede recibir likes de forma independiente, con su propio contador visible. Los comentarios se cargan junto con la publicación y se añaden en tiempo real al enviarlos, sin recargar la página.

### RF-06 — Gestión de Perfil de Usuario
Cada usuario cuenta con una página de perfil que muestra su información académica, foto de perfil, foto de portada (banner), biografía personal, número de publicaciones y número de compañeros. Desde el perfil propio, el usuario puede editar su bio, subir o cambiar su foto de perfil y su foto de portada. Las imágenes se almacenan en el servidor y la URL queda registrada en el servicio de autenticación para ser utilizada en publicaciones y comentarios.

### RF-07 — Directorio de Compañeros con Sistema de Solicitudes
La sección de Compañeros ofrece un directorio de usuarios de la plataforma con opciones de filtrado por facultad y escuela, y búsqueda por nombre. Los usuarios pueden enviar solicitudes de compañero a otros usuarios. El destinatario recibe la solicitud y puede aceptarla o rechazarla. Una vez aceptada, ambos usuarios se agregan mutuamente como compañeros. Se muestra un badge con el número de solicitudes pendientes en el ícono de navegación. La lista de compañeros confirmados es visible en el perfil de cada usuario.

### RF-08 — Chat Privado entre Compañeros
Los usuarios con relación de compañero confirmada pueden iniciar conversaciones de chat privado. La pantalla de mensajes muestra la lista de conversaciones activas a la izquierda y el hilo del chat seleccionado a la derecha. Soporta envío de mensajes de texto e imágenes. Los nuevos mensajes se cargan automáticamente mediante polling cada 3 segundos para simular tiempo real. Los mensajes propios y del interlocutor se distinguen visualmente por alineación y color.

### RF-09 — Panel de Administración
Los usuarios con rol de administrador tienen acceso a un panel de control exclusivo con dos módulos: **Gestión de Usuarios**, donde pueden ver el listado completo de cuentas, editar la información académica de cualquier usuario (facultad, escuela, ciclo, código) y activar o desactivar cuentas para restringir el acceso; y **Moderación de Contenido**, donde pueden visualizar todas las publicaciones y comentarios de la plataforma y eliminarlos si incumplen las normas de la comunidad universitaria. El acceso al panel está protegido por verificación de rol en el backend.

---

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

---

## 🚫 Restricciones

| # | Descripción |
|---|---|
| RE-01 | Solo usuarios con cuenta `@virtual.upt.pe` pueden autenticarse |
| RE-02 | El sistema requiere conexión a Internet para funcionar |
| RE-03 | El almacenamiento de imágenes está limitado al espacio de la VPS |
