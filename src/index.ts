import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';

export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  JWT_SECRET: string;
}

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

app.use('*', cors());

// ===============================
// VISTA PÚBLICA DEL CLIENTE (HTML)
// ===============================
app.get('/ticket/:code', async (c) => {
  const code = c.req.param('code');
  const vehicle = await c.env.DB.prepare('SELECT * FROM vehicles WHERE ticket_code = ?').bind(code).first();
  
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
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mi Ticket - Valet Eye</title>
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
                <div class="logo">Valet<span>Eye</span></div>
                <div class="status-box">
                    <div class="status-icon">${status.icon}</div>
                    <div class="status-text">${status.text}</div>
                </div>
                <div style="color:#94a3b8; font-size:0.8rem; text-transform:uppercase; letter-spacing:1px;">Vehículo</div>
                <div class="plate">${vehicle.plate}</div>
                <div class="info">
                    <div class="info-row"><span>Ticket:</span><span>${vehicle.ticket_code}</span></div>
                    <div class="info-row"><span>Marca:</span><span>${vehicle.brand || '—'}</span></div>
                    <div class="info-row"><span>Color:</span><span>${vehicle.color || '—'}</span></div>
                </div>
                
                ${vehicle.status === 'parked' ? `
                    <button class="btn" id="reqBtn" onclick="requestCar()">Solicitar mi vehículo</button>
                ` : `
                    <button class="btn" disabled>${status.text}</button>
                `}
                
                <div class="footer">Este es un resguardo digital oficial. Valet Eye System.</div>
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

// Endpoint público para solicitud del cliente
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
// Middleware JWT (protege rutas /api/* EXCEPTO login)
// ===============================
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/staff/login') return next();

  const auth = c.req.header('Authorization');
  if (!auth) return c.json({ error: 'Autorización requerida' }, 401);

  const token = auth.replace('Bearer ', '').trim();

  try {
    const payload = await verify(token, c.env.JWT_SECRET || 'secret');
    c.set('user', payload);
    await next();
  } catch (err) {
    return c.json({ error: 'Token inválido o expirado' }, 401);
  }
});

// ===============================
// STAFF MANAGEMENT
// ===============================
app.get('/api/staff', async (c) => {
  const user = c.get('user');
  if (user.role !== 'supervisor' && user.role !== 'director') {
    return c.json({ error: 'No autorizado' }, 403);
  }

  const staff = await c.env.DB.prepare('SELECT id, name, role, created_at FROM users ORDER BY created_at DESC').all();
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
    const ticketCode = 'V' + Date.now().toString(36).toUpperCase();

    const result = await c.env.DB.prepare(
      `INSERT INTO vehicles 
        (plate, status, ticket_code, owner_name, owner_phone, owner_id_ref, brand, model, color, parking_spot, key_hook, damage_notes, damage_json, fee_amount, valet_in) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      data.plate, 'parked', ticketCode, data.owner_name, data.owner_phone || null, data.owner_id_ref || null,
      data.brand || null, data.model || null, data.color || null, data.parking_spot || null, data.key_hook || null, data.damage_notes || null, data.damage_json || null, data.fee_amount || 0, data.valet_in || null
    ).run();

    const vehicleId = result.meta.last_row_id;

    await c.env.DB.prepare(
      'INSERT INTO events (vehicle_id, user_id, event_type) VALUES (?, ?, ?)'
    ).bind(vehicleId, user.id, 'checkin').run();

    return c.json({ message: 'Check-in registrado', ticket_code: ticketCode, vehicle_id: vehicleId });
  } catch (error: any) {
    return c.json({ error: error.message, stack: error.stack }, 500);
  }
});

// ===============================
// GET VEHICLES LIST
// ===============================
app.get('/api/vehicles', async (c) => {
  const status = c.req.query('status');
  const search = c.req.query('search');

  let query = 'SELECT * FROM vehicles WHERE 1=1';
  const params: any[] = [];

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

// ===============================
// VEHICLES ACTIVE (Datalist)
// ===============================
app.get('/api/vehicles/active', async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT plate FROM vehicles WHERE status IN ('checkin', 'parked', 'pending_retrieval')"
  ).all();
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
  if (!q) return c.json({ error: 'Query required' }, 400);

  const vehicle = await c.env.DB.prepare(
    'SELECT * FROM vehicles WHERE plate = ? OR ticket_code = ?'
  ).bind(q, q).first();

  if (!vehicle) return c.json({ error: 'Not found' }, 404);
  return c.json(vehicle);
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

  const allowedFields = ['status', 'check_out_at', 'valet_out', 'fee_amount', 'fee_paid', 'payment_method', 'key_hook', 'parking_spot', 'damage_json'];
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

  if (body.action) {
    let eventType = body.action.toLowerCase();
    if (eventType.includes('checkout')) eventType = 'checkout';
    await c.env.DB.prepare(
      'INSERT INTO events (vehicle_id, user_id, event_type) VALUES (?, ?, ?)'
    ).bind(id, user?.id || 1, eventType).run();
  }

  return c.json({ success: true });
});

// ===============================
// CHECK-OUT (Legacy POST support)
// ===============================
app.post('/api/events/checkout', async (c) => {
  const { plate } = await c.req.json();
  const user = c.get('user');

  const vehicle = await c.env.DB.prepare(
    'SELECT id FROM vehicles WHERE plate = ?'
  ).bind(plate).first<{ id: number }>();

  if (!vehicle) {
    return c.json({ error: 'Vehículo no encontrado' }, 404);
  }

  await c.env.DB.prepare(
    'UPDATE vehicles SET status = ?, check_out_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind('retrieved', vehicle.id).run();

  await c.env.DB.prepare(
    'INSERT INTO events (vehicle_id, user_id, event_type) VALUES (?, ?, ?)'
  ).bind(vehicle.id, user.id, 'checkout').run();

  return c.json({ message: 'Check-out registrado' });
});

// ===============================
// DASHBOARD (supervisor)
// ===============================
app.get('/api/dashboard/today', async (c) => {
  const total = await c.env.DB.prepare(
    "SELECT COUNT(*) AS total FROM vehicles WHERE status IN ('parked', 'pending_retrieval')"
  ).first<{ total: number }>();

  const checkins = await c.env.DB.prepare(
    "SELECT COUNT(*) AS total FROM events WHERE event_type = 'checkin' AND date(ts) = date('now')"
  ).first<{ total: number }>();
    "SELECT COUNT(*) AS count FROM events WHERE event_type = 'checkin' AND date(ts) = date('now')"
  ).first<{ count: number }>();

  const checkouts = await c.env.DB.prepare("SELECT COUNT(id) as count FROM events WHERE event_type = 'checkout' AND date(created_at) = date('now')").first<{ count: number }>();
  const earnings = await c.env.DB.prepare("SELECT SUM(fee_amount) as total FROM vehicles WHERE fee_paid = 1 AND date(check_out_at) = date('now')").first<{ total: number }>();

  // Ocupación
  const slotsCount = await c.env.DB.prepare("SELECT COUNT(*) as count FROM slots").first<{ count: number }>();
  const occupiedCount = await c.env.DB.prepare("SELECT COUNT(*) as count FROM vehicles WHERE status NOT IN ('retrieved') AND parking_spot IS NOT NULL").first<{ count: number }>();

  return c.json({
    total: total?.count || 0,
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

app.get('/api/vehicles/:id/photos', async (c) => {
  const id = c.req.param('id');
  const photos = await c.env.DB.prepare('SELECT id, photo_type as type, photo_url as url FROM photos WHERE vehicle_id = ? ORDER BY created_at DESC')
    .bind(id)
    .all();
  
  return c.json({ photos: photos.results });
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
// PHOTO UPLOAD (R2)
// ===============================
app.post('/api/photos/upload', async (c) => {
  const { plate, image, type } = await c.req.json();
  const key = `photos/${plate}/${type}_${Date.now()}.jpg`;

  const base64Data = image.split(',')[1];
  const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

  await c.env.PHOTOS.put(key, binaryData, {
    httpMetadata: { contentType: 'image/jpeg' }
  });

  const vehicle = await c.env.DB.prepare('SELECT id FROM vehicles WHERE plate = ? ORDER BY created_at DESC LIMIT 1').bind(plate).first<{id:number}>();
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

export default app;

