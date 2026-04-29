
const resendApiKey = "re_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF";
const to = "ncarrillok@gmail.com";

async function sendNotification() {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'EYE STAFF <onboarding@resend.dev>',
      to: [to],
      subject: '🚀 ACTUALIZACIÓN Y BACKUP: v2.2.23',
      html: `
        <div style="font-family:sans-serif; max-width:500px; margin:auto; border:1px solid #eee; border-radius:15px; overflow:hidden; border-top:5px solid #22c55e;">
          <div style="padding:30px; text-align:center;">
            <h1 style="color:#22c55e; margin:0;">EYE STAFF</h1>
            <p style="color:#64748b; font-weight:700;">NOTIFICACIÓN DE BACKUP Y VERSIÓN</p>
            <div style="background:#f8fafc; padding:20px; border-radius:12px; margin:20px 0; text-align:left;">
              <p><strong>NUEVA VERSIÓN:</strong> v2.2.23</p>
              <p><strong>ESTADO:</strong> Backup D1 completado satisfactoriamente.</p>
              <p><strong>REVISIÓN DE CAMBIOS:</strong></p>
              <ul style="padding-left:20px;">
                <li>Nuevo Módulo de Formatos Multi-Evento.</li>
                <li>Buscador Autocompletable de Personal.</li>
                <li>Sincronización Automática de Roles y Fechas.</li>
                <li>Persistencia de Datos Bancarios en Perfil.</li>
              </ul>
            </div>
            <p style="color:#64748b; font-size:0.8rem;">Respaldo almacenado en: scratch/backup_2026_04_25.sql</p>
          </div>
        </div>
      `
    })
  });
  const data = await response.json();
  console.log(data);
}

sendNotification();
