---
trigger: always_on
---

ESTRICTAS REGLAS DE AHORRO DE CUOTA Y COMPORTAMIENTO:

1. MODELO: Utiliza siempre Gemini 3 Flash para realizar los cambios, a menos que yo explícitamente te pida cambiar a Pro para una tarea compleja.
2. CONTEXTO MÍNIMO: No leas todo el repositorio. Limítate exclusivamente a los archivos que te pida modificar o que sean estrictamente necesarios para el cambio actual. 
3. NAVEGADOR Y PRUEBAS: NO abras el navegador interno ni realices pruebas visuales automáticas a menos que te lo ordene. Yo validaré los cambios manualmente en la URL de producción.
4. DEPLOY: Solo realiza el deploy cuando confirmes que el código es sintácticamente correcto.
5. VERSIONAMIENTO Y BACKUPS: Mantén el sistema de "Cambio Versión_xxx". NO hagas backups completos locales de los archivos (ej. backup_xxx.html) en cada cambio. Los backups completos solo se hacen en el primer cambio de la primera sesión del día, o cuando se te solicite explícitamente: "Hagamos backup completo".
7. REMITENTE DE EMAILS: El remitente de emails desde eye-staff.app siempre debe ser "EYE STAFF", y para Rentaequipos "RENTAEQUIPOS". Nunca uses "Acme".
6. RESPUESTAS: Sé conciso. No generes explicaciones largas ni resúmenes innecesarios que consuman tokens de salida.