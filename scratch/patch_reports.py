import re

# Patch index.ts
with open('src/index.ts', 'r') as f:
    content = f.read()

# Add the new route in test-request
route_str = """
  } else if (type === 'permissions-matrix') {
    const allUsers = await env.DB.prepare("SELECT name, role FROM users WHERE is_active = 1 ORDER BY name ASC").all();
    const users = allUsers.results || [];
    const allowedCfoNames = ["NELSON CARRILLO", "NICOLAS BETANCOURT", "MAIFER BARRUETA"];

    let excelData = [
      ['Empleado', 'Valet Parking Ve', 'Valet Parking Mod', 'Eventos y Listas Ve', 'Eventos y Listas Mod', 'Admin General Ve', 'Admin General Mod', 'VIP Eye Staff Ve', 'VIP Eye Staff Mod', 'Seguridad (Pines) Ve', 'Seguridad (Pines) Mod']
    ];

    let htmlRows = '';

    for (const u of users) {
      const isSuperadmin = u.role === 'director';
      const isSupervisor = u.role === 'supervisor';
      const isVIP = allowedCfoNames.some(n => (u.name || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(n));

      const valetVe = true;
      const valetMod = isSuperadmin || isSupervisor;
      const eventosVe = isSuperadmin || isSupervisor;
      const eventosMod = isSuperadmin || isSupervisor;
      const adminVe = isSuperadmin;
      const adminMod = isSuperadmin;
      const vipVe = isVIP;
      const vipMod = isVIP;
      const segVe = isSuperadmin;
      const segMod = isSuperadmin;

      const toMark = (b) => b ? '✅' : '❌';

      excelData.push([
        u.name.toUpperCase(),
        toMark(valetVe), toMark(valetMod),
        toMark(eventosVe), toMark(eventosMod),
        toMark(adminVe), toMark(adminMod),
        toMark(vipVe), toMark(vipMod),
        toMark(segVe), toMark(segMod)
      ]);

      htmlRows += `
        <tr style="border-bottom: 1px solid #e2e8f0; background: white; color: #1e293b; font-size: 0.8rem; text-align: center;">
          <td style="padding: 10px; text-align: left; font-weight: bold; border-right: 1px solid #e2e8f0;">${u.name.toUpperCase()}</td>
          <td style="padding: 10px; border-right: 1px dashed #e2e8f0;">${toMark(valetVe)}</td><td style="padding: 10px; border-right: 1px solid #e2e8f0;">${toMark(valetMod)}</td>
          <td style="padding: 10px; border-right: 1px dashed #e2e8f0;">${toMark(eventosVe)}</td><td style="padding: 10px; border-right: 1px solid #e2e8f0;">${toMark(eventosMod)}</td>
          <td style="padding: 10px; border-right: 1px dashed #e2e8f0;">${toMark(adminVe)}</td><td style="padding: 10px; border-right: 1px solid #e2e8f0;">${toMark(adminMod)}</td>
          <td style="padding: 10px; border-right: 1px dashed #e2e8f0;">${toMark(vipVe)}</td><td style="padding: 10px; border-right: 1px solid #e2e8f0;">${toMark(vipMod)}</td>
          <td style="padding: 10px; border-right: 1px dashed #e2e8f0;">${toMark(segVe)}</td><td style="padding: 10px;">${toMark(segMod)}</td>
        </tr>
      `;
    }

    const ws = XLSX.utils.aoa_to_sheet(excelData);
    const colWidths = excelData.map(() => ({ wch: 15 }));
    colWidths[0].wch = 30; // Nombre más ancho
    ws['!cols'] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Permisos");
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
    const excelBase64 = uint8ArrayToBase64(new Uint8Array(excelBuffer));

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #0f172a;">Matriz Visual de Permisos por Empleado — EYE STAFF</h2>
        <p style="color: #334155;">Hola,</p>
        <p style="color: #334155;">A continuación se presenta la matriz de permisos de visualización y modificación en formato de tabla con casillas de verificación (✅/❌) para cada uno de los empleados activos:</p>
        
        <table style="width: 100%; max-width: 1000px; border-collapse: collapse; border: 1px solid #cbd5e1; margin-top: 20px;">
          <thead>
            <tr style="background: #f8fafc; color: #0f172a; font-size: 0.85rem; border-bottom: 2px solid #cbd5e1;">
              <th rowspan="2" style="padding: 10px; text-align: left; border-right: 1px solid #cbd5e1;">Empleado</th>
              <th colspan="2" style="padding: 10px; border-right: 1px solid #cbd5e1;">Valet Parking</th>
              <th colspan="2" style="padding: 10px; border-right: 1px solid #cbd5e1;">Eventos y Listas</th>
              <th colspan="2" style="padding: 10px; border-right: 1px solid #cbd5e1;">Admin General</th>
              <th colspan="2" style="padding: 10px; border-right: 1px solid #cbd5e1;">VIP Eye Staff</th>
              <th colspan="2" style="padding: 10px;">Seguridad (Pines)</th>
            </tr>
            <tr style="background: #f1f5f9; color: #475569; font-size: 0.75rem; border-bottom: 2px solid #cbd5e1;">
              <th style="padding: 5px; border-right: 1px dashed #cbd5e1;">Ve</th><th style="padding: 5px; border-right: 1px solid #cbd5e1;">Mod</th>
              <th style="padding: 5px; border-right: 1px dashed #cbd5e1;">Ve</th><th style="padding: 5px; border-right: 1px solid #cbd5e1;">Mod</th>
              <th style="padding: 5px; border-right: 1px dashed #cbd5e1;">Ve</th><th style="padding: 5px; border-right: 1px solid #cbd5e1;">Mod</th>
              <th style="padding: 5px; border-right: 1px dashed #cbd5e1;">Ve</th><th style="padding: 5px; border-right: 1px solid #cbd5e1;">Mod</th>
              <th style="padding: 5px; border-right: 1px dashed #cbd5e1;">Ve</th><th style="padding: 5px;">Mod</th>
            </tr>
          </thead>
          <tbody>
            ${htmlRows}
          </tbody>
        </table>
      </div>
    `;

    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'EYE STAFF <onboarding@resend.dev>',
        to: adminEmail,
        subject: 'Matriz Checkbox de Permisos por Empleado — EYE STAFF',
        html: htmlBody,
        attachments: [
          { filename: 'Matriz_Permisos.xlsx', content: excelBase64, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
        ]
      })
    });

    if (!sendRes.ok) {
      console.error('Error enviando email:', await sendRes.text());
      return c.json({ error: 'Error enviando email' }, 500);
    }

    return c.json({ success: true, message: `Matriz de permisos enviada a ${adminEmail}` });"""

if "} else if (type === 'convocation') {" in content:
    content = content.replace("} else if (type === 'convocation') {", route_str + "\n  } else if (type === 'convocation') {")
    with open('src/index.ts', 'w') as f:
        f.write(content)

# Patch index.html
with open('frontend/index.html', 'r') as f:
    html_content = f.read()

# Adding the permissions matrix button logic
new_js_logic = """
        else if (type === 'permissions-matrix') title = 'MATRIZ DE PERMISOS (EXCEL)';"""
if "else if (type === 'xlsx') title = 'BASE DE DATOS EN EXCEL (XLSX)';" in html_content:
    html_content = html_content.replace("else if (type === 'xlsx') title = 'BASE DE DATOS EN EXCEL (XLSX)';", "else if (type === 'xlsx') title = 'BASE DE DATOS EN EXCEL (XLSX)';" + new_js_logic)

new_card_html = """
                <!-- Matriz de Permisos -->
                <div class="card" style="border-top:4px solid #6366f1; background:rgba(99, 102, 241, 0.02); display:flex; flex-direction:column; justify-content:space-between; gap:16px;">
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:start;">
                            <span style="font-size:1.5rem;">✅</span>
                            <span style="font-size:0.6rem; font-weight:900; background:rgba(99,102,241,0.15); color:#6366f1; padding:4px 8px; border-radius:6px; text-transform:uppercase;">ACCIÓN MANUAL</span>
                        </div>
                        <h3 style="margin:10px 0 5px 0; font-size:1rem; font-weight:900; color:white;">Matriz de Permisos</h3>
                        <p style="font-size:0.75rem; color:var(--muted); line-height:1.5; margin:0;">
                            Consolidado en Excel y visualización en HTML que muestra la matriz de permisos de visualización y modificación por cada módulo para todos los empleados.
                        </p>
                    </div>
                    <div style="border-top:1px solid rgba(255,255,255,0.03); padding-top:12px; display:flex; flex-direction:column; gap:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.7rem;">
                            <span style="color:var(--muted); font-weight:700;">Formatos: <b style="color:white;">Excel + Email HTML</b></span>
                            <span style="color:var(--muted); font-weight:700;">Destino: <b style="color:white;">Email Administrativo</b></span>
                        </div>
                        <button class="btn btn-sm" onclick="solicitarPruebaEspecifica('permissions-matrix')" style="width:100%; border-radius:10px; padding:8px; font-size:0.7rem; font-weight:900; background:rgba(99, 102, 241, 0.12); color:#6366f1; border:1px solid rgba(99, 102, 241, 0.3); cursor:pointer; text-transform:uppercase;">
                            ✉️ ENVIAR MATRIZ PERMISOS
                        </button>
                    </div>
                </div>
"""

# Find where to insert in renderInformesYReportes
# I'll insert it right after the BBDD de Eventos Cerrados block or right before the "Volver footer"
insert_point = "<!-- Volver footer -->"
if insert_point in html_content:
    html_content = html_content.replace(insert_point, new_card_html + "\n            " + insert_point)
    with open('frontend/index.html', 'w') as f:
        f.write(html_content)

print("Patching done!")
