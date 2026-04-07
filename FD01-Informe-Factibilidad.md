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

        Riesgo	Descripción	Impacto	Mitigación
        Falta de tiempo	Retraso en el desarrollo por carga académica	Alto	Planificación semanal
        Fallas en VPS	Problemas en el servidor	Medio	Backup y pruebas locales
        Problemas en microservicios	Errores en la integración	Alto	Pruebas continuas
        Fallas de seguridad	Vulnerabilidades en PHP	Alto	SonarQube y Snyk
        Problemas en Docker	Configuración incorrecta	Medio	Documentación y pruebas
        Falta de coordinación	Desorganización del equipo	Alto	Reuniones semanales

<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

3. <span id="_Toc52661348" class="anchor"></span>**Análisis de la Situación actual**

    3.1. Planteamiento del problema

            Describa antecedentes y situación actual, explicando la problemática y/o necesidad que será resuelta con el proyecto propuesto.

    3.2. Consideraciones de hardware y software

            Hardware y software posibles para la implementación, se analizara lo que existe y es alcanzable, se evaluara que tecnología se puede > utilizar en el proyecto.

<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

4. <span id="_Toc52661349" class="anchor"></span>**Estudio de
    Factibilidad**

    Describir los resultados que esperan alcanzar del estudio de factibilidad, las actividades que se realizaron para preparar la evaluación de factibilidad y por quien fue aprobado.

    4.1. <span id="_Toc52661350" class="anchor"></span>Factibilidad Técnica

        El estudio de viabilidad técnica se enfoca en obtener un entendimiento de los recursos tecnológicos disponibles actualmente y su aplicabilidad a las necesidades que se espera tenga el proyecto. En el caso de tecnología informática esto implica una evaluación del hardware y software y como este puede cubrir las necesidades del sistema propuesto.

        Realizar una evaluación de la tecnología actual existente y la posibilidad de utilizarla en el desarrollo e implantación del sistema.*

        Describir acerca del hardware (equipos, servidor), software (aplicaciones, navegadores, sistemas operativos, dominio, internet, infraestructura de red física, etc.

    4.2. <span id="_Toc52661351" class="anchor"></span>Factibilidad Económica

        El propósito del estudio de viabilidad económica, es determinar los beneficios económicos del proyecto o sistema propuesto para la organización, en contraposición con los costos.
        Como se mencionó anteriormente en el estudio de factibilidad técnica wvaluar si la institución (departamento de TI) cuenta con las herramientas necesarias para la implantación del sistema y evaluar si la propuesta requiere o no de una inversión inicial en infraestructura informática.
        Se plantearán los costos del proyecto.
        Costeo del Proyecto: Consiste en estimar los costos de los recursos Humanos, materiales o consumibles y/o máquinas) directos para completar las actividades del proyecto}.*

        Definir los siguientes costos:

        4.2.1. Costos Generales

                Los costos generales son todos los gastos realizados en accesorios y material de oficina y de uso diario, necesarios para los procesos, tales como, papeles, plumas, cartuchos de impresora, marcadores, computadora etc. Colocar tabla de costos.

        4.2.2. Costos operativos durante el desarrollo 
        
                Evaluar costos necesarios para la operatividad de las actividades de la empresa durante el periodo en el que se realizara el proyecto. Los costos de operación pueden ser renta de oficina, agua, luz, teléfono, etc.

        4.2.3. Costos del ambiente

                Evaluar si se cuenta con los requerimientos técnicos para la implantación del software como el dominio, infraestructura de red, acceso a internet, etc.

        4.2.4. Costos de personal

                Aquí se incluyen los gastos generados por el recurso humano que se necesita para el desarrollo del sistema únicamente.

                No se considerará personal para la operación y funcionamiento del sistema.

                Incluir tabla que muestra los gastos correspondientes al personal.

                Indicar organización y roles. Indicar horario de trabajo del personal.

        4.2.5.  Costos totales del desarrollo del sistema

                {Totalizar costos y realizar resumen de costo final del proyecto y la forma de pago.

    4.3. <span id="_Toc52661352" class="anchor"></span>Factibilidad Operativa

        Describir los beneficios del producto y si se tiene la capacidad por parte del cliente para mantener el sistema funcionando y garantizar el buen funcionamiento y su impacto en los usuarios. Lista de interesados.

    4.4. <span id="_Toc52661353" class="anchor"></span>Factibilidad Legal

        Determinar si existe conflicto del proyecto con restricciones legales como leyes y regulaciones del país o locales relacionadas con seguridad, protección de datos, conducta de negocio, empleo y adquisiciones.

    4.5. <span id="_Toc52661354" class="anchor"></span>Factibilidad Social 

        Evaluar influencias y asuntos de índole social y cultural como el clima político, códigos de conducta y ética*

    4.6. <span id="_Toc52661355" class="anchor"></span>Factibilidad Ambiental

        Evaluar influencias y asuntos de índole ambiental como el impacto y repercusión en el medio ambiente.

<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

5. <span id="_Toc52661356" class="anchor"></span>**Análisis Financiero**

    El plan financiero se ocupa del análisis de ingresos y gastos asociados a cada proyecto, desde el punto de vista del instante temporal en que se producen. Su misión fundamental es detectar situaciones financieramente inadecuadas.
    Se tiene que estimar financieramente el resultado del proyecto.

    5.1. Justificación de la Inversión

        5.1.1. Beneficios del Proyecto

            El beneficio se calcula como el margen económico menos los costes de oportunidad, que son los márgenes que hubieran podido obtenerse de haber dedicado el capital y el esfuerzo a otras actividades.
            El beneficio, obtenido lícitamente, no es sólo una recompensa a la inversión, al esfuerzo y al riesgo asumidos por el empresario, sino que también es un factor esencial para que las empresas sigan en el  mercado e incorporen nuevas inversiones al tejido industrial y social de las naciones.
            Describir beneficios tangibles e intangibles*
            Beneficios tangibles: son de fácil cuantificación, generalmente están relacionados con la reducción de recursos o talento humano.
            Beneficios intangibles: no son fácilmente cuantificables y están relacionados con elementos o mejora en otros procesos de la organización.
>
            Ejemplo de beneficios:

            - Mejoras en la eficiencia del área bajo estudio.
            - Reducción de personal.
            - Reducción de futuras inversiones y costos.
            - Disponibilidad del recurso humano.
            - Mejoras en planeación, control y uso de recursos.
            - Suministro oportuno de insumos para las operaciones.
            - Cumplimiento de requerimientos gubernamentales.
            - Toma acertada de decisiones.
            - Disponibilidad de información apropiada.
            - Aumento en la confiabilidad de la información.
            - Mejor servicio al cliente externo e interno
            - Logro de ventajas competitivas.
            - Valor agregado a un producto de la compañía.
        
        5.1.2. Criterios de Inversión

            5.1.2.1. Relación Beneficio/Costo (B/C)

                En base a los costos y beneficios identificados se evalúa si es factible el desarrollo del proyecto. 
                Si se presentan varias alternativas de solución se evaluará cada una de ellas para determinar la mejor solución desde el punto de vista del > retorno de la inversión
                El B/C si es mayor a uno, se acepta el proyecto; si el B/C es igual a uno es indiferente aceptar o rechazar el proyecto y si el B/C es menor a uno se rechaza el proyecto

            5.1.2.2. Valor Actual Neto (VAN)
            
                Valor actual de los beneficios netos que genera el proyecto. Si el VAN es mayor que cero, se acepta el proyecto; si el VAN es igual a cero es indiferente aceptar o rechazar el proyecto y si el VAN es menor que cero se rechaza el proyecto

            5.1.2.3 Tasa Interna de Retorno (TIR)*
                Es la tasa porcentual que indica la rentabilidad promedio anual que genera el capital invertido en el proyecto. Si la TIR es mayor que el costo de oportunidad se acepta el proyecto, si la TIR es igual al costo de oportunidad es indiferente aceptar o rechazar el proyecto, si la TIR es menor que el costo de oportunidad se rechaza el proyecto

                Costo de oportunidad de capital (COK) es la tasa de interés que podría haber obtenido con el dinero invertido en el proyecto

<div style="page-break-after: always; visibility: hidden">\pagebreak</div>

6. <span id="_Toc52661357" class="anchor"></span>**Conclusiones**

Explicar los resultados del análisis de factibilidad que nos indican si el proyecto es viable y factible.
