const { execSync } = require('child_process');

async function main() {
  console.log('Obteniendo personal de D1...');
  const outputJson = execSync('npx wrangler d1 execute valet-db --remote --json --command "SELECT name, cedula, pin_hash, profile_admin, profile_opera, eye_id FROM users ORDER BY name ASC"').toString();
  
  // Analizar respuesta
  const parsed = JSON.parse(outputJson);
  const staff = parsed[0].results;
  
  if (!staff || staff.length === 0) {
    console.error('No se encontraron empleados.');
    return;
  }
  
  console.log(`Se encontraron ${staff.length} empleados. Generando HTML...`);
  
  let tableRows = '';
  staff.forEach((u) => {
    tableRows += `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px; font-weight: bold; color: #1e293b; text-align: left;">${u.name}</td>
        <td style="padding: 10px; color: #475569; text-align: left;">${u.cedula || '---'}</td>
        <td style="padding: 10px; font-family: monospace; font-weight: bold; color: #6366f1; background: #f8fafc; text-align: center;">${u.pin_hash || '---'}</td>
        <td style="padding: 10px; color: #64748b; text-align: left;">${u.eye_id || '---'}</td>
        <td style="padding: 10px; color: #64748b; text-align: left;">${u.profile_admin || '---'} / ${u.profile_opera || '---'}</td>
      </tr>
    `;
  });

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <span style="font-size: 0.8rem; letter-spacing: 4px; color: #64748b; font-weight: bold; display: block; margin-bottom: 5px;">GRUPO EYE STAFF</span>
        <h2 style="color: #0f172a; margin: 0; font-size: 1.8rem; font-weight: 800;">LISTADO COMPLETO DE ACCESOS</h2>
        <p style="color: #64748b; margin-top: 5px; font-size: 0.95rem;">Contraseñas iniciales (PIN) asignadas según Cédula de Identidad</p>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem; text-align: left; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05);">
        <thead>
          <tr style="background: #0f172a; color: #ffffff; text-align: left;">
            <th style="padding: 12px 10px; text-align: left;">EMPLEADO</th>
            <th style="padding: 12px 10px; text-align: left;">CÉDULA</th>
            <th style="padding: 12px 10px; text-align: center;">PIN DE ACCESO</th>
            <th style="padding: 12px 10px; text-align: left;">EYE ID</th>
            <th style="padding: 12px 10px; text-align: left;">PERFILES</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
      <div style="margin-top: 20px; padding: 15px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #166534; font-size: 0.9rem;">
        <strong style="display: block; margin-bottom: 5px;">🔐 ¿Cómo cambiar tu clave de acceso?</strong>
        Para mayor seguridad, te recomendamos cambiar tu clave inicial. Solo debes ingresar al sistema, hacer clic en el botón <strong>CLAVE 🔐</strong> (arriba a la derecha, junto al botón de Salir), escribir tu nueva clave (mínimo 4 caracteres) y presionar "Guardar".
      </div>
      <div style="margin-top: 30px; text-align: center; color: #94a3b8; font-size: 0.8rem;">
        Plataforma Integral EYE STAFF © 2026 — Control Operativo de Valet Parking
      </div>
    </div>
  `;

  console.log('Enviando email a través de Resend...');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer re_D2247Pmz_2w2BuqArEEmMvifyKmwtZwA5',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'EYE STAFF <noreply@grupoeyestaff.kosak.es>',
      to: ['eyestaff.ncarrillo@gmail.com'],
      subject: 'EYE STAFF — Listado Completo de Accesos y Pines',
      html: html
    })
  });
  
  const resData = await res.json();
  console.log('Respuesta de Resend:', resData);
}

main().catch(console.error);
