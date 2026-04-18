# 🎓 Red Social UPT

Plataforma social universitaria exclusiva para la comunidad de la Universidad Privada de Tacna (UPT). Solo accesible con cuenta institucional `@virtual.upt.pe`.

---

## 🛠️ Stack Tecnológico

| Parte | Tecnología |
|---|---|
| Backend | Python + FastAPI |
| Frontend | HTML + CSS + JavaScript |
| Base de datos | MySQL |
| Contenedores | Docker + Docker Compose |
| Infraestructura | Terraform |
| CI/CD | GitHub Actions |
| Calidad de código | SonarCloud |
| Seguridad | Snyk |
| Autenticación | JWT |

---

## 🏗️ Arquitectura

El sistema está construido con arquitectura de **microservicios**. Cada servicio es independiente, tiene su propia base de datos MySQL y corre en su propio contenedor Docker.

| Microservicio | Descripción |
|---|---|
| **Auth Service** | Registro, login, validación `@virtual.upt.pe`, JWT |
| **Posts Service** | Feed, historias, imágenes |
| **Profile & Social Service** | Perfiles, likes, comentarios |

---

## 👥 Integrantes

| Nombre | Código |
|---|---|
| Cutipa Gutierrez, Ricardo | 2021069827 |
| Malaga Espinoza, Ivan | 2021071086 |
| Chino Rivera, Angel | 2021069830 |

**Curso:** Patrones de Software  
**Docente:** Mag. Ing. Patrick Cuadros Quiroga  
**Universidad:** Universidad Privada de Tacna — 2026-I

---

## ✅ Requerimientos Funcionales

| # | Descripción |
|---|---|
| RF-01 | Registro con cuenta `@virtual.upt.pe` |
| RF-02 | Inicio y cierre de sesión seguro (JWT) |
| RF-03 | Crear publicaciones de texto e imagen en el feed |
| RF-04 | Visualizar el feed en orden cronológico |
| RF-05 | Publicar historias de texto o imagen con expiración automática |
| RF-06 | Dar likes a publicaciones |
| RF-07 | Comentar publicaciones |
| RF-08 | Compartir publicaciones |
| RF-09 | Gestionar perfil (nombre, foto, carrera, facultad) |
| RF-10 | Panel de administración para gestión de usuarios y contenido |

---

## ⚙️ Requerimientos No Funcionales

| # | Descripción |
|---|---|
| RNF-01 | Acceso exclusivo mediante dominio `@virtual.upt.pe` |
| RNF-02 | Contraseñas almacenadas con hash bcrypt |
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
| RE-01 | Solo usuarios con cuenta `@virtual.upt.pe` pueden registrarse |
| RE-02 | El sistema requiere conexión a Internet para funcionar |
| RE-03 | El almacenamiento de imágenes está limitado al espacio de la VPS |