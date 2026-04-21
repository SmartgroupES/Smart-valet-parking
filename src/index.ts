import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';

export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  JWT_SECRET: string;
}

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// ===============================
// CORS
// ===============================
app.use('*', cors());

// ===============================
// LOGIN (Frontend)
// ===============================
app.post('/api/staff/login', async (c) => {
  const { pin } = await c.req.json();
  
  // Aceptamos 1234 como master PIN por ahora
  if (pin !== '1234') {
    return c.json({ error: 'PIN inválido' }, 401);
  }

  const token = await sign(
    {
      id: 1,
      name: 'Admin Valet',
      role: 'supervisor',
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24h
    },
    c.env.JWT_SECRET || 'secret'
  );

  return c.json({
    id: 1,
    name: 'Admin Valet',
    role: 'supervisor',
    token
  });
});

// ===============================
// Middleware JWT (protege rutas /api/* EXCEPTO login)
// ===============================
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/staff/login') {
    return next();
  }

  const auth = c.req.header('Authorization');
  if (!auth) {
    // Bypass para facilitar la prueba de la V1
    c.set('user', { id: 1, name: 'Admin', role: 'supervisor' });
    return next();
  }

  const token = auth.replace('Bearer ', '').trim();

  try {
    const payload = await verify(token, c.env.JWT_SECRET || 'secret');
    c.set('user', payload);
    await next();
  } catch (err) {
    // En caso de error de token, dejamos pasar la petición para pruebas locales
    c.set('user', { id: 1, name: 'Admin', role: 'supervisor' });
    await next();
  }
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
        (plate, status, ticket_code, owner_name, owner_phone, owner_id_ref, brand, model, color, parking_spot, damage_notes, fee_amount, valet_in) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      data.plate, 'parked', ticketCode, data.owner_name, data.owner_phone || null, data.owner_id_ref || null,
      data.brand || null, data.model || null, data.color || null, data.parking_spot || null, data.damage_notes || null, data.fee_amount || 0, data.valet_in || null
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

  const allowedFields = ['status', 'check_out_at', 'valet_out', 'fee_amount', 'fee_paid', 'payment_method'];
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

  const checkouts = await c.env.DB.prepare(
    "SELECT COUNT(*) AS total FROM events WHERE event_type = 'checkout' AND date(ts) = date('now')"
  ).first<{ total: number }>();

  const revenue = await c.env.DB.prepare(
    "SELECT SUM(fee_amount) AS total FROM vehicles WHERE fee_paid = 1 AND date(check_out_at) = date('now')"
  ).first<{ total: number }>();

  return c.json({
    total: total?.total || 0,
    checkins: checkins?.total || 0,
    checkouts: checkouts?.total || 0,
    revenue_today: revenue?.total || 0
  });
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

export default app;

