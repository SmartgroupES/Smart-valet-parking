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
// Middleware JWT (protege rutas /api/*)
// ===============================
app.use('/api/*', async (c, next) => {
  const auth = c.req.header('Authorization');
  if (!auth) return c.json({ error: 'Missing token' }, 401);

  const token = auth.replace('Bearer ', '').trim();

  try {
    const payload = await verify(token, c.env.JWT_SECRET);
    c.set('user', payload);
    await next();
  } catch (err) {
    return c.json({ error: 'Invalid token' }, 401);
  }
});

// ===============================
// LOGIN
// ===============================
app.post('/auth/login', async (c) => {
  const { username, password } = await c.req.json();

  const user = await c.env.DB.prepare(
    'SELECT id, username, role FROM users WHERE username = ? AND password = ?'
  )
    .bind(username, password)
    .first();

  if (!user) {
    return c.json({ error: 'Credenciales incorrectas' }, 401);
  }

  const token = await sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24h
    },
    c.env.JWT_SECRET
  );

  return c.json({
    token,
    role: user.role,
    user: user.username
  });
});

// ===============================
// VERIFY TOKEN (para el frontend)
// ===============================
app.get('/auth/verify', async (c) => {
  const auth = c.req.header('Authorization');
  if (!auth) return c.json({ error: 'No token' }, 401);

  const token = auth.replace('Bearer ', '').trim();

  try {
    const payload = await verify(token, c.env.JWT_SECRET);
    return c.json({ valid: true, user: payload });
  } catch (err) {
    return c.json({ error: 'Invalid token' }, 401);
  }
});

// ===============================
// CHECK-IN (chofer)
// ===============================
app.post('/api/events/checkin', async (c) => {
  const { plate, driver } = await c.req.json();
  const user = c.get('user');

  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO vehicles (plate, status) VALUES (?, ?)'
  ).bind(plate, 'checkin').run();

  await c.env.DB.prepare(
    'UPDATE vehicles SET status = ? WHERE plate = ?'
  ).bind('checkin', plate).run();

  const vehicle = await c.env.DB.prepare(
    'SELECT id FROM vehicles WHERE plate = ?'
  ).bind(plate).first<{ id: number }>();

  if (!vehicle) {
    return c.json({ error: 'Error registrando vehículo' }, 500);
  }

  await c.env.DB.prepare(
    'INSERT INTO events (vehicle_id, user_id, event_type) VALUES (?, ?, ?)'
  ).bind(vehicle.id, user.id, 'checkin').run();

  return c.json({ message: 'Check-in registrado' });
});

// ===============================
// CHECK-OUT
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
    'UPDATE vehicles SET status = ? WHERE id = ?'
  ).bind('delivered', vehicle.id).run();

  await c.env.DB.prepare(
    'INSERT INTO events (vehicle_id, user_id, event_type) VALUES (?, ?, ?)'
  ).bind(vehicle.id, user.id, 'checkout').run();

  return c.json({ message: 'Check-out registrado' });
});

// ===============================
// ACTIVE VEHICLES (para el datalist)
// ===============================
app.get('/api/vehicles/active', async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT plate FROM vehicles WHERE status IN ('checkin', 'parked')"
  ).all();
  return c.json({ vehicles: results });
});

// ===============================
// DASHBOARD (supervisor)
// ===============================
app.get('/api/dashboard/today', async (c) => {
  const total = await c.env.DB.prepare(
    "SELECT COUNT(*) AS total FROM events WHERE date(ts) = date('now')"
  ).first<{ total: number }>();

  const checkins = await c.env.DB.prepare(
    "SELECT COUNT(*) AS total FROM events WHERE event_type = 'checkin' AND date(ts) = date('now')"
  ).first<{ total: number }>();

  const checkouts = await c.env.DB.prepare(
    "SELECT COUNT(*) AS total FROM events WHERE event_type = 'checkout' AND date(ts) = date('now')"
  ).first<{ total: number }>();

  return c.json({
    total: total?.total || 0,
    checkins: checkins?.total || 0,
    checkouts: checkouts?.total || 0
  });
});

// ===============================
// PHOTO UPLOAD (R2)
// ===============================
app.post('/api/photos/upload', async (c) => {
  const { plate, image, type } = await c.req.json();
  const key = `photos/${plate}/${type}_${Date.now()}.jpg`;

  // Convertir base64 a ArrayBuffer (suponiendo que viene como data:image/jpeg;base64,...)
  const base64Data = image.split(',')[1];
  const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

  await c.env.PHOTOS.put(key, binaryData, {
    httpMetadata: { contentType: 'image/jpeg' }
  });

  // Guardar referencia en D1
  const vehicle = await c.env.DB.prepare('SELECT id FROM vehicles WHERE plate = ?').bind(plate).first<{id:number}>();
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

