<center>

[comment]: <img src="./media/media/image1.png" style="width:1.088in;height:1.46256in" alt="escudo.png" />

![./media/media/image1.png](./media/logo-upt.png)

**UNIVERSIDAD PRIVADA DE TACNA**

**FACULTAD DE INGENIERÍA**

**Escuela Profesional de Ingeniería de Sistemas**

**Proyecto *Red Social UPT***

Curso: *Patrones de Software*

Docente: *Mag. Ing. Patrick Cuadros Quiroga*

Integrantes:

***Cutipa Gutierrez, Ricardo (2021069827)***

***Malaga Espinoza, Ivan (2021071086)***

***Chino Rivera, Angel (2021069830)***

**Tacna – Perú**

***2026***

</center>

<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

| CONTROL DE VERSIONES |           |              |              |            |                  |
| :------------------: | :-------- | :----------- | :----------- | :--------- | :--------------- |
| Versión              | Hecha por | Revisada por | Aprobada por | Fecha      | Motivo           |
| 1.0                  | RCG       | IME          | ACR          | 06/04/2026 | Versión Original |

<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

**Sistema *Red Social UPT***

**Documento de Visión**

**Versión *1.0***

<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

| CONTROL DE VERSIONES |           |              |              |            |                  |
| :------------------: | :-------- | :----------- | :----------- | :--------- | :--------------- |
| Versión              | Hecha por | Revisada por | Aprobada por | Fecha      | Motivo           |
| 1.0                  | RCG       | IME          | ACR          | 06/04/2026 | Versión Original |

<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

## ÍNDICE GENERAL

- [1. Introducción](#1-introducción)
  - [1.1 Propósito](#11-propósito)
  - [1.2 Alcance](#12-alcance)
  - [1.3 Definiciones, Siglas y Abreviaturas](#13-definiciones-siglas-y-abreviaturas)
  - [1.4 Referencias](#14-referencias)
  - [1.5 Visión General](#15-visión-general)
- [2. Posicionamiento](#2-posicionamiento)
  - [2.1 Oportunidad de negocio](#21-oportunidad-de-negocio)
  - [2.2 Definición del problema](#22-definición-del-problema)
- [3. Descripción de los interesados y usuarios](#3-descripción-de-los-interesados-y-usuarios)
  - [3.1 Resumen de los interesados](#31-resumen-de-los-interesados)
  - [3.2 Resumen de los usuarios](#32-resumen-de-los-usuarios)
  - [3.3 Entorno de usuario](#33-entorno-de-usuario)
  - [3.4 Perfiles de los interesados](#34-perfiles-de-los-interesados)
  - [3.5 Perfiles de los Usuarios](#35-perfiles-de-los-usuarios)
  - [3.6 Necesidades de los interesados y usuarios](#36-necesidades-de-los-interesados-y-usuarios)
- [4. Vista General del Producto](#4-vista-general-del-producto)
  - [4.1 Perspectiva del producto](#41-perspectiva-del-producto)
  - [4.2 Resumen de capacidades](#42-resumen-de-capacidades)
  - [4.3 Suposiciones y dependencias](#43-suposiciones-y-dependencias)
  - [4.4 Costos y precios](#44-costos-y-precios)
  - [4.5 Licenciamiento e instalación](#45-licenciamiento-e-instalación)
- [5. Características del producto](#5-características-del-producto)
- [6. Restricciones](#6-restricciones)
- [7. Rangos de calidad](#7-rangos-de-calidad)
- [8. Precedencia y Prioridad](#8-precedencia-y-prioridad)
- [9. Otros requerimientos del producto](#9-otros-requerimientos-del-producto)
  - [a) Estándares legales](#a-estándares-legales)
  - [b) Estándares de comunicación](#b-estándares-de-comunicación)
  - [c) Estándares de cumplimiento de la plataforma](#c-estándares-de-cumplimiento-de-la-plataforma)
  - [d) Estándares de calidad y seguridad](#d-estándares-de-calidad-y-seguridad)
- [CONCLUSIONES](#conclusiones)
- [RECOMENDACIONES](#recomendaciones)
- [BIBLIOGRAFÍA](#bibliografía)
- [WEBGRAFÍA](#webgrafía)

<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

## Informe de Visión del Proyecto

---

## 1. Introducción

<div style="text-align: justify">

Este documento establece la visión del proyecto para desarrollar la **Red Social UPT**, una plataforma digital de comunicación e interacción exclusiva para los estudiantes y la comunidad académica de la Universidad Privada de Tacna (UPT). El objetivo principal es proporcionar una descripción completa de los elementos esenciales relacionados con el desarrollo y funcionamiento del sistema. La visión delineada aquí orientará el diseño, la implementación y la entrega exitosa de la plataforma, asegurando la satisfacción de las necesidades y expectativas de los usuarios e interesados dentro del entorno universitario.

</div>

### 1.1 Propósito

<div style="text-align: justify">

El propósito de este documento es establecer una visión clara y detallada de la **Red Social UPT**. El documento describe de manera exhaustiva las características fundamentales, funcionalidades, restricciones y requerimientos clave del sistema. El enfoque principal es ofrecer a la comunidad universitaria de la UPT un espacio digital propio donde puedan interactuar, compartir contenido académico y social, conectarse por facultad y carrera, y colaborar de forma segura mediante el uso exclusivo de cuentas institucionales con dominio `@virtual.upt.pe` (Google). El sistema busca reemplazar la dependencia de redes sociales genéricas para la comunicación universitaria, brindando una herramienta centralizada, segura y orientada al entorno académico.

</div>

### 1.2 Alcance

<div style="text-align: justify">

El alcance de esta visión del proyecto abarca la creación de la **Red Social UPT** con arquitectura de microservicios, diseñada para garantizar la escalabilidad, independencia funcional de cada módulo y facilidad de mantenimiento. El sistema estará compuesto por tres microservicios principales desplegados de forma independiente: el servicio de autenticación institucional, el servicio de publicaciones e historias, y el servicio de perfiles y grupos.

En términos concretos, el alcance incluye los siguientes aspectos:

- La definición detallada de los objetivos del sistema, especificando las funcionalidades esenciales y las características clave que se integrarán en la plataforma.
- La identificación de los interesados y usuarios relevantes dentro de la comunidad UPT.
- Las restricciones, estándares y requerimientos legales que deben cumplirse durante el desarrollo e implementación.
- El despliegue del sistema en una VPS con sistema operativo Debian, utilizando Docker y Docker Compose para la orquestación de microservicios.
- La provisión y gestión de infraestructura como código mediante **Terraform**.
- La integración de herramientas de calidad y seguridad como **SonarQube**, **Snyk** o **Semgrep**, y **GitHub Actions**.
- La documentación del producto, sus versiones y características futuras en la **Wiki de GitHub**, incluyendo el roadmap del proyecto con fechas de liberación estimadas.

La escalabilidad es un elemento fundamental en el diseño, permitiendo que la plataforma evolucione e incorpore nuevas funcionalidades en versiones futuras sin comprometer la estabilidad del sistema existente.

</div>

### 1.3 Definiciones, Siglas y Abreviaturas

| Término | Definición |
|---------|------------|
| **RSU** | Red Social UPT – nombre abreviado del sistema desarrollado. |
| **UPT** | Universidad Privada de Tacna. |
| **Microservicio** | Componente de software independiente que implementa una funcionalidad específica del sistema y se comunica con otros componentes mediante APIs REST. |
| **API REST** | Interfaz de programación de aplicaciones basada en el protocolo HTTP y el estilo arquitectónico REST. |
| **VPS** | Virtual Private Server – servidor privado virtual donde se desplegará el sistema. |
| **IaC** | Infrastructure as Code – práctica de gestionar infraestructura mediante archivos de configuración (Terraform). |
| **JWT** | JSON Web Token – estándar para la autenticación segura entre microservicios. |
| **CI/CD** | Integración continua y despliegue continuo mediante GitHub Actions. |
| **Gherkin** | Lenguaje para escribir criterios de aceptación en formato DADO/CUANDO/ENTONCES. |
| **MARP** | Markdown Presentation Ecosystem – herramienta para generar presentaciones desde Markdown. |
| **Feed** | Muro de publicaciones donde los usuarios visualizan y crean posts en tiempo real. |
| **Historia** | Publicación efímera de texto o imagen con duración limitada, similar a las historias de Instagram. |
| **Wiki** | Sección de documentación del repositorio GitHub donde se describen las características del producto y el roadmap. |
| **Roadmap** | Plan de versiones del producto que indica las funcionalidades previstas y sus fechas de liberación estimadas. |
| **Interesado** | Individuo o grupo con interés directo en el desarrollo y funcionamiento del sistema. |

### 1.4 Referencias

<div style="text-align: justify">

Durante la concepción y desarrollo de la Red Social UPT, se han consultado diversas fuentes para enriquecer el conocimiento del equipo y adoptar las mejores prácticas de desarrollo de software:

- Documentación oficial de PHP y el framework Lumen (Laravel).
- Documentación oficial de Docker y Docker Compose.
- Documentación de Terraform by HashiCorp.
- Guías de GitHub Actions para CI/CD.
- Documentación de SonarQube con plugin SonarPHP para análisis estático de código PHP.
- Documentación de Snyk para análisis de dependencias PHP mediante `composer.lock`.
- Documentación de Semgrep con reglas PHP disponibles en el registro oficial.
- Especificación de formato Gherkin para criterios de aceptación.
- Plantillas FD01, FD02, FD03, FD04 y FD05 proporcionadas por la cátedra de Patrones de Software – UPT, 2026-I.

</div>

### 1.5 Visión General

<div style="text-align: justify">

La visión del proyecto **Red Social UPT** es construir una plataforma social universitaria exclusiva para la comunidad de la Universidad Privada de Tacna, que permita a los estudiantes comunicarse, compartir contenido, organizarse por facultades y carreras, e interactuar de manera segura dentro de un entorno digital controlado e institucional. El sistema garantizará el acceso exclusivo mediante validación de cuenta institucional con dominio `@virtual.upt.pe` (Google), ofrecerá un feed de publicaciones en tiempo real, un módulo de historias efímeras de texto e imagen, interacciones sociales básicas, y gestión de perfiles segmentados por carrera y facultad. Será desplegado en infraestructura en la nube con altos estándares de seguridad y calidad de código. El producto y su evolución estarán documentados en la Wiki de GitHub, con un roadmap que detalla las versiones planificadas y sus fechas de liberación.

</div>

<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

---

## 2. Posicionamiento

### 2.1 Oportunidad de negocio

<div style="text-align: justify">

La comunidad estudiantil de la Universidad Privada de Tacna carece actualmente de una plataforma digital propia para la comunicación e interacción académica y social. Los estudiantes utilizan plataformas genéricas como Facebook, Instagram o WhatsApp para coordinarse, compartir material y mantenerse informados, lo que genera problemas de privacidad, falta de segmentación por carrera o facultad, y ausencia de un espacio institucional controlado. La oportunidad radica en ofrecer una solución tecnológica construida específicamente para el contexto universitario de la UPT, que centralice la comunicación estudiantil, garantice la identidad institucional de sus usuarios mediante la cuenta `@virtual.upt.pe`, y permita a la comunidad universitaria interactuar de forma organizada, segura y relevante para su entorno académico.

Los principales beneficios que ofrece esta oportunidad son los siguientes:

- **Identidad institucional verificada:** Solo miembros con cuenta `@virtual.upt.pe` pueden acceder, garantizando autenticidad.
- **Segmentación académica:** Los usuarios se agrupan por facultad y carrera, facilitando la comunicación relevante.
- **Centralización de la comunicación:** Un único espacio para publicaciones, historias, grupos y noticias universitarias.
- **Privacidad y seguridad:** La plataforma es controlada institucionalmente, a diferencia de redes sociales abiertas.
- **Escalabilidad futura:** La arquitectura de microservicios permite la incorporación de nuevas funcionalidades sin afectar las existentes.

</div>

### 2.2 Definición del problema

| Campo | Descripción |
|-------|-------------|
| **LA FALTA** | Los estudiantes de la UPT no cuentan con una red social propia e institucional que centralice su comunicación académica y social. La ausencia de un espacio digital verificado obliga a los estudiantes a depender de plataformas externas genéricas que no están adaptadas al entorno universitario, carecen de segmentación por carrera o facultad, y no garantizan la identidad de sus usuarios. |
| **LA NECESIDAD** | La comunidad universitaria necesita una plataforma digital propia que valide la identidad institucional de sus usuarios mediante `@virtual.upt.pe`, permita compartir publicaciones, historias efímeras, imágenes y contenido relevante al entorno académico, y facilite la organización por grupos según facultad y carrera. Adicionalmente, se requiere que la plataforma sea escalable, segura y fácilmente mantenible. |
| **EL PROBLEMA** | El problema central se enfoca en la dispersión de la comunicación estudiantil en múltiples plataformas no institucionales, la falta de verificación de identidad universitaria, la ausencia de segmentación académica en los canales de comunicación existentes, y los riesgos de privacidad que implica el uso de redes sociales abiertas para la difusión de información relacionada con la institución. |
| **LA SOLUCIÓN** | La solución consiste en desarrollar la **Red Social UPT**, una plataforma web basada en arquitectura de microservicios con PHP/Lumen y MySQL, que valide el dominio `@virtual.upt.pe` para el acceso, permita publicaciones en tiempo real en un muro compartido, incluya un módulo de historias de texto e imagen con expiración automática, gestione perfiles segmentados por facultad y carrera, e implemente interacciones sociales básicas. El sistema será desplegado en una VPS Debian con Docker y gestionado mediante Terraform, con integración continua a través de GitHub Actions y análisis de calidad con SonarQube y Snyk o Semgrep. |

<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

---

## 3. Descripción de los interesados y usuarios

### 3.1 Resumen de los interesados

Los principales interesados en la Red Social UPT son los siguientes:

| Nombre | Descripción | Responsabilidad |
|--------|-------------|-----------------|
| Equipo de Desarrollo | Estudiantes del curso de Patrones de Software encargados de diseñar, implementar y desplegar el sistema. | Desarrollar, mantener y documentar el sistema conforme a los requerimientos del curso. |
| Docente del Curso | Mag. Ing. Patrick Cuadros Quiroga, responsable de evaluar el cumplimiento de los entregables y la calidad técnica del proyecto. | Revisar y calificar los entregables FD01 al FD05, el repositorio GitHub y la presentación final. |
| Estudiantes UPT | Comunidad estudiantil de la Universidad Privada de Tacna que utilizará la plataforma para comunicarse e interactuar. | Usar la plataforma, publicar contenido, crear historias y participar en grupos de su carrera y facultad. |
| Universidad Privada de Tacna | Institución que provee el dominio de cuenta institucional `@virtual.upt.pe` (Google) como mecanismo de verificación de identidad. | Proporcionar el contexto institucional que da sentido y exclusividad al sistema. |

### 3.2 Resumen de los usuarios

Los usuarios del sistema se clasifican de la siguiente manera:

| Nombre | Descripción | Responsabilidad |
|--------|-------------|-----------------|
| Estudiante UPT | Usuario principal del sistema. Debe poseer una cuenta institucional activa con dominio `@virtual.upt.pe` para poder registrarse y acceder. | Crear publicaciones, publicar historias, interactuar con el feed, gestionar su perfil y participar en grupos por facultad. |
| Administrador del Sistema | Miembro del equipo de desarrollo con acceso de gestión al sistema. | Supervisar el funcionamiento, moderar contenido y gestionar la configuración de la plataforma. |

### 3.3 Entorno de usuario

<div style="text-align: justify">

Los usuarios interactúan con la Red Social UPT a través de una interfaz web responsiva, accesible desde cualquier navegador moderno (Chrome, Firefox, Edge) en dispositivos de escritorio y móviles. El acceso requiere conexión a Internet y una cuenta institucional activa con dominio `@virtual.upt.pe`.

El flujo principal de uso contempla los siguientes pasos:

1. El estudiante accede a la plataforma desde su navegador mediante la URL de la VPS o dominio asignado.
2. Se registra e inicia sesión utilizando su cuenta `@virtual.upt.pe`, la cual es validada por el microservicio de autenticación.
3. Accede al feed principal donde visualiza publicaciones de la comunidad en tiempo real.
4. Puede crear publicaciones con texto e imágenes, dar likes, comentar y compartir contenido.
5. Puede publicar historias de texto o imagen con duración limitada, visibles para el resto de la comunidad.
6. Gestiona su perfil personal, indicando su carrera y facultad.
7. Explora grupos organizados por carreras (Sistemas, Civil, etc.).

El sistema estará desplegado en una VPS con sistema operativo Debian, corriendo sobre contenedores Docker gestionados con Docker Compose, garantizando disponibilidad continua.

</div>

### 3.4 Perfiles de los interesados

**Equipo de Desarrollo**

| Campo | Descripción |
|-------|-------------|
| Representante | Ricardo Cutipa Gutierrez, Ivan Malaga Espinoza, Angel Chino Rivera |
| Descripción | Estudiantes de Ingeniería de Sistemas de la UPT, cursando Patrones de Software en el semestre 2026-I. |
| Tipo | Desarrollador / Implementador |
| Responsabilidades | Diseñar la arquitectura, implementar los microservicios, documentar los entregables FD01-FD05, gestionar el repositorio en GitHub, mantener la Wiki con el roadmap y realizar el despliegue en la VPS. |
| Criterios de éxito | Sistema funcional desplegado en la nube, documentación completa en README y Wiki, código sin vulnerabilidades críticas en SonarQube/Snyk, presentación aprobada. |

**Docente del Curso**

| Campo | Descripción |
|-------|-------------|
| Representante | Mag. Ing. Patrick Cuadros Quiroga |
| Descripción | Docente responsable del curso de Patrones de Software, Escuela de Ingeniería de Sistemas, UPT. |
| Tipo | Evaluador / Stakeholder académico |
| Responsabilidades | Definir los criterios de evaluación, revisar los entregables y calificar el proyecto según la rúbrica establecida. |
| Criterios de éxito | Los entregables cumplen con los formatos FD01-FD05, el repositorio GitHub está completo con Wiki y roadmap, y el sistema está correctamente desplegado y documentado. |

### 3.5 Perfiles de los Usuarios

**Estudiante UPT**

| Campo | Descripción |
|-------|-------------|
| Representante | Estudiantes de cualquier carrera de la UPT |
| Descripción | Usuario principal del sistema. Accede con cuenta `@virtual.upt.pe`, interactúa con el feed, publica historias de texto o imagen, gestiona su perfil y participa en grupos. |
| Tipo | Usuario final |
| Responsabilidades | Registrarse con cuenta institucional, crear y consumir contenido del feed, publicar historias, interactuar con publicaciones y mantener su perfil actualizado. |
| Criterios de éxito | Puede registrarse, publicar en el feed, crear historias de texto e imagen, dar likes y comentar, gestionar su perfil y acceder a grupos de su carrera sin inconvenientes. |
| Implicación | Usuario directo y principal consumidor de todas las funcionalidades del sistema. |

**Administrador del Sistema**

| Campo | Descripción |
|-------|-------------|
| Representante | Miembro del equipo de desarrollo con rol de administrador |
| Descripción | Gestiona la configuración del sistema, supervisa el estado de los microservicios y modera el contenido cuando es necesario. |
| Tipo | Administrador |
| Responsabilidades | Monitorear el sistema, gestionar usuarios en caso de reportes, revisar métricas de uso y realizar mantenimiento. |
| Criterios de éxito | Puede acceder al panel de administración, visualizar el estado de los servicios y realizar acciones de gestión sin interrumpir la operación del sistema. |
| Implicación | Involucrado en la supervisión operativa continua del sistema una vez desplegado. |

### 3.6 Necesidades de los interesados y usuarios

| Nro. | Requerimiento Funcional | Descripción | Prioridad | Inquietudes | Solución Propuesta |
|------|-------------------------|-------------|-----------|-------------|-------------------|
| RF-01 | Registro e Inicio de Sesión Institucional | Permitir que los estudiantes se registren e inicien sesión utilizando únicamente cuentas con dominio `@virtual.upt.pe`. | Alta | Asegurar que no ingresen usuarios externos a la UPT. | Implementar validación del dominio de correo en el microservicio de autenticación con JWT. |
| RF-02 | Publicación en el Feed | Permitir a los usuarios autenticados crear publicaciones con texto e imágenes visibles en el feed en tiempo real. | Alta | Garantizar que las publicaciones sean visibles de forma inmediata. | Implementar el microservicio de posts con endpoints REST para creación y listado. |
| RF-03 | Visualización del Feed | Permitir a los usuarios ver el muro de publicaciones de la comunidad ordenado cronológicamente. | Alta | Asegurar tiempos de carga adecuados. | Implementar paginación y consultas optimizadas en el microservicio de posts. |
| RF-04 | Publicación de Historias | Permitir a los usuarios crear historias de texto o imagen con duración limitada (similar a Instagram Stories), visibles para toda la comunidad durante un período definido antes de expirar automáticamente. | Alta | Gestionar la expiración automática de historias y el almacenamiento de imágenes. | Implementar en el microservicio de posts un módulo de historias con campo de expiración y limpieza periódica. |
| RF-05 | Interacciones Sociales | Permitir a los usuarios dar likes, comentar y compartir publicaciones del feed. | Alta | Evitar duplicados de likes y garantizar la consistencia de los datos. | Implementar lógica de unicidad por usuario/publicación en el microservicio de interacciones. |
| RF-06 | Gestión de Perfil de Usuario | Permitir a los usuarios visualizar y editar su perfil, incluyendo nombre, foto, carrera y facultad. | Media | Asegurar que la información de perfil sea precisa y actualizada. | Implementar el microservicio de perfiles con endpoints REST para consulta y actualización. |
| RF-07 | Segmentación por Facultad y Carrera | Permitir agrupar a los usuarios y filtrar contenido según la facultad y carrera a la que pertenecen (Sistemas, Civil, etc.). | Media | Garantizar que la clasificación sea correcta y útil. | Incorporar campos de facultad y carrera en el perfil del usuario y filtros en el feed. |
| RF-08 | Carga y Visualización de Imágenes | Permitir a los usuarios subir imágenes al crear publicaciones e historias, y visualizarlas correctamente. | Alta | Gestionar el almacenamiento y el rendimiento al cargar imágenes. | Implementar almacenamiento de archivos en la VPS gestionado por el microservicio de posts. |
| RF-09 | Autenticación con JWT | El sistema debe generar y validar tokens JWT para la comunicación segura entre el cliente y los microservicios. | Alta | Asegurar la expiración y renovación adecuada de los tokens. | Implementar middleware de validación JWT en cada microservicio del backend. |
| RF-10 | Panel de Administración | Permitir al administrador visualizar usuarios registrados, publicaciones y gestionar contenido reportado. | Media | Asegurar que el panel sea accesible solo para administradores. | Implementar roles diferenciados en el microservicio de autenticación y vistas de administración protegidas. |
| RF-11 | Cierre de Sesión | Permitir a los usuarios cerrar sesión de forma segura, invalidando el token activo. | Alta | Garantizar que los tokens expirados no puedan reutilizarse. | Implementar expiración corta con refresh token en el microservicio de autenticación. |

<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

---

## 4. Vista General del Producto

### 4.1 Perspectiva del producto

<div style="text-align: justify">

La **Red Social UPT** es una solución web independiente desarrollada con arquitectura de microservicios, diseñada específicamente para la comunidad estudiantil de la Universidad Privada de Tacna. A diferencia de redes sociales genéricas, la plataforma está concebida para operar en un entorno institucional cerrado, donde la identidad de cada usuario está verificada mediante el dominio de cuenta `@virtual.upt.pe` (Google).

El sistema está compuesto por tres microservicios principales, cada uno desarrollado con **PHP/Lumen** y **MySQL**, comunicándose entre sí mediante peticiones HTTP con autenticación JWT:

- **Microservicio de Autenticación (Auth Service):** Gestiona el registro, inicio y cierre de sesión, validación de cuenta institucional `@virtual.upt.pe` y generación de tokens JWT.
- **Microservicio de Publicaciones e Historias (Posts Service):** Gestiona la creación, listado y eliminación de publicaciones en el feed, el módulo de historias de texto e imagen con expiración automática, y la carga de imágenes.
- **Microservicio de Perfiles e Interacciones (Profile & Social Service):** Gestiona los perfiles de usuario, la segmentación por carrera y facultad, y las interacciones sociales (likes, comentarios, grupos).

Toda la infraestructura está orquestada con **Docker Compose** sobre una **VPS Debian**, y la provisión de la misma se gestiona mediante **Terraform** como infraestructura como código (IaC). La documentación del producto, sus versiones y el roadmap de desarrollo se mantienen actualizados en la **Wiki del repositorio de GitHub**.

</div>

### 4.2 Resumen de capacidades

| Beneficio para el Usuario | Características Principales |
|--------------------------|----------------------------|
| Acceso exclusivo y seguro | Registro e inicio de sesión validado con dominio `@virtual.upt.pe` y JWT. |
| Comunicación en tiempo real | Feed de publicaciones con texto e imágenes actualizado en tiempo real. |
| Historias efímeras | Publicación de historias de texto o imagen con expiración automática. |
| Interacción social | Likes, comentarios y compartición de publicaciones entre la comunidad. |
| Identidad universitaria | Perfil personalizado con carrera, facultad y foto de perfil. |
| Organización académica | Grupos y segmentación por carrera (Sistemas, Civil, etc.). |
| Despliegue en nube | Sistema publicado en VPS con disponibilidad continua y acceso desde cualquier navegador. |
| Calidad y seguridad de código | Integración con SonarQube, Snyk o Semgrep y GitHub Actions para PHP. |
| Infraestructura como código | Gestión de la VPS mediante Terraform para reproducibilidad del entorno. |
| Documentación del producto | Wiki de GitHub con características por versión y roadmap con fechas de liberación. |

### 4.3 Suposiciones y dependencias

**Suposiciones:**

<div style="text-align: justify">

- Se asume que los estudiantes de la UPT poseen una cuenta institucional activa con dominio `@virtual.upt.pe` para poder registrarse en la plataforma.
- Se asume que el equipo de desarrollo tendrá acceso continuo a una VPS con sistema operativo Debian durante todo el ciclo de vida del proyecto.
- Se asume que los tres integrantes del equipo trabajarán de forma coordinada, cada uno responsable de un microservicio principal, colaborando en el frontend y el despliegue.
- Se asume que la infraestructura de la VPS (procesador, RAM y almacenamiento) será suficiente para soportar el tráfico de pruebas y evaluación del sistema.
- Se asume que los datos de prueba ingresados durante el desarrollo no corresponden a información personal real de estudiantes de la UPT.

</div>

**Dependencias:**

<div style="text-align: justify">

- **PHP y Lumen Framework:** El desarrollo de los microservicios depende de la disponibilidad y estabilidad del framework Lumen y sus dependencias gestionadas mediante Composer.
- **MySQL:** La persistencia de datos de cada microservicio depende de instancias independientes de MySQL desplegadas en contenedores Docker.
- **Docker y Docker Compose:** La orquestación y el despliegue de los microservicios dependen completamente de Docker y Docker Compose instalados en la VPS.
- **Terraform:** La provisión de la infraestructura como código depende de la cuenta del proveedor de VPS y de las credenciales de acceso a su API.
- **GitHub y GitHub Actions:** La integración continua, el análisis de calidad, la gestión de versiones y la Wiki del producto dependen de la disponibilidad del repositorio en GitHub y de las Actions configuradas.
- **SonarQube, Snyk o Semgrep:** El análisis de vulnerabilidades en código PHP depende de la correcta configuración de estas herramientas en el pipeline de CI/CD. Las tres tienen soporte oficial para PHP.
- **Conexión a Internet:** El sistema requiere conectividad de red estable tanto en la VPS como en el dispositivo del usuario final para su correcto funcionamiento.

</div>

### 4.4 Costos y precios

<div style="text-align: justify">

Los costos estimados del proyecto son los siguientes, considerando que se trata de un proyecto académico con recursos principalmente de software libre y servicios en la nube de bajo costo:

</div>

| Concepto | Descripción | Costo Estimado |
|----------|-------------|----------------|
| VPS Debian | Servidor virtual (ej. Hetzner CX21: 2 vCPU, 4GB RAM, 40GB SSD) | $5.00 – $7.00 / mes |
| Dominio (opcional) | Dominio `.com` o `.pe` para acceso público | $10.00 – $15.00 / año |
| **Subtotal infraestructura (1 mes)** | | **~$7.00 – $22.00 USD** |

**Costos de herramientas (licencia $0 – software libre / freemium):**

| Herramienta | Licencia |
|-------------|----------|
| PHP / Lumen Framework | Open Source (MIT) |
| MySQL | Open Source (GPL) |
| Docker / Docker Compose | Open Source (Apache 2.0) |
| Terraform | Open Source (MPL 2.0) |
| SonarQube Community | Open Source (LGPL v3) |
| Snyk (plan gratuito) | Freemium |
| Semgrep (plan gratuito) | Open Source / Freemium |
| GitHub / GitHub Actions | Freemium |
| Visual Studio Code | Open Source (MIT) |

**Costos de personal (estimado académico):**

| Rol | Integrante | Horas estimadas | Costo referencial (S/. 20/hr) |
|-----|-----------|-----------------|-------------------------------|
| Auth Service + Coordinación | Ricardo Cutipa Gutierrez | 60 hrs | S/. 1,200.00 |
| Posts Service + Historias | Ivan Malaga Espinoza | 60 hrs | S/. 1,200.00 |
| Profiles & Social Service | Angel Chino Rivera | 60 hrs | S/. 1,200.00 |
| **Total estimado de personal** | | **180 hrs** | **S/. 3,600.00** |

> *Nota: Los costos de personal son referenciales con fines académicos. La tarifa de S/. 20/hr corresponde a una estimación de desarrollador junior en la región de Tacna, Perú.*

**Costo total estimado del proyecto:**

| Categoría | Costo |
|-----------|-------|
| Infraestructura (1 mes de desarrollo) | ~$22.00 USD |
| Herramientas de software | $0.00 (open source / freemium) |
| Personal (referencial) | S/. 3,600.00 |
| **Total** | **S/. 3,600.00 + ~$22.00 USD** |

### 4.5 Licenciamiento e instalación

<div style="text-align: justify">

Todas las herramientas y tecnologías utilizadas en el proyecto son de software libre y código abierto, sin costo de licenciamiento:

- **PHP 8.x** – Licencia PHP License v3.01 (open source).
- **Lumen Framework (Laravel)** – Licencia MIT (open source).
- **MySQL 8.x** – Licencia GPL v2 (open source, edición Community).
- **Docker / Docker Compose** – Licencia Apache 2.0 (open source).
- **Terraform by HashiCorp** – Licencia MPL 2.0 (open source).
- **SonarQube Community Edition** – Licencia LGPL v3. Compatible con PHP mediante el plugin **SonarPHP**, incluido en la edición Community.
- **Snyk** – Plan gratuito para proyectos open source. Soporta análisis de dependencias PHP a través del archivo `composer.lock`.
- **Semgrep** – Open source con reglas PHP disponibles en el registro oficial de Semgrep (`semgrep.dev/r?lang=php`). Alternativa a Snyk para análisis estático de código PHP.
- **GitHub / GitHub Actions** – Plan gratuito para repositorios públicos.
- **Visual Studio Code** – Licencia MIT (open source).

La instalación del sistema se realiza mediante **Docker Compose** en la VPS Debian, ejecutando el comando `docker-compose up -d` en el directorio raíz del repositorio, previa configuración de las variables de entorno en el archivo `.env` de cada microservicio. El proceso de provisión de la VPS puede realizarse automáticamente mediante Terraform con `terraform init && terraform apply`.

</div>

<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

---

## 5. Características del producto

<div style="text-align: justify">

La **Red Social UPT** ofrecerá las siguientes características clave en su primera versión:

**Autenticación Institucional Segura:**
Registro e inicio de sesión exclusivo para cuentas con dominio `@virtual.upt.pe` (Google). El sistema valida el dominio en tiempo real y genera tokens JWT para la gestión de sesiones seguras. Solo miembros de la comunidad UPT pueden acceder a la plataforma.

**Feed de Publicaciones en Tiempo Real:**
Muro de publicaciones donde los usuarios pueden crear posts con texto e imágenes. Las publicaciones se listan en orden cronológico descendente y son visibles para todos los usuarios autenticados. Se implementa paginación para optimizar el rendimiento.

**Módulo de Historias:**
Los usuarios pueden publicar historias de texto o imagen con duración limitada, similares a las historias de Instagram. Las historias expiran automáticamente transcurrido el período definido y son visibles para toda la comunidad mientras estén activas. Este módulo es gestionado por el microservicio de posts e incorpora limpieza periódica de historias expiradas.

**Módulo de Interacciones Sociales:**
Los usuarios pueden dar likes, comentar y compartir publicaciones del feed. El sistema garantiza la unicidad de los likes por usuario y publicación, y muestra el conteo de interacciones en tiempo real.

**Gestión de Perfiles de Usuario:**
Cada usuario dispone de un perfil personalizable con nombre, foto de perfil, descripción, carrera y facultad. Los perfiles son visibles para los demás usuarios de la plataforma.

**Segmentación por Facultad y Carrera:**
Los usuarios se organizan según su facultad y carrera. El sistema permite filtrar el contenido del feed y visualizar grupos de usuarios por carrera (Sistemas, Civil, Administración, etc.).

**Arquitectura de Microservicios:**
El sistema está implementado con tres microservicios independientes (Auth, Posts & Historias, Profiles & Social), cada uno con su propia base de datos MySQL, desplegados en contenedores Docker separados y comunicándose mediante API REST con autenticación JWT.

**Despliegue en Infraestructura en la Nube:**
El sistema está publicado en una VPS con sistema operativo Debian, accesible públicamente desde cualquier navegador. La infraestructura es gestionada como código mediante Terraform, garantizando reproducibilidad y documentación del entorno.

**Wiki de GitHub y Roadmap del Producto:**
La Wiki del repositorio en GitHub documenta las características del producto, sus módulos funcionales y el roadmap del sistema. En el estado final del proyecto, este roadmap quedó resumido en dos versiones principales: una versión base inicial y una versión final consolidada, ambas con sus respectivas fechas de liberación. Esto permite mantener una visión clara de la evolución real del producto dentro del alcance académico del curso.

**Integración Continua y Análisis de Calidad:**
Pipeline de CI/CD configurado en GitHub Actions que ejecuta automáticamente análisis de código estático con SonarQube (plugin SonarPHP) y escaneo de vulnerabilidades con Snyk o Semgrep en cada push al repositorio. Ambas herramientas tienen soporte oficial para proyectos PHP.

**Gestión de Versiones y Releases:**
El repositorio en GitHub gestiona el versionamiento semántico del proyecto mediante tags y releases documentados, incluyendo Docker images publicadas como packages en el GitHub Container Registry.

</div>

<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

---

## 6. Restricciones

<div style="text-align: justify">

Las siguientes restricciones aplican al desarrollo y operación de la Red Social UPT:

**Restricciones técnicas:**

- El acceso al sistema requiere conexión a Internet; la plataforma no tendrá funcionalidad offline.
- El registro está restringido exclusivamente a cuentas con dominio `@virtual.upt.pe`. Correos de otros dominios serán rechazados automáticamente por el sistema.
- El sistema está diseñado para ejecutarse en entornos Linux (Debian) con Docker. No está optimizado para instalación en entornos Windows sin Docker Desktop.
- El tiempo de desarrollo es de aproximadamente 1 mes, lo que limita el alcance de funcionalidades avanzadas en la versión inicial.

**Restricciones de equipo:**

- El equipo de desarrollo está conformado por 3 estudiantes, cada uno responsable de un microservicio. La capacidad de desarrollo está acotada al tiempo académico disponible.
- Los integrantes no tienen experiencia previa con arquitectura de microservicios, lo que implica una curva de aprendizaje que debe considerarse en la planificación.

**Restricciones de infraestructura:**

- Los recursos de la VPS (CPU, RAM, almacenamiento) son limitados al plan contratado, lo que puede impactar el rendimiento bajo alta concurrencia.
- El almacenamiento de imágenes está limitado al espacio disponible en la VPS. No se contempla integración con servicios de almacenamiento en la nube (S3, Azure Blob) en la versión inicial.

**Restricciones legales y de privacidad:**

- El sistema debe cumplir con la Ley N° 29733 de Protección de Datos Personales del Perú en cuanto al tratamiento de datos de los estudiantes registrados.
- El sistema no debe almacenar contraseñas en texto plano; deben ser hasheadas con bcrypt u algoritmo equivalente.

</div>

<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

---

## 7. Rangos de calidad

<div style="text-align: justify">

La Red Social UPT se compromete a cumplir con los siguientes estándares de calidad durante su desarrollo y operación:

**Disponibilidad:**
El sistema deberá mantener una disponibilidad mínima del 95% durante el período de evaluación académica. Los microservicios deben reiniciarse automáticamente ante fallos mediante la política `restart: always` de Docker Compose.

**Rendimiento:**
El tiempo de respuesta de las APIs de los microservicios no deberá superar los 500ms para operaciones de consulta bajo condiciones normales de uso. El feed debe cargar las primeras 10 publicaciones en menos de 2 segundos.

**Seguridad:**
El código fuente deberá pasar el análisis de SonarQube sin vulnerabilidades de severidad **Critical** ni **Blocker**. El escaneo de dependencias con Snyk o Semgrep no deberá reportar vulnerabilidades críticas sin parche disponible. Todas las contraseñas deben almacenarse con hash bcrypt y la comunicación entre microservicios debe estar autenticada mediante JWT.

**Mantenibilidad:**
El código debe seguir el estándar PSR-12 para PHP. Cada microservicio debe contar con documentación de sus endpoints API en el README y la Wiki de GitHub. El repositorio debe mantener una cobertura completa de los criterios de aceptación descritos en los issues de GitHub Projects.

**Portabilidad:**
El sistema debe poder ser desplegado en cualquier VPS con Docker y Docker Compose instalados, siguiendo el procedimiento documentado en el README del repositorio.

**Usabilidad:**
La interfaz de usuario debe ser intuitiva y responsiva, accesible desde navegadores modernos en dispositivos de escritorio y móviles. El proceso de registro e inicio de sesión no debe superar los 3 pasos para el usuario.

</div>

<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

---

## 8. Precedencia y Prioridad

<div style="text-align: justify">

La precedencia se establece asegurando que los componentes fundamentales del sistema estén listos y funcionando antes de construir sobre ellos los módulos de mayor complejidad. La prioridad principal recae en la entrega de un sistema funcional, seguro y debidamente documentado que cumpla con los criterios de evaluación establecidos por el docente. El orden de precedencia en el desarrollo es el siguiente:

</div>

| Roles | Nro. | Requerimiento Funcional | Descripción | Prioridad |
|-------|------|-------------------------|-------------|-----------|
| Estudiante / Sistema | RF-01 | Registro e Inicio de Sesión Institucional | Autenticación con cuenta `@virtual.upt.pe` y JWT. Base de la que dependen el resto de funcionalidades. | **Alta** |
| Sistema | RF-09 | Autenticación con JWT | Validación de tokens entre microservicios. Requerido antes de implementar cualquier funcionalidad protegida. | **Alta** |
| Estudiante | RF-02 | Publicación en el Feed | Creación de posts con texto e imágenes. Funcionalidad central del sistema. | **Alta** |
| Estudiante | RF-03 | Visualización del Feed | Listado de publicaciones en tiempo real. Visible solo para usuarios autenticados. | **Alta** |
| Estudiante | RF-08 | Carga y Visualización de Imágenes | Subida de imágenes al crear publicaciones e historias. Complementa el feed y el módulo de historias. | **Alta** |
| Estudiante | RF-04 | Publicación de Historias | Creación de historias de texto o imagen con expiración automática. Depende del microservicio de posts. | **Alta** |
| Estudiante | RF-05 | Interacciones Sociales | Likes, comentarios y compartición. Depende del feed funcional. | **Alta** |
| Estudiante | RF-06 | Gestión de Perfil de Usuario | Edición de perfil con carrera y facultad. Depende del módulo de autenticación. | **Media** |
| Estudiante | RF-07 | Segmentación por Facultad y Carrera | Grupos y filtros por carrera. Depende de los perfiles configurados. | **Media** |
| Administrador | RF-10 | Panel de Administración | Gestión de usuarios y contenido. Depende de la autenticación con roles. | **Media** |
| Estudiante / Sistema | RF-11 | Cierre de Sesión Seguro | Invalidación de tokens. Complementa el módulo de autenticación. | **Alta** |

<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

---

## 9. Otros requerimientos del producto

### a) Estándares legales

<div style="text-align: justify">

La Red Social UPT se compromete a cumplir con las regulaciones y normativas vigentes en el Perú relacionadas con la protección de datos personales y la privacidad de los usuarios:

- **Ley N° 29733 – Ley de Protección de Datos Personales (Perú):** Regula la recopilación, almacenamiento y tratamiento de datos personales. El sistema únicamente recopilará los datos estrictamente necesarios para el funcionamiento de la plataforma (cuenta institucional, nombre, carrera, facultad) y no los compartirá con terceros.
- **Decreto Supremo N° 003-2013-JUS:** Reglamento de la Ley de Protección de Datos Personales. El sistema implementará medidas técnicas y organizativas para garantizar la seguridad de los datos almacenados.
- Las contraseñas de los usuarios serán almacenadas utilizando el algoritmo de hash bcrypt, nunca en texto plano.
- Los datos personales de los usuarios no serán utilizados con fines distintos a los declarados en el sistema.

</div>

### b) Estándares de comunicación

<div style="text-align: justify">

La privacidad e integridad de la información transmitida entre los usuarios y el sistema serán garantizadas mediante los siguientes mecanismos:

- Uso de **HTTPS** (TLS/SSL) para toda la comunicación entre el cliente y el servidor, protegiendo los datos en tránsito.
- Autenticación mediante **JWT (JSON Web Tokens)** con expiración configurada y firma digital para garantizar la autenticidad de las peticiones.
- Comunicación interna entre microservicios mediante HTTP autenticado con JWT, dentro de la red privada de Docker, sin exposición directa a Internet.
- Las APIs REST expuestas públicamente estarán protegidas mediante middleware de autenticación que valida el token en cada petición.

</div>

### c) Estándares de cumplimiento de la plataforma

<div style="text-align: justify">

El desarrollo y mantenimiento del sistema seguirán los siguientes estándares técnicos:

- **PSR-12** (PHP Standards Recommendations): Estándar de estilo de código para PHP, garantizando consistencia y legibilidad en el código de los microservicios.
- **Conventional Commits:** Convención para los mensajes de commits en Git, facilitando la generación del historial de cambios y el versionamiento semántico.
- **Semantic Versioning (SemVer):** El sistema seguirá el esquema MAJOR.MINOR.PATCH para el versionamiento de los releases en GitHub.
- **Wiki de GitHub:** La Wiki del repositorio documentará las características del producto por versión y el roadmap de futuras funcionalidades con fechas de liberación estimadas, en cumplimiento directo con el requerimiento del curso sobre uso de Wikis.
- **Docker Best Practices:** Uso de imágenes base oficiales y ligeras (`php:8-fpm-alpine`), definición de variables de entorno mediante archivos `.env`, y separación de configuración del código fuente.

</div>

### d) Estándares de calidad y seguridad

<div style="text-align: justify">

El sistema deberá cumplir con los siguientes estándares de calidad y seguridad, verificables mediante las herramientas integradas en el pipeline de CI/CD:

- **SonarQube Community Edition con SonarPHP:** Herramienta de análisis estático con soporte oficial para PHP incluido en la edición Community. El código de cada microservicio deberá pasar el Quality Gate sin vulnerabilidades de nivel Critical o Blocker. Se monitorizarán métricas de cobertura de código, duplicaciones, complejidad ciclomática y deuda técnica.

- **Snyk (análisis de dependencias PHP):** Snyk soporta el análisis del archivo `composer.lock` de proyectos PHP para detectar vulnerabilidades conocidas en paquetes de terceros. El pipeline fallará ante vulnerabilidades críticas sin parche disponible.

- **Semgrep (análisis estático PHP):** Alternativa open source con reglas específicas para PHP disponibles en el registro oficial de Semgrep. Detecta patrones de código inseguros como inyección SQL, XSS y uso incorrecto de funciones criptográficas en proyectos PHP.

- **GitHub Actions:** Todas las integraciones de código al branch principal deberán pasar el pipeline de CI/CD configurado, que incluye análisis estático con SonarQube, escaneo de seguridad con Snyk o Semgrep, y build de las imágenes Docker.

</div>

<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

---

## CONCLUSIONES

<div style="text-align: justify">

El presente documento de visión establece el marco conceptual y técnico sobre el cual se desarrollará la **Red Social UPT**, una plataforma web de comunicación e interacción social exclusiva para la comunidad estudiantil de la Universidad Privada de Tacna.

A lo largo del documento se ha identificado con claridad el problema que busca resolver el sistema: la ausencia de un espacio digital institucional donde los estudiantes de la UPT puedan interactuar de forma segura, verificada y organizada según su carrera y facultad. La solución propuesta, basada en una arquitectura de microservicios con PHP/Lumen y MySQL, responde a los requisitos académicos del curso de Patrones de Software al mismo tiempo que introduce al equipo en prácticas modernas de desarrollo de software.

La elección de tecnologías open source, el despliegue en una VPS Debian con Docker y Terraform, la integración de herramientas de calidad como SonarQube y Snyk o Semgrep —todas con soporte oficial para PHP—, y la documentación del producto en la Wiki de GitHub con un roadmap detallado, garantizan que el proyecto no solo cumpla con los criterios de evaluación, sino que también represente una experiencia formativa completa y alineada con las prácticas de la industria del software actual.

El documento también evidencia la viabilidad del proyecto dentro del plazo de un mes, con una división clara del trabajo entre los tres integrantes del equipo, cada uno responsable de un microservicio principal, y con un presupuesto de infraestructura accesible para un proyecto académico.

</div>

---

## RECOMENDACIONES

<div style="text-align: justify">

- **Comenzar con el microservicio de autenticación:** Dado que todos los demás microservicios dependen de la validación JWT, se recomienda que este sea el primer módulo en ser implementado y probado por el equipo.

- **Usar Docker Compose desde el inicio del desarrollo:** Configurar el entorno local con Docker Compose desde el primer día evitará inconsistencias entre los entornos de los tres integrantes y facilitará el despliegue final en la VPS.

- **Configurar GitHub Actions y la Wiki tempranamente:** Integrar SonarQube y Snyk o Semgrep en el pipeline de CI/CD, y crear la estructura inicial de la Wiki con el roadmap al inicio del proyecto, permitirá detectar problemas de calidad de forma incremental y cumplir con los entregables del curso sin acumular trabajo al final.

- **Definir los contratos de API antes de implementar:** Antes de que cada integrante comience a desarrollar su microservicio, se recomienda definir conjuntamente los endpoints, formatos de request/response y mecanismos de autenticación entre servicios, para evitar inconsistencias de integración.

- **Documentar continuamente en el README y la Wiki de GitHub:** La documentación del proyecto debe mantenerse actualizada a medida que se desarrolla. El README debe incluir los requisitos, procedimientos y parámetros para desplegar el proyecto, mientras que la Wiki debe reflejar las características del producto por versión y el roadmap con fechas de liberación.

- **Realizar commits frecuentes y bien descritos:** Seguir la convención de Conventional Commits facilitará la generación del historial de cambios para los releases y demostrará la contribución individual de cada integrante al proyecto.

- **Planificar el despliegue con anticipación:** Realizar el primer despliegue en la VPS en las primeras semanas del proyecto, no al final, para detectar problemas de configuración con tiempo suficiente para resolverlos.

</div>

---

## BIBLIOGRAFÍA

- Fowler, M. & Lewis, J. (2014). *Microservices: a definition of this new architectural term*. martinfowler.com.
- Newman, S. (2015). *Building Microservices: Designing Fine-Grained Systems*. O'Reilly Media.

---

## WEBGRAFÍA

- PHP Documentation. (2024). *PHP Manual*. Recuperado de https://www.php.net/docs.php
- Laravel. (2024). *Lumen – The stunningly fast micro-framework by Laravel*. Recuperado de https://lumen.laravel.com/docs
- Docker Inc. (2024). *Docker Documentation*. Recuperado de https://docs.docker.com

