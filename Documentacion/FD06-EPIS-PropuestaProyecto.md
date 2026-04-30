![](Aspose.Words.c5293cf3-f799-436c-9622-263d9585133c.001.png)

**UNIVERSIDAD PRIVADA DE TACNA** 

**FACULTAD DE INGENIERIA** 

**Escuela Profesional de Ingeniería de Sistemas** 

` `**Propuesta del Proyecto *Red Social UPT*** 

Curso: *Patrones de Software* \
Docente: *Mag. Ing. Patrick Cuadros Quiroga* 

Integrantes: 

***Cutipa Gutierrez, Ricardo (2021069827) Malaga Espinoza, Ivan (2021071086) Chino Rivera, Angel (2021069830)*** 

**Tacna – Perú** 

***2026*** 

Logo de Mi Empresa  Logo de mi Cliente 

**Proyecto** 

***Red Social UPT, Tacna, 2026}*** 

**Presentado por: *Cutipa Gutierrez, Ricardo*** 

***Malaga Espinoza, Ivan***  

***Chino Rivera, Angel***  

***Estudiantes*** 

***29/04/2026***  



|CONTROL DE VERSIONES ||||||
| - | :- | :- | :- | :- | :- |
|Versión |Hecha por |Revisada por |Aprobada por |Fecha |Motivo |
|1\.0 |MPV |ELV |ARV |10/10/2020 |Versión Original |

Tabla de contenido 

Resumen Ejecutivo ............................................................................................................3  I Propuesta narrativa ........................................................................................................4 

1. Planteamiento del Problema………………………………………………………………………………4 
1. Justificación del proyecto  ................................................................................4 
1. Objetivo general  ............................................................................................5 
1. Beneficios  ........................................................................................................6 
1. Alcance ....................................................................................................................7 
1. Requerimientos del sistema  ................................................................................7 
1. Restricciones  ........................................................................................................7 
8. Supuestos .................................................................................................................7 
8. Resultados esperados  ............................................................................................8 
8. Metodología de implementación  ....................................................................8 
8. Actores claves  ........................................................................................................9 
8. Papel y responsabilidades del personal  .......................................................10 
8. Plan de monitoreo y evaluación  ..................................................................12 
8. Cronograma del proyecto  .....................................................................................15 
8. Hitos de entregables  ..........................................................................................17 

II Presupuesto ..................................................................................................................18 

1. Planteamiento de aplicación del presupuesto ......................................................18 
1. Presupuesto  ..........................................................................................................18 
1. Análisis de Factibilidad ..............................................................................................18
1. Evaluación Financiera................................................................................................18

Anexo 01 – Requerimientos del Sistema *{nombre del sistema}* ..................................19

RESUMEN EJECUTIVO



|**Nombre del Proyecto propuesto**:  ||
| - | :- |
|||
|*Red Social UPT – Plataforma Social Universitaria basada en Microservicios,* ||
|*Tacna – 2026* ||
|**Propósito del Proyecto y Resultados esperados:**  ||
|||
|El propósito del proyecto es desarrollar una plataforma digital institucional que ||
|permita a los estudiantes de la Universidad Privada de Tacna comunicarse, ||
|interactuar y compartir contenido académico y social en un entorno seguro, ||
|centralizado y exclusivo mediante cuentas @virtual.upt.pe. ||
|||
|Los resultados esperados son: ||
|￿  Implementación de una red social funcional desplegada en la nube ||
|￿  Mejora en la comunicación académica entre estudiantes ||
|￿  Reducción del uso de plataformas externas ||
|￿  Sistema seguro con autenticación institucional ||
|￿  Infraestructura automatizada mediante Terraform ||
|||
|**Población Objetivo:**  ||
|*Estudiantes de la Universidad Privada de Tacna* ||
|<p>**Monto de Inversión (En Soles):** </p><p>` `***S/. 4513*** </p>|<p>**Duración del Proyecto (En Meses):** </p><p>***4 meses*** </p>|

1. **Propuesta Narrativa** 
1. **Planteamiento del Problema** 

Describe la situación actual de la comunidad estudiantil de la Universidad Privada de Tacna, caracterizada por la ausencia de una plataforma digital institucional propia para la comunicación académica y social. Expone las limitaciones del uso de redes sociales genéricas como la falta de verificación de identidad, problemas de privacidad y ausencia de segmentación por carrera o facultad. 

2. **Justificación del Proyecto** 

Explica la importancia de desarrollar una red social institucional que permita centralizar la comunicación dentro de la universidad, garantizando seguridad, identidad verificada mediante cuentas @virtual.upt.pe y un entorno adaptado a las necesidades académicas. Se resalta el valor del proyecto tanto a nivel tecnológico como formativo. 

3. **Objetivo General** 

Desarrollar una plataforma web denominada Red Social UPT, basada en arquitectura de microservicios, que permita a los estudiantes interactuar, compartir contenido y organizarse académicamente de manera segura utilizando autenticación institucional. 

4. **Beneficios** 

Detalla los beneficios que el sistema aportará a la comunidad universitaria, tales como: 

- Validación de identidad institucional de los usuarios  
- Centralización de la comunicación académica y social  
- Mejora en la privacidad y seguridad de la información  
- Organización por facultades y carreras  
- Escalabilidad para futuras funcionalidades  
5. **Alcance** 

Define los límites del proyecto, incluyendo el desarrollo de los principales módulos del sistema (autenticación, publicaciones e historias, perfiles e interacciones), el despliegue en infraestructura en la nube mediante una VPS con Docker, la implementación de prácticas de integración continua y la documentación del sistema en GitHub. 

6. **Requerimientos del Sistema** 

Describe los requerimientos funcionales principales que debe cumplir la plataforma, entre ellos: 

- Registro e inicio de sesión con cuentas institucionales  
- Publicación y visualización de contenido en el feed  
- Creación de historias efímeras  
- Interacciones sociales como likes y comentarios  
- Gestión de perfiles de usuario  
- Segmentación por facultad y carrera  
- Autenticación segura mediante JWT  
- Panel de administración  
7. **Restricciones** 

Detalla las limitaciones del proyecto, tales como: 

- Acceso restringido a cuentas institucionales @virtual.upt.pe  
- Dependencia de conexión a Internet  
- Recursos limitados de la VPS  
- Tiempo de desarrollo reducido  
- Cumplimiento de normativas legales de protección de datos  
8. **Supuestos** 

Establece las condiciones asumidas para el desarrollo del proyecto: 

- Disponibilidad de cuentas institucionales por parte de los usuarios  
- Acceso continuo a la infraestructura tecnológica  
- Coordinación efectiva del equipo de desarrollo  
- Uso de datos de prueba durante la implementación  
- Recursos suficientes para pruebas y despliegue inicial  
9. **Resultados Esperados** 

Describe los logros que se esperan alcanzar con la implementación de la Red Social UPT. Incluye la disponibilidad de una plataforma funcional accesible para la comunidad universitaria, la validación efectiva de usuarios mediante cuentas institucionales, la correcta implementación del feed de publicaciones e historias, así como la interacción social entre estudiantes. También se espera contar con un sistema seguro, escalable, documentado y desplegado en la nube, cumpliendo con los estándares de calidad definidos. 

10. **Metodología de Implementación** 

Explica el enfoque metodológico utilizado para el desarrollo del proyecto. Se basa en prácticas ágiles, con una división del trabajo por microservicios (autenticación, publicaciones e historias, perfiles e interacciones). Incluye el uso de herramientas como GitHub para control de versiones, GitHub Actions para integración continua, Docker para contenerización, y Terraform para la gestión de infraestructura como código. El desarrollo se realiza de manera incremental, priorizando funcionalidades críticas como la autenticación y el feed. 

11. **Actores Claves** 

Identifica a los principales participantes del proyecto, incluyendo: 

- Equipo de desarrollo (estudiantes encargados de implementar el sistema)  
- Docente del curso (responsable de la evaluación del proyecto)  
- Estudiantes de la UPT (usuarios finales de la plataforma)  
- Universidad Privada de Tacna (entidad que proporciona el entorno institucional)  

Cada actor cumple un rol fundamental en el desarrollo, validación y uso del sistema. 

12. **Papel y Responsabilidades del Personal** 

El desarrollo de la Red Social UPT es llevado a cabo por un equipo conformado por tres integrantes, quienes trabajan de manera coordinada bajo una distribución clara de responsabilidades basada en la arquitectura de microservicios del sistema. 

Cada integrante asume el desarrollo de un componente principal del sistema: 

- **Responsable del Microservicio de Autenticación (Auth Service)** 

  Encargado de implementar el registro e inicio de sesión con cuentas institucionales @virtual.upt.pe, la generación y validación de tokens JWT, y la gestión de seguridad del sistema. Además, cumple un rol de coordinación general del proyecto, asegurando la correcta integración entre los servicios.  

- **Responsable del Microservicio de Publicaciones e Historias (Posts Service)** Desarrolla el módulo del feed en tiempo real, la creación de publicaciones con texto e imágenes, así como el sistema de historias efímeras con expiración automática. También gestiona el almacenamiento de archivos y optimización del rendimiento del contenido multimedia.  
- **Responsable del Microservicio de Perfiles e Interacciones (Profile & Social Service)** 

  Implementa la gestión de perfiles de usuario, incluyendo datos académicos como carrera y facultad, así como las funcionalidades de interacción social (likes, comentarios y segmentación por grupos).  

Adicionalmente, el equipo trabaja de forma conjunta en: 

- Integración de los microservicios mediante APIs REST  
- Desarrollo del frontend web  
- Configuración del entorno con Docker y Docker Compose  
- Implementación de CI/CD con GitHub Actions  
- Gestión de infraestructura mediante Terraform  
- Documentación técnica en README y Wiki del repositorio  

El **administrador del sistema**, rol asumido por el equipo de desarrollo durante la fase operativa, se encarga de supervisar el estado de los servicios, monitorear el rendimiento y gestionar posibles incidencias. 

El **docente del curso** cumple la función de evaluador del proyecto, verificando el cumplimiento de los entregables (FD01 a FD06), la calidad técnica del sistema y la correcta aplicación de los conceptos de arquitectura de software. 

13. **Plan de Monitoreo y Evaluación** 

El proyecto incorpora mecanismos continuos de monitoreo y evaluación con el objetivo de garantizar la calidad, seguridad y correcto funcionamiento del sistema. 

El control de calidad del código se realiza mediante herramientas especializadas como **SonarQube**, que analiza métricas de mantenibilidad, duplicación y vulnerabilidades, y **Snyk o Semgrep**, que permiten detectar riesgos de seguridad en dependencias y código fuente. 

El pipeline de **integración continua (CI/CD)** configurado en GitHub Actions ejecuta automáticamente validaciones en cada actualización del repositorio, asegurando que el sistema cumpla con los estándares definidos antes de ser integrado. 

El monitoreo del sistema incluye: 

- Verificación del estado de los microservicios desplegados en Docker  
- Evaluación del rendimiento de las APIs (tiempos de respuesta)  
- Validación del funcionamiento del feed, autenticación e interacciones  
- Control del uso de recursos en la VPS (CPU, RAM, almacenamiento)  

La evaluación del cumplimiento del proyecto se basa en: 

- Implementación completa de los requerimientos funcionales  
- Entrega progresiva de documentos FD01 a FD06  
- Funcionamiento del sistema desplegado en la nube  
- Calidad del código según herramientas de análisis  
- Documentación en GitHub (README y Wiki con roadmap)  

Este enfoque permite detectar errores de manera temprana y asegurar la estabilidad del sistema antes de su entrega final. 

14. **Cronograma del Proyecto** 

El desarrollo del proyecto se organiza en un período comprendido entre los meses de **marzo y junio**, distribuyendo las actividades en fases progresivas: 

**Mes  Fase  Actividades Principales ![](Aspose.Words.c5293cf3-f799-436c-9622-263d9585133c.002.png)![](Aspose.Words.c5293cf3-f799-436c-9622-263d9585133c.003.png)**



|Inicio y Planificación |
| :- |

Definición del proyecto, análisis del problema, elaboración del FD01 (Informe de Factibilidad), configuración del entorno de desarrollo, creación del repositorio en GitHub 



|Análisis y Diseño |
| - |

Desarrollo del FD02 (Informe de Visión) y FD03 (Requerimientos), diseño de arquitectura de microservicios, inicio del desarrollo del microservicio de autenticación 



|Desarrollo e Integración |
| - |

Elaboración del FD04 (Arquitectura de Software), desarrollo de       microservicios (posts, historias, perfiles), integración mediante APIs REST, desarrollo del frontend, pruebas iniciales 

Pruebas,  Desarrollo del FD05 (Informe Final) y FD06 (Propuesta), integración **Junio**  Despliegue y  completa del sistema, pruebas finales, despliegue en VPS con 

Cierre  Docker y Terraform, documentación en GitHub y presentación final 

15. **Hitos de Entregables** 

El proyecto se estructura en una serie de entregables académicos que evidencian el avance del desarrollo y cumplimiento de los objetivos: 

- **FD01 – Informe de Factibilidad** 

  Define la viabilidad técnica, económica y operativa del proyecto, así como la configuración inicial del entorno.  

- **FD02 – Informe de Visión** 

  Establece la visión general del sistema, alcance, objetivos y descripción de los usuarios e interesados.  

- **FD03 – Informe de Especificación de Requerimientos** 

  Detalla los requerimientos funcionales y no funcionales del sistema, así como los criterios de aceptación.  

- **FD04 – Informe de Arquitectura de Software (SAD)** 

  Define la arquitectura basada en microservicios, componentes del sistema, diagramas y tecnologías utilizadas.  

- **FD05 – Informe Final del Proyecto** 

  Integra todos los aspectos del desarrollo, incluyendo implementación, pruebas, despliegue y resultados obtenidos.  

- **FD06 – Propuesta del Proyecto** 

  Documento que consolida la propuesta general del sistema y su valor dentro del contexto académico.  

Adicionalmente, se consideran como hitos clave: 

- Repositorio en GitHub con código fuente funcional  
- Wiki documentada con roadmap del producto  
- Sistema desplegado en una VPS operativa  
- Presentación final del proyecto  

Cada uno de estos entregables representa un avance significativo en el desarrollo del sistema y permite validar el cumplimiento de los objetivos establecidos. 

2. **Presupuesto** 
1. **Planteamiento de Aplicación del Presupuesto** 

El presupuesto del proyecto Red Social UPT está orientado a cubrir los recursos necesarios para el desarrollo, implementación y despliegue del sistema dentro del contexto académico. La asignación de costos se enfoca principalmente en cuatro componentes: costos generales, costos operativos, costos de infraestructura (ambiente) y costos de personal. 

Se prioriza el uso de herramientas de software libre como PHP/Lumen, MySQL, Docker, Terraform y GitHub, lo que reduce significativamente los gastos en licencias. La inversión se concentra en la contratación de una VPS para el despliegue del sistema, el consumo de servicios básicos durante el desarrollo y el esfuerzo del equipo conformado por tres integrantes. 

El presupuesto permite garantizar que el sistema pueda ser desarrollado en un entorno real, cumpliendo con los requerimientos funcionales definidos en los entregables FD01 a FD06, y asegurando su disponibilidad para pruebas, evaluación y presentación final. 

2. **Presupuesto** 

El costo total del proyecto se distribuye de la siguiente manera: 

Costos Generales: 

Incluyen materiales de apoyo utilizados durante la documentación y desarrollo del proyecto, como papel, útiles de oficina e impresión. 

Costos Operativos: 

Corresponden a servicios básicos necesarios durante el desarrollo, como acceso a Internet y consumo de energía eléctrica durante un período de cuatro meses (marzo a junio). 

Costos del Ambiente: 

Incluyen la infraestructura tecnológica necesaria para el despliegue del sistema, como la contratación de una VPS con sistema operativo Debian, el registro de dominio web y el uso de repositorios en GitHub. 

Costos de Personal: 

Representan el esfuerzo del equipo de desarrollo, conformado por tres integrantes, cada uno responsable de un microservicio (autenticación, publicaciones e historias, perfiles e interacciones), así como tareas de integración, documentación y despliegue. 

El costo total estimado del proyecto asciende a S/ 4565, considerando todos los componentes mencionados. 

3. **Análisis de Factibilidad** 

El proyecto presenta condiciones favorables para su ejecución dentro del entorno académico. 

En el aspecto técnico, se dispone de tecnologías modernas, estables y ampliamente documentadas, como PHP/Lumen, MySQL y Docker, que permiten implementar la arquitectura de microservicios sin limitaciones significativas. 

En el aspecto económico, el proyecto resulta viable debido al bajo costo de infraestructura y al uso de herramientas gratuitas. La mayor inversión corresponde al esfuerzo del equipo de desarrollo, considerado como un costo referencial. 

En el aspecto operativo, el sistema puede ser utilizado fácilmente por los estudiantes de la Universidad Privada de Tacna a través de un navegador web, utilizando su cuenta institucional @virtual.upt.pe, sin necesidad de configuraciones complejas. 

4. **Evaluación Financiera** 

El proyecto Red Social UPT no tiene como objetivo generar ingresos económicos directos, ya que se desarrolla dentro de un contexto académico. Sin embargo, su valor se refleja en los beneficios que aporta a la comunidad universitaria. 

La implementación del sistema permite centralizar la comunicación entre estudiantes, mejorar la seguridad mediante autenticación institucional, y reducir la dependencia de plataformas externas. Además, la arquitectura de microservicios facilita la escalabilidad del sistema para futuras mejoras. 

La relación costo-beneficio es favorable, ya que con una inversión relativamente baja se obtiene una plataforma funcional, segura y alineada con las necesidades del entorno universitario. 

**Anexo 01 – Requerimientos del Sistema Red Social UPT** 

El Anexo 01 contiene el detalle completo de los requerimientos del sistema, definidos en el Informe de Especificación de Requerimientos (FD03). 

Incluye los requerimientos funcionales principales como: 

- Registro e inicio de sesión con cuentas institucionales @virtual.upt.pe  
- Publicación y visualización en el feed  
- Creación de historias efímeras  
- Interacciones sociales (likes, comentarios)  
- Gestión de perfiles de usuario  
- Segmentación por facultad y carrera  
- Autenticación mediante JWT  
- Panel de administración  

También incorpora criterios de aceptación, prioridades y consideraciones técnicas que sirven como base para el desarrollo, validación y pruebas del sistema. 
12 
