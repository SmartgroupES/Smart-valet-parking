const resendApiKey = "re_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF";
const to = "ncarrillok@gmail.com";
const now = new Date();
const dateStr = now.toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric' });
const timeStr = now.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });

async function sendNotification() {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'EYE STAFF <onboarding@resend.dev>',
      to: [to],
      subject: `🗄️ BACKUP COMPLETO v2.4.17 — ${dateStr} ${timeStr}`,
      html: `
        <div style="font-family:sans-serif; max-width:560px; margin:auto; border:1px solid #eee; border-radius:15px; overflow:hidden; border-top:5px solid #6366f1;">
          <div style="background:#0f172a; padding:30px; text-align:center;">
            <h1 style="color:#6366f1; margin:0; font-size:1.8rem; letter-spacing:2px;">EYE STAFF</h1>
            <p style="color:#94a3b8; font-weight:700; margin:5px 0 0;">NOTIFICACIÓN DE BACKUP Y VERSIÓN</p>
          </div>
          <div style="padding:30px; background:#fff;">
            <div style="background:#f8fafc; padding:20px; border-radius:12px; margin-bottom:20px; border-left:4px solid #6366f1;">
              <p style="margin:0 0 8px;"><strong>VERSIÓN:</strong> v2.4.17</p>
              <p style="margin:0 0 8px;"><strong>FECHA:</strong> ${dateStr} — ${timeStr}</p>
              <p style="margin:0 0 0;"><strong>ESTADO:</strong> <span style="color:#22c55e; font-weight:700;">✅ BACKUP COMPLETO EXITOSO</span></p>
            </div>

            <h3 style="color:#0f172a; margin:0 0 12px;">📦 Archivos respaldados</h3>
            <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
              <tr style="background:#f1f5f9;">
                <td style="padding:10px 12px; font-weight:700;">Base de Datos (D1)</td>
                <td style="padding:10px 12px; color:#6366f1;">backup_v2417_20260517_0710.sql (Exportación remota D1)</td>
              </tr>
              <tr>
                <td style="padding:10px 12px; font-weight:700;">Frontend (HTML Backup)</td>
                <td style="padding:10px 12px; color:#6366f1;">backup_v2416_index.html (Copia de seguridad local)</td>
              </tr>
              <tr style="background:#f1f5f9;">
                <td style="padding:10px 12px; font-weight:700;">Google Drive Backup</td>
                <td style="padding:10px 12px; color:#6366f1;">antigravity_and_cloudflare_*.zip y all_projects_full_*.zip</td>
              </tr>
            </table>

            <h3 style="color:#0f172a; margin:20px 0 12px;">🔧 Detalles del Proceso de Respaldo</h3>
            <ul style="padding-left:20px; color:#334155; line-height:1.8;">
              <li>Exportación exitosa de la base de datos D1 (valet-db) en formato SQL.</li>
              <li>Incremento de versión del sistema a <b>v2.4.17</b> en index.html.</li>
              <li>Generación de respaldos locales preventivos de la interfaz web (backup_v2416_index.html).</li>
              <li>Compresión y almacenamiento de todos los proyectos activos en Google Drive de forma segura.</li>
              <li>Limpieza automática de respaldos con antigüedad superior a 15 días en la nube.</li>
            </ul>

            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:15px; margin-top:20px; text-align:center;">
              <p style="margin:0; color:#166534; font-weight:700;">🌐 Producción activa en grupoeyestaff.kosak.es</p>
              <p style="margin:4px 0 0; color:#166534; font-size:0.85rem;">Worker ID: e390baa1-fabc-4bc8-a40c-8b3c404b6eed</p>
            </div>

            <p style="color:#94a3b8; font-size:0.75rem; text-align:center; margin-top:20px;">
              GRUPO EYE STAFF — Sistema de Gestión de Personal · Backup local en /scratch/ y copia en la nube
            </p>
          </div>
        </div>
      `
    })
  });
  const data = await response.json();
  if (data.id) {
    console.log(`✅ Email enviado correctamente. ID: ${data.id}`);
  } else {
    console.error('❌ Error:', JSON.stringify(data));
  }
}

sendNotification();
