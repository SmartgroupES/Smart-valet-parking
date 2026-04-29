# Reglas de Respaldo y Actualización (ESTRICTO)

El "Combo de Actualización" (Backup + Versión + Email) **SÓLO** se debe ejecutar cuando el usuario lo solicite explícitamente con la palabra **"backup"**.

**Protocolo de Solicitud Explícita:**
1.  **Respaldo**: Export de base de datos D1.
2.  **Versión**: Incrementar número en `index.html`.
3.  **Resumen**: Enviar email a **ncarrillok@gmail.com**.

**IMPORTANTE**: NO realizar estas acciones automáticamente tras cada cambio o deploy, a menos que se use la palabra clave mencionada.
