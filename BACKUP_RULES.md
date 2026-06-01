# Reglas de Respaldo y Actualización (ESTRICTO)

El "Combo de Actualización" (Backup + Versión + Email) **SÓLO** se debe ejecutar cuando el usuario lo solicite explícitamente con la palabra **"backup"**.

**Protocolo de Solicitud Explícita:**
1.  **Respaldo**: Export de base de datos D1.
2.  **Versión**: Incrementar número en `index.html`.
3.  **Resumen**: Enviar email a **ncarrillok@gmail.com** con el título del remitente (Sender) como **EYE STAFF**.

**IMPORTANTE**: NO realizar estas acciones automáticamente tras cada cambio o deploy, a menos que se use la palabra clave mencionada.

## Protocolo de Migraciones D1 (Cambios en Base de Datos)
Cualquier cambio en la estructura de la base de datos debe realizarse a través de archivos de migración para garantizar la integridad de los datos en Staging y Producción:
1. **Crear Migración**: Ejecutar `npx wrangler d1 migrations create nombre_descriptivo`.
2. **Escribir SQL**: Modificar el archivo generado en `migrations/` con los comandos SQL (`ALTER TABLE`, `CREATE TABLE`). NUNCA hacer un `DROP TABLE` o perder datos existentes a menos que esté estrictamente planeado.
3. **Despliegue Automático**: Al hacer push a `staging` o `main`, las GitHub Actions aplicarán automáticamente esta migración mediante `wrangler d1 migrations apply`.
