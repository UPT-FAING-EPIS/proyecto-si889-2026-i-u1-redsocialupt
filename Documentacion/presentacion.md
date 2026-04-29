---
marp: true
theme: default
paginate: true
style: |
  section {
    font-family: 'Segoe UI', sans-serif;
    background: linear-gradient(135deg, #0f172a, #1e293b);
    color: #f1f5f9;
    padding: 40px;
  }

  h1 {
    color: #38bdf8;
    text-align: center;
    font-size: 2.5em;
  }

  h2 {
    color: #22c55e;
    border-left: 5px solid #22c55e;
    padding-left: 10px;
  }

  h3 {
    color: #facc15;
  }

  strong {
    color: #facc15;
  }

  ul li {
    margin-bottom: 8px;
  }

  section.lead {
    text-align: center;
    font-size: 1.3em;
  }

  section.highlight {
    background: linear-gradient(135deg, #1e3a8a, #0f172a);
    color: white;
  }
---

# 🎓 Red Social UPT
### Plataforma Social Universitaria  
Universidad Privada de Tacna – 2026-I  

---

**Integrantes:**
- Ricardo Cutipa Gutierrez  
- Ivan Malaga Espinoza  
- Angel Chino Rivera  

**Curso:** Patrones de Software  
**Docente:** Mag. Ing. Patrick Cuadros Quiroga  

---

## ❗ Problema

Actualmente, los estudiantes de la UPT no cuentan con una plataforma digital institucional para comunicarse.

El uso de redes externas como WhatsApp o Facebook genera:
- Falta de control institucional  
- Problemas de privacidad  
- Desorganización por carreras y facultades  

---

## 💡 Solución

Se propone el desarrollo de una red social universitaria exclusiva:

Un sistema que permite a los estudiantes:
- Comunicarse en un entorno seguro  
- Compartir contenido académico y social  
- Interactuar dentro de su comunidad universitaria  

Todo esto mediante autenticación institucional.

---

## 📌 Descripción del Sistema

La Red Social UPT es una plataforma web diseñada para centralizar la comunicación estudiantil.

El acceso está restringido únicamente a usuarios con cuenta institucional @virtual.upt.pe, garantizando identidad real y seguridad dentro del sistema.

---

## 🛠️ Stack Tecnológico

El sistema está construido utilizando tecnologías modernas orientadas a escalabilidad:

- Backend basado en microservicios con PHP y Lumen  
- Frontend web con HTML, CSS y JavaScript  
- Base de datos MySQL independiente por servicio  
- Autenticación segura mediante Google OAuth y JWT  

---

## ⚙️ DevOps y Calidad

El proyecto incorpora prácticas modernas de desarrollo:

- Integración continua con GitHub Actions  
- Control de calidad con SonarCloud  
- Análisis de seguridad con Snyk  

Esto garantiza código limpio, seguro y mantenible.

---

## 🏗️ Arquitectura

El sistema adopta una arquitectura de microservicios.

Cada componente funciona de manera independiente, con su propia base de datos y lógica de negocio, comunicándose mediante APIs REST.

Esto permite escalabilidad, flexibilidad y facilidad de mantenimiento.

---

## 🔧 Microservicios

El sistema se divide en cuatro servicios principales:

- **Auth Service**: gestiona autenticación con Google y generación de JWT  
- **Posts Service**: administra publicaciones, historias e imágenes  
- **Social Service**: maneja perfiles, interacciones y relaciones  
- **Chat Service**: gestiona conversaciones privadas y mensajes entre amigos

El frontend se encarga de la interacción con el usuario.

---

## 🚀 Despliegue

El sistema puede ejecutarse tanto en entorno local como en producción.

Se utiliza Docker para contenerización y Docker Compose para orquestación.

En producción, el sistema se despliega en una VPS Debian, cuya infraestructura es gestionada mediante Terraform.

---

## 🎯 Funcionalidades Principales

El sistema permite a los usuarios:

- Iniciar sesión con cuenta institucional  
- Publicar contenido en un feed dinámico  
- Interactuar mediante likes y comentarios  
- Gestionar su perfil académico  
- Comunicarse con otros usuarios  

---

## 🔐 Autenticación

El acceso al sistema se realiza mediante Google OAuth.

Solo usuarios con dominio @virtual.upt.pe pueden ingresar, asegurando identidad institucional.

Una vez autenticado, el sistema genera un token JWT para gestionar la sesión de forma segura.

---

## 📝 Publicaciones y Feed

Los usuarios pueden crear publicaciones con texto e imágenes.

El feed muestra contenido en orden cronológico y se adapta según:
- Visibilidad de la publicación  
- Relaciones entre usuarios  
- Facultad del usuario  

---

## ❤️ Interacciones Sociales

El sistema permite interacción en tiempo real:

- Likes en publicaciones  
- Comentarios dinámicos  

Esto mejora la experiencia del usuario y la fluidez del sistema.

---

## 👤 Gestión de Perfil

Cada usuario dispone de un perfil personalizado que incluye:

- Información académica  
- Foto de perfil y portada  
- Biografía  

El usuario puede editar su información en cualquier momento.

---

## 🤝 Red de Compañeros

El sistema incluye un directorio de usuarios:

- Búsqueda por nombre o facultad  
- Envío y gestión de solicitudes  
- Creación de una red de compañeros  

Esto fortalece la interacción dentro de la comunidad.

---

## 💬 Chat Privado

Los usuarios pueden comunicarse mediante chat privado.

El sistema permite:
- Envío de mensajes de texto  
- Compartición de imágenes  
- Actualización casi en tiempo real  

---

## 🛡️ Administración

El sistema incluye un panel administrativo que permite:

- Gestionar usuarios  
- Moderar contenido  
- Controlar el acceso a la plataforma  

El acceso está restringido según roles.

---

## ⚙️ Requerimientos No Funcionales

El sistema garantiza:

- Seguridad mediante JWT  
- Autenticación sin contraseñas  
- Código sin vulnerabilidades críticas  
- Despliegue en infraestructura real  

---

## 🚫 Restricciones

El sistema presenta algunas limitaciones:

- Acceso exclusivo con cuentas institucionales  
- Dependencia de conexión a Internet  
- Capacidad limitada de almacenamiento en la VPS  

---

## 🎯 Resultado Final

Se obtiene una plataforma:

- Funcional y accesible  
- Segura y controlada  
- Escalable mediante microservicios  
- Desplegada en la nube  

---

## 🙌 Gracias