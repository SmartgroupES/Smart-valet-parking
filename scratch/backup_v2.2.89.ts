import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';
import Stripe from 'stripe';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  JWT_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  ASSETS: { fetch: typeof fetch };
  RESEND_API_KEY?: string;
  CALLMEBOT_API_KEY?: string;
  ADMIN_KEY?: string;
  DIRECTOR_EMAIL?: string;
}

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

async function logEvent(env: any, vehicleId: number, userId: number | null, eventType: string, details: string = '') {
  try {
    await env.DB.prepare('INSERT INTO events (vehicle_id, user_id, event_type, details) VALUES (?, ?, ?, ?)')
      .bind(vehicleId, userId || 1, eventType, details)
      .run();
  } catch (e) { console.error('Log Error:', e); }
}

// Iniciar base de datos de asistencia si no existe
async function initAttendanceTable(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS staff_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      session_id INTEGER,
      type TEXT, -- 'entry', 'exit', 'break_start', 'break_end'
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Ensure bank columns in users table
  try { await db.prepare('ALTER TABLE users ADD COLUMN bank_name TEXT').run(); } catch(e) {}
  try { await db.prepare('ALTER TABLE users ADD COLUMN bank_account TEXT').run(); } catch(e) {}
  try { await db.prepare('ALTER TABLE users ADD COLUMN carnet_url TEXT').run(); } catch(e) {}
}

function mapRole(role: string): 'driver' | 'supervisor' | 'director' | 'logistics' {
  const r = role.toLowerCase().trim();
  if (r.includes('logistica') || r === 'logistics') return 'logistics';
  if (r.includes('valet') || r.includes('operador') || r === 'driver') return 'driver';
  if (r.includes('supervisor')) return 'supervisor';
  if (r.includes('director') || r.includes('admin') || r.includes('administrativo')) return 'director';
  return 'driver';
}

async function standardizeValue(env: Env, category: string, value: string): Promise<string> {
  if (!value) return '';
  const val = value.toUpperCase().trim();
  const eq = await env.DB.prepare('SELECT standard_value FROM equivalences WHERE category = ? AND original_value = ?')
    .bind(category, val)
    .first<{ standard_value: string }>();
  return eq ? eq.standard_value : val;
}

app.use('*', cors());

// Kill sw.js
app.get('/sw.js', (c) => {
  return c.text('// SW Disabled', 404);
});

// Servir Portal (Bypass total de caché)
app.get('/', async (c) => {
  const res = await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url)));
  const response = new Response(res.body, res);
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  return response;
});

app.get('/portal', async (c) => {
  const res = await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url)));
  const response = new Response(res.body, res);
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  return response;
});

app.get('/test', async (c) => {
  const res = await c.env.ASSETS.fetch(new Request(new URL('/test.html', c.req.url)));
  return new Response(res.body, res);
});

// ===============================
// GESTIÓN DE SESIONES (EVENTOS)
// ===============================
app.get('/api/sessions/active', async (c) => {
  const sessionsRes = await c.env.DB.prepare('SELECT id, name, status, started_at, ended_at, type, client, phone, address, internal_key FROM sessions WHERE status IN ("planning", "active") ORDER BY id DESC').all();
  const sessions = sessionsRes.results || [] as any[];
  
  // Fetch assigned staff and vehicle counts for each session
  for (let s of sessions) {
    // Si no tiene internal_key (registros viejos), usamos el name
    if (!s.internal_key) s.internal_key = s.name;
    
    // Staff details
    const staffRes = await c.env.DB.prepare('SELECT id, name, role FROM users WHERE current_session_id = ?').bind(s.id).all();
    const staff = staffRes.results || [] as any[];
    
    for (let u of staff) {
      const attRes = await c.env.DB.prepare('SELECT type, timestamp FROM staff_attendance WHERE user_id = ? AND session_id = ? ORDER BY timestamp ASC').bind(u.id, s.id).all();
      u.attendance = attRes.results || [];
    }

    s.assigned_staff_list = staff; // List of {id, name, role, attendance}
    s.assigned_staff_count = staff.length;
    s.assigned_staff = staff.map(u => u.name).join(', '); // Legacy support
    
    // Vehicle counts
    const vehicleStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total_entries,
        COUNT(check_out_at) as total_exits
      FROM vehicles 
      WHERE session_id = ?
    `).bind(s.id).first<any>();
    
    s.total_entries = vehicleStats?.total_entries || 0;
    s.total_exits = vehicleStats?.total_exits || 0;
    s.active_vehicles = s.total_entries - s.total_exits;
  }
  
  return c.json({ sessions });
});

app.get('/api/sessions/next-correlativo', async (c) => {
  const result = await c.env.DB.prepare('SELECT MAX(id) as maxId FROM sessions').first<{maxId: number | null}>();
  const next = (result?.maxId || 0) + 1;
  return c.json({ next });
});

app.get('/api/sessions/concluded', async (c) => {
  const result = await c.env.DB.prepare('SELECT * FROM sessions WHERE status = "closed" ORDER BY id DESC').all();
  const sessions = result.results || [];
  
  for (let s of sessions) {
    const staffRes = await c.env.DB.prepare('SELECT name FROM users WHERE current_session_id = ?').bind(s.id).all();
    s.assigned_staff = (staffRes.results || []).map(u => u.name).join(', ');
  }
  
  return c.json({ sessions });
});

app.get('/api/staff/:id/sessions', async (c) => {
  const userId = c.req.param('id');
  const query = `
    SELECT DISTINCT s.id, s.name, s.started_at, u.role
    FROM sessions s
    JOIN staff_attendance a ON s.id = a.session_id
    JOIN users u ON a.user_id = u.id
    WHERE a.user_id = ?
    ORDER BY s.started_at DESC
  `;
  const result = await c.env.DB.prepare(query).bind(userId).all();
  return c.json({ sessions: result.results || [] });
});

app.post('/api/sessions/:id/assign-staff', async (c) => {
  const sessionId = c.req.param('id');
  const { user_id } = await c.req.json();
  if (!user_id) return c.json({ error: 'User ID requerido' }, 400);

  // REGLA: Verificar si el empleado ya está asignado a otra sesión activa
  const user = await c.env.DB.prepare('SELECT current_session_id, name FROM users WHERE id = ?').bind(user_id).first<{current_session_id: number | null, name: string}>();
  
  if (user && user.current_session_id && user.current_session_id != sessionId) {
    // Verificar si la sesión a la que está asignado sigue activa
    const otherSession = await c.env.DB.prepare('SELECT name FROM sessions WHERE id = ? AND status = "active"').bind(user.current_session_id).first<{name: string}>();
    if (otherSession) {
      return c.json({ error: `EL EMPLEADO ${user.name} YA ESTÁ ASIGNADO AL EVENTO "${otherSession.name}"` }, 400);
    }
  }

  await c.env.DB.prepare('UPDATE users SET current_session_id = ? WHERE id = ?')
    .bind(sessionId, user_id)
    .run();
  
  return c.json({ success: true });
});

app.post('/api/sessions/:id/unassign-staff', async (c) => {
  const { user_id } = await c.req.json();
  if (!user_id) return c.json({ error: 'User ID requerido' }, 400);

  await c.env.DB.prepare('UPDATE users SET current_session_id = NULL WHERE id = ?')
    .bind(user_id)
    .run();
  
  return c.json({ success: true });
});

app.post('/api/sessions/plan', async (c) => {
  const { name, type, supervisor_id, staff_ids, started_at, phone, address, contact_name, email, observations, correlativo } = await c.req.json();
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const sessionName = name || `EVENTO_${dateStr}`;
  const sessionType = type || 'valet';
  const internalKey = correlativo ? `${sessionName} ${correlativo}` : sessionName;

  // Verificar exclusividad antes de planificar
  const allIds = [...new Set([supervisor_id, ...(staff_ids || [])])].filter(Boolean);
  if (allIds.length > 0) {
    const busyRes = await c.env.DB.prepare(`SELECT name FROM users WHERE id IN (${allIds.join(',')}) AND current_session_id IS NOT NULL`).all<any>();
    if (busyRes.results && busyRes.results.length > 0) {
      const names = busyRes.results.map(u => u.name).join(', ');
      return c.json({ error: `⚠️ ERROR: ${names} ya están asignados a otro evento activo.` }, 400);
    }
  }

  const result = await c.env.DB.prepare(`
    INSERT INTO sessions (name, internal_key, type, status, supervisor_id, started_at, phone, address, contact_name, email, observations) 
    VALUES (?, ?, ?, "planning", ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(sessionName, internalKey, sessionType, supervisor_id || null, started_at || null, phone || null, address || null, contact_name || null, email || null, observations || null)
    .run();
  return c.json({ success: true, id: result.meta.last_row_id, name: sessionName, internal_key: internalKey, type: sessionType, status: 'planning' });
});

app.post('/api/sessions/activate', async (c) => {
  const { id, supervisor_id, staff_ids } = await c.req.json();
  if (!id) return c.json({ error: 'ID requerido' }, 400);

  // 1. Activar Sesión
  await c.env.DB.prepare('UPDATE sessions SET status = "active", started_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run();

  // 2. Asignar Personal
  const allIds = [...new Set([supervisor_id, ...(staff_ids || [])])].filter(Boolean);
  for (const userId of allIds) {
    // Actualizar ficha usuario
    await c.env.DB.prepare('UPDATE users SET current_session_id = ? WHERE id = ?').bind(id, userId).run();
    // Registrar asistencia automática (entrada)
    await c.env.DB.prepare('INSERT INTO staff_attendance (user_id, session_id, type) VALUES (?, ?, "entry")').bind(userId, id).run();
  }

  return c.json({ success: true, status: 'active' });
});

app.post('/api/staff/update-status', async (c) => {
  const { id, is_active } = await c.req.json();
  if (!id) return c.json({ error: 'ID requerido' }, 400);

  await c.env.DB.prepare('UPDATE users SET is_active = ? WHERE id = ?')
    .bind(is_active, id)
    .run();
  
  return c.json({ success: true });
});

app.post('/api/sessions/close', async (c) => {
  let { id } = await c.req.json().catch(() => ({}));
  
  if (!id) {
    const active = await c.env.DB.prepare('SELECT id FROM sessions WHERE status = "active" ORDER BY id DESC LIMIT 1').first<{id:number}>();
    id = active ? active.id : null;
  }

  if (!id) return c.json({ error: 'No hay sesión activa para cerrar' }, 400);

  await c.env.DB.prepare('UPDATE sessions SET status = "closed", ended_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run();
  
  // Liberar personal asignado al cerrar
  await c.env.DB.prepare('UPDATE users SET current_session_id = NULL WHERE current_session_id = ?').bind(id).run();

  // Generar reporte detallado y enviar por email
  await sendEventClosingReport(c.env, id);

  return c.json({ success: true, status: 'closed', session_id: id });
});

async function sendEventClosingReport(env: Env, sessionId: number) {
  const session = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(sessionId).first<any>();
  if (!session) return;

  const vehiclesRes = await env.DB.prepare(`
    SELECT v.*, 
      (SELECT COUNT(*) FROM vehicles v2 WHERE v2.plate = v.plate AND v2.session_id != ?) as recurrence_count
    FROM vehicles v WHERE v.session_id = ?
  `).bind(sessionId, sessionId).all<any>();
  const vehicles = vehiclesRes.results || [];

  const staffActivityRes = await env.DB.prepare(`
    SELECT u.name, u.role, 
      s.start_at, s.end_at,
      (SELECT COUNT(*) FROM events e WHERE e.user_id = u.id AND e.ts BETWEEN ? AND ?) as total_actions
    FROM users u
    JOIN shifts s ON u.id = s.user_id
    WHERE s.start_at BETWEEN ? AND datetime(?, "+24 hours")
  `).bind(session.started_at, session.ended_at || 'CURRENT_TIMESTAMP', session.started_at, session.started_at).all<any>();
  const staffActivity = staffActivityRes.results || [];

  const hourlyBalanceRes = await env.DB.prepare(`
    SELECT strftime("%H", check_in_at) as hour, COUNT(*) as count 
    FROM vehicles WHERE session_id = ? 
    GROUP BY hour ORDER BY hour ASC
  `).bind(sessionId).all<any>();
  const hourlyBalance = hourlyBalanceRes.results || [];

  // 1. Generar HTML para el Email
  let html = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 800px; margin: 0 auto; border: 1px solid #eee; padding: 20px;">
      <div style="background: #ef4444; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0;">REPORTE DE CIERRE DE EVENTO</h1>
        <p style="margin: 5px 0 0 0; opacity: 0.8;">${session.name} | ID: ${sessionId} | CLAVE: ${session.internal_key || session.name}</p>
      </div>

      <div style="padding: 20px;">
        <p><b>Inicio:</b> ${new Date(session.started_at).toLocaleString()}</p>
        <p><b>Fin:</b> ${new Date(session.ended_at || Date.now()).toLocaleString()}</p>
        <p><b>Total Vehículos:</b> ${vehicles.length}</p>

        <h3 style="color: #ef4444; border-bottom: 2px solid #ef4444; padding-bottom: 5px;">DETALLE DE VEHÍCULOS</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px;">
          <tr style="background: #f8f9fa;">
            <th style="border: 1px solid #ddd; padding: 8px;">PLACA</th>
            <th style="border: 1px solid #ddd; padding: 8px;">MARCA/COLOR</th>
            <th style="border: 1px solid #ddd; padding: 8px;">ENTRADA</th>
            <th style="border: 1px solid #ddd; padding: 8px;">SALIDA</th>
            <th style="border: 1px solid #ddd; padding: 8px;">REC.</th>
          </tr>
          ${vehicles.map((v: any) => `
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">${v.plate}</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${v.brand || ''} ${v.color || ''}</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${new Date(v.check_in_at).toLocaleTimeString()}</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${v.check_out_at ? new Date(v.check_out_at).toLocaleTimeString() : 'EN CUSTODIA'}</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${v.recurrence_count > 0 ? 'SÍ' : 'NO'}</td>
            </tr>
          `).join('')}
        </table>

        <h3 style="color: #ef4444; border-bottom: 2px solid #ef4444; padding-bottom: 5px; margin-top: 30px;">PERSONAL Y GESTIÓN</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px;">
          <tr style="background: #f8f9fa;">
            <th style="border: 1px solid #ddd; padding: 8px;">NOMBRE</th>
            <th style="border: 1px solid #ddd; padding: 8px;">ROL</th>
            <th style="border: 1px solid #ddd; padding: 8px;">ACCIONES</th>
          </tr>
          ${staffActivity.map((s: any) => `
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">${s.name}</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-transform: uppercase;">${s.role}</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${s.total_actions}</td>
            </tr>
          `).join('')}
        </table>
      </div>
      
      <div style="background: #f4f4f4; padding: 15px; text-align: center; font-size: 11px; color: #999; border-radius: 0 0 10px 10px;">
        Este reporte es generado automáticamente por EYE STAFF v2.2.6.
      </div>
    </div>
  `;

  // 2. Generar CSV para Excel
  let csv = "PLACA;MARCA;MODELO;COLOR;ESTADO;ENTRADA;SALIDA;RECURRENTE;TIEMPO_MIN\n";
  vehicles.forEach((v: any) => {
    const entry = new Date(v.check_in_at);
    const exit = v.check_out_at ? new Date(v.check_out_at) : null;
    const diff = exit ? Math.round((exit.getTime() - entry.getTime()) / 60000) : 0;
    csv += `${v.plate};${v.brand || ''};${v.model || ''};${v.color || ''};${v.status};${v.check_in_at};${v.check_out_at || ''};${v.recurrence_count > 0 ? 'SI' : 'NO'};${diff}\n`;
  });

  // 3. Generar PDF Simple con la lista
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([600, 800]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  page.drawText('EYE STAFF - REPORTE DE EVENTO', { x: 50, y: 750, size: 20, font: bold, color: rgb(0.93, 0.26, 0.26) });
  page.drawText(`Evento: ${session.name}`, { x: 50, y: 720, size: 12, font: bold });
  page.drawText(`Fecha: ${new Date().toLocaleString()}`, { x: 50, y: 705, size: 10, font });
  
  let y = 670;
  page.drawText('LISTADO DE VEHICULOS:', { x: 50, y, size: 12, font: bold });
  y -= 20;

  vehicles.forEach((v: any, i: number) => {
    if (y < 50) {
      page = pdfDoc.addPage([600, 800]);
      y = 750;
    }
    page.drawText(`${i+1}. ${v.plate} - ${v.brand || ''} ${v.color || ''} | Entrada: ${new Date(v.check_in_at).toLocaleTimeString()}`, { x: 50, y, size: 9, font });
    y -= 15;
  });

  const pdfBytes = await pdfDoc.save();
  const pdfBase64 = uint8ArrayToBase64(pdfBytes);

  const attachments = [
    {
      filename: `Reporte_${session.name.replace(/ /g, '_')}.csv`,
      content: btoa(csv)
    },
    {
      filename: `Reporte_${session.name.replace(/ /g, '_')}.pdf`,
      content: pdfBase64,
      type: 'application/pdf'
    }
  ];

  const adminEmail = env.DIRECTOR_EMAIL || 'ncarrillok@gmail.com';
  await sendEmail(env, adminEmail, `EYE STAFF: Reporte Final - ${session.internal_key || session.name}`, html, attachments);
}

// Ayudante para correos
async function sendEmail(env: Env, to: string, subject: string, html: string, attachments?: any[]) {
  if (!env.RESEND_API_KEY) return;
  try {
    const payload: any = {
      from: 'EYE STAFF <onboarding@resend.dev>',
      to: [to],
      subject,
      html
    };
    if (attachments && attachments.length > 0) {
      payload.attachments = attachments;
    }
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) { console.error('Email Error:', e); }
}

async function sendRetrievalTokenEmail(env: Env, vehicle: any, token: string) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
      <div style="background: #f59e0b; color: white; padding: 30px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px; letter-spacing: 2px;">EYE STAFF</h1>
        <p style="margin: 5px 0 0 0; opacity: 0.8; font-weight: bold;">CÓDIGO DE RETIRO DE VEHÍCULO (CLAVE DINÁMICA)</p>
      </div>
      
      <div style="padding: 40px; color: #334155; line-height: 1.6; text-align: center;">
        <p style="font-size: 18px; margin-bottom: 20px;">Hola <b>${(vehicle.owner_name || '').toUpperCase()}</b>,</p>
        <p>Tu solicitud de retiro para el vehículo con placa <b>${vehicle.plate}</b> ha sido recibida.</p>
        
        <div style="background: #fffbeb; border: 2px dashed #f59e0b; padding: 30px; margin: 30px 0; border-radius: 15px;">
          <p style="margin: 0; font-size: 14px; color: #92400e; text-transform: uppercase; letter-spacing: 1px;">Tu Clave Dinámica de Seguridad:</p>
          <p style="margin: 10px 0 0 0; font-size: 48px; font-weight: 900; color: #b45309; letter-spacing: 10px;">${token}</p>
        </div>
        
        <p style="font-size: 14px; color: #64748b;">Por favor, muestra esta clave dinámica al operador para completar la entrega de tu vehículo.</p>
      </div>
      
      <div style="background: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8;">
        &copy; 2026 EYE STAFF — Valet Parking System
      </div>
    </div>
  `;
  await sendEmail(env, vehicle.owner_email, `🔑 CLAVE DINÁMICA DE RETIRO: ${token} - ${vehicle.plate}`, html);
}

async function sendDeliveryConfirmationEmail(env: Env, vehicle: any) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
      <div style="background: #10b981; color: white; padding: 30px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px; letter-spacing: 2px;">EYE STAFF</h1>
        <p style="margin: 5px 0 0 0; opacity: 0.8; font-weight: bold;">VEHÍCULO ENTREGADO CON ÉXITO</p>
      </div>
      
      <div style="padding: 40px; color: #334155; line-height: 1.6; text-align: center;">
        <p style="font-size: 18px; margin-bottom: 20px;">¡Gracias por usar nuestro servicio!</p>
        <p>El vehículo con placa <b>${vehicle.plate}</b> ha sido entregado correctamente.</p>
        
        <div style="background: #f0fdf4; border: 1px solid #10b981; padding: 20px; margin: 30px 0; border-radius: 10px;">
          <p style="margin: 0; font-size: 14px; color: #065f46;"><b>Detalles de la entrega:</b></p>
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #047857;">Fecha: ${new Date().toLocaleString()}</p>
        </div>
        
        <p>Esperamos verte pronto.</p>
      </div>
      
      <div style="background: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8;">
        &copy; 2026 EYE STAFF — Valet Parking System
      </div>
    </div>
  `;
  await sendEmail(env, vehicle.owner_email, `✅ VEHÍCULO ENTREGADO: ${vehicle.plate}`, html);
}

function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  let binary = '';
  const len = uint8Array.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

async function generateTicketPDF(data: any) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([300, 500]);
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Header background
  page.drawRectangle({
    x: 0,
    y: height - 80,
    width: width,
    height: 80,
    color: rgb(0.937, 0.267, 0.267),
  });

  page.drawText('EYE STAFF', {
    x: width / 2 - 50,
    y: height - 45,
    size: 20,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  page.drawText('Valet Parking System', {
    x: width / 2 - 45,
    y: height - 60,
    size: 10,
    font: font,
    color: rgb(1, 1, 1),
  });

  // Ticket Title
  page.drawText('TICKET DIGITAL', {
    x: 30,
    y: height - 120,
    size: 16,
    font: boldFont,
    color: rgb(0.06, 0.09, 0.16),
  });

  // Plate Card
  page.drawRectangle({
    x: 20,
    y: height - 230,
    width: width - 40,
    height: 90,
    color: rgb(0.96, 0.97, 0.98),
    borderColor: rgb(0.89, 0.91, 0.94),
    borderWidth: 1,
  });

  page.drawText('PLACA', {
    x: width / 2 - 20,
    y: height - 160,
    size: 8,
    font: boldFont,
    color: rgb(0.39, 0.45, 0.55),
  });

  const plateText = (data.plate || '').toUpperCase();
  page.drawText(plateText, {
    x: width / 2 - (plateText.length * 9),
    y: height - 200,
    size: 32,
    font: boldFont,
    color: rgb(0.06, 0.09, 0.16),
  });

  page.drawText(`Ticket #${String(data.daily_seq || 0).padStart(5, '0')}`, {
    x: width / 2 - 35,
    y: height - 220,
    size: 12,
    font: boldFont,
    color: rgb(0.937, 0.267, 0.267),
  });

  // Vehicle Info
  const infoStart = height - 260;
  const labels = ['Propietario:', 'Marca:', 'Modelo:', 'Color:', 'Fecha:'];
  const values = [
    (data.owner_name || '—').toUpperCase(),
    (data.brand || '—').toUpperCase(),
    (data.model || '—').toUpperCase(),
    (data.color || '—').toUpperCase(),
    new Date().toLocaleString()
  ];

  labels.forEach((label, i) => {
    page.drawText(label, { x: 30, y: infoStart - (i * 20), size: 9, font: font, color: rgb(0.39, 0.45, 0.55) });
    page.drawText(values[i], { x: 110, y: infoStart - (i * 20), size: 9, font: boldFont, color: rgb(0.06, 0.09, 0.16) });
  });

  page.drawText('Gracias por confiar en EYE STAFF.', {
    x: 70,
    y: 65,
    size: 9,
    font: boldFont,
    color: rgb(0.937, 0.267, 0.267),
  });

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}


app.post('/api/email/start', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const sessionId = body.session_id || body.id;
  
  if (!sessionId) return c.json({ error: 'No session ID provided' }, 400);
  const session = await c.env.DB.prepare('SELECT name FROM sessions WHERE id = ?').bind(sessionId).first<{ name: string }>();
  if (!session) return c.json({ error: 'No session found' }, 404);

  const to = c.env.DIRECTOR_EMAIL || 'ncarrillok@gmail.com';
  
  // Reutilizamos la misma estructura visual profesional
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
      <div style="background: #ef4444; color: white; padding: 30px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px; letter-spacing: 2px;">EYE STAFF</h1>
        <p style="margin: 5px 0 0 0; opacity: 0.8; font-weight: bold;">NOTIFICACIÓN DE INICIO DE JORNADA</p>
      </div>
      
      <div style="padding: 40px; color: #334155; line-height: 1.6;">
        <p style="font-size: 18px; margin-bottom: 20px;">Hola,</p>
        <p>Se ha iniciado formalmente una nueva jornada operativa en el sistema <b>Valet Eye</b>.</p>
        
        <div style="background: #f8fafc; border-left: 4px solid #ef4444; padding: 20px; margin: 30px 0; border-radius: 0 10px 10px 0;">
          <p style="margin: 0; font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Detalles del Evento:</p>
          <p style="margin: 10px 0 0 0; font-size: 20px; font-weight: bold; color: #0f172a;">${session.name}</p>
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #475569;">Fecha: ${new Date().toLocaleString()}</p>
        </div>
        
        <p>A partir de este momento, el personal puede comenzar a registrar entradas y salidas de vehículos para este evento.</p>
      </div>
      
      <div style="background: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8;">
        Este es un mensaje automático generado por EYE STAFF v2.2.6.
      </div>
    </div>
  `;

  await sendEmail(c.env, to, `🚀 JORNADA INICIADA: ${session.name}`, html);
  return c.json({ success: true });
});

// Endpoint redundante eliminado (ahora en /api/sessions/close)
app.post('/api/email/close', async (c) => {
  return c.json({ success: true });
});

app.get('/manifest.json', async (c) => c.env.ASSETS.fetch(c.req.raw));
app.get('/sw.js', async (c) => c.env.ASSETS.fetch(c.req.raw));

app.get('/api/settings', async (c) => {
  return c.json({
    company_name: 'EYE STAFF',
    currency: '$',
    "version": "2.2.6",
  });
});

// ===============================
// VISTA PÚBLICA DEL CLIENTE (HTML)
// ===============================
app.get('/ticket/:code', async (c) => {
  const code = c.req.param('code');
  const vehicle = await c.env.DB.prepare('SELECT * FROM vehicles WHERE ticket_code = ?').bind(code).first<any>();

  if (!vehicle) return c.html('<h1 style="text-align:center;margin-top:50px;font-family:sans-serif;">Ticket no encontrado</h1>', 404);

  const v1 = c.req.query('v1');
  const v2 = c.req.query('v2');
  const isVerified = (v1 === vehicle.auth_token_1 && v2 === vehicle.auth_token_2);

  const statusMap: any = {
    'parked': { text: 'Estacionado', color: '#10b981', icon: '🅿️' },
    'pending_retrieval': { text: 'En Camino / Preparando', color: '#f59e0b', icon: '🏃' },
    'retrieved': { text: 'Entregado', color: '#6b7280', icon: '✅' },
    'inspecting': { text: 'Inspección / Conformidad', color: '#f59e0b', icon: '🔍' }
  };
  const status = statusMap[vehicle.status] || { text: vehicle.status, color: '#000', icon: '🚗' };

  return c.html(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <meta name="theme-color" content="#0f172a">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
        <link rel="manifest" href="/manifest.json">
        <title>Valet Eye Staff</title>
        <style>
            :root { --primary: #6366f1; --bg: #0f172a; --card: #1e293b; --text: #f8fafc; }
            body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; justify-content: center; padding: 20px; }
            .container { max-width: 400px; width: 100%; }
            .card { background: var(--card); border-radius: 24px; padding: 30px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); }
            .logo { font-size: 24px; font-weight: 800; margin-bottom: 30px; letter-spacing: -1px; }
            .logo span { color: var(--primary); }
            .status-box { background: ${status.color}20; color: ${status.color}; padding: 20px; border-radius: 16px; margin-bottom: 30px; border: 1px solid ${status.color}40; }
            .status-icon { font-size: 40px; margin-bottom: 10px; }
            .status-text { font-size: 1.2rem; font-weight: 700; }
            .plate { font-size: 2rem; font-weight: 900; margin: 20px 0; letter-spacing: 2px; }
            .info { text-align: left; margin-bottom: 30px; color: #94a3b8; font-size: 0.9rem; }
            .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
            .btn { background: var(--primary); color: white; border: none; padding: 16px; border-radius: 12px; font-size: 1rem; font-weight: 700; width: 100%; cursor: pointer; transition: transform 0.2s; box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.4); }
            .btn:active { transform: scale(0.98); }
            .btn:disabled { background: #334155; color: #64748b; cursor: not-allowed; box-shadow: none; }
            .footer { margin-top: 20px; font-size: 0.8rem; color: #475569; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="card">
                <div class="footer-info">COPYRIGHT EYE STAFF 2026 - v2.2.11</div>
                
                ${isVerified ? `
                    <div style="background:#064e3b; color:#10b981; padding:10px; border-radius:12px; margin-bottom:20px; font-size:0.8rem; font-weight:800; border:1px solid #10b98140; display:flex; align-items:center; justify-content:center; gap:8px;">
                        🛡️ TICKET VERIFICADO (ORIGINAL)
                    </div>
                ` : `
                    <div style="background:#450a0a; color:#ef4444; padding:10px; border-radius:12px; margin-bottom:20px; font-size:0.8rem; font-weight:800; border:1px solid #ef444440;">
                        ⚠️ VERIFICACIÓN DE SEGURIDAD REQUERIDA
                    </div>
                `}

                <div class="status-box">
                    <div class="status-icon">${status.icon}</div>
                    <div class="status-text" style="text-transform:uppercase;">${status.text}</div>
                </div>
                
                <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:15px; border-radius:15px; margin-bottom:25px;">
                    <div style="color:#94a3b8; font-size:0.8rem; text-transform:uppercase; letter-spacing:1px; font-weight:800;">Vehículo</div>
                    <div class="plate">${(vehicle.plate || '').toUpperCase()}</div>
                </div>

                <div style="background:#fff; padding:20px; border-radius:24px; margin-bottom:25px; display:inline-block; border:4px solid var(--primary);">
                    <div style="color:#000; font-size:0.7rem; font-weight:900; margin-bottom:10px; text-transform:uppercase;">QR DE SEGURIDAD PARA ENTREGA</div>
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=VALET_EYE:${vehicle.ticket_code}:${vehicle.auth_token_1}:${vehicle.auth_token_2}" style="width:180px; height:180px; display:block; margin:0 auto;">
                    <div style="color:#64748b; font-size:0.6rem; margin-top:10px; font-weight:700;">MUESTRE ESTE QR AL PERSONAL PARA RETIRAR SU VEHÍCULO</div>
                </div>

                ${(vehicle.status === 'pending_retrieval' || vehicle.status === 'inspecting') ? `
                    <div id="conformity-box" style="background:rgba(99, 102, 241, 0.1); border:1px solid var(--primary); padding:20px; border-radius:16px; margin-bottom:25px;">
                        <div style="font-size:0.8rem; font-weight:800; color:var(--primary); margin-bottom:10px; text-transform:uppercase;">Validación de Entrega</div>
                        
                        ${vehicle.conformity_signed ? `
                            <p style="font-size:0.8rem; color:#10b981; font-weight:800;">✅ CLAVE DINÁMICA FIRMADA</p>
                            <p style="font-size:0.7rem; color:#94a3b8; margin-bottom:15px;">Muestra esta clave dinámica al operador:</p>
                            <div style="font-size:3rem; font-weight:900; color:var(--text); letter-spacing:10px; margin:10px 0;">${vehicle.retrieval_token}</div>
                        ` : `
                            <p style="font-size:0.8rem; color:#94a3b8; margin-bottom:15px;">Para recibir su vehículo, por favor confirme que el estado es correcto tras la inspección.</p>
                            <button class="btn" id="confBtn" onclick="confirmConformity()">Firmar Conformidad</button>
                        `}
                    </div>
                ` : ''}

                <div class="info">
                    <div class="info-row"><span>Ticket:</span><span style="font-weight:800;">${vehicle.ticket_code}</span></div>
                    <div class="info-row"><span>Correlativo:</span><span style="font-weight:800;">#${String(vehicle.daily_seq || 0).padStart(5, '0')}</span></div>
                    <div class="info-row"><span>Nombre:</span><span style="font-weight:800;">${(vehicle.owner_name || '—').toUpperCase()}</span></div>
                    <div class="info-row"><span>Marca:</span><span style="font-weight:800;">${(vehicle.brand || '—').toUpperCase()}</span></div>
                    <div class="info-row"><span>Modelo:</span><span style="font-weight:800;">${(vehicle.model || '—').toUpperCase()}</span></div>
                    <div class="info-row"><span>Color:</span><span style="font-weight:800;">${(vehicle.color || '—').toUpperCase()}</span></div>
                </div>
                
                ${vehicle.status === 'parked' ? `
                    <button class="btn" id="reqBtn" onclick="requestCar()">Solicitar vehículo</button>
                ` : `
                    <div class="status-box" style="margin-top:20px; background:rgba(255,255,255,0.05); border:1px dashed #475569;">
                        <div class="status-text" style="color:#94a3b8">${status.text}</div>
                    </div>
                `}
                
                <div class="footer">Comprobante Digital Oficial<br>${vehicle.created_at}</div>
            </div>
        </div>
        <script>
            async function requestCar() {
                if (!confirm('¿Deseas solicitar que traigan tu auto ahora?')) return;
                const btn = document.getElementById('reqBtn');
                btn.disabled = true;
                btn.textContent = 'Procesando...';
                try {
                    const res = await fetch('/api/public/request-car/${code}', { method: 'POST' });
                    if (res.ok) {
                        alert('¡Solicitud enviada! El personal de Valet ya está preparando tu auto.');
                        location.reload();
                    } else {
                        throw new Error();
                    }
                } catch {
                    alert('Error al enviar solicitud. Intenta de nuevo.');
                    btn.disabled = false;
                    btn.textContent = 'Solicitar mi vehículo';
                }
            }

            async function confirmConformity() {
                if (!confirm('¿Confirma que el vehículo se encuentra en el estado esperado? Al aceptar, se generará su clave dinámica de retiro.')) return;
                const btn = document.getElementById('confBtn');
                btn.disabled = true;
                btn.textContent = 'Procesando...';
                try {
                    const res = await fetch('/api/public/confirm-conformity/${code}', { method: 'POST' });
                    if (res.ok) {
                        location.reload();
                    } else {
                        throw new Error();
                    }
                } catch {
                    alert('Error al firmar conformidad.');
                    btn.disabled = false;
                    btn.textContent = 'Firmar Conformidad';
                }
            }

            // Polling para actualizar estado automáticamente
            setInterval(async () => {
                const res = await fetch(window.location.href, { headers: { 'Accept': 'text/html' } });
                if (res.ok) {
                    // Si el estado cambia en el servidor, refrescamos para mostrar cambios (muy simple para costo cero)
                    // En una app real compararíamos el HTML o usaríamos un endpoint de status
                }
            }, 10000);
        </script>
    </body>
    </html>
  `);
});

// PÚBLICO: SOLICITUD DE AUTO (Antiguo endpoint, se mantiene por compatibilidad si es necesario)
app.post('/api/public/request-car/:code', async (c) => {
  const code = c.req.param('code');
  const vehicle = await c.env.DB.prepare('SELECT id, status FROM vehicles WHERE ticket_code = ?').bind(code).first();

  if (!vehicle) return c.json({ error: 'Ticket no encontrado' }, 404);
  if (vehicle.status !== 'parked') return c.json({ error: 'El auto ya está en camino o fue entregado' }, 400);

  const retrievalToken = Math.floor(1000 + Math.random() * 9000).toString();
  await c.env.DB.prepare("UPDATE vehicles SET status = 'pending_retrieval' WHERE id = ?")
    .bind(vehicle.id).run();

  // Registrar evento (usamos ID 1 como sistema/cliente por defecto)
  await c.env.DB.prepare('INSERT INTO events (vehicle_id, user_id, event_type) VALUES (?, ?, ?)')
    .bind(vehicle.id, 1, 'checkout_request').run();

  return c.json({ message: 'Auto solicitado' });
});

// PÚBLICO: FIRMAR CONFORMIDAD
app.post('/api/public/confirm-conformity/:code', async (c) => {
  const code = c.req.param('code');
  const vehicle = await c.env.DB.prepare('SELECT id, status FROM vehicles WHERE ticket_code = ?').bind(code).first();

  if (!vehicle) return c.json({ error: 'Ticket no encontrado' }, 404);
  
  await c.env.DB.prepare("UPDATE vehicles SET conformity_signed = 1 WHERE id = ?").bind(vehicle.id).run();
  
  return c.json({ success: true, message: 'Conformidad firmada' });
});

// ===============================
// LOGIN (Frontend)
// ===============================
app.post('/api/staff/login', async (c) => {
  const { pin } = await c.req.json();

  // Buscar usuario por PIN
  const user: any = await c.env.DB.prepare('SELECT id, name, role, bank_name, bank_account FROM users WHERE pin_hash = ?')
    .bind(pin)
    .first();

  if (!user) {
    return c.json({ error: 'PIN inválido' }, 401);
  }

  const token = await sign(
    {
      id: user.id,
      name: user.name,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24h
    },
    c.env.JWT_SECRET || 'secret'
  );

  const permissions = await c.env.DB.prepare('SELECT module_id FROM role_permissions WHERE role = ? AND can_view = 1').bind(user.role).all();
  const allowedModules = permissions.results.map((p: any) => p.module_id);

  return c.json({
    id: user.id,
    name: user.name,
    role: user.role,
    permissions: allowedModules,
    bank_name: user.bank_name,
    bank_account: user.bank_account,
    token
  });
});

// ===============================
// Middleware JWT (DESHABILITADO TEMPORALMENTE POR SOLICITUD)
// ===============================
app.use('/api/*', async (c, next) => {
  // Simular usuario director para que las rutas protegidas no fallen
  c.set('user', { id: 1, name: 'Admin Temporal', role: 'director' });
  await next();
});

// ===============================
// STAFF MANAGEMENT
// ===============================
app.get('/api/staff/list', async (c) => {
  const result = await c.env.DB.prepare('SELECT id, name, role, bank_name, bank_account FROM users ORDER BY name ASC').all();
  return c.json({ staff: result.results || [] });
});
app.get('/api/staff', async (c) => {
  const staff = await c.env.DB.prepare('SELECT * FROM users ORDER BY name ASC').all();
  const sessions = await c.env.DB.prepare('SELECT id, name FROM sessions WHERE status != "closed"').all();
  return c.json({ staff: staff.results, sessions: sessions.results });
});

app.post('/api/staff', async (c) => {
  const current = c.get('user');
  if (current.role !== 'supervisor' && current.role !== 'director') {
    return c.json({ error: 'No autorizado' }, 403);
  }

  const { name, pin_hash, role, cedula, phone, sector, bank_name, bank_account, carnet } = await c.req.json();
  if (!name || !pin_hash || !role) return c.json({ error: 'Faltan datos' }, 400);

  let carnetKey = null;
  if (carnet) {
    try {
      const key = `carnets/${Date.now()}.jpg`;
      const base64Data = carnet.split(',')[1];
      if (base64Data) {
        const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        await c.env.PHOTOS.put(key, binaryData, { httpMetadata: { contentType: 'image/jpeg' } });
        carnetKey = key;
      }
    } catch (e) { console.error('Carnet upload error:', e); }
  }

  // Limpieza de nombre si viene en formato "APELLIDO, NOMBRE"
  let cleanName = name;
  if (name.includes(',')) {
    const parts = name.split(',');
    const fName = parts[1].trim().split(' ')[0];
    const lName = parts[0].trim().split(' ')[0];
    cleanName = `${fName} ${lName}`.toUpperCase();
  }

  const mappedRole = mapRole(role);

  await c.env.DB.prepare('INSERT INTO users (name, pin_hash, role, cedula, phone, sector, bank_name, bank_account, carnet_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(cleanName, pin_hash, mappedRole, cedula || null, phone || null, sector || null, bank_name || null, bank_account || null, carnetKey)
    .run();

  return c.json({ message: 'Personal registrado correctamente', name: cleanName });
});

app.delete('/api/staff/:id', async (c) => {
  const current = c.get('user');
  if (current && current.role !== 'supervisor' && current.role !== 'director') {
    return c.json({ error: 'No autorizado' }, 403);
  }
  
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

app.post('/api/staff/update', async (c) => {
  const { id, field, value } = await c.req.json();
  if (!id || !field) return c.json({ error: 'Faltan datos' }, 400);

  const allowedFields = ['name', 'role', 'pin_hash', 'cedula', 'phone', 'sector', 'emergency_contact', 'emergency_phone', 'is_allergic', 'current_session_id', 'bank_name', 'bank_account', 'carnet_url'];
  if (!allowedFields.includes(field)) return c.json({ error: 'Campo no permitido' }, 400);

  await c.env.DB.prepare(`UPDATE users SET ${field} = ? WHERE id = ?`)
    .bind(value, id)
    .run();

  return c.json({ success: true });
});

app.get('/api/admin/vehicles', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT v.*, 
    (SELECT GROUP_CONCAT(url) FROM photos WHERE vehicle_id = v.id) as all_photos
    FROM vehicles v
    WHERE v.id IN (SELECT MAX(id) FROM vehicles GROUP BY plate)
    ORDER BY plate ASC
  `).all();
  return c.json({ vehicles: result.results || [] });
});

app.delete('/api/admin/vehicles/:plate', async (c) => {
  const plate = c.req.param('plate');
  // Borrar fotos asociadas (opcionalmente podríamos borrarlas de R2, pero por ahora solo de la DB para evitar huérfanos)
  await c.env.DB.prepare('DELETE FROM photos WHERE vehicle_id IN (SELECT id FROM vehicles WHERE plate = ?)').bind(plate).run();
  await c.env.DB.prepare('DELETE FROM events WHERE vehicle_id IN (SELECT id FROM vehicles WHERE plate = ?)').bind(plate).run();
  await c.env.DB.prepare('DELETE FROM vehicles WHERE plate = ?').bind(plate).run();
  return c.json({ success: true });
});

app.post('/api/staff/update-bank-info', async (c) => {
  const { bank_name, bank_account, user_id } = await c.req.json();
  const targetId = user_id || c.get('user')?.id;
  if (!targetId) return c.json({ error: 'ID de usuario no identificado' }, 400);

  await c.env.DB.prepare('UPDATE users SET bank_name = ?, bank_account = ? WHERE id = ?')
    .bind(bank_name, bank_account, targetId)
    .run();

  return c.json({ success: true });
});

app.post('/api/staff/import', async (c) => {
  const { csv } = await c.req.json();
  if (!csv) return c.json({ error: 'CSV requerido' }, 400);

  const lines = csv.split('\n');
  let count = 0;

  for (let line of lines.slice(1)) { // Skip header
    const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
    if (cols.length < 5) continue;

    const pin = cols[1] || 'eye001';
    const rawRole = cols[3] || 'VALET';
    const role = mapRole(rawRole);
    const name = cols[4] || '';
    const cedula = cols[5] || '';
    const sector = cols[6] || '';
    const phone = cols[7] || '';

    // Limpieza de nombre
    let cleanName = name;
    if (name.includes(',')) {
      const parts = name.split(',');
      const fName = parts[1]?.trim().split(' ')[0] || '';
      const lName = parts[0]?.trim().split(' ')[0] || '';
      cleanName = `${fName} ${lName}`.trim().toUpperCase();
    }

    if (!cleanName) continue;

    await c.env.DB.prepare(`
      INSERT INTO users (name, pin_hash, role, cedula, sector, phone) 
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET 
        pin_hash = excluded.pin_hash,
        role = excluded.role,
        cedula = excluded.cedula,
        sector = excluded.sector,
        phone = excluded.phone
    `).bind(cleanName, pin, role, cedula, sector, phone).run().catch(e => console.error('Import row error:', e));
    
    count++;
  }

  return c.json({ success: true, count });
});

// RBAC: Gestión de Permisos
app.get('/api/admin/permissions', async (c) => {
  const user = c.get('user');
  if (user.role !== 'director') return c.json({ error: 'No autorizado' }, 403);

  const modules = await c.env.DB.prepare('SELECT * FROM modules').all();
  const permissions = await c.env.DB.prepare('SELECT * FROM role_permissions').all();

  return c.json({
    modules: modules.results,
    permissions: permissions.results
  });
});

app.post('/api/admin/permissions', async (c) => {
  const user = c.get('user');
  if (user.role !== 'director') return c.json({ error: 'No autorizado' }, 403);

  const { role, module_id, can_view } = await c.req.json();
  
  await c.env.DB.prepare(
    'INSERT INTO role_permissions (role, module_id, can_view) VALUES (?, ?, ?) ON CONFLICT(role, module_id) DO UPDATE SET can_view = ?'
  ).bind(role, module_id, can_view ? 1 : 0, can_view ? 1 : 0).run();

});

// ===============================
// GESTIÓN DE EQUIVALENCIAS
// ===============================
app.get('/api/admin/equivalences', async (c) => {
  const user = c.get('user');
  if (user.role !== 'director') return c.json({ error: 'No autorizado' }, 403);
  const results = await c.env.DB.prepare('SELECT * FROM equivalences ORDER BY category, standard_value').all();
  return c.json(results.results);
});

app.post('/api/admin/equivalences', async (c) => {
  const user = c.get('user');
  if (user.role !== 'director') return c.json({ error: 'No autorizado' }, 403);
  const { category, original_value, standard_value } = await c.req.json();
  if (!category || !original_value || !standard_value) return c.json({ error: 'Faltan datos' }, 400);
  
  await c.env.DB.prepare('INSERT OR REPLACE INTO equivalences (category, original_value, standard_value) VALUES (?, ?, ?)')
    .bind(category, original_value.toUpperCase().trim(), standard_value.toUpperCase().trim())
    .run();
  return c.json({ success: true });
});

app.delete('/api/admin/equivalences/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'director') return c.json({ error: 'No autorizado' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM equivalences WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// ===============================
// CHECK-IN (chofer)
// ===============================
app.post('/api/events/checkin', async (c) => {
  try {
    const data = await c.req.json();
    const user = c.get('user');
    const sessionId = data.session_id;
    if (!sessionId) return c.json({ error: 'Session ID requerido' }, 400);

    // Validación de campos obligatorios
    if (!data.plate) return c.json({ error: 'Placa del vehículo es obligatoria' }, 400);
    if (!data.brand) return c.json({ error: 'Marca del vehículo es obligatoria' }, 400);
    if (!data.model) return c.json({ error: 'Modelo del vehículo es obligatorio' }, 400);
    if (!data.color) return c.json({ error: 'Color del vehículo es obligatorio' }, 400);
    if (!data.owner_name) return c.json({ error: 'Nombre del propietario es obligatorio' }, 400);
    if (!data.owner_phone) return c.json({ error: 'Contacto del propietario es obligatorio' }, 400);
    if (!data.owner_email) return c.json({ error: 'Email del cliente es obligatorio' }, 400);

    // Correlativo global para evitar colisiones entre sesiones
    const lastSeq = await c.env.DB.prepare('SELECT MAX(daily_seq) as maxSeq FROM vehicles').first<{ maxSeq: number }>();
    const nextSeq = (lastSeq?.maxSeq || 0) + 1;
    const ticketCode = 'V' + nextSeq.toString().padStart(5, '0');

    // SEGURIDAD: Generar tokens aleatorios para verificación física
    const authToken1 = Math.floor(1000 + Math.random() * 9000).toString();
    const authToken2 = Math.floor(1000 + Math.random() * 9000).toString();

    // RESTRICCIÓN: No permitir duplicados activos (solo si ya está físicamente en una sesión ACTIVA)
    const existing = await c.env.DB.prepare(`
      SELECT v.id FROM vehicles v
      JOIN sessions s ON v.session_id = s.id
      WHERE v.plate = ? 
        AND v.status NOT IN ('pre-registered', 'delivered', 'retrieved')
        AND s.status = 'active'
      LIMIT 1
    `).bind(data.plate.toUpperCase()).first();

    if (existing) {
      return c.json({ 
        error: 'EL VEHÍCULO YA SE ENCUENTRA EN EL RECINTO', 
        is_duplicate: true 
      }, 400);
    }

    const retrievalToken = Math.floor(1000 + Math.random() * 9000).toString();

    // ESTANDARIZACIÓN AUTOMÁTICA
    const cleanBrand = await standardizeValue(c.env, 'brand', data.brand);
    const cleanModel = await standardizeValue(c.env, 'model', data.model);
    const cleanColor = await standardizeValue(c.env, 'color', data.color);

    const result = await c.env.DB.prepare(
      `INSERT INTO vehicles 
        (plate, status, ticket_code, owner_name, owner_phone, brand, model, color, parking_spot, damage_notes, damage_json, fee_amount, session_id, daily_seq, auth_token_1, auth_token_2, retrieval_token) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      data.plate.toUpperCase(), 'parked', ticketCode, data.owner_name || null, data.owner_phone || null,
      cleanBrand || null, cleanModel || null, cleanColor || null, data.parking_spot || null, data.damage_notes || null, data.damage_json || null, data.fee_amount || 0,
      sessionId, nextSeq, authToken1, authToken2, retrievalToken
    ).run();

    const vehicleId = result.meta.last_row_id;

    // GUARDAR FOTOS DE EVIDENCIA
    if (data.photos) {
      for (const [type, image] of Object.entries(data.photos as Record<string, string>)) {
        if (!image || typeof image !== 'string') continue;
        try {
          const key = `photos/${data.plate.toUpperCase()}/${type}_${Date.now()}.jpg`;
          const base64Data = image.split(',')[1];
          if (!base64Data) continue;
          const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

          await c.env.PHOTOS.put(key, binaryData, {
            httpMetadata: { contentType: 'image/jpeg' }
          });

          await c.env.DB.prepare('INSERT INTO photos (vehicle_id, url) VALUES (?, ?)')
            .bind(vehicleId, key)
            .run();
        } catch (photoErr) {
          console.error('Error guardando foto:', photoErr);
        }
      }
    }

    await logEvent(c.env, vehicleId, user.id, 'checkin', `Vehículo registrado en sesión ${sessionId}`);

    // ENVIAR TICKET POR EMAIL AL CLIENTE
    if (data.owner_email) {
      try {
        const ticketUrl = `${new URL(c.req.url).origin}/ticket/${ticketCode}?v1=${authToken1}&v2=${authToken2}`;
        const pdfBytes = await generateTicketPDF({ 
          ...data, 
          daily_seq: nextSeq, 
          auth_token_1: authToken1, 
          auth_token_2: authToken2 
        });
        const pdfBase64 = uint8ArrayToBase64(pdfBytes);

        await sendEmail(c.env, data.owner_email, `🎟️ TICKET DIGITAL - ${data.plate}`, `
          <div style="font-family:sans-serif; max-width:500px; margin:auto; border:1px solid #eee; border-radius:15px; overflow:hidden;">
            <div style="background:#ef4444; color:white; padding:20px; text-align:center;">
              <h1 style="margin:0;">EYE STAFF</h1>
              <p style="margin:5px 0 0 0;">Valet Parking System</p>
            </div>
            <div style="padding:30px; text-align:center;">
              <p style="font-size:1.1rem;">Hola <strong>${(data.owner_name || '').toUpperCase()}</strong>,</p>
              <p style="color:#475569; font-size:1rem; margin:20px 0;">
                Tu vehículo ha sido recibido correctamente.<br><br>
                <b>Puedes solicitar tu vehículo en el Ticket digital anexo.</b>
              </p>
              
              <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:15px; border-radius:10px; margin:20px 0;">
                <p style="color:#64748b; font-size:0.8rem; font-weight:700; margin:0 0 10px 0;">DETALLES DEL VEHÍCULO:</p>
                <p style="color:#1e293b; font-size:1.2rem; font-weight:900; margin:0;">${data.plate}</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${ticketUrl}" style="display:inline-block; background:#ef4444; color:white; padding:15px 30px; border-radius:10px; text-decoration:none; font-weight:bold; font-size:1rem;">VER TICKET ONLINE</a>
              </div>

              <a href="${ticketUrl}" style="display:inline-block; color:#ef4444; text-decoration:none; font-weight:700; font-size:0.9rem; margin-top:10px;">O haz clic aquí para ver el ticket online</a>
            </div>
            <div style="background:#f1f5f9; padding:15px; text-align:center; font-size:0.7rem; color:#64748b; letter-spacing:1px;">
              EYE STAFF © 2026 — PLATAFORMA OPERATIVA
            </div>
          </div>
        `, [
          {
            filename: `Ticket_${data.plate}.pdf`,
            content: pdfBase64
          }
        ]);
      } catch (e) {
        console.error('Error enviando email a cliente con PDF:', e);
      }
    }

    const vehicle = await c.env.DB.prepare('SELECT * FROM vehicles WHERE id = ?').bind(vehicleId).first();

    return c.json({
      success: true,
      message: 'Check-in registrado',
      vehicle: vehicle,
      vehicle_id: vehicleId,
      ticket_code: ticketCode,
      daily_seq: nextSeq
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ===============================
// ESTADÍSTICAS Y DETALLES
// ===============================
app.get('/api/events/stats', async (c) => {
  let sessionId = c.req.query('session_id');

  if (!sessionId) {
    const active = await c.env.DB.prepare('SELECT id FROM sessions WHERE status = "active" ORDER BY id DESC LIMIT 1').first();
    sessionId = active ? (active.id as any).toString() : null;
  }

  if (!sessionId) return c.json({ total: 0, reception: 0, custody: 0, delivery: 0, exits: 0, note: 'No hay sesión activa' });

  const stats = await c.env.DB.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'parked' THEN 1 ELSE 0 END) as reception,
      SUM(CASE WHEN status NOT IN ('delivered', 'retrieved', 'pre-registered') THEN 1 ELSE 0 END) as custody,
      SUM(CASE WHEN status IN ('requested', 'pending_retrieval', 'delivering') THEN 1 ELSE 0 END) as delivery,
      SUM(CASE WHEN status IN ('delivered', 'retrieved') THEN 1 ELSE 0 END) as exits
    FROM vehicles WHERE session_id = ?
  `).bind(sessionId).first();
  return c.json({ ...stats, debug_session: sessionId });
});

app.get('/api/events/detail/:type', async (c) => {
  const type = c.req.param('type');
  let sessionId = c.req.query('session_id');

  if (!sessionId) {
    const active = await c.env.DB.prepare('SELECT id FROM sessions WHERE status = "active" ORDER BY id DESC LIMIT 1').first();
    sessionId = active ? (active.id as any).toString() : null;
  }

  if (!sessionId) return c.json({ list: [], error: 'Session ID requerido o no hay sesión activa' });

  let whereClause = 'session_id = ?';
  const params: any[] = [sessionId];

  if (type === 'RECIBIDOS') {
    whereClause += " AND status = 'parked' AND date(created_at) = date('now')";
  } else if (type === 'CUSTODIA') {
    whereClause += " AND status NOT IN ('delivered', 'retrieved', 'pre-registered')";
  } else if (type === 'ENTREGADOS') {
    whereClause += " AND status IN ('delivered', 'retrieved')";
  } else if (type === 'PRE-LISTA') {
    whereClause += ' AND status = ?';
    params.push('pre-registered');
  }

  const { results } = await c.env.DB.prepare(`
    SELECT id, plate, owner_name, brand, model, color, status, daily_seq,
    strftime('%H:%M', created_at) as time_in,
    strftime('%H:%M', check_out_at) as time_out
    FROM vehicles 
    WHERE ${whereClause}
    ORDER BY daily_seq DESC
  `).bind(...params).all();
  return c.json({ list: results, debug_session: sessionId, debug_type: type });
});
app.get('/api/vehicles', async (c) => {
  const status = c.req.query('status');
  const search = c.req.query('search');
  const sessionId = c.req.query('session_id');

  let query = 'SELECT * FROM vehicles WHERE 1=1';
  const params: any[] = [];

  if (sessionId) {
    query += ' AND session_id = ?';
    params.push(sessionId);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (search) {
    query += ' AND (plate LIKE ? OR ticket_code LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY created_at DESC';

  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  return c.json(results);
});

app.get('/api/vehicles/all', async (c) => {
  const sessionId = c.req.query('session_id');
  let query = 'SELECT * FROM vehicles WHERE 1=1';
  const params: any[] = [];

  if (sessionId) {
    query += ' AND session_id = ?';
    params.push(sessionId);
  }

  query += ' ORDER BY created_at DESC';
  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ vehicles: results });
});

// ===============================
// VEHICLES ACTIVE (Datalist)
// ===============================
app.get('/api/vehicles/active', async (c) => {
  const sessionId = c.req.query('session_id');
  let query = `
    SELECT v.id, v.plate, v.brand, v.model, v.owner_name, v.owner_phone, v.daily_seq, v.created_at, v.status 
    FROM vehicles v
    JOIN sessions s ON v.session_id = s.id
    WHERE v.status NOT IN ('delivered', 'retrieved', 'pre-registered')
  `;
  const params = [];
  
  if (sessionId) {
    query += " AND v.session_id = ?";
    params.push(sessionId);
  } else {
    // Si no se pide una sesión específica, solo mostrar de las sesiones ACTIVAS
    query += " AND s.status = 'active'";
  }
  
  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ vehicles: results });
});

// ===============================
// VEHICLE LOOKUP (Checkout)
// ===============================
// Búsqueda predictiva (DATALIST) con conteo de visitas
app.get('/api/vehicles/predictive', async (c) => {
  const q = c.req.query('q') || '';
  const results = await c.env.DB.prepare(`
    SELECT plate, owner_name, brand, model, color, COUNT(*) as visit_count
    FROM vehicles 
    WHERE plate LIKE ? 
    GROUP BY plate
    LIMIT 10
  `).bind(`%${q}%`).all();
  return c.json(results.results);
});

// Búsqueda global en todo el historial
app.get('/api/vehicles/search', async (c) => {
  const q = c.req.query('q') || '';
  const results = await c.env.DB.prepare(`
    SELECT * FROM vehicles 
    WHERE plate LIKE ? OR owner_name LIKE ? OR ticket_code LIKE ?
    ORDER BY check_in_at DESC
    LIMIT 50
  `).bind(`%${q}%`, `%${q}%`, `%${q}%`).all();
  return c.json(results.results);
});

app.get('/api/vehicles/lookup', async (c) => {
  const q = c.req.query('q');
  const results = await c.env.DB.prepare('SELECT id, plate, owner_name, brand, model FROM vehicles WHERE plate LIKE ? OR owner_name LIKE ? LIMIT 10').bind(`%${q}%`, `%${q}%`).all();
  return c.json(results.results);
});

app.get('/api/vehicles/predictive', async (c) => {
  const q = c.req.query('q');
  const results = await c.env.DB.prepare('SELECT plate, owner_name, brand, model, color FROM vehicles WHERE plate LIKE ? ORDER BY created_at DESC LIMIT 10').bind(`%${q}%`).all();
  return c.json(results.results);
});

// Búsqueda predictiva de clientes por nombre
app.get('/api/customers/predictive', async (c) => {
  const q = c.req.query('q') || '';
  const results = await c.env.DB.prepare(`
    SELECT DISTINCT owner_name, owner_phone, owner_email
    FROM vehicles 
    WHERE owner_name LIKE ? 
      AND owner_name IS NOT NULL
    ORDER BY id DESC
    LIMIT 10
  `).bind(`%${q}%`).all();
  return c.json(results.results);
});

// NUEVO endpoint: devuelve los últimos datos de contacto de un cliente por nombre
app.get('/api/customers/by-name/:name', async (c) => {
  const name = c.req.param('name')?.trim().toUpperCase();
  if (!name) return c.json({ error: 'Nombre requerido' }, 400);

  const result = await c.env.DB.prepare(`
    SELECT owner_phone, owner_email
    FROM vehicles
    WHERE owner_name = ?
    ORDER BY id DESC
    LIMIT 1
  `).bind(name).first<{
    owner_phone: string;
    owner_email: string;
  }>();

  if (!result) return c.json({ error: 'Cliente no encontrado' }, 404);
  return c.json(result);
});

// Autocompletado predictivo para placas
app.get('/api/vehicles/predictive', async (c) => {
  const q = c.req.query('q')?.toUpperCase() || '';
  const results = await c.env.DB.prepare('SELECT DISTINCT plate, brand, model, owner_name FROM vehicles WHERE plate LIKE ? LIMIT 10').bind(`%${q}%`).all();
  return c.json(results.results || []);
});

// Autocompletado predictivo para clientes
app.get('/api/customers/predictive', async (c) => {
  const q = c.req.query('q')?.toUpperCase() || '';
  const results = await c.env.DB.prepare('SELECT DISTINCT owner_name, owner_phone, owner_email FROM vehicles WHERE owner_name LIKE ? LIMIT 10').bind(`%${q}%`).all();
  return c.json(results.results || []);
});


// ===============================
// GET VEHICLE BY ID
// ===============================
app.get('/api/vehicles/:id', async (c) => {
  const id = c.req.param('id');
  const vehicle = await c.env.DB.prepare('SELECT * FROM vehicles WHERE id = ?').bind(id).first();
  if (!vehicle) return c.json({ error: 'Not found' }, 404);
  return c.json(vehicle);
});

// NUEVO endpoint: devuelve la última información del vehículo por placa
app.get('/api/vehicles/by-plate/:plate', async (c) => {
  const plate = c.req.param('plate')?.trim().toUpperCase();
  if (!plate) return c.json({ error: 'Placa requerida' }, 400);

  // Busca el último registro del vehículo para autocompletar
  const result = await c.env.DB.prepare(`
    SELECT brand, model, color, owner_name, owner_email, owner_phone
    FROM vehicles
    WHERE plate = ?
    ORDER BY id DESC
    LIMIT 1
  `).bind(plate).first<{
    brand: string;
    model: string;
    color: string;
    owner_name: string;
    owner_email: string;
    owner_phone: string;
  }>();

  if (!result) return c.json({ error: 'Vehículo no encontrado' }, 404);
  return c.json(result);
});


// ===============================
// UPDATE VEHICLE (PATCH)
// ===============================
app.patch('/api/vehicles/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const user = c.get('user');

  const updates: string[] = [];
  const params: any[] = [];

  const allowedFields = ['status', 'check_out_at', 'valet_out', 'fee_amount', 'fee_paid', 'payment_method', 'key_hook', 'parking_spot', 'damage_json', 'requested_at'];
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      params.push(body[field]);
    }
  }

  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400);

  params.push(id);
  const query = `UPDATE vehicles SET ${updates.join(', ')} WHERE id = ?`;
  await c.env.DB.prepare(query).bind(...params).run();

  let detail = '';
  if (body.parking_spot) detail += `Ubicación: ${body.parking_spot}. `;
  if (body.key_hook) detail += `Gancho: ${body.key_hook}. `;
  if (body.status === 'retrieved') detail += 'Vehículo entregado.';

  const eventType = body.status === 'retrieved' ? 'delivered' : 'parked';
  await logEvent(c.env, parseInt(id), user?.id || 1, eventType, detail || 'Actualización de datos');

  return c.json({ success: true });
});

// ===============================
// CHECK-OUT (Legacy POST support)
// ===============================
app.post('/api/events/checkout', async (c) => {
  const body = await c.req.json();
  const id = body.id || body.vehicle_id;
  const user = c.get('user');
  const vehicle = await c.env.DB.prepare('SELECT id, plate FROM vehicles WHERE id = ?').bind(id).first<any>();
  if (!vehicle) return c.json({ error: 'Vehículo no encontrado' }, 404);

  await c.env.DB.prepare(
    'UPDATE vehicles SET status = ?, check_out_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind('retrieved', vehicle.id).run();

  await logEvent(c.env, vehicle.id, user.id, 'delivered', `Entrega registrada por ${user.name}`);

  // Enviar email de confirmación de entrega
  const v = await c.env.DB.prepare('SELECT * FROM vehicles WHERE id = ?').bind(vehicle.id).first<any>();
  if (v && v.owner_email) {
    await sendDeliveryConfirmationEmail(c.env, v);
  }

  return c.json({ message: 'Check-out registrado', plate: vehicle.plate });
});

app.post('/api/events/override-checkout', async (c) => {
  const { vehicle_id, reason, supervisor_pin } = await c.req.json();
  const user = c.get('user');

  // Validar PIN de supervisor
  const supervisor = await c.env.DB.prepare('SELECT id FROM users WHERE pin_hash = ? AND role IN ("supervisor", "director")')
    .bind(supervisor_pin).first();

  if (!supervisor) {
    return c.json({ error: 'PIN de Supervisor inválido' }, 401);
  }

  await c.env.DB.prepare(
    'UPDATE vehicles SET status = ?, check_out_at = CURRENT_TIMESTAMP, damage_notes = COALESCE(damage_notes, "") || ? WHERE id = ?'
  ).bind('retrieved', ` [OVERRIDE: ${reason}]`, vehicle_id).run();

  await logEvent(c.env, vehicle_id, user.id, 'delivered', `Entrega MANUAL (Override) por ${user.name}. Motivo: ${reason}`);

  const v = await c.env.DB.prepare('SELECT * FROM vehicles WHERE id = ?').bind(vehicle_id).first<any>();
  if (v && v.owner_email) {
    await sendDeliveryConfirmationEmail(c.env, v);
  }

  return c.json({ success: true, message: 'Entrega manual registrada' });
});

// ===============================
// DASHBOARD (supervisor)
// ===============================
app.get('/api/dashboard/today', async (c) => {
  const total = await c.env.DB.prepare(
    "SELECT COUNT(*) AS total FROM vehicles WHERE status IN ('parked', 'pending_retrieval')"
  ).first<{ total: number }>();

  const checkins = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM events WHERE event_type = 'checkin' AND date(ts) = date('now')"
  ).first<{ count: number }>();

  const checkouts = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM events WHERE event_type = 'delivered' AND date(ts) = date('now')"
  ).first<{ count: number }>();

  const earnings = await c.env.DB.prepare("SELECT SUM(fee_amount) as total FROM vehicles WHERE fee_paid = 1 AND date(check_out_at) = date('now')").first<{ total: number }>();

  const slotsCount = await c.env.DB.prepare("SELECT COUNT(*) as count FROM slots").first<{ count: number }>();
  const occupiedCount = await c.env.DB.prepare("SELECT COUNT(*) as count FROM vehicles WHERE status NOT IN ('retrieved') AND parking_spot IS NOT NULL").first<{ count: number }>();

  return c.json({
    total: total?.total || 0,
    checkins: checkins?.count || 0,
    checkouts: checkouts?.count || 0,
    earnings: earnings?.total || 0,
    slots_total: slotsCount?.count || 0,
    slots_occupied: occupiedCount?.count || 0
  });
});
// ===============================
// REPORTES
// ===============================

app.post('/api/reports/send-start', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const sessionId = body.id || body.session_id;
  
  if (!sessionId) return c.json({ error: 'Session ID is required' }, 400);

  const session = await c.env.DB.prepare('SELECT name FROM sessions WHERE id = ?').bind(sessionId).first<{ name: string }>();
  if (!session) return c.json({ error: 'No session found' }, 404);

  const to = c.env.DIRECTOR_EMAIL || 'ncarrillok@gmail.com';
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
      <div style="background: #ef4444; color: white; padding: 30px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px; letter-spacing: 2px;">EYE STAFF</h1>
        <p style="margin: 5px 0 0 0; opacity: 0.8; font-weight: bold;">NOTIFICACIÓN DE INICIO DE JORNADA</p>
      </div>
      
      <div style="padding: 40px; color: #334155; line-height: 1.6;">
        <p style="font-size: 18px; margin-bottom: 20px;">Hola,</p>
        <p>Se ha iniciado formalmente una nueva jornada operativa en el sistema <b>Valet Eye</b>.</p>
        
        <div style="background: #f8fafc; border-left: 4px solid #ef4444; padding: 20px; margin: 30px 0; border-radius: 0 10px 10px 0;">
          <p style="margin: 0; font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Detalles del Evento:</p>
          <p style="margin: 10px 0 0 0; font-size: 20px; font-weight: bold; color: #0f172a;">${session.name}</p>
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #475569;">Fecha: ${new Date().toLocaleString()}</p>
        </div>
        
        <p>A partir de este momento, el personal puede comenzar a registrar entradas y salidas de vehículos para este evento.</p>
        
        <div style="text-align: center; margin-top: 40px;">
          <a href="${new URL(c.req.url).origin}" style="background: #0f172a; color: white; padding: 12px 25px; text-decoration: none; border-radius: 30px; font-weight: bold; font-size: 14px; display: inline-block;">ACCEDER AL PANEL</a>
        </div>
      </div>
      
      <div style="background: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8;">
        Este es un mensaje automático generado por EYE STAFF v2.2.6.<br>
        &copy; 2026 Grupo Eye - Operaciones Valet
      </div>
    </div>
  `;

  await sendEmail(c.env, to, `🚀 JORNADA INICIADA: ${session.name}`, html);
  
  return c.json({ success: true, message: 'Reporte de inicio enviado correctamente' });
});

// Reportes consolidados en /api/sessions/close

app.post('/api/test/changelog', async (c) => {
  const to = c.env.DIRECTOR_EMAIL || 'ncarrillok@gmail.com';
  const html = `
    <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 30px; border-radius: 20px;">
      <h2 style="color: #ef4444; border-bottom: 2px solid #ef4444; padding-bottom: 10px;">AVANCE DEL PROYECTO: v2.2.6</h2>
      <p>Hola, aquí tienes el detalle de las mejoras implementadas en este corte respecto a la versión anterior:</p>
      
      <ul style="line-height: 1.6;">
        <li><b>Reportes de Cierre PRO:</b> Ahora recibes un <b>PDF formal</b> y un <b>Excel (CSV)</b> automáticamente al finalizar cada evento.</li>
        <li><b>Consolidación de Operaciones:</b> Se optimizó el cierre para que con un solo clic se envíen todos los reportes y se limpie la jornada.</li>
        <li><b>Contador en Tiempo Real:</b> El botón de "Custodia" ahora muestra el número de vehículos en <b>verde brillante</b> directamente en el menú.</li>
        <li><b>Navegación Minimalista:</b> El Control de Jornada ahora es una tarjeta compacta y elegante, liberando espacio en el dashboard.</li>
        <li><b>Mejora en Evidencias:</b> Se optimizó la carga de fotos para asegurar que siempre sean visibles y tengan diagnóstico de carga.</li>
        <li><b>Seguridad Reforzada:</b> Los tickets digitales ahora incluyen tokens de verificación cruzada para mayor seguridad.</li>
      </ul>

      <p style="margin-top: 30px; font-size: 0.9rem; color: #666;">El backup de la base de datos v2.2.3 ha sido guardado exitosamente.</p>
      <div style="text-align: center; margin-top: 30px; font-size: 0.8rem; color: #999;">EYE STAFF 2026 — Advanced Coding Division</div>
    </div>
  `;
  await sendEmail(c.env, to, 'EYE STAFF: Avance del Proyecto - v2.2.6', html);
  return c.json({ success: true });
});

app.post('/api/reports/send-summary', async (c) => {
  return c.json({ success: true, message: 'Reporte ahora se envía al cerrar la sesión' });
});

app.post('/api/ai/scan-vehicle', async (c) => {
  const { images } = await c.req.json<{ images: string[] }>();
  
  if (!images || images.length === 0) {
    return c.json({ error: 'No se proporcionaron imágenes' }, 400);
  }

  try {
    // Tomamos la primera imagen para el análisis principal (o combinamos si el modelo lo permite)
    // La mayoría de los modelos de Workers AI aceptan una imagen por llamada.
    // Usaremos la primera imagen (posición 2 o 10) para la placa y marca.
    const imageBase64 = images[0].split(',')[1]; // Remover el prefijo data:image/jpeg;base64,
    const binaryImage = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));

    const prompt = `Analiza las imágenes de este vehículo (procedentes de servicios de Valet en USA, Venezuela o España). Extrae la información y devuélvela estrictamente en este formato de texto plano para mapeo directo:

PLACA: [Solo caracteres alfanuméricos, sin guiones ni espacios. Revisa bien todas las fotos para mayor precisión]
MARCA: [Nombre principal, ej: TOYOTA, FORD, CHEVROLET]
MODELO: [Nombre comercial principal, ej: COROLLA, F-150, AVEO]
COLOR: [Color sólido predominante TRADUCIDO AL ESPAÑOL, ej: BLANCO, NEGRO, GRIS, AZUL, ROJO, PLATA]
COMENTARIOS_IA: [Breve descripción de 1 frase en ESPAÑOL sobre el estado visual detectado en las fotos, ej: 'VEHÍCULO PRESENTA SUCIEDAD MODERADA Y POSIBLE ROCE EN PARACHOQUES FRONTAL DERECHO'. Si no hay daños evidentes: 'SIN DAÑOS VISIBLES EN LAS CAPTURAS'].

Restricciones:
- RESPONDE SIEMPRE EN ESPAÑOL.
- No incluyas explicaciones adicionales.
- Si un dato no es legible, coloca 'REVISAR'.
- En MODELO, no incluyas años ni versiones de motorización para evitar ruido en la DB.
- TODO EN MAYÚSCULAS Y RESPETANDO ACENTOS.`;

    const response = await c.env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', {
      image: [...binaryImage],
      prompt: prompt,
      max_tokens: 200
    });

    const text = response.description || response.text || '';
    
    // Parsear el resultado
    const lines = text.split('\n');
    const result: any = {};
    lines.forEach((line: string) => {
      if (line.includes('PLACA:')) result.plate = line.split('PLACA:')[1].trim();
      if (line.includes('MARCA:')) result.brand = line.split('MARCA:')[1].trim();
      if (line.includes('MODELO:')) result.model = line.split('MODELO:')[1].trim();
      if (line.includes('COLOR:')) result.color = line.split('COLOR:')[1].trim();
      if (line.includes('COMENTARIOS_IA:')) result.comments = line.split('COMENTARIOS_IA:')[1].trim();
    });

    return c.json({ success: true, ...result });
  } catch (err: any) {
    console.error('AI Scan Error:', err);
    return c.json({ error: 'Error en el análisis de IA: ' + err.message }, 500);
  }
});

app.get('/api/debug/trigger-report', async (c) => {
  const last = await c.env.DB.prepare('SELECT id, name FROM sessions ORDER BY id DESC LIMIT 1').first<{id:number, name:string}>();
  if (!last) return c.json({ error: 'No hay sesiones' });

  const stats = await c.env.DB.prepare(`
    SELECT COUNT(*) as total, SUM(fee_amount) as revenue
    FROM vehicles WHERE session_id = ? AND status != 'pre-registered'
  `).bind(last.id).first<{ total: number, revenue: number }>();

  const to = c.env.DIRECTOR_EMAIL || 'ncarrillok@gmail.com';
  await sendEmail(c.env, to, `🧪 PRUEBA DE ENVÍO: ${last.name}`, `
    <div style="font-family:sans-serif; max-width:500px; margin:auto; border:1px solid #eee; border-radius:15px; overflow:hidden; border-top:5px solid #ef4444;">
      <div style="padding:30px; text-align:center;">
        <h1 style="color:#ef4444; margin:0;">EYE STAFF</h1>
        <p style="color:#64748b; font-weight:700;">CONFIRMACIÓN DE CORREO EXITOSA</p>
        <div style="background:#f8fafc; padding:20px; border-radius:12px; margin:20px 0; text-align:left;">
          <p><strong>ÚLTIMO EVENTO:</strong> ${last.name}</p>
          <p><strong>VEHÍCULOS:</strong> ${stats?.total || 0}</p>
          <p><strong>RECAUDACIÓN:</strong> $${stats?.revenue || 0}</p>
        </div>
        <p>Si recibes este correo, la configuración es correcta.</p>
      </div>
    </div>
  `);

  return c.json({ message: 'Email de prueba enviado a ' + to });
});

app.get('/api/messages/:id', async (c) => {
  const id = c.req.param('id');
  const { results } = await c.env.DB.prepare('SELECT * FROM messages WHERE vehicle_id = ? ORDER BY ts ASC').bind(id).all();
  return c.json(results);
});

app.post('/api/messages/:id', async (c) => {
  return c.json({ success: true });
});

app.get('/api/reports/financial', async (c) => {
  const user = c.get('user');
  if (user.role !== 'supervisor' && user.role !== 'director') {
    return c.json({ error: 'No autorizado' }, 403);
  }

  // Ingresos por día (últimos 30 días)
  const dailyEarnings = await c.env.DB.prepare(`
    SELECT 
      strftime('%Y-%m-%d', check_out_at) as date,
      SUM(fee_amount) as total,
      COUNT(id) as services
    FROM vehicles 
    WHERE fee_paid = 1 AND check_out_at IS NOT NULL
    GROUP BY date
    ORDER BY date DESC
    LIMIT 30
  `).all();

  // Resumen total
  const summary = await c.env.DB.prepare(`
    SELECT 
      SUM(fee_amount) as total_earnings,
      COUNT(id) as total_services
    FROM vehicles 
    WHERE fee_paid = 1
  `).first();

  return c.json({
    summary,
    daily: dailyEarnings.results
  });
});

app.get('/api/reports/analytics', async (c) => {
  const user = c.get('user');
  if (user.role !== 'supervisor' && user.role !== 'director') return c.json({ error: 'No autorizado' }, 403);

  // 1. Horas Pico (Entradas por hora)
  const peakHours = await c.env.DB.prepare(`
    SELECT 
      strftime('%H', check_in_at) as hour,
      COUNT(id) as count
    FROM vehicles
    WHERE check_in_at >= date('now', '-7 days')
    GROUP BY hour
    ORDER BY hour ASC
  `).all();

  // 2. Rendimiento Staff (Servicios por usuario)
  const staffPerformance = await c.env.DB.prepare(`
    SELECT 
      u.name,
      COUNT(e.id) as actions
    FROM users u
    JOIN events e ON e.user_id = u.id
    WHERE e.created_at >= date('now', '-7 days')
    GROUP BY u.name
    ORDER BY actions DESC
  `).all();

  // 3. Métricas de hoy vs ayer
  const comparison = await c.env.DB.prepare(`
    SELECT 
      date(check_in_at) as day,
      COUNT(id) as count
    FROM vehicles
    WHERE check_in_at >= date('now', '-1 day')
    GROUP BY day
  `).all();

  return c.json({
    peakHours: peakHours.results,
    staffPerformance: staffPerformance.results,
    comparison: comparison.results
  });
});

// ===============================
// ESPACIOS (MAPA)
// ===============================
app.get('/api/slots', async (c) => {
  const slots = await c.env.DB.prepare(`
    SELECT s.id, s.zone, s.number, v.plate, v.id as vehicle_id, v.status as vehicle_status
    FROM slots s
    LEFT JOIN vehicles v ON v.parking_spot = (s.zone || '-' || s.number) AND v.status NOT IN ('retrieved')
    ORDER BY s.zone, s.number
  `).all();
  return c.json(slots.results);
});

app.post('/api/slots', async (c) => {
  const user = c.get('user');
  if (user.role !== 'supervisor' && user.role !== 'director') return c.json({ error: 'No autorizado' }, 403);

  const { zone, number } = await c.req.json();
  await c.env.DB.prepare('INSERT INTO slots (zone, number) VALUES (?, ?)').bind(zone, number).run();
  return c.json({ message: 'Espacio creado' });
});

app.post('/api/slots/bulk', async (c) => {
  const user = c.get('user');
  if (user.role !== 'supervisor' && user.role !== 'director') return c.json({ error: 'No autorizado' }, 403);

  const { zone, from, to } = await c.req.json();
  const queries = [];
  for (let i = from; i <= to; i++) {
    queries.push(c.env.DB.prepare('INSERT INTO slots (zone, number) VALUES (?, ?)').bind(zone, i));
  }
  await c.env.DB.batch(queries);
  return c.json({ message: `${queries.length} espacios creados en Zona ${zone}` });
});

app.delete('/api/slots/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'supervisor' && user.role !== 'director') return c.json({ error: 'No autorizado' }, 403);

  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM slots WHERE id = ?').bind(id).run();
  return c.json({ message: 'Espacio eliminado' });
});



// ===============================
// GESTIÓN DE NÓMINA (FORMATOS)
// ===============================

app.get('/api/payroll/rates', async (c) => {
  const result = await c.env.DB.prepare('SELECT * FROM payroll_rates').all();
  return c.json({ rates: result.results || [] });
});

app.get('/api/payroll/pending-events', async (c) => {
  const userId = c.req.query('user_id');
  if (!userId) return c.json({ error: 'User ID requerido' }, 400);

  // Buscar sesiones cerradas donde el usuario tuvo actividad (events) 
  // pero que NO están en payroll_submissions para ese usuario
  const query = `
    SELECT s.id, s.name, s.ended_at, u.role, r.rate
    FROM sessions s
    JOIN users u ON u.id = ?
    LEFT JOIN payroll_rates r ON u.role = r.role
    WHERE s.status = 'closed'
    AND s.id IN (
      SELECT DISTINCT v.session_id 
      FROM events e 
      JOIN vehicles v ON e.vehicle_id = v.id 
      WHERE e.user_id = ?
    )
    AND s.id NOT IN (
      SELECT session_id FROM payroll_submissions WHERE user_id = ?
    )
    ORDER BY s.ended_at DESC
  `;
  
  const result = await c.env.DB.prepare(query).bind(userId, userId, userId).all();
  return c.json({ events: result.results || [] });
});
// --- GESTIÓN DE NÓMINA / FORMATOS DE COBRO ---

app.get('/api/staff/search', async (c) => {
  const q = c.req.query('q') || '';
  const result = await c.env.DB.prepare('SELECT id, name, bank_name, bank_account FROM users WHERE name LIKE ? LIMIT 10')
    .bind(`%${q}%`)
    .all();
  return c.json(result.results);
});

app.get('/api/staff/:id/available-sessions', async (c) => {
  const id = c.req.param('id');
  
  // Buscar sesiones cerradas donde el usuario tuvo actividad (events) 
  // pero que NO están en payroll_submissions para ese usuario
  const query = `
    SELECT DISTINCT s.id, s.name, s.ended_at, e.event_type as role
    FROM sessions s
    JOIN events e ON e.user_id = ?
    JOIN vehicles v ON e.vehicle_id = v.id AND v.session_id = s.id
    WHERE s.status = 'closed'
    AND s.id NOT IN (
      SELECT session_id FROM payroll_submissions WHERE user_id = ?
    )
    ORDER BY s.ended_at DESC
  `;
  
  const result = await c.env.DB.prepare(query).bind(id, id).all();
  return c.json(result.results);
});


app.post('/api/payroll/submit', async (c) => {
  const data = await c.req.json();
  const user = c.get('user');
  
  // Normalizar datos para manejar tanto envío individual como masivo
  let sessionsToProcess = [];
  if (data.sessions_data && Array.isArray(data.sessions_data)) {
    sessionsToProcess = data.sessions_data;
  } else if (data.session_id) {
    sessionsToProcess = [{
      session_id: data.session_id,
      date: data.date,
      role: data.role_at_event || data.role
    }];
  }

  if (sessionsToProcess.length === 0) {
    return c.json({ error: 'Debe seleccionar al menos un evento' }, 400);
  }

  const userId = data.user_id || user.id;

  // Actualizar datos bancarios en el perfil del usuario
  if (data.bank_name || data.bank_account) {
    await c.env.DB.prepare('UPDATE users SET bank_name = ?, bank_account = ? WHERE id = ?')
      .bind(
        data.bank_name ? data.bank_name.toUpperCase() : null, 
        data.bank_account || null, 
        userId
      ).run();
  }

  // Insertar cada sesión seleccionada
  const queries = [];
  for (const session of sessionsToProcess) {
    // Buscar tarifa para el rol
    const role = (session.role || '').toLowerCase();
    const rateRecord = await c.env.DB.prepare('SELECT rate FROM payroll_rates WHERE role = ?')
      .bind(role)
      .first<{ rate: number }>();
    
    const amount = rateRecord ? rateRecord.rate : 0;

    queries.push(
      c.env.DB.prepare(
        `INSERT INTO payroll_submissions 
        (user_id, session_id, date, role_at_event, bank_name, bank_account, amount, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
      ).bind(
        userId, 
        session.session_id, 
        session.date, 
        session.role, 
        data.bank_name ? data.bank_name.toUpperCase() : null, 
        data.bank_account || null, 
        amount
      )
    );
  }

  if (queries.length > 0) {
    await c.env.DB.batch(queries);
  }

  // Enviar notificación por email (Resumen de sesiones)
  try {
    const staff = await c.env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(userId).first<any>();
    
    const sessionsListHtml = (data.sessions_data || sessionsToProcess).map((s: any) => `
      <li style="margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">
        <strong>EVENTO:</strong> ${s.name}<br>
        <strong>FECHA:</strong> ${s.date}<br>
        <strong>ROL:</strong> ${s.role}
      </li>
    `).join('');

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${c.env.RESEND_API_KEY}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        from: 'EYE STAFF <onboarding@resend.dev>',
        to: ['ncarrillok@gmail.com'],
        subject: `💰 NUEVO REPORTE DE COBRO: ${staff?.name || 'EMPLEADO'}`,
        html: `
          <div style="font-family:sans-serif; max-width:500px; margin:auto; border:1px solid #eee; border-radius:15px; overflow:hidden; border-top:5px solid #a855f7;">
            <div style="padding:30px;">
              <h2 style="color:#a855f7; margin:0;">REPORTE DE COBRO</h2>
              <hr style="border:0; border-top:1px solid #eee; margin:20px 0;">
              <p><strong>EMPLEADO:</strong> ${staff?.name || 'N/A'}</p>
              <p><strong>BANCO:</strong> ${data.bank_name || 'N/A'}</p>
              <p><strong>CUENTA:</strong> ${data.bank_account || 'N/A'}</p>
              <h4 style="margin-top:20px;">SESIONES INCLUIDAS:</h4>
              <ul style="padding-left:0; list-style:none;">
                ${sessionsListHtml}
              </ul>
            </div>
          </div>
        `
      })
    });
  } catch (e) { console.error('Email error:', e); }

  return c.json({ success: true });
});


app.use('*', async (c, next) => {
  await initAttendanceTable(c.env.DB);
  await next();
});

// --- ASISTENCIA (FICHAJE) ---

app.post('/api/attendance/log', async (c) => {
  const { type, session_id, user_id } = await c.req.json();
  const user = c.get('user');
  const targetUserId = user_id || user.id;
  
  if (!session_id || !type) return c.json({ error: 'Faltan datos' }, 400);

  // REGLA DE EXCLUSIVIDAD: Si es entrada, verificar si ya tiene una entrada activa en OTRO evento
  if (type === 'entry') {
    const activeEntry = await c.env.DB.prepare(`
      SELECT s.name 
      FROM staff_attendance a
      JOIN sessions s ON a.session_id = s.id
      WHERE a.user_id = ? AND a.type = 'entry' AND s.status = 'active' AND a.session_id != ?
      ORDER BY a.timestamp DESC LIMIT 1
    `).bind(targetUserId, session_id).first<{name: string}>();

    if (activeEntry) {
      return c.json({ error: `⚠️ NO PUEDES ENTRAR: Ya tienes una entrada activa en el evento "${activeEntry.name}". Marca SALIDA allí primero.` }, 400);
    }
  }

  await c.env.DB.prepare('INSERT INTO staff_attendance (user_id, session_id, type) VALUES (?, ?, ?)')
    .bind(targetUserId, session_id, type)
    .run();
    
  return c.json({ success: true });
    
  return c.json({ success: true });
});

app.get('/api/attendance/session/:id', async (c) => {
  const sessionId = c.req.param('id');
  const result = await c.env.DB.prepare(`
    SELECT a.*, u.name as user_name
    FROM staff_attendance a
    JOIN users u ON a.user_id = u.id
    WHERE a.session_id = ?
    ORDER BY a.timestamp DESC
  `).bind(sessionId).all();
  
  return c.json(result.results);
});

app.get('/api/attendance/current', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.query('session_id');
  
  const result = await c.env.DB.prepare(`
    SELECT * FROM staff_attendance 
    WHERE user_id = ? AND session_id = ? 
    ORDER BY timestamp DESC LIMIT 1
  `).bind(user.id, sessionId).first<any>();
  
  return c.json({ status: result ? result.type : 'none' });
});

app.get('/api/payroll/submissions', async (c) => {

  const user = c.get('user');
  const sessionId = c.req.query('session_id');
  
  let query = `
    SELECT p.*, u.name as user_name, s.name as session_name 
    FROM payroll_submissions p
    JOIN users u ON p.user_id = u.id
    JOIN sessions s ON p.session_id = s.id
    WHERE 1=1
  `;
  const params: any[] = [];
  
  if (sessionId) {
    query += " AND p.session_id = ?";
    params.push(sessionId);
  }
  
  // Si no es admin, solo ve lo suyo
  if (user.role !== 'director') {
    query += " AND p.user_id = ?";
    params.push(user.id);
  }

  query += " ORDER BY p.created_at DESC";
  
  const result = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ submissions: result.results || [] });
});

app.post('/api/payroll/approve', async (c) => {
  const user = c.get('user');
  if (user.role !== 'director') return c.json({ error: 'No autorizado' }, 403);

  const { id, status } = await c.req.json();
  if (!id || !status) return c.json({ error: 'Faltan datos' }, 400);

  await c.env.DB.prepare(
    "UPDATE payroll_submissions SET status = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(status, id).run();

  return c.json({ success: true });
});

app.post('/api/payroll/update-amount', async (c) => {
  const { id, amount } = await c.req.json();
  const user = c.get('user');
  
  if (user.role !== 'director') return c.json({ error: 'No autorizado' }, 403);
  
  await c.env.DB.prepare('UPDATE payroll_submissions SET amount = ? WHERE id = ?')
    .bind(amount, id)
    .run();
    
  return c.json({ success: true });
});

app.get('/api/payroll/summary', async (c) => {

  const user = c.get('user');
  if (user.role !== 'director') return c.json({ error: 'No autorizado' }, 403);

  const sessionId = c.req.query('session_id');
  
  let query = `
    SELECT 
      s.name as session_name,
      p.role_at_event,
      COUNT(p.id) as count,
      SUM(p.amount) as total_amount
    FROM payroll_submissions p
    JOIN sessions s ON p.session_id = s.id
    WHERE p.status = 'approved'
  `;
  const params: any[] = [];

  if (sessionId) {
    query += " AND p.session_id = ?";
    params.push(sessionId);
  }

  query += " GROUP BY session_name, role_at_event";
  
  const result = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ summary: result.results || [] });
});

app.get('/api/payroll/session-user-info', async (c) => {
  const userId = c.req.query('user_id');
  const sessionId = c.req.query('session_id');
  
  if (!userId || !sessionId) return c.json({ error: 'Faltan parámetros' }, 400);

  const session = await c.env.DB.prepare('SELECT ended_at, started_at FROM sessions WHERE id = ?').bind(sessionId).first<any>();
  const user = await c.env.DB.prepare('SELECT role, bank_name, bank_account FROM users WHERE id = ?').bind(userId).first<any>();
  
  // Verificar si participó en el evento
  const participated = await c.env.DB.prepare(`
    SELECT 1 FROM events e 
    JOIN vehicles v ON e.vehicle_id = v.id 
    WHERE e.user_id = ? AND v.session_id = ? 
    LIMIT 1
  `).bind(userId, sessionId).first();

  return c.json({
    date: session?.ended_at ? session.ended_at.split(' ')[0] : (session?.started_at ? session.started_at.split(' ')[0] : 'SIN DATOS'),
    role: participated ? user?.role || 'SIN DATOS' : 'SIN DATOS',
    bank_name: user?.bank_name || '',
    bank_account: user?.bank_account || ''
  });
});

app.get('/api/photos/*', async (c) => {
  // Capturar todo lo que venga después de /api/photos/
  const key = c.req.path.replace('/api/photos/', '');
  if (!key) return c.json({ error: 'Key requerida' }, 400);

  const object = await c.env.PHOTOS.get(key);

  if (!object) {
    return c.json({ error: 'Foto no encontrada', key }, 404);
  }

  const headers = new Headers();
  // Forzar Content-Type si está disponible en metadata o por extensión
  const contentType = object.httpMetadata?.contentType || 'image/jpeg';
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', 'public, max-age=31536000');
  
  return new Response(object.body, { headers });
});

// ADMIN: Obtener todos los reportes de nómina para gestión
app.get('/api/admin/payroll-submissions', async (c) => {
  const submissions = await c.env.DB.prepare(`
    SELECT 
      ps.*, 
      u.name as staff_name, 
      s.name as event_name 
    FROM payroll_submissions ps
    JOIN users u ON u.id = ps.user_id
    JOIN sessions s ON s.id = ps.session_id
    ORDER BY ps.created_at DESC
  `).all<any>();
  return c.json({ success: true, submissions: submissions.results || [] });
});

// ADMIN: Actualizar monto o estado de un reporte
app.post('/api/admin/update-payroll-submission', async (c) => {
  const { id, amount, status } = await c.req.json();
  await c.env.DB.prepare('UPDATE payroll_submissions SET amount = ?, status = ? WHERE id = ?')
    .bind(amount, status, id)
    .run();
  return c.json({ success: true });
});

// ===============================
// ADMINISTRACIÓN
// ===============================
app.post('/api/staff/update-bank', async (c) => {
  const user = c.get('user');
  const { bank_name, bank_account } = await c.req.json();
  
  await c.env.DB.prepare('UPDATE users SET bank_name = ?, bank_account = ? WHERE id = ?')
    .bind(bank_name, bank_account, user.id)
    .run();
    
  return c.json({ success: true });
});

app.post('/api/admin/verify', async (c) => {
  const { key } = await c.req.json();
  const validKey = c.env.ADMIN_KEY || 'EYE-ADMIN-2026';
  return c.json({ valid: key === validKey });
});

// ===============================
// PHOTO UPLOAD (R2)
// ===============================
app.post('/api/admin/preload-csv', async (c) => {
  const { csv, session_id } = await c.req.json();
  if (!session_id) return c.json({ error: 'Session ID requerido' }, 400);

  const lines = csv.split('\n');
  let count = 0;
  const stmt = c.env.DB.prepare('INSERT INTO vehicles (plate, owner_name, owner_phone, brand, model, status, session_id) VALUES (?, ?, ?, ?, ?, "pre-registered", ?)');
  const batch = [];

  for (let line of lines) {
    if (!line.trim() || line.startsWith('PLACA')) continue;
    const cols = line.split(',').map((s: string) => s.trim());
    if (cols.length >= 2) {
      batch.push(stmt.bind(cols[0].toUpperCase(), cols[1], cols[2] || null, cols[3] || null, cols[4] || null, session_id));
      count++;
    }
  }
  if (batch.length > 0) await c.env.DB.batch(batch);
  return c.json({ success: true, count });
});

app.get('/api/admin/sessions', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM sessions WHERE status = "closed" ORDER BY ended_at DESC').all();
  return c.json(results);
});

app.get('/api/admin/sessions/:id/detail', async (c) => {
  const id = c.req.param('id');
  const session = await c.env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(id).first();
  const stats = await c.env.DB.prepare(`
    SELECT 
      COUNT(*) as total_cars,
      SUM(CASE WHEN status IN ('delivered', 'retrieved') THEN 1 ELSE 0 END) as exits,
      SUM(fee_amount) as revenue
    FROM vehicles WHERE session_id = ?
  `).bind(id).first();
  const vehicles = await c.env.DB.prepare('SELECT * FROM vehicles WHERE session_id = ? ORDER BY check_in_at DESC').bind(id).all();

  return c.json({ session, stats, vehicles: vehicles.results });
});

app.post('/api/photos/upload', async (c) => {
  const { plate, image, type } = await c.req.json();
  const key = `photos/${plate}/${type}_${Date.now()}.jpg`;

  const base64Data = image.split(',')[1];
  const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

  await c.env.PHOTOS.put(key, binaryData, {
    httpMetadata: { contentType: 'image/jpeg' }
  });

  const vehicle = await c.env.DB.prepare('SELECT id FROM vehicles WHERE plate = ? ORDER BY created_at DESC LIMIT 1').bind(plate).first<{ id: number }>();
  if (vehicle) {
    await c.env.DB.prepare('INSERT INTO photos (vehicle_id, url) VALUES (?, ?)')
      .bind(vehicle.id, key)
      .run();
  }

  return c.json({ key });
});

// Eliminar endpoint redundante que causaba conflictos
// app.get('/api/photos/:plate/:filename', ...) se ha consolidado en el de arriba.

// ===============================
// VEHICLE PHOTOS LIST
// ===============================
app.get('/api/vehicles/:id/photos', async (c) => {
  const id = c.req.param('id');
  const { results } = await c.env.DB.prepare('SELECT url FROM photos WHERE vehicle_id = ?').bind(id).all();
  return c.json({ photos: results });
});

// ===============================
// RESERVATIONS
// ===============================
app.get('/api/reservations', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM reservations ORDER BY expected_arrival ASC').all();
  return c.json(results);
});

app.post('/api/reservations', async (c) => {
  const body = await c.req.json();
  const confirmCode = 'R' + Date.now().toString(36).toUpperCase();

  await c.env.DB.prepare(
    `INSERT INTO reservations (confirm_code, owner_name, owner_phone, plate, brand, model, expected_arrival, notes, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
  ).bind(
    confirmCode, body.owner_name, body.owner_phone, body.plate, body.brand, body.model, body.expected_arrival, body.notes
  ).run();

  return c.json({ confirm_code: confirmCode });
});

app.patch('/api/reservations/:id', async (c) => {
  const id = c.req.param('id');
  const { status } = await c.req.json();
  await c.env.DB.prepare('UPDATE reservations SET status = ? WHERE id = ?').bind(status, id).run();
  return c.json({ message: 'Reserva actualizada' });
});

// ===============================
// SHIFTS (CLOCK-IN/OUT)
// ===============================
app.get('/api/shifts/status', async (c) => {
  const user = c.get('user');
  const shift = await c.env.DB.prepare('SELECT * FROM shifts WHERE user_id = ? AND status = ? ORDER BY start_at DESC LIMIT 1')
    .bind(user.id, 'active').first();
  return c.json(shift || { status: 'inactive' });
});

app.post('/api/shifts/clock-in', async (c) => {
  const user = c.get('user');
  const active = await c.env.DB.prepare('SELECT id FROM shifts WHERE user_id = ? AND status = ?').bind(user.id, 'active').first();
  if (active) return c.json({ error: 'Ya tienes un turno activo' }, 400);

  await c.env.DB.prepare('INSERT INTO shifts (user_id) VALUES (?)').bind(user.id).run();
  return c.json({ success: true });
});

app.post('/api/shifts/clock-out', async (c) => {
  const user = c.get('user');
  const active: any = await c.env.DB.prepare('SELECT id, start_at FROM shifts WHERE user_id = ? AND status = ?').bind(user.id, 'active').first();
  if (!active) return c.json({ error: 'No tienes turnos activos' }, 400);

  const start = new Date(active.start_at).getTime();
  const end = Date.now();
  const minutes = Math.round((end - start) / 60000);

  await c.env.DB.prepare('UPDATE shifts SET end_at = CURRENT_TIMESTAMP, total_minutes = ?, status = ? WHERE id = ?')
    .bind(minutes, 'completed', active.id).run();

  return c.json({ success: true, total_minutes: minutes });
});

app.get('/api/reports/shifts', async (c) => {
  const user = c.get('user');
  if (user.role !== 'supervisor' && user.role !== 'director') return c.json({ error: 'No autorizado' }, 403);

  const { results } = await c.env.DB.prepare(`
    SELECT u.name, SUM(s.total_minutes) as total_min, COUNT(s.id) as total_shifts
    FROM users u
    JOIN shifts s ON s.user_id = u.id
    WHERE s.status = 'completed' AND s.start_at >= date('now', '-30 days')
    GROUP BY u.name
    ORDER BY total_min DESC
  `).all();
  return c.json(results);
});

// ===============================
// PUSH NOTIFICATIONS
// ===============================
app.post('/api/push/subscribe', async (c) => {
  const user = c.get('user');
  const { endpoint, keys } = await c.req.json();

  await c.env.DB.prepare('INSERT OR REPLACE INTO subscriptions (user_id, endpoint, keys_p256dh, keys_auth) VALUES (?, ?, ?, ?)')
    .bind(user.id, endpoint, keys.p256dh, keys.auth)
    .run();

  return c.json({ success: true });
});

// ===============================
// AJUSTES (Settings)
// ===============================
app.get('/api/settings', async (c) => {
  const result = await c.env.DB.prepare('SELECT * FROM settings').all();
  const settings = result.results.reduce((acc: any, curr: any) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {});
  return c.json(settings);
});

app.patch('/api/settings', async (c) => {
  const user = c.get('user');
  if (user.role !== 'director') return c.json({ error: 'Solo el Director puede cambiar los ajustes' }, 403);

  const body = await c.req.json();
  const queries = Object.entries(body).map(([key, value]) =>
    c.env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').bind(key, value, value)
  );
  await c.env.DB.batch(queries);
  return c.json({ message: 'Ajustes actualizados' });
});

// ===============================
// PÚBLICO: SOLICITUD DE AUTO
// ===============================
app.post('/api/public/ticket/:code/request', async (c) => {
  const code = c.req.param('code');
  const now = new Date().toISOString();

  await c.env.DB.prepare('UPDATE vehicles SET requested_at = ? WHERE ticket_code = ? AND status = ?')
    .bind(now, code, 'parked')
    .run();

  const v: any = await c.env.DB.prepare('SELECT id FROM vehicles WHERE ticket_code = ?').bind(code).first();
  if (v) await logEvent(c.env, v.id, null, 'requested', 'Cliente solicitó auto desde la Web');

  return c.json({ message: 'Solicitud recibida', requested_at: now });
});

app.get('/api/vehicles/:id/history', async (c) => {
  const id = c.req.param('id');
  const logs = await c.env.DB.prepare(`
    SELECT e.*, u.name as user_name, u.role as user_role, e.ts as created_at
    FROM events e
    LEFT JOIN users u ON e.user_id = u.id
    WHERE e.vehicle_id = ?
    ORDER BY e.ts DESC
  `).bind(id).all();
  return c.json(logs.results);
});

// ===============================
// PAYMENTS (STRIPE)
// ===============================
app.post('/api/public/payments/create-session/:code', async (c) => {
  const code = c.req.param('code');
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);

  const v: any = await c.env.DB.prepare('SELECT * FROM vehicles WHERE ticket_code = ?').bind(code).first();
  if (!v) return c.json({ error: 'Ticket no encontrado' }, 404);

  const amount = Math.round((v.fee_amount || 0) * 100); // Stripe usa centavos
  if (amount <= 0) return c.json({ error: 'Monto inválido' }, 400);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: `Servicio Valet - Ticket ${code}`, description: `Placa: ${v.plate}` },
        unit_amount: amount,
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${c.req.header('Origin') || ''}/ticket/${code}?payment=success`,
    cancel_url: `${c.req.header('Origin') || ''}/ticket/${code}?payment=cancel`,
    metadata: { ticket_code: code, vehicle_id: v.id.toString() }
  });

  return c.json({ url: session.url });
});

// Webhook para confirmar pago
app.post('/api/payments/webhook', async (c) => {
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);
  const signature = c.req.header('stripe-signature');
  const body = await c.req.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, c.env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }

  if (event.type === 'checkout.session.completed') {
    const session: any = event.data.object;
    const vehicleId = session.metadata.vehicle_id;

    await c.env.DB.prepare('UPDATE vehicles SET fee_paid = 1, payment_method = ? WHERE id = ?')
      .bind('Stripe (Tarjeta)', vehicleId).run();

    await logEvent(c.env, parseInt(vehicleId), null, 'parked', 'Pago digital recibido vía Stripe ✅');
  }

  return c.json({ received: true });
});

// ===============================
// GEOLOCALIZACIÓN Y ACTIVOS
// ===============================

app.post('/api/location/report', async (c) => {
  const { lat, lon, accuracy, entity_id, entity_type } = await c.req.json();
  if (!lat || !lon || !entity_id || !entity_type) return c.json({ error: 'Faltan datos' }, 400);

  await c.env.DB.prepare('INSERT INTO locations (entity_id, entity_type, latitude, longitude, accuracy) VALUES (?, ?, ?, ?, ?)')
    .bind(entity_id, entity_type, lat, lon, accuracy || null)
    .run();
  
  return c.json({ success: true });
});

app.get('/api/location/latest', async (c) => {
  // Obtener última ubicación de cada staff activo y cada asset
  const staffQuery = `
    SELECT u.id, u.name, u.role, l.latitude, l.longitude, l.ts, l.accuracy
    FROM users u
    JOIN locations l ON l.entity_id = u.id AND l.entity_type = 'staff'
    WHERE l.id IN (SELECT MAX(id) FROM locations WHERE entity_type = 'staff' GROUP BY entity_id)
    AND (u.current_session_id IS NOT NULL OR u.role = 'director')
  `;
  
  const assetQuery = `
    SELECT a.id, a.name, a.type, l.latitude, l.longitude, l.ts, l.accuracy
    FROM assets a
    JOIN locations l ON l.entity_id = a.id AND l.entity_type = 'asset'
    WHERE l.id IN (SELECT MAX(id) FROM locations WHERE entity_type = 'asset' GROUP BY entity_id)
  `;

  const staff = await c.env.DB.prepare(staffQuery).all();
  const assets = await c.env.DB.prepare(assetQuery).all();

  return c.json({ 
    staff: staff.results || [], 
    assets: assets.results || [] 
  });
});

app.get('/api/admin/assets', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM assets ORDER BY name ASC').all();
  return c.json({ assets: results || [] });
});

app.post('/api/admin/assets', async (c) => {
  const { name, type, description } = await c.req.json();
  await c.env.DB.prepare('INSERT INTO assets (name, type, description) VALUES (?, ?, ?)')
    .bind(name, type, description || null)
    .run();
  return c.json({ success: true });
});

app.get('/api/settings', (c) => {
  return c.json({
    company_name: 'EYE STAFF',
    currency: '$',
    theme: 'dark'
  });
});

export default app;

