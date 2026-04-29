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
  const result = await c.env.DB.prepare('SELECT * FROM sessions WHERE status IN ("planning", "active") ORDER BY id DESC').all();
  return c.json({ sessions: result.results });
});

app.post('/api/sessions/plan', async (c) => {
  const { name } = await c.req.json();
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const sessionName = name || `EVENTO_${dateStr}`;

  const result = await c.env.DB.prepare('INSERT INTO sessions (name, status) VALUES (?, "planning")').bind(sessionName).run();
  return c.json({ success: true, id: result.meta.last_row_id, name: sessionName, status: 'planning' });
});

app.post('/api/sessions/activate', async (c) => {
  const { id } = await c.req.json();
  await c.env.DB.prepare('UPDATE sessions SET status = "active", started_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run();
  return c.json({ success: true, status: 'active' });
});

app.post('/api/sessions/close', async (c) => {
  let { id } = await c.req.json().catch(() => ({}));
  
  if (!id) {
    const active = await c.env.DB.prepare('SELECT id FROM sessions WHERE status = "active" ORDER BY id DESC LIMIT 1').first<{id:number}>();
    id = active ? active.id : null;
  }

  if (!id) return c.json({ error: 'No hay sesión activa para cerrar' }, 400);

  await c.env.DB.prepare('UPDATE sessions SET status = "closed", ended_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run();
  return c.json({ success: true, status: 'closed', session_id: id });
});

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

  // Footer / Instructions
  page.drawText('Presente este ticket para retirar su vehículo.', {
    x: 45,
    y: 80,
    size: 9,
    font: font,
    color: rgb(0.39, 0.45, 0.55),
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
  const { session_id } = await c.req.json();
  const session = await c.env.DB.prepare('SELECT name FROM sessions WHERE id = ?').bind(session_id).first<{ name: string }>();
  if (!session) return c.json({ error: 'No session' }, 404);

  const to = c.env.DIRECTOR_EMAIL || 'ncarrillok@gmail.com';
  await sendEmail(c.env, to, `🚀 JORNADA INICIADA: ${session.name}`, `
    <h1 style="color:#ef4444">EYE STAFF</h1>
    <p>Se ha iniciado una nueva jornada operativa.</p>
    <p><strong>Evento:</strong> ${session.name}</p>
    <p><strong>Fecha/Hora:</strong> ${new Date().toLocaleString()}</p>
  `);
  return c.json({ success: true });
});

app.post('/api/email/close', async (c) => {
  const { session_id } = await c.req.json();
  const session = await c.env.DB.prepare('SELECT name FROM sessions WHERE id = ?').bind(session_id).first<{ name: string }>();
  if (!session) return c.json({ error: 'No session' }, 404);

  const stats = await c.env.DB.prepare(`
    SELECT COUNT(*) as total, SUM(fee_amount) as revenue
    FROM vehicles WHERE session_id = ? AND status != 'pre-registered'
  `).bind(session_id).first<{ total: number, revenue: number }>();

  const to = c.env.DIRECTOR_EMAIL || 'ncarrillok@gmail.com';
  await sendEmail(c.env, to, `🏁 JORNADA FINALIZADA: ${session.name}`, `
    <h1 style="color:#ef4444">EYE STAFF - RESUMEN DE CIERRE</h1>
    <p>La jornada ha finalizado.</p>
    <p><strong>Evento:</strong> ${session.name}</p>
    <p><strong>Total Vehículos:</strong> ${stats?.total || 0}</p>
    <p><strong>Recaudación:</strong> $${stats?.revenue || 0}</p>
    <p><strong>Fecha/Hora:</strong> ${new Date().toLocaleString()}</p>
  `);
  return c.json({ success: true });
});

app.get('/manifest.json', async (c) => c.env.ASSETS.fetch(c.req.raw));
app.get('/sw.js', async (c) => c.env.ASSETS.fetch(c.req.raw));

app.get('/api/settings', async (c) => {
  return c.json({
    company_name: 'EYE STAFF',
    currency: '$',
    version: '2.0'
  });
});

// ===============================
// VISTA PÚBLICA DEL CLIENTE (HTML)
// ===============================
app.get('/ticket/:code', async (c) => {
  const code = c.req.param('code');
  const vehicle = await c.env.DB.prepare('SELECT * FROM vehicles WHERE ticket_code = ?').bind(code).first<any>();

  if (!vehicle) return c.html('<h1 style="text-align:center;margin-top:50px;font-family:sans-serif;">Ticket no encontrado</h1>', 404);

  const statusMap: any = {
    'parked': { text: 'Estacionado', color: '#10b981', icon: '🅿️' },
    'pending_retrieval': { text: 'En Camino / Preparando', color: '#f59e0b', icon: '🏃' },
    'retrieved': { text: 'Entregado', color: '#6b7280', icon: '✅' }
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
                <div class="logo">EYE <span>STAFF</span></div>
                <div class="status-box">
                    <div class="status-icon">${status.icon}</div>
                    <div class="status-text" style="text-transform:uppercase;">${status.text}</div>
                </div>
                <div style="color:#94a3b8; font-size:0.8rem; text-transform:uppercase; letter-spacing:1px; font-weight:800;">Vehículo</div>
                <div class="plate">${(vehicle.plate || '').toUpperCase()}</div>
                <div class="info">
                    <div class="info-row"><span>Ticket:</span><span style="font-weight:800;">${vehicle.ticket_code}</span></div>
                    <div class="info-row"><span>Correlativo:</span><span style="font-weight:800;">#${String(vehicle.daily_seq || 0).padStart(5, '0')}</span></div>
                    <div class="info-row"><span>Propietario:</span><span style="font-weight:800;">${(vehicle.owner_name || '—').toUpperCase()}</span></div>
                    <div class="info-row"><span>Marca:</span><span style="font-weight:800;">${(vehicle.brand || '—').toUpperCase()}</span></div>
                    <div class="info-row"><span>Modelo:</span><span style="font-weight:800;">${(vehicle.model || '—').toUpperCase()}</span></div>
                    <div class="info-row"><span>Color:</span><span style="font-weight:800;">${(vehicle.color || '—').toUpperCase()}</span></div>
                </div>
                
                ${vehicle.status === 'parked' ? `
                    <button class="btn" id="reqBtn" onclick="requestCar()">Solicitar mi vehículo</button>
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

  await c.env.DB.prepare("UPDATE vehicles SET status = 'pending_retrieval' WHERE id = ?").bind(vehicle.id).run();

  // Registrar evento (usamos ID 1 como sistema/cliente por defecto)
  await c.env.DB.prepare('INSERT INTO events (vehicle_id, user_id, event_type) VALUES (?, ?, ?)')
    .bind(vehicle.id, 1, 'checkout_request').run();

  return c.json({ message: 'Auto solicitado' });
});

// ===============================
// LOGIN (Frontend)
// ===============================
app.post('/api/staff/login', async (c) => {
  const { pin } = await c.req.json();

  // Buscar usuario por PIN
  const user = await c.env.DB.prepare('SELECT id, name, role FROM users WHERE pin_hash = ?')
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

  return c.json({
    id: user.id,
    name: user.name,
    role: user.role,
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
app.get('/api/staff', async (c) => {
  // Permitimos lectura para auditoría interna via deep-link
  const staff = await c.env.DB.prepare('SELECT id, name, role, pin_hash, created_at FROM users ORDER BY name ASC').all();
  return c.json(staff.results);
});

app.post('/api/staff', async (c) => {
  const current = c.get('user');
  if (current.role !== 'supervisor' && current.role !== 'director') {
    return c.json({ error: 'No autorizado' }, 403);
  }

  const { name, pin, role } = await c.req.json();
  if (!name || !pin || !role) return c.json({ error: 'Faltan datos' }, 400);

  await c.env.DB.prepare('INSERT INTO users (name, pin_hash, role) VALUES (?, ?, ?)')
    .bind(name, pin, role)
    .run();

  return c.json({ message: 'Personal registrado correctamente' });
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

    const result = await c.env.DB.prepare(
      `INSERT INTO vehicles 
        (plate, status, ticket_code, owner_name, owner_phone, brand, model, color, parking_spot, damage_notes, damage_json, fee_amount, session_id, daily_seq) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      data.plate.toUpperCase(), 'parked', ticketCode, data.owner_name || null, data.owner_phone || null,
      data.brand || null, data.model || null, data.color || null, data.parking_spot || null, data.damage_notes || null, data.damage_json || null, data.fee_amount || 0,
      sessionId, nextSeq
    ).run();

    const vehicleId = result.meta.last_row_id;
    await logEvent(c.env, vehicleId, user.id, 'checkin', `Vehículo registrado en sesión ${sessionId}`);

    // ENVIAR TICKET POR EMAIL AL CLIENTE
    if (data.owner_email) {
      try {
        const ticketUrl = `${new URL(c.req.url).origin}/ticket/${ticketCode}`;
        const pdfBytes = await generateTicketPDF({ ...data, daily_seq: nextSeq });
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
  let query = "SELECT id, plate, brand, model, owner_name, owner_phone, daily_seq, created_at, status FROM vehicles WHERE status NOT IN ('delivered', 'retrieved', 'pre-registered')";
  const params = [];
  if (sessionId) {
    query += " AND session_id = ?";
    params.push(sessionId);
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

// ===============================
// GET VEHICLE BY ID
// ===============================
app.get('/api/vehicles/:id', async (c) => {
  const id = c.req.param('id');
  const vehicle = await c.env.DB.prepare('SELECT * FROM vehicles WHERE id = ?').bind(id).first();
  if (!vehicle) return c.json({ error: 'Not found' }, 404);
  return c.json(vehicle);
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
  const { plate, vehicle_id } = await c.req.json();
  const user = c.get('user');

  let vehicle;
  if (vehicle_id) {
    vehicle = await c.env.DB.prepare('SELECT id, plate FROM vehicles WHERE id = ?').bind(vehicle_id).first<{ id: number; plate: string }>();
  } else if (plate) {
    vehicle = await c.env.DB.prepare('SELECT id, plate FROM vehicles WHERE plate = ?').bind(plate).first<{ id: number; plate: string }>();
  }

  if (!vehicle) {
    return c.json({ error: 'Vehículo no encontrado' }, 404);
  }

  await c.env.DB.prepare(
    'UPDATE vehicles SET status = ?, check_out_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind('retrieved', vehicle.id).run();

  await logEvent(c.env, vehicle.id, user.id, 'delivered', `Entrega registrada por ${user.name}`);

  return c.json({ message: 'Check-out registrado', plate: vehicle.plate });
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
  return c.json({ success: true, message: 'Reporte de inicio enviado' });
});

app.post('/api/reports/send-summary', async (c) => {
  let { session_id } = await c.req.json().catch(() => ({}));
  
  if (!session_id) {
    const last = await c.env.DB.prepare('SELECT id FROM sessions ORDER BY id DESC LIMIT 1').first<{id:number}>();
    session_id = last ? last.id : null;
  }

  if (!session_id) return c.json({ error: 'No se encontró sesión' }, 400);

  // Reusar lógica de /api/email/close
  const session = await c.env.DB.prepare('SELECT name FROM sessions WHERE id = ?').bind(session_id).first<{ name: string }>();
  if (!session) return c.json({ error: 'Sesión no encontrada' }, 404);

  const stats = await c.env.DB.prepare(`
    SELECT COUNT(*) as total, SUM(fee_amount) as revenue
    FROM vehicles WHERE session_id = ? AND status != 'pre-registered'
  `).bind(session_id).first<{ total: number, revenue: number }>();

  const to = c.env.DIRECTOR_EMAIL || 'ncarrillok@gmail.com';
  await sendEmail(c.env, to, `🏁 REPORTE DE CIERRE: ${session.name}`, `
    <div style="font-family:sans-serif; max-width:500px; margin:auto; border:1px solid #eee; border-radius:15px; overflow:hidden;">
      <div style="background:#ef4444; color:white; padding:30px; text-align:center;">
        <h1 style="margin:0;">EYE STAFF</h1>
        <p style="margin:5px 0 0 0; opacity:0.8;">Resumen Final de Jornada</p>
      </div>
      <div style="padding:30px;">
        <p>Se ha cerrado la jornada operativa con los siguientes resultados:</p>
        <div style="background:#f8fafc; padding:20px; border-radius:12px; margin:20px 0;">
          <div style="margin-bottom:10px;"><strong>EVENTO:</strong> ${session.name}</div>
          <div style="margin-bottom:10px;"><strong>VEHÍCULOS:</strong> ${stats?.total || 0}</div>
          <div style="margin-bottom:10px;"><strong>RECAUDACIÓN:</strong> $${stats?.revenue || 0}</div>
          <div><strong>FECHA CIERRE:</strong> ${new Date().toLocaleString('es-ES')}</div>
        </div>
        <p style="color:#64748b; font-size:0.9rem;">Este es un reporte automático generado por el sistema Valet Eye.</p>
      </div>
    </div>
  `);

  return c.json({ success: true, message: 'Resumen enviado', session_id });
});

app.post('/api/ai/scan-vehicle', async (c) => {
  return c.json({ success: false, error: 'AI not configured' });
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



app.get('/api/photos/:key', async (c) => {
  const key = c.req.param('key');
  const object = await c.env.PHOTOS.get(key);

  if (!object) {
    return c.json({ error: 'Foto no encontrada' }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000'); // Cache por 1 año

  return new Response(object.body, { headers });
});

// ===============================
// ADMINISTRACIÓN
// ===============================
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

// ===============================
// GET PHOTO (R2)
// ===============================
app.get('/api/photos/:plate/:filename', async (c) => {
  const { plate, filename } = c.req.param();
  const key = `photos/${plate}/${filename}`;
  const object = await c.env.PHOTOS.get(key);

  if (!object) return c.notFound();

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);

  return new Response(object.body, { headers });
});

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

app.get('/api/settings', (c) => {
  return c.json({
    company_name: 'EYE STAFF',
    currency: '$',
    theme: 'dark'
  });
});

export default app;

