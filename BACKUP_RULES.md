# Reglas de Respaldo y Actualización (ESTRICTO)

El "Combo de Actualización" (Backup + Versión + Email) **SÓLO** se debe ejecutar cuando el usuario lo solicite explícitamente con la palabra **"backup"**.

**Protocolo de Solicitud Explícita:**
1.  **Versión**: Incrementar número de versión en \`frontend/index.html\`.
2.  **Respaldo y Resumen (Vía API de Producción)**: 
    Para garantizar que el envío use Brevo y respete la matriz de suscripciones (tal como el botón de la interfaz), debes usar un script Node que genere un JWT local como administrador y llame al endpoint de producción:
    \`\`\`javascript
    const jwt = require('jsonwebtoken');
    const secret = 'p8X3mA9qL7sT2vB4yZ6rN1kF0wH9cQ5d';
    const payload = { id: 1, name: 'ADMIN', role: 'director', is_superadmin: true, profile_admin: 'DIRECTOR', profile_opera: 'JEFE DE GRUPO', eye_id: 'ORO', is_guest: false, exp: Math.floor(Date.now() / 1000) + 60 * 60 };
    const token = jwt.sign(payload, secret);
    fetch('https://eye-staff.app/api/admin/send-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${token}\` },
        body: JSON.stringify({ channel: 'ambos' })
    }).then(res => res.json()).then(console.log);
    \`\`\`
    Guarda y ejecuta este script. Esto empaquetará (D1 + Frontend + Backend) y lo enviará vía Brevo/WhatsApp según la configuración activa en la base de datos.

**IMPORTANTE**: NO realizar estas acciones automáticamente tras cada cambio o deploy, a menos que se solicite con la palabra clave.

## Protocolo de Migraciones D1 (Cambios en Base de Datos)
Cualquier cambio en la estructura de la base de datos debe realizarse a través de archivos de migración para garantizar la integridad de los datos en Staging y Producción:
1. **Crear Migración**: Ejecutar `npx wrangler d1 migrations create nombre_descriptivo`.
2. **Escribir SQL**: Modificar el archivo generado en `migrations/` con los comandos SQL (`ALTER TABLE`, `CREATE TABLE`). NUNCA hacer un `DROP TABLE` o perder datos existentes a menos que esté estrictamente planeado.
3. **Despliegue Automático**: Al hacer push a `staging` o `main`, las GitHub Actions aplicarán automáticamente esta migración mediante `wrangler d1 migrations apply`.
