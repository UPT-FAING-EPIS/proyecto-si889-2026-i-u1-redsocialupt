<center>

[comment]: <img src="./media/media/image1.png" style="width:1.088in;height:1.46256in" alt="escudo.png" />

![./media/media/image1.png](./media/logo-upt.png)

**UNIVERSIDAD PRIVADA DE TACNA**

**FACULTAD DE INGENIERIA**

**Escuela Profesional de Ingeniería de Sistemas**

**Proyecto Red Social UPT***

Curso: *Patrones de Software*

Docente: *Mag. Ing. Patricio Cuadros Quiroga*

Integrantes:

***Cutipa Gutierrez, Ricardo (2021069827)***

***Malaga Espinoza, Ivan (2021071086)***

***Chino Rivera, Angel (2021069830)***

**Tacna – Perú**

***2026***

**  
**
</center>
<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

Sistema *{Nombre del Sistema}*

Informe de Factibilidad

Versión *{1.0}*

|CONTROL DE VERSIONES||||||
| :-: | :- | :- | :- | :- | :- |
|Versión|Hecha por|Revisada por|Aprobada por|Fecha|Motivo|
|1\.0|RCG|IME|ACR|06/04/2026|Versión Original|

<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

# **INDICE GENERAL**

[1. Descripción del Proyecto](#_Toc52661346)

[2. Riesgos](#_Toc52661347)

[3. Análisis de la Situación actual](#_Toc52661348)

[4. Estudio de Factibilidad](#_Toc52661349)

[4.1 Factibilidad Técnica](#_Toc52661350)

[4.2 Factibilidad económica](#_Toc52661351)

[4.3 Factibilidad Operativa](#_Toc52661352)

[4.4 Factibilidad Legal](#_Toc52661353)

[4.5 Factibilidad Social](#_Toc52661354)

[4.6 Factibilidad Ambiental](#_Toc52661355)

[5. Análisis Financiero](#_Toc52661356)

[6. Conclusiones](#_Toc52661357)


<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

**<u>Informe de Factibilidad</u>**

1. <span id="_Toc52661346" class="anchor"></span>**Descripción del Proyecto**

    1.1. Nombre del proyecto
   Red Social UPT – Plataforma Social Universitaria basada en Microservicios

    1.2. Duración del proyecto
   El proyecto tendrá una duración estimada de 4 meses (16 semanas), correspondiente al semestre académico 2026-I, desde abril hasta julio de 2026.

    1.3. Descripción

   La Red Social UPT es una plataforma digital desarrollada para la comunidad estudiantil de la Universidad Privada de Tacna, que permitirá la comunicación e      interacción académica y social dentro de un entorno institucional seguro.

   El proyecto consiste en el desarrollo de una red social web basada en arquitectura de microservicios, que permitirá a los estudiantes registrarse con su        cuenta institucional @virtual.upt.pe, publicar contenido, crear historias, interactuar con otros estudiantes y organizarse por facultad y carrera.

   La importancia del proyecto radica en que actualmente los estudiantes utilizan redes sociales externas como Facebook o WhatsApp para coordinar actividades      académicas, lo que genera problemas de privacidad, falta de control institucional y dispersión de la información.

   El sistema se desenvolverá en un entorno universitario digital, utilizando tecnologías modernas como:
    
    - PHP/Lumen
    - MySQL
    - Docker
    - Terraform
    - GitHub Actions
    - SonarQube
    - VPS Debian

   El objetivo principal es ofrecer una plataforma segura, escalable y centralizada que mejore la comunicación universitaria.

    1.4. Objetivos

        1.4.1 Objetivo general
        Desarrollar una plataforma web de red social universitaria basada en arquitectura de microservicios que permita a los estudiantes de la Universidad             Privada de Tacna interactuar, compartir contenido y comunicarse de forma segura mediante cuentas institucionales.
        
        1.4.2 Objetivos Específicos
        OE1: Diseñar la arquitectura de microservicios del sistema
        Se logrará definir la estructura del sistema, los microservicios de autenticación, publicaciones y perfiles, y su comunicación mediante API REST.
        
        OE2: Implementar el sistema de autenticación institucional
        Se logrará permitir el registro e inicio de sesión mediante cuentas @virtual.upt.pe utilizando JWT.
        
        OE3: Desarrollar el módulo de publicaciones e historias
        Se logrará permitir a los usuarios publicar contenido, historias efímeras e imágenes en el feed.
        
        OE4: Implementar el módulo de perfiles e interacciones sociales
        Se logrará permitir la gestión de perfiles, likes, comentarios y segmentación por facultad y carrera.
        
        OE5: Desplegar el sistema en un VPS con Docker y Terraform
        Se logrará que el sistema funcione en la nube con infraestructura automatizada.
        
        OE6: Implementar control de calidad y seguridad del código
        Se logrará integrar SonarQube, Snyk o Semgrep y GitHub Actions para garantizar la calidad del software.

<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

2. <span id="_Toc52661347" class="anchor"></span>**Riesgos**

    Los principales riesgos que podrían afectar el éxito del proyecto son:
   
    | Riesgo                      | Descripción                                  | Impacto | Mitigación               |
    | --------------------------- | -------------------------------------------- | ------- | ------------------------ |
    | Falta de tiempo             | Retraso en el desarrollo por carga académica | Alto    | Planificación semanal    |
    | Fallas en VPS               | Problemas en el servidor                     | Medio   | Backup y pruebas locales |
    | Problemas en microservicios | Errores en la integración                    | Alto    | Pruebas continuas        |
    | Fallas de seguridad         | Vulnerabilidades en PHP                      | Alto    | SonarQube y Snyk         |
    | Problemas en Docker         | Configuración incorrecta                     | Medio   | Documentación y pruebas  |
    | Falta de coordinación       | Desorganización del equipo                   | Alto    | Reuniones semanales      |


    
<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

3. <span id="_Toc52661348" class="anchor"></span>**Análisis de la Situación actual**

    3.1. Planteamiento del problema

    Actualmente los estudiantes de la Universidad Privada de Tacna no cuentan con una plataforma digital institucional que centralice la comunicación               académica    y social.

    La comunicación se realiza mediante redes sociales externas como Facebook, WhatsApp e Instagram, lo que genera problemas como:

    - Falta de privacidad
    - Información dispersa
    - No hay control institucional
    - No existe segmentación por carrera
    - Riesgo de cuentas falsas
    - Dependencia de plataformas externas

    Esto genera la necesidad de una red social universitaria propia que permita la comunicación segura y organizada dentro de la institución.

    3.2. Consideraciones de hardware y software

    Hardware
    - Computadoras del equipo de desarrollo
    - VPS Debian
    - Internet
    - Servidor virtual
    - Almacenamiento SSD
    
    Software
    - PHP 8
    - Lumen Framework
    - MySQL
    - Docker
    - Terraform
    - GitHub
    - SonarQube
    - Snyk
    - Semgrep
    - Visual Studio Code
    - Navegadores web

<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

4. <span id="_Toc52661349" class="anchor"></span>**Estudio de
    Factibilidad**

    Describir los resultados que esperan alcanzar del estudio de factibilidad, las actividades que se realizaron para preparar la evaluación de factibilidad y por quien fue aprobado.

    4.1. <span id="_Toc52661350" class="anchor"></span>Factibilidad Técnica

     El proyecto Red Social UPT se presenta como una iniciativa técnicamente viable para mejorar la comunicación e interacción entre los estudiantes de la           Universidad Privada de Tacna mediante el uso de una plataforma web basada en arquitectura de microservicios.
    
    La implementación del sistema implica el desarrollo de tres microservicios principales: autenticación institucional, publicaciones e historias, y perfiles      e interacciones sociales, los cuales estarán conectados mediante API REST y protegidos con tokens JWT. Esto permitirá garantizar la seguridad,                  escalabilidad y mantenimiento del sistema.
    
    El desarrollo del sistema web requiere la creación de una interfaz funcional y compatible con diferentes navegadores y dispositivos, lo que permitirá a los     estudiantes acceder desde computadoras o teléfonos móviles sin inconvenientes. Para ello, se realizarán pruebas de compatibilidad y rendimiento que             aseguren el correcto funcionamiento de la plataforma.
    
    La implementación del microservicio de autenticación permitirá validar las cuentas institucionales con dominio @virtual.upt.pe, garantizando que solo           estudiantes de la universidad puedan acceder al sistema. Esto ayudará a mantener un entorno seguro y controlado.
    
    El microservicio de publicaciones e historias permitirá a los usuarios crear contenido en tiempo real, subir imágenes y generar historias efímeras,             asegurando un control eficiente del almacenamiento y la expiración automática de contenido.
    
    El microservicio de perfiles e interacciones permitirá la gestión de perfiles, comentarios, likes y segmentación por facultad y carrera, facilitando la         organización académica y la interacción social.
    
    Además, el sistema será desplegado en un VPS con sistema operativo Debian utilizando Docker y Terraform, lo que garantizará una infraestructura                 automatizada y reproducible.
    
    El proyecto también integrará herramientas de calidad y seguridad como SonarQube, Snyk o Semgrep y GitHub Actions para asegurar la calidad del código y         evitar vulnerabilidades.
    
    Aunque el proyecto presenta desafíos técnicos como la integración de microservicios y el despliegue en la nube, su factibilidad se basa en el uso de            tecnologías modernas, software libre y metodologías adecuadas de desarrollo, lo que permite afirmar que el proyecto es técnicamente viable.
        
    4.2. <span id="_Toc52661351" class="anchor"></span>Factibilidad Económica

   El propósito del estudio de viabilidad económica, es determinar los beneficios económicos del proyecto o sistema propuesto para la organización, en             contraposición con los costos.

   Definir los siguientes costos:

        4.2.1. Costos Generales

        | Ítem | Descripción          | u.m.   | Costo Unitario | Cantidad  | Costo Total  |
        | ---- | -------------------- | ------ | -------------- | --------- | ------------ |
        | 1    | Papel Bond           | Millar | S/ 20.00       | 2         | S/ 40.00     |
        | 2    | Lapiceros            | Caja   | S/ 10.00       | 1         | S/ 10.00     |
        | 3    | Folder               | Unidad | S/ 1.00        | 10        | S/ 10.00     |
        | 4    | Recarga de impresora | Unidad | S/ 35.00       | 1         | S/ 35.00     |
        |      |                      |        |                | **Total** | **S/ 95.00** |

        4.2.2. Costos operativos durante el desarrollo 
        
        | Ítem | Descripción | Costo Unitario | Meses     | Total      |
        | ---- | ----------- | -------------- | --------- | ---------- |
        | 1    | Internet    | S/ 100         | 4         | S/ 400     |
        | 2    | Luz         | S/ 80          | 4         | S/ 320     |
        |      |             |                | **Total** | **S/ 720** |

        4.2.3. Costos del ambiente

        | Ítem | Descripción | Detalles         | Costo | Cantidad  | Total      |
        | ---- | ----------- | ---------------- | ----- | --------- | ---------- |
        | 1    | VPS Debian  | Servidor virtual | S/ 25 | 4         | S/ 100     |
        | 2    | Dominio web | Plataforma       | S/ 50 | 1         | S/ 50      |
        | 3    | GitHub      | Repositorio      | S/ 0  | 1         | S/ 0       |
        |      |             |                  |       | **Total** | **S/ 150** |

        4.2.4. Costos de personal
   
        | Rol                          | Unidad | Cantidad | Pago por hora | Horas | Horario       | Total    |
        | ---------------------------- | ------ | -------- | ------------- | ----- | ------------- | -------- |
        | Desarrollador Backend        | 1      | 1        | 20            | 60    | 8:00 - 14:00  | 1200     |
        | Desarrollador Microservicios | 1      | 1        | 20            | 60    | 14:00 - 20:00 | 1200     |
        | DevOps y Documentación       | 1      | 1        | 20            | 60    | 19:00 - 22:00 | 1200     |
        |                              |        |          |               |       | **Total**     | **3600** |

        4.2.5.  Costos totales del desarrollo del sistema

            | Resumen de Costos  | Costos Totales |
            | ------------------ | -------------- |
            | Costos Generales   | S/ 95          |
            | Costos de Ambiente | S/ 150         |
            | Costos de Personal | S/ 3600        |
            | Costos Operativos  | S/ 720         |
            | **TOTAL**          | **S/ 4565**    |



    4.3. <span id="_Toc52661352" class="anchor"></span>Factibilidad Operativa

       El proyecto es operativamente viable, ya que el sistema permitirá a los usuarios de la institución educativa controlar la asistencia de manera rápida y         eficiente mediante el reconocimiento por vectores numéricos. La plataforma será fácil de usar, con una interfaz intuitiva que permitirá a docentes y            personal administrativo registrar, consultar y gestionar la asistencia sin complicaciones. Además, el sistema reducirá el trabajo manual, mejorará el           control de la información y optimizará los procesos internos de la institución. También se contará con soporte técnico y capacitación básica para               garantizar el correcto uso y mantenimiento del sistema, asegurando su funcionamiento continuo.
   
    4.4. <span id="_Toc52661353" class="anchor"></span>Factibilidad Legal

     El proyecto cumple con la normativa legal vigente en el Perú, especialmente en lo relacionado con la protección de datos personales y el uso de                 tecnologías de información. Se respetará la Ley de Protección de Datos Personales, garantizando la seguridad y confidencialidad de la información de los        estudiantes y docentes. Asimismo, el sistema se desarrollará respetando las normas de uso de software, derechos de autor y regulaciones tecnológicas,           evitando problemas legales durante su implementación.

    4.5. <span id="_Toc52661354" class="anchor"></span>Factibilidad Social 

        El proyecto tendrá un impacto social positivo, ya que mejorará el control de asistencia en las instituciones educativas de Tacna, contribuyendo a una         mejor organización académica y administrativa. Los estudiantes, docentes y personal administrativo se beneficiarán al contar con un sistema moderno que         reduce errores y mejora la eficiencia en el registro de asistencia. Además, el uso de tecnología en el entorno educativo promueve la innovación y               fortalece la digitalización de los procesos institucionales.

    4.6. <span id="_Toc52661355" class="anchor"></span>Factibilidad Ambiental

       El proyecto no genera un impacto ambiental significativo, ya que se basa principalmente en el uso de tecnología digital. La implementación del sistema          permitirá reducir el uso de papel en el registro de asistencia, contribuyendo al cuidado del medio ambiente. Asimismo, se promoverá el uso responsable          de equipos informáticos y recursos tecnológicos, garantizando una gestión sostenible durante el desarrollo e implementación del sistema.

<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

5. <span id="_Toc52661356" class="anchor"></span>**Análisis Financiero**

    El plan financiero se ocupa del análisis de ingresos y gastos asociados a cada proyecto, desde el punto de vista del instante temporal en que se producen.      Su misión fundamental es detectar situaciones financieramente inadecuadas.
    Se tiene que estimar financieramente el resultado del proyecto.

    5.1. Justificación de la Inversión

        5.1.1. Beneficios del Proyecto

        Beneficios Tangibles
        - Reducción de tiempo en el control de asistencia.
        - Disminución de errores en registros manuales.
        - Ahorro en uso de papel y recursos administrativos.
        - Mejor control de la información académica.
        - Optimización del trabajo del personal administrativo.

        Beneficios Intangibles
        - Mejora en la organización institucional.
        - Mayor confiabilidad en la información.
        - Modernización tecnológica de la institución.
        - Mejor toma de decisiones académicas.
        - Incremento en la eficiencia del sistema educativo.
        - Mayor seguridad en el control de asistencia.
        
        5.1.2. Criterios de Inversión

            5.1.2.1. Relación Beneficio/Costo (B/C)

            La relación beneficio/costo permite evaluar si los beneficios del proyecto superan a los costos de inversión.
            Cuando el resultado es mayor a 1, el proyecto es rentable y puede ser aceptado.

            ![Uploading PASOFT_IMAGE03.png…]()


            B/C = 1.72
            
            Esto indica que el proyecto es rentable, ya que los beneficios son mayores que los costos.

            5.1.2.2. Valor Actual Neto (VAN)
            
            El Valor Actual Neto representa el valor actual de los beneficios que generará el proyecto a lo largo del tiempo.
            Si el VAN es mayor a cero, el proyecto es viable económicamente.
            
            <img width="676" height="267" alt="PASOFT_IMAGE01" src="https://github.com/user-attachments/assets/14d1aaec-ca52-4caa-a587-cb165c548143" />

            VAN = S/ 4,081.11
            i = 13%
            
            Esto demuestra que el proyecto genera ganancias y es económicamente viable.
              
            5.1.2.3 Tasa Interna de Retorno (TIR)*

            La Tasa Interna de Retorno indica la rentabilidad del proyecto en porcentaje anual.
            Si la TIR es mayor que el costo de oportunidad (COK), el proyecto se acepta.
            
            <img width="671" height="287" alt="PASOFT_IMAGE02" src="https://github.com/user-attachments/assets/684187b8-bd88-48c4-8b68-4f45bb06bb64" />

            
            TIR = 43%
            
            Esto indica que el proyecto tiene una alta rentabilidad, superando el costo de oportunidad del 13%, por lo que es viable.
   
            
<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

6. <span id="_Toc52661357" class="anchor"></span>**Conclusiones**

El análisis de factibilidad demuestra que el proyecto del sistema de control de asistencia mediante reconocimiento por vectores numéricos es viable técnica, económica, operativa, legal, social y ambientalmente. Los resultados financieros muestran un VAN positivo de S/ 4,081.11, una TIR de 43% y una relación beneficio/costo de 1.72, lo que confirma que el proyecto es rentable y sostenible en el tiempo.

En conclusión, la implementación del sistema permitirá mejorar la gestión de asistencia en instituciones educativas de Tacna, optimizar recursos, reducir errores administrativos y modernizar los procesos académicos, garantizando beneficios económicos y operativos a largo plazo.
