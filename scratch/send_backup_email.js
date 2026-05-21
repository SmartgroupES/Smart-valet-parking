const RESEND_API_KEY = "re_D2247Pmz_2w2BuqArEEmMvifyKmwtZwA5";

const payload = {
  from: 'EYE STAFF <noreply@grupoeyestaff.kosak.es>',
  to: ['ncarrillok@gmail.com'],
  subject: 'EYE STAFF: Reporte de Actualización y Backup v2.4.76',
  html: `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
      <div style="background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 1.5rem;">RESPALDO Y ACTUALIZACIÓN COMPLETADO</h1>
        <p style="margin: 5px 0 0 0; opacity: 0.8;">Versión: v2.4.76</p>
      </div>
      <div style="padding: 20px;">
        <p>Hola Nelson,</p>
        <p>Se ha realizado un respaldo completo del sistema y se ha desplegado la última versión de <b>Valet Eye</b> de manera exitosa.</p>
        
        <h3 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 5px; margin-top: 25px;">Detalles del Proceso</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #666; font-weight: bold; width: 180px;">Estado del Respaldo:</td>
            <td style="padding: 8px 0; color: #16a34a; font-weight: bold;">✅ Éxito</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666; font-weight: bold;">Base de Datos D1:</td>
            <td style="padding: 8px 0; color: #333;">Exportada a SQL y respaldada localmente en la carpeta <code>scratch/</code></td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666; font-weight: bold;">Archivo de Backup DB:</td>
            <td style="padding: 8px 0; color: #333; font-family: monospace; font-size: 0.85rem;">backup_v2.4.76_20260520_0401.sql</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666; font-weight: bold;">Versión Desplegada:</td>
            <td style="padding: 8px 0; color: #333; font-weight: bold;">v2.4.76</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666; font-weight: bold;">Fecha del Proceso:</td>
            <td style="padding: 8px 0; color: #333;">20 de Mayo de 2026</td>
          </tr>
        </table>

        <h3 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 5px; margin-top: 25px;">Resumen de Cambios</h3>
        <ul style="padding-left: 20px; line-height: 1.6;">
          <li><b>Base de Datos</b>: Añadida la columna <code>event_end_date</code> a la tabla <code>sessions</code>.</li>
          <li><b>API Backend</b>: Actualización de endpoints de planificación y edición de eventos para admitir y persistir la fecha de fin de evento, con integración en correos de activación.</li>
          <li><b>Frontend</b>: Nuevo input de tipo fecha asociado a la hora de fin estimada, maquetado de forma simétrica y limpia.</li>
          <li><b>Visualización</b>: Integrada la fecha de fin tanto en el detalle del calendario como en el aviso de evento planificado en la interfaz del empleado.</li>
        </ul>

        <p style="margin-top: 30px; font-size: 0.85rem; color: #777; text-align: center; border-top: 1px solid #eee; padding-top: 15px;">
          EYE STAFF 2026 - Control Operativo Inteligente
        </p>
      </div>
    </div>
  `
};

fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { 
    'Authorization': 'Bearer ' + RESEND_API_KEY, 
    'Content-Type': 'application/json' 
  },
  body: JSON.stringify(payload)
})
.then(res => res.json())
.then(data => {
  console.log('Email sent status:', data);
  process.exit(0);
})
.catch(err => {
  console.error('Error sending email:', err);
  process.exit(1);
});
