const fs = require('fs');
let ts = fs.readFileSync('src/index.ts', 'utf8');

const notifyHrCode = `
app.post('/api/presupuestos/notify-hr', async (c) => {
  try {
    const data = await c.req.json();
    const budgetId = data.id;
    const empresa = data.empresa || 'N/A';
    const evento = data.evento || 'N/A';
    const fecha = data.fecha || 'N/A';
    const tipo = (data.form && data.form.tipoEvento) ? data.form.tipoEvento : 'N/A';
    
    if (!c.env.RESEND_API_KEY) {
        return c.json({ success: false, error: 'RESEND API KEY missing' });
    }
    
    const htmlBody = \`
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #2563eb;">Nuevo Presupuesto Aprobado</h2>
        <p>Se ha aprobado un nuevo presupuesto que requiere asignación de personal.</p>
        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p><b>Presupuesto #:</b> \${budgetId}</p>
          <p><b>Empresa/Cliente:</b> \${empresa}</p>
          <p><b>Evento:</b> \${evento}</p>
          <p><b>Fecha:</b> \${fecha}</p>
          <p><b>Tipo de Servicio:</b> \${tipo}</p>
        </div>
        <p>Haz clic en el siguiente botón para crear el evento y asignar personal:</p>
        <a href="https://eye-staff.app/?action=create_session_from_budget&budget_id=\${budgetId}" 
           style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">
           CREAR EVENTO EN GESTIÓN DE LISTAS
        </a>
      </div>
    \`;
    
    const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': \`Bearer \${c.env.RESEND_API_KEY}\`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: 'EYE STAFF <onboarding@resend.dev>',
            to: ['eyestaff.rrhh@gmail.com', 'ncarrillok@gmail.com'],
            subject: \`NUEVO PRESUPUESTO APROBADO - Asignación de Personal (Ref: #\${budgetId})\`,
            html: htmlBody
        })
    });
    
    const resData = await resendRes.json();
    if (!resendRes.ok) {
        console.error('Resend error:', resData);
        return c.json({ success: false, error: resData });
    }
    
    return c.json({ success: true, data: resData });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});
`;

// Insert after send-email
const sendEmailEndTarget = `    return c.json({ success: true, data });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});`;

ts = ts.replace(sendEmailEndTarget, sendEmailEndTarget + '\n' + notifyHrCode);

// Update POST /api/sessions/plan
ts = ts.replace(
    'const { name, type, supervisor_id, staff_ids, started_at, phone, address, contact_name, email, observations, correlativo, convocation_time, event_start_time, event_end_time, event_end_date } = await c.req.json();',
    'const { name, type, supervisor_id, staff_ids, started_at, phone, address, contact_name, email, observations, correlativo, convocation_time, event_start_time, event_end_time, event_end_date, budget_id } = await c.req.json();'
);

ts = ts.replace(
    'INSERT INTO sessions (name, internal_key, type, status, supervisor_id, started_at, phone, address, contact_name, email, observations, convocation_time, event_start_time, event_end_time, event_end_date)',
    'INSERT INTO sessions (name, internal_key, type, status, supervisor_id, started_at, phone, address, contact_name, email, observations, convocation_time, event_start_time, event_end_time, event_end_date, budget_id)'
);

ts = ts.replace(
    '.bind(sessionName, internalKey, sessionType, supervisor_id || null, started_at || null, phone || null, address || null, contact_name || null, email || null, observations || null, convocation_time || null, event_start_time || null, event_end_time || null, event_end_date || null)',
    '.bind(sessionName, internalKey, sessionType, supervisor_id || null, started_at || null, phone || null, address || null, contact_name || null, email || null, observations || null, convocation_time || null, event_start_time || null, event_end_time || null, event_end_date || null, budget_id || null)'
);

// Update POST /api/sessions/update
ts = ts.replace(
    'const { id, name, type, supervisor_id, staff_ids, started_at, phone, address, contact_name, email, observations, correlativo, convocation_time, event_start_time, event_end_time, event_end_date } = await c.req.json();',
    'const { id, name, type, supervisor_id, staff_ids, started_at, phone, address, contact_name, email, observations, correlativo, convocation_time, event_start_time, event_end_time, event_end_date, budget_id } = await c.req.json();'
);

ts = ts.replace(
    'event_end_date = ?\n    WHERE id = ?',
    'event_end_date = ?, budget_id = ?\n    WHERE id = ?'
);

ts = ts.replace(
    '.bind(name, internalKey, type.toLowerCase(), supervisor_id || null, started_at || null, phone || null, address || null, contact_name || null, email || null, observations || null, convocation_time || null, event_start_time || null, event_end_time || null, event_end_date || null, id)',
    '.bind(name, internalKey, type.toLowerCase(), supervisor_id || null, started_at || null, phone || null, address || null, contact_name || null, email || null, observations || null, convocation_time || null, event_start_time || null, event_end_time || null, event_end_date || null, budget_id || null, id)'
);

fs.writeFileSync('src/index.ts', ts);
console.log("Done patching src/index.ts");
