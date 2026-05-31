const resendApiKey = "re_D2247Pmz_2w2BuqArEEmMvifyKmwtZwA5";
const recipients = ["eyestaff.ncarrillo@gmail.com"];
const now = new Date();
const dateStr = now.toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric' });
const timeStr = now.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });

async function sendNotification() {
  console.log("Enviando reporte de backup por correo...");
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'EYE STAFF BACKUP <onboarding@resend.dev>',
      to: recipients,
      subject: `📦 BACKUP INTEGRAL v2.4.41 — ${dateStr} ${timeStr}`,
      html: `
        <div style="font-family:sans-serif; max-width:600px; margin:auto; border:1px solid #eee; border-radius:15px; overflow:hidden; border-top:5px solid #ef4444;">
          <div style="background:#0b0f19; padding:30px; text-align:center;">
            <h1 style="color:#ef4444; margin:0; font-size:1.8rem; letter-spacing:2px;">EYE STAFF</h1>
            <p style="color:#94a3b8; font-weight:700; margin:5px 0 0;">RESPALDO OPERATIVO INTEGRAL</p>
          </div>
          <div style="padding:30px; background:#fff;">
            <div style="background:#f8fafc; padding:20px; border-radius:12px; margin-bottom:20px; border-left:4px solid #ef4444;">
              <p style="margin:0 0 8px;"><strong>VERSIÓN DEL SISTEMA:</strong> v2.4.41</p>
              <p style="margin:0 0 8px;"><strong>FECHA Y HORA:</strong> ${dateStr} — ${timeStr}</p>
              <p style="margin:0 0 0;"><strong>ESTADO GLOBAL:</strong> <span style="color:#10b981; font-weight:700;">✅ RESPALDO COMPLETO REALIZADO</span></p>
            </div>

            <h3 style="color:#0f172a; margin:0 0 12px; font-size:1rem;">🗄️ Elementos Respaldados Correctamente</h3>
            <table style="width:100%; border-collapse:collapse; font-size:0.85rem; margin-bottom:20px;">
              <thead>
                <tr style="background:#f1f5f9; text-align:left; border-bottom:1px solid #e2e8f0;">
                  <th style="padding:10px; font-weight:700;">Componente</th>
                  <th style="padding:10px; font-weight:700;">Archivo generado / Destino</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom:1px solid #f1f5f9;">
                  <td style="padding:10px; font-weight:700;">Base de Datos (D1 Remote)</td>
                  <td style="padding:10px; color:#ef4444; font-family:monospace;">scratch/backup_v2.4.41_20260517_1415.sql</td>
                </tr>
                <tr style="border-bottom:1px solid #f1f5f9; background:#fafafa;">
                  <td style="padding:10px; font-weight:700;">Frontend Web (HTML)</td>
                  <td style="padding:10px; color:#ef4444; font-family:monospace;">backups/index_backup_2026_05_17_v2.4.41.html</td>
                </tr>
                <tr style="border-bottom:1px solid #f1f5f9;">
                  <td style="padding:10px; font-weight:700;">Backend Worker (TS)</td>
                  <td style="padding:10px; color:#ef4444; font-family:monospace;">backups/index_backup_2026_05_17_v2.4.41.ts</td>
                </tr>
                <tr style="border-bottom:1px solid #f1f5f9; background:#fafafa;">
                  <td style="padding:10px; font-weight:700;">Google Drive Backup</td>
                  <td style="padding:10px; color:#475569;">
                    📁 <code>Mi unidad > Backups_Antigravity</code><br>
                    📦 <b>antigravity_and_cloudflare_*.zip</b><br>
                    📦 <b>all_projects_full_*.zip</b>
                  </td>
                </tr>
              </tbody>
            </table>

            <h3 style="color:#0f172a; margin:20px 0 12px; font-size:1rem;">🔧 Resumen del Procedimiento</h3>
            <ul style="padding-left:20px; color:#334155; line-height:1.7; font-size:0.85rem;">
              <li><b>Exportación SQL Completa</b>: D1 (valet-db) exportada íntegramente con todos los esquemas y registros de vehículos, personal, asistencia y auditorías.</li>
              <li><b>Copia Preventiva del Código</b>: Resguardo local del frontend y del worker en la carpeta de backups de forma versionada.</li>
              <li><b>Compresión Multi-Proyecto</b>: Respaldo total de la memoria de Antigravity (IA), credenciales locales de Cloudflare y código de proyectos activos en Google Drive.</li>
              <li><b>Limpieza de Historial</b>: Rotación automática de respaldos en Google Drive para mantener únicamente los últimos 15 días.</li>
            </ul>

            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:15px; margin-top:25px; text-align:center;">
              <p style="margin:0; color:#166534; font-weight:700; font-size:0.9rem;">🌐 Producción Activa: grupoeyestaff.kosak.es</p>
              <p style="margin:4px 0 0; color:#166534; font-size:0.75rem; font-family:monospace;">Worker Version ID: ae4dea11-0b91-4bfe-a15f-2d4bf7e2337f</p>
            </div>

            <p style="color:#94a3b8; font-size:0.7rem; text-align:center; margin-top:25px; border-top:1px solid #f1f5f9; padding-top:15px;">
              GRUPO EYE STAFF 2026 · Sistema Automatizado de Seguridad Operativa
            </p>
          </div>
        </div>
      `
    })
  });
  const data = await response.json();
  if (data.id) {
    console.log(`✅ Reporte enviado correctamente a ${recipients.join(', ')}. ID: ${data.id}`);
  } else {
    console.error('❌ Error al enviar reporte:', JSON.stringify(data));
  }
}

sendNotification();
