---
trigger: always_on
---

ESTRICTAS REGLAS DE AHORRO DE CUOTA Y COMPORTAMIENTO:

1. MODELO: Utiliza siempre Gemini 3 Flash para realizar los cambios, a menos que yo explícitamente te pida cambiar a Pro para una tarea compleja.
2. CONTEXTO MÍNIMO: No leas todo el repositorio. Limítate exclusivamente a los archivos que te pida modificar o que sean estrictamente necesarios para el cambio actual. 
3. NAVEGADOR Y PRUEBAS: NO abras el navegador interno ni realices pruebas visuales automáticas a menos que te lo ordene. Yo validaré los cambios manualmente en la URL de producción.
4. DEPLOY: Solo realiza el deploy cuando confirmes que el código es sintácticamente correcto.
5. VERSIONAMIENTO: Mantén el sistema de "Cambio Versión_xxx". Antes de cada cambio, crea un backup local del archivo (ej. backup_xxx.html) para poder revertir rápidamente sin usar razonamiento del agente.
6. RESPUESTAS: Sé conciso. No generes explicaciones largas ni resúmenes innecesarios que consuman tokens de salida.