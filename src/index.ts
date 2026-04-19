import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

// ===============================
// CORS
// ===============================
app.use('*', cors());

// ===============================
// Middleware JWT (protege rutas)
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
    console.log('JWT ERROR:', err);
    return c.json({ error: 'Invalid token' }, 401);
  }
});
// ===============================
// LOGIN (token SIN expiración)
// ===============================
app.post('/api/login', async (c) => {
  const { username, password } = await c.req.json();

  if (username !== 'admin' || password !== '1234') {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const token = await sign(
    {
      id: 1,
      username: 'admin',
      role: 'admin'
    },
    c.env.JWT_SECRET
  );

  return c.json({ token });
});
// ===============================
// CHECK-IN (crear vehículo)
// ===============================
app.post('/api/checkin', async (c) => {
  try {
    const db = c.env.DB;
    const { plate, brand, model, color } = await c.req.json();
    const user = c.get('user');

    if (!plate || !brand || !model || !color) {
      return c.json({ error: 'Todos los campos son obligatorios' }, 400);
    }

    const result = await db
      .prepare(
        `INSERT INTO vehicles (plate, brand, model, color, status, created_at)
         VALUES (?, ?, ?, ?, 'inside', datetime('now'))`
      )
      .bind(plate, brand, model, color)
      .run();

    const vehicleId = result.lastInsertRowId;

    await db
      .prepare(
        `INSERT INTO events (vehicle_id, user_id, event_type, slot_id, created_at)
         VALUES (?, ?, 'CHECKIN', NULL, datetime('now'))`
      )
      .bind(vehicleId, user.id)
      .run();

    return c.json({ success: true, vehicle_id: vehicleId });
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});
// ===============================
// EVENTS (PARKED, MOVED, EXIT)
// ===============================
app.post('/api/events', async (c) => {
  try {
    const db = c.env.DB;
    const { vehicle_id, event_type, slot_id } = await c.req.json();
    const user = c.get('user');

    if (!vehicle_id || !event_type) {
      return c.json({ error: 'vehicle_id y event_type son obligatorios' }, 400);
    }

    const validEvents = ['PARKED', 'MOVED', 'EXIT'];
    if (!validEvents.includes(event_type)) {
      return c.json({ error: 'event_type inválido' }, 400);
    }

    if ((event_type === 'PARKED' || event_type === 'MOVED') && !slot_id) {
      return c.json({ error: 'slot_id es obligatorio para PARKED y MOVED' }, 400);
    }

    await db
      .prepare(
        `INSERT INTO events (vehicle_id, user_id, event_type, slot_id, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      )
      .bind(vehicle_id, user.id, event_type, slot_id || null)
      .run();

    if (event_type === 'PARKED') {
      await db.prepare(`UPDATE vehicles SET status = 'parked' WHERE id = ?`)
        .bind(vehicle_id).run();
    }

    if (event_type === 'MOVED') {
      await db.prepare(`UPDATE vehicles SET status = 'moved' WHERE id = ?`)
        .bind(vehicle_id).run();
    }

    if (event_type === 'EXIT') {
      await db.prepare(`UPDATE vehicles SET status = 'exit' WHERE id = ?`)
        .bind(vehicle_id).run();
    }

    return c.json({ success: true, message: 'Evento registrado correctamente' });
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});
// ===============================
// DASHBOARD
// ===============================
app.get('/api/dashboard', async (c) => {
  try {
    const db = c.env.DB;

    const today = new Date().toISOString().split('T')[0];

    const vehiclesInside = await db
      .prepare(`SELECT COUNT(*) AS count FROM vehicles WHERE status != 'exit'`)
      .first();

    const vehiclesToday = await db
      .prepare(
        `SELECT COUNT(*) AS count FROM vehicles WHERE DATE(created_at) = ?`
      )
      .bind(today)
      .first();

    const eventsToday = await db
      .prepare(
        `SELECT COUNT(*) AS count FROM events WHERE DATE(created_at) = ?`
      )
      .bind(today)
      .first();

    const lastCheckins = await db
      .prepare(
        `SELECT id, plate, brand, model, color, created_at
         FROM vehicles
         ORDER BY created_at DESC
         LIMIT 5`
      )
      .all();

    const lastEvents = await db
      .prepare(
        `SELECT e.id, e.event_type, e.created_at, v.plate
         FROM events e
         JOIN vehicles v ON v.id = e.vehicle_id
         ORDER BY e.created_at DESC
         LIMIT 5`
      )
      .all();

    return c.json({
      vehicles_inside: vehiclesInside.count,
      vehicles_today: vehiclesToday.count,
      events_today: eventsToday.count,
      last_checkins: lastCheckins.results,
      last_events: lastEvents.results
    });
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});
export default app;
