import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';
import Stripe from 'stripe';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import PostalMime from 'postal-mime';
import * as XLSX from 'xlsx';


export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  JWT_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  ASSETS: { fetch: typeof fetch };
  RESEND_API_KEY?: string;
  ADMIN_KEY?: string;
  DIRECTOR_EMAIL?: string;
  OFFICE_GROUP_ID?: string;
  TELEGRAM_BOT_TOKEN?: string;
  AI: any;
  WHATSAPP_BOT_URL?: string;
  WHATSAPP_BOT_API_KEY?: string;
  BREVO_API_KEY?: string;
  DEVELOPMENT_API_KEY?: string;
  IS_STAGING?: string;
}

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

async function logEvent(env: any, vehicleId: number, userId: number | null, eventType: string, details: string = '') {
  try {
    await env.DB.prepare('INSERT INTO events (vehicle_id, user_id, event_type, details) VALUES (?, ?, ?, ?)')
      .bind(vehicleId, userId || 1, eventType, details)
      .run();
  } catch (e) { console.error('Log Error:', e); }
}

async function getSubscribedEmails(env: Env, reportId: string): Promise<string[]> {
  try {
    let fieldMap: any = {
        'convocatoria': 'convocatoria',
        'cumpleanos': 'cumpleanos',
        'dossier': 'dossier_pdf',
        'excel': 'bbdd_excel',
        'nominas': 'nominas',
        'permisos': 'permisos',
        'plantilla_rrhh': 'plantilla_rrhh',
        'actualizacion_datos': 'actualizacion_datos',
        'credenciales': 'credenciales',
        'cierre_html': 'cierre_html'
    };
    let field = fieldMap[reportId] || reportId;
    const validFields = ['convocatoria', 'cumpleanos', 'dossier_pdf', 'bbdd_excel', 'nominas', 'permisos', 'plantilla_rrhh', 'actualizacion_datos', 'credenciales', 'cierre_html', 'apertura_evento'];
    if (!validFields.includes(field)) return [];

    const subs = await env.DB.prepare(`
      SELECT u.email FROM user_report_subscriptions rs
      JOIN users u ON rs.user_id = u.id
      WHERE rs.${field} = 1 AND u.email IS NOT NULL AND u.email != '' AND u.is_active = 1
    `).all();
    if (subs && subs.results) {
      return subs.results.map((r: any) => r.email);
    }
  } catch (e) {
    console.error('Error fetching subscriptions for ' + reportId, e);
  }
  return [];
}

function formatFull24h(date: Date): string {
  return date.toLocaleString('es-VE', {
    timeZone: 'America/Caracas',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).replace(',', '');
}

export function sanitizePhoneNumber(phone: string): string | null {
  // Eliminar todo lo que no sea dígito
  let clean = phone.replace(/\D/g, '');

  // 1. España (Prefijo 34, empieza con 6 o 7 si tiene 9 dígitos, o ya viene con 34 y 9 dígitos)
  if (clean.startsWith('34') && clean.length === 11 && (clean[2] === '6' || clean[2] === '7')) {
    return clean;
  }
  if (clean.length === 9 && (clean.startsWith('6') || clean.startsWith('7'))) {
    return '34' + clean;
  }

  // 2. Estados Unidos (Prefijo 1, ej: 786... u otros códigos de área de 10 dígitos)
  // Si empieza con 786 y tiene 10 dígitos, añadir prefijo 1
  if (clean.length === 10 && clean.startsWith('786')) {
    return '1' + clean;
  }
  // Si tiene 11 dígitos y empieza con 1, consideramos que ya tiene el prefijo de EE.UU.
  if (clean.length === 11 && clean.startsWith('1')) {
    return clean;
  }

  // 3. Venezuela (Por defecto, prefijo 58)
  // Si empieza con 0 y tiene 11 dígitos (ej. 04121234567) -> quitar 0 y agregar 58
  if (clean.length === 11 && clean.startsWith('0')) {
    return '58' + clean.substring(1);
  }
  // Si tiene 10 dígitos y empieza con 4 (ej. 4121234567) -> agregar 58
  if (clean.length === 10 && clean.startsWith('4')) {
    return '58' + clean;
  }
  // Si ya tiene 58 y tiene 12 dígitos, dejarlo igual
  if (clean.length === 12 && clean.startsWith('58')) {
    return clean;
  }

  // Si no coincide con ninguna regla de validación de España, Estados Unidos o Venezuela, es inválido.
  return null;
}

// Iniciar base de datos de asistencia si no existe
async function initDatabase(db: D1Database) {
  // Tabla de asistencia
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS staff_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      session_id INTEGER,
      type TEXT, -- 'entry', 'exit', 'break_start', 'break_end'
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Tabla de matriz de permisos personalizados por usuario
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS user_permissions_matrix (
      user_id INTEGER PRIMARY KEY,
      valet_ve INTEGER DEFAULT 0,
      valet_mod INTEGER DEFAULT 0,
      eventos_ve INTEGER DEFAULT 0,
      eventos_mod INTEGER DEFAULT 0,
      admin_ve INTEGER DEFAULT 0,
      admin_mod INTEGER DEFAULT 0,
      vip_ve INTEGER DEFAULT 0,
      vip_mod INTEGER DEFAULT 0,
      seg_ve INTEGER DEFAULT 0,
      seg_mod INTEGER DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS user_report_subscriptions (
      user_id INTEGER PRIMARY KEY,
      convocatoria INTEGER DEFAULT 0,
      cumpleanos INTEGER DEFAULT 0,
      dossier_pdf INTEGER DEFAULT 0,
      bbdd_excel INTEGER DEFAULT 0,
      nominas INTEGER DEFAULT 0,
      permisos INTEGER DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `).run();

  // Tabla de auditoría (RBAC)
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT,
      details TEXT,
      ip TEXT,
      device TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Tabla de reportes de eventos cerrados (BBDD DE EVENTOS)
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS event_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      session_name TEXT,
      event_type TEXT,
      closed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_vehicles INTEGER DEFAULT 0,
      total_staff INTEGER DEFAULT 0,
      pdf_r2_key TEXT,
      excel_r2_key TEXT,
      summary_json TEXT,
      sent_emails_history TEXT DEFAULT '[]'
    )
  `).run();

  // Ensure columns in tables
  try { await db.prepare("ALTER TABLE event_reports ADD COLUMN sent_emails_history TEXT DEFAULT '[]'").run(); } catch (e) { }
  try { await db.prepare('ALTER TABLE users ADD COLUMN bank_name TEXT').run(); } catch (e) { }
  try { await db.prepare('ALTER TABLE users ADD COLUMN bank_account TEXT').run(); } catch (e) { }
  try { await db.prepare('ALTER TABLE users ADD COLUMN carnet_url TEXT').run(); } catch (e) { }
  try { await db.prepare('ALTER TABLE users ADD COLUMN profile_admin TEXT').run(); } catch (e) { }
  try { await db.prepare('ALTER TABLE users ADD COLUMN profile_opera TEXT').run(); } catch (e) { }
  try { await db.prepare('ALTER TABLE users ADD COLUMN eye_id TEXT').run(); } catch (e) { }
  try { await db.prepare('ALTER TABLE users ADD COLUMN last_login DATETIME').run(); } catch (e) { }
  try { await db.prepare('ALTER TABLE user_permissions_matrix ADD COLUMN traslados_ve INTEGER DEFAULT 0').run(); } catch (e) { }
  try { await db.prepare('ALTER TABLE user_permissions_matrix ADD COLUMN traslados_mod INTEGER DEFAULT 0').run(); } catch (e) { }
  try { await db.prepare('ALTER TABLE user_permissions_matrix ADD COLUMN guardia_ve INTEGER DEFAULT 0').run(); } catch (e) { }
  try { await db.prepare('ALTER TABLE user_permissions_matrix ADD COLUMN guardia_mod INTEGER DEFAULT 0').run(); } catch (e) { }
  try { await db.prepare('ALTER TABLE user_permissions_matrix ADD COLUMN custodia_ve INTEGER DEFAULT 0').run(); } catch (e) { }
  try { await db.prepare('ALTER TABLE user_permissions_matrix ADD COLUMN custodia_mod INTEGER DEFAULT 0').run(); } catch (e) { }
  try { await db.prepare('ALTER TABLE budgets ADD COLUMN is_deleted INTEGER DEFAULT 0').run(); } catch (e) { }
  try { await db.prepare('ALTER TABLE user_report_subscriptions ADD COLUMN apertura_evento INTEGER DEFAULT 0').run(); } catch (e) { }

  // Tabla de Mensajería Interna (Chat)
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS chat_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_by INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(created_by) REFERENCES users(id)
      )
    `).run();
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS chat_group_members (
        group_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        PRIMARY KEY(group_id, user_id),
        FOREIGN KEY(group_id) REFERENCES chat_groups(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `).run();
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER NOT NULL,
        recipient_id INTEGER,
        group_id INTEGER,
        session_id INTEGER,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(sender_id) REFERENCES users(id),
        FOREIGN KEY(recipient_id) REFERENCES users(id),
        FOREIGN KEY(group_id) REFERENCES chat_groups(id),
        FOREIGN KEY(session_id) REFERENCES sessions(id)
      )
    `).run();
    try { await db.prepare('ALTER TABLE chat_messages ADD COLUMN group_id INTEGER REFERENCES chat_groups(id)').run(); } catch (e) { }
  } catch (e) { }

  // Telegram integration
  try { await db.prepare('ALTER TABLE users ADD COLUMN telegram_chat_id TEXT').run(); } catch (e) { }
  try { await db.prepare('ALTER TABLE users ADD COLUMN telegram_link_token TEXT').run(); } catch (e) { }

  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS telegram_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_message_id TEXT,
        sender_chat_id TEXT NOT NULL,
        sender_name TEXT,
        text TEXT,
        latitude REAL,
        longitude REAL,
        is_incoming INTEGER DEFAULT 1,
        ts TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch (e) { }
}

async function logAudit(env: Env, userId: number, action: string, details: string = '', c?: any) {
  const ip = c ? c.req.header('cf-connecting-ip') || 'unknown' : 'system';
  const device = c ? c.req.header('user-agent') || 'unknown' : 'system';
  try {
    await env.DB.prepare('INSERT INTO audit_logs (user_id, action, details, ip, device) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, action, details, ip, device)
      .run();
  } catch (e) { console.error('Audit Error:', e); }
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
  const val = value.toUpperCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const eq = await env.DB.prepare('SELECT standard_value FROM equivalences WHERE category = ? AND original_value = ?')
    .bind(category, val)
    .first<{ standard_value: string }>();
  return eq ? eq.standard_value : val;
}

function normalizeName(name: string): string {
  return name.toUpperCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

async function saveBase64ToR2(env: Env, base64: string, path: string): Promise<string> {
  try {
    const [header, data] = base64.split(',');
    const mime = header.split(':')[1].split(';')[0];
    const binary = atob(data);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);

    await env.PHOTOS.put(path, array, { httpMetadata: { contentType: mime } });
    return path;
  } catch (e) {
    console.error('R2 Save Error:', e);
    throw e;
  }
}

app.use('*', cors());

// Kill sw.js
app.get('/sw.js', (c) => {
  c.header('Content-Type', 'application/javascript');
  return c.text('// SW Disabled', 200);
});

app.get('/api/health', (c) => {
  return c.json({ status: 'ok' });
});

app.get('/api/office/stats', async (c) => {
  return c.json({
    project: "Valet Eye",
    status: "up",
    metrics: [
      { label: "Personal Activo", value: "8", trend: "up" },
      { label: "Vehículos Custodia", value: "45", trend: "neutral" },
      { label: "Eventos Hoy", value: "3", trend: "up" }
    ],
    lastUpdate: new Date().toISOString()
  }, 200, {
    'Access-Control-Allow-Origin': 'https://office.kosak.es',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
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

// --- PUBLIC JOB APPLICATIONS ---
app.get('/join', async (c) => {
  const res = await c.env.ASSETS.fetch(new Request(new URL('/join.html', c.req.url)));
  const response = new Response(res.body, res);
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  return response;
});

app.post('/api/staff/apply', async (c) => {
  try {
    const { name, cedula, email, phone, address, birth_date, experience, photo } = await c.req.json();

    let photoUrl = '';
    if (photo && photo.startsWith('data:image')) {
      const filename = `apps/${cedula.replace(/[^a-zA-Z0-9]/g, '')}_${Date.now()}.jpg`;
      await saveBase64ToR2(c.env, photo, filename);
      photoUrl = filename;
    }

    await c.env.DB.prepare('INSERT INTO job_applications (name, cedula, email, phone, address, birth_date, experience, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(name, cedula, email, phone, address, birth_date, experience, photoUrl)
      .run();

    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ===============================
// VERIFY PIN
// ===============================
app.post('/api/verify-pin', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ success: false, error: 'No autorizado' }, 401);
    const token = authHeader.split(' ')[1];
    const payload = await verify(token, c.env.JWT_SECRET || 'secret', 'HS256') as any;
    const currentUserId = payload.id;

    const { pin } = await c.req.json();
    if (!pin) return c.json({ success: false, error: 'PIN requerido' }, 400);

    let dbUser: any = null;
    if (currentUserId === 1) {
      dbUser = { pin_hash: 'corifede1416' };
    } else {
      dbUser = await c.env.DB.prepare('SELECT pin_hash FROM users WHERE id = ?').bind(currentUserId).first<any>();
    }

    if (!dbUser || (dbUser.pin_hash || '').toString().toLowerCase() !== pin.toString().trim().toLowerCase()) {
      return c.json({ success: false, error: 'Clave incorrecta' }, 400);
    }
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ===============================
// GESTIÓN DE SESIONES (EVENTOS)
// ===============================
app.get('/api/sessions/without-budget', async (c) => {
  try {
    const res = await c.env.DB.prepare(`SELECT * FROM sessions WHERE (budget_id IS NULL OR budget_id = '') AND (status = 'planning' OR status = 'active') ORDER BY started_at DESC`).all();
    return c.json({ success: true, data: res.results });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.get('/api/sessions/active', async (c) => {
  const sessionsRes = await c.env.DB.prepare('SELECT * FROM sessions WHERE status IN ("planning", "active") ORDER BY id ASC').all();
  const sessions = (sessionsRes.results || []) as any[];

  // Fetch assigned staff and vehicle counts for each session
  for (let s of sessions) {
    // Si no tiene internal_key (registros viejos), usamos el name
    if (!s.internal_key) s.internal_key = s.name;

    if (s.type === 'guardia diurna/nocturna') {
      const gRes = await c.env.DB.prepare('SELECT * FROM guardia_details WHERE session_id = ?').bind(s.id).first();
      s.guardia_details = gRes || null;
    }

    // Staff details
    const staffRes = await c.env.DB.prepare("SELECT id, name, role, cedula FROM users WHERE current_session_id = ? OR instr(',' || current_session_id || ',', ',' || CAST(? AS TEXT) || ',') > 0").bind(String(s.id), String(s.id)).all();
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

app.get('/api/sessions/active/current', async (c) => {
  const active = await c.env.DB.prepare('SELECT * FROM sessions WHERE status = "active" ORDER BY id DESC LIMIT 1').first<any>();
  if (!active) return c.json({ error: 'No hay sesión activa' }, 404);
  return c.json(active);
});

app.get('/api/sessions/active/stats', async (c) => {
  const active = await c.env.DB.prepare('SELECT id FROM sessions WHERE status = "active" ORDER BY id DESC LIMIT 1').first<any>();
  if (!active) return c.json({ reservations: 0, recibidos: 0, custodia: 0, entregados: 0 });

  const sessionId = active.id;
  const stats = await c.env.DB.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM vehicles WHERE session_id = ? AND status = 'pre-registered') as reservations,
      (SELECT COUNT(*) FROM vehicles WHERE session_id = ? AND status = 'parked') as recibidos,
      (SELECT COUNT(*) FROM vehicles WHERE session_id = ? AND status NOT IN ('delivered', 'retrieved', 'pre-registered')) as custodia,
      (SELECT COUNT(*) FROM vehicles WHERE session_id = ? AND status IN ('delivered', 'retrieved')) as entregados
  `).bind(sessionId, sessionId, sessionId, sessionId).first<any>();

  return c.json(stats);
});

app.get('/api/sessions/next-correlativo', async (c) => {
  const result = await c.env.DB.prepare('SELECT MAX(id) as maxId FROM sessions').first<{ maxId: number | null }>();
  const next = (result?.maxId || 0) + 1;
  return c.json({ next });
});

app.get('/api/admin/clients', async (c) => {
  const query = `
    WITH CombinedClients AS (
      SELECT 
        UPPER(TRIM(owner_name)) as owner_name, 
        owner_phone, 
        owner_id_ref,
        COUNT(v.id) as total_visits,
        GROUP_CONCAT(s.name || '|' || v.check_in_at || '|' || v.plate, '::') as visit_history,
        'VALET PARKING' as event_type
      FROM vehicles v
      JOIN sessions s ON v.session_id = s.id
      WHERE owner_name IS NOT NULL AND owner_name != ''
      GROUP BY UPPER(TRIM(owner_name)), owner_phone

      UNION ALL

      SELECT 
        UPPER(TRIM(name)) as owner_name, 
        phone as owner_phone, 
        '' as owner_id_ref,
        1 as total_visits,
        'PRESUPUESTO|' || created_at || '|N/A' as visit_history,
        event_type
      FROM valet_clients
    )
    SELECT 
        owner_name, 
        GROUP_CONCAT(DISTINCT owner_phone) as owner_phone, 
        MAX(owner_id_ref) as owner_id_ref, 
        SUM(total_visits) as total_visits,
        GROUP_CONCAT(visit_history, '::') as visit_history,
        GROUP_CONCAT(DISTINCT event_type) as event_types
    FROM CombinedClients
    GROUP BY owner_name
    ORDER BY owner_name ASC
  `;
  const result = await c.env.DB.prepare(query).all();
  const clients = (result.results || []).map((cl: any) => ({
    ...cl,
    event_types: cl.event_types || 'VALET PARKING',
    history: ((cl.visit_history as string) || '').split('::').filter((h: string) => h.includes('|')).map((h: string) => {
      const [event, date, plate] = h.split('|');
      return { event: event || 'S/E', date, plate };
    })
  }));
  return c.json({ clients });
});

app.post('/api/presupuestos/client', async (c) => {
  try {
    const { name, phone, email, event_type } = await c.req.json();
    if (!name) return c.json({ success: false, error: 'Name is required' }, 400);

    // Check if client exists to avoid exact duplicates
    const checkQuery = `SELECT * FROM valet_clients WHERE UPPER(TRIM(name)) = UPPER(TRIM(?))`;
    const existing = await c.env.DB.prepare(checkQuery).bind(name).first();

    if (existing) {
      // Update phone and email if they were empty
      if (!existing.phone && phone) {
        await c.env.DB.prepare(`UPDATE valet_clients SET phone = ?, email = ? WHERE id = ?`).bind(phone || '', email || '', existing.id).run();
      }
    } else {
      const insertQuery = `INSERT INTO valet_clients (name, phone, email, event_type) VALUES (?, ?, ?, ?)`;
      await c.env.DB.prepare(insertQuery).bind(name, phone || '', email || '', event_type || 'PRESUPUESTO').run();
    }

    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});
app.get('/api/presupuestos', async (c) => {
  try {
    const result = await c.env.DB.prepare('SELECT * FROM budgets WHERE is_deleted = 0 ORDER BY timestamp DESC').all();
    return c.json({ success: true, budgets: result.results });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.get('/api/presupuestos/next-id', async (c) => {
  try {
    const empresa = c.req.query('empresa') || 'EYE STAFF';
    const currentYear = new Date().getFullYear();
    const prefix = empresa.toUpperCase() === 'RENTAEQUIPOS' ? 'REN' : 'EYE';

    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS budget_company_seq (
        empresa TEXT,
        year INTEGER,
        seq INTEGER DEFAULT 0,
        PRIMARY KEY (empresa, year)
      )
    `).run();

    const seqData = await c.env.DB.prepare('SELECT seq FROM budget_company_seq WHERE empresa = ? AND year = ?').bind(empresa, currentYear).first();
    const nextSeq = seqData ? (seqData.seq as number) + 1 : 1;
    const nextId = `${prefix}-${String(nextSeq).padStart(3, '0')}`;

    return c.json({ success: true, nextId });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.post('/api/presupuestos', async (c) => {
  try {
    const data = await c.req.json();
    const currentYear = new Date().getFullYear();

    if (Array.isArray(data)) {
      // Bulk migration
      for (const b of data) {
        await c.env.DB.prepare(`
          INSERT OR IGNORE INTO budgets (id, empresa, evento, fecha, monto, estatus, action, form_data, items_data, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          b.id, b.empresa, b.evento, b.fecha, b.monto, b.estatus || 'GENERADO', b.action || 'guardar',
          JSON.stringify(b.form || {}), JSON.stringify(b.items || []), b.timestamp || new Date().getTime()
        ).run();
      }
      return c.json({ success: true });
    }

    const empresaVal = data.form?.empresaEmisora || data.empresa || 'EYE STAFF';
    const prefix = empresaVal.toUpperCase() === 'RENTAEQUIPOS' ? 'REN' : 'EYE';

    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS budget_company_seq (
        empresa TEXT,
        year INTEGER,
        seq INTEGER DEFAULT 0,
        PRIMARY KEY (empresa, year)
      )
    `).run();

    // Generate new correlative
    let seq = 1;
    const seqData = await c.env.DB.prepare('SELECT seq FROM budget_company_seq WHERE empresa = ? AND year = ?').bind(empresaVal, currentYear).first();
    if (seqData) {
      seq = (seqData.seq as number) + 1;
      await c.env.DB.prepare('UPDATE budget_company_seq SET seq = ? WHERE empresa = ? AND year = ?').bind(seq, empresaVal, currentYear).run();
    } else {
      await c.env.DB.prepare('INSERT INTO budget_company_seq (empresa, year, seq) VALUES (?, ?, 1)').bind(empresaVal, currentYear).run();
    }

    const correlativo = `${prefix}-${String(seq).padStart(3, '0')}`;

    await c.env.DB.prepare(`
      INSERT INTO budgets (id, empresa, evento, fecha, monto, estatus, action, form_data, items_data, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      correlativo, data.empresa, data.evento, data.fecha, data.monto, data.estatus || 'GENERADO', data.action || 'guardar',
      JSON.stringify(data.form || {}), JSON.stringify(data.items || []), data.timestamp || new Date().getTime()
    ).run();

    if (data.sessionId) {
      await c.env.DB.prepare('UPDATE sessions SET budget_id = ? WHERE id = ?').bind(correlativo, data.sessionId).run();
    }

    return c.json({ success: true, id: correlativo });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.put('/api/presupuestos/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const data = await c.req.json();
    const prev = await c.env.DB.prepare('SELECT estatus FROM budgets WHERE id = ?').bind(id).first<any>();

    await c.env.DB.prepare(`
      UPDATE budgets SET empresa = ?, evento = ?, fecha = ?, monto = ?, estatus = ?, action = ?, form_data = ?, items_data = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      data.empresa, data.evento, data.fecha, data.monto, data.estatus, data.action || 'guardar',
      JSON.stringify(data.form || {}), JSON.stringify(data.items || []), id
    ).run();

    if (prev && prev.estatus !== 'APROBADO' && data.estatus === 'APROBADO') {
      if (c.env.DIRECTOR_EMAIL) {
        const html = `
          <h2 style="color: #22c55e;">Presupuesto Aprobado</h2>
          <p>El presupuesto <strong>#${data.form?.correlativo || id}</strong> para el evento <strong>${data.evento}</strong> ha cambiado a estado APROBADO.</p>
          <p>Por favor, ingrese a la <strong>Gestión de Listas</strong> en el sistema para asignar los empleados correspondientes y finalizar la programación del evento.</p>
        `;
        const subject = `PRESUPUESTO APROBADO: #${data.form?.correlativo || id} - ${data.evento}`;
        await sendEmail(c.env, c.env.DIRECTOR_EMAIL as string, subject, html, undefined, undefined, undefined, 'EYE STAFF')
          .catch(e => console.error("Error sending email on budget approval", e));
      }
    }
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.delete('/api/presupuestos/:id', async (c) => {
  try {
    const id = c.req.param('id');
    // Soft delete el presupuesto
    await c.env.DB.prepare('UPDATE budgets SET is_deleted = 1 WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.post('/api/presupuestos/send-email', async (c) => {
  try {
    const { to, subject, pdfData, filename, senderName } = await c.req.json();

    const fromName = senderName || 'EYE STAFF';
    const html = `<p>Hola,</p><p>Adjunto información referente al presupuesto solicitado.</p><p>Atentamente,<br>${fromName === 'RENTAEQUIPOS' ? 'Rentaequipos' : 'Eye Staff'}</p>`;
    const attachments = [{ name: filename, content: pdfData }];
    
    await sendEmail(c.env, to, subject, html, attachments, undefined, undefined, fromName);

    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.post('/api/presupuestos/notify-hr', async (c) => {
  try {
    const data = await c.req.json();
    const budgetId = data.id;
    const empresa = data.empresa || 'N/A';
    const evento = data.evento || 'N/A';
    const fecha = data.fecha || 'N/A';
    const tipo = (data.form && data.form.tipoEvento) ? data.form.tipoEvento : 'N/A';

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #2563eb;">Nuevo Presupuesto Aprobado</h2>
        <p>Se ha aprobado un nuevo presupuesto que requiere asignación de personal.</p>
        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p><b>Presupuesto #:</b> ${budgetId}</p>
          <p><b>Empresa/Cliente:</b> ${empresa}</p>
          <p><b>Evento:</b> ${evento}</p>
          <p><b>Fecha:</b> ${fecha}</p>
          <p><b>Tipo de Servicio:</b> ${tipo}</p>
        </div>
        <p>Haz clic en el siguiente botón para crear el evento y asignar personal:</p>
        <a href="https://eye-staff.app/?action=create_session_from_budget&budget_id=${budgetId}" 
           style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">
           CREAR EVENTO EN GESTIÓN DE LISTAS
        </a>
      </div>
    `;

    const subject = `NUEVO PRESUPUESTO APROBADO - Asignación de Personal (Ref: #${budgetId})`;
    await sendEmail(c.env, c.env.DIRECTOR_EMAIL as string, subject, htmlBody, undefined, undefined, undefined, 'EYE STAFF');

    return c.json({ success: true, data: {} });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// --- ENVÍO MASIVO DE REPORTES (ENTORNO DE DESARROLLO) ---
app.post('/api/send-bulk-reports', async (c) => {
  try {
    const { employeeIds, reportType } = await c.req.json();
    if (!employeeIds || !Array.isArray(employeeIds)) {
      return c.json({ success: false, error: 'employeeIds array is required' }, 400);
    }

    // Requerimiento: Configurar el remitente como solicitado para pruebas
    const fromAddress = 'EYE STAFF (TEST) <eyestaff.ncarrillo@gmail.com>';

    // Consultar D1 para obtener los empleados
    const placeholders = employeeIds.map(() => '?').join(',');
    const query = `SELECT id, name, email FROM users WHERE id IN (${placeholders})`;
    const employeesData = await c.env.DB.prepare(query).bind(...employeeIds).all();
    const employees = employeesData.results || [];

    const results = {
      successCount: 0,
      failureCount: 0,
      failures: [] as any[]
    };

    console.log(`[BULK] Iniciando envío de ${reportType} a ${employees.length} empleados.`);

    // Promise.all para enviar correos asincrónicamente con control individual
    await Promise.all(employees.map(async (emp: any) => {
      try {
        if (!emp.email) throw new Error('Usuario no tiene correo registrado');

        const mailPayload = {
          from: fromAddress,
          to: emp.email,
          subject: `[TEST DESARROLLO] Simulación: ${reportType}`,
          html: `
              <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                <h2 style="color: #2563eb;">Reporte de Prueba</h2>
                <p>Hola <strong>${emp.name}</strong>,</p>
                <p>Este es un envío simulado desde el panel de desarrollo para verificar la carga masiva.</p>
                <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0;">
                  <p><b>Tipo de Reporte:</b> ${reportType}</p>
                </div>
                <p>Por favor ignorar este mensaje.</p>
              </div>
            `
        };

        // Lógica de motor de envío
        // Usa GMAIL / BREVO / MAILGUN usando variables de entorno de desarrollo
        if (c.env.DEVELOPMENT_API_KEY) {
          // Ejemplo de fetch a intermediario HTTP usando la key (e.g. Mailgun/Resend)
          // Aquí usamos Resend si DEVELOPMENT_API_KEY es de Resend para mantener consistencia
          const resp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${c.env.DEVELOPMENT_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: mailPayload.from,
              to: [mailPayload.to],
              subject: mailPayload.subject,
              html: mailPayload.html
            })
          });

          if (!resp.ok) {
            const errData = await resp.text();
            throw new Error(`API Error: ${errData}`);
          }
        } else {
          // SIMULACIÓN (si no hay keys configuradas, registra en consola para testeo)
          console.log(`[SIMULATED EMAIL] To: ${mailPayload.to} | Subject: ${mailPayload.subject}`);
          // Simulamos un retraso de red
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        results.successCount++;
        console.log(`✅ [BULK] Éxito enviando a ${emp.email}`);
      } catch (err: any) {
        results.failureCount++;
        results.failures.push({ id: emp.id, email: emp.email, status: 'error', error: err.message });
        console.error(`❌ [BULK] Error enviando a ${emp.email}: ${err.message}`);
      }
    }));

    console.log(`[BULK] Envío finalizado. Éxitos: ${results.successCount}, Fallos: ${results.failureCount}`);
    return c.json({ success: true, ...results });
  } catch (e: any) {
    console.error('[BULK] Error crítico en el endpoint:', e);
    return c.json({ success: false, error: e.message }, 500);
  }
});

// --- CONTROL DE ACCESOS DIGITAL ---
app.get('/api/accesos/:session_id/guests', async (c) => {
  try {
    const sessionId = c.req.param('session_id');
    const { results } = await c.env.DB.prepare('SELECT * FROM access_control_guests WHERE session_id = ? ORDER BY created_at DESC')
      .bind(sessionId).all();
    return c.json({ success: true, data: results });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.post('/api/accesos/:session_id/guests', async (c) => {
  try {
    const sessionId = c.req.param('session_id');
    const data = await c.req.json();
    if (!data.name) return c.json({ success: false, error: 'Name is required' }, 400);

    const qrCodeId = data.qr_code_id || `QR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const type = data.guest_type || 'INVITADO';

    await c.env.DB.prepare('INSERT INTO access_control_guests (session_id, name, qr_code_id, guest_type, phone, email) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(sessionId, data.name, qrCodeId, type, data.phone || null, data.email || null)
      .run();

    return c.json({ success: true, qr_code_id: qrCodeId });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.post('/api/accesos/:session_id/guests/bulk', async (c) => {
  try {
    const sessionId = c.req.param('session_id');
    const { guests } = await c.req.json();
    if (!guests || !Array.isArray(guests)) return c.json({ success: false, error: 'Invalid data format' }, 400);

    let added = 0;
    // Basic loop insertion for bulk payload
    for (const g of guests) {
      if (!g.name) continue;
      const qrCodeId = `QR-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const type = g.guest_type || 'INVITADO';
      await c.env.DB.prepare('INSERT INTO access_control_guests (session_id, name, qr_code_id, guest_type, phone, email) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(sessionId, g.name.trim(), qrCodeId, type.trim().toUpperCase(), g.phone || null, g.email || null)
        .run();
      added++;
    }
    return c.json({ success: true, added });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.get('/acceso/qr/:qr_id', async (c) => {
  const qrId = c.req.param('qr_id');
  const guest: any = await c.env.DB.prepare('SELECT g.*, s.name as session_name FROM access_control_guests g JOIN sessions s ON g.session_id = s.id WHERE g.qr_code_id = ?').bind(qrId).first();

  if (!guest) return c.html('<h1>Pase no encontrado o no válido.</h1>', 404);

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Pase de Acceso - ${guest.session_name}</title>
      <style>
        body { font-family: 'Inter', system-ui, sans-serif; background: #0f172a; color: white; display: flex; flex-direction: column; align-items: center; padding: 40px 20px; margin: 0; }
        .card { background: rgba(255,255,255,0.05); padding: 40px 30px; border-radius: 20px; text-align: center; border: 1px solid rgba(168,85,247,0.3); max-width: 400px; width: 100%; box-sizing: border-box; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .qr-container { margin: 30px 0; padding: 20px; background: white; border-radius: 15px; display: inline-flex; justify-content: center; align-items: center; }
        .title { color: #a855f7; font-size: 1.5rem; font-weight: 900; margin-bottom: 5px; text-transform: uppercase; }
        .name { font-size: 1.8rem; font-weight: 900; margin-bottom: 10px; text-transform: uppercase; line-height: 1.2; }
        .type { display: inline-block; background: #a855f7; color: white; padding: 5px 15px; border-radius: 20px; font-size: 0.8rem; font-weight: bold; letter-spacing: 1px; }
      </style>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    </head>
    <body>
      <div class="card">
        <div class="title">${guest.session_name}</div>
        <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 25px; letter-spacing: 1px; font-weight: bold;">PASE OFICIAL DE ACCESO</div>
        
        <div class="name">${guest.name}</div>
        <div class="type">${guest.guest_type}</div>
        
        <div class="qr-container" id="qrcode"></div>
        
        <div style="font-size: 0.75rem; color: #64748b; margin-top: 20px; font-weight: bold;">
          Presente este código en la entrada del evento.<br>ID: ${guest.qr_code_id}
        </div>
      </div>
      
      <script>
        new QRCode(document.getElementById("qrcode"), {
          text: "${guest.qr_code_id}",
          width: 250,
          height: 250,
          colorDark : "#000000",
          colorLight : "#ffffff",
          correctLevel : QRCode.CorrectLevel.H
        });
      </script>
    </body>
    </html>
  `;
  return c.html(html);
});

app.put('/api/accesos/checkin/:qr_or_id', async (c) => {
  try {
    const term = c.req.param('qr_or_id');
    const guestData: any = await c.env.DB.prepare('SELECT id, session_id, status, name FROM access_control_guests WHERE qr_code_id = ? OR id = ?')
      .bind(term, term).first();

    if (!guestData) return c.json({ success: false, error: 'Guest not found' }, 404);
    if (guestData.status === 'CHECKED_IN') return c.json({ success: false, error: 'Guest already checked in', guest: guestData }, 400);

    await c.env.DB.prepare('UPDATE access_control_guests SET status = \'CHECKED_IN\', checked_in_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(guestData.id).run();

    return c.json({ success: true, guest: guestData });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.delete('/api/accesos/guests/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM access_control_guests WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// --- ALQUILER DE EQUIPOS (RENTALS) ---
app.get('/api/rentals', async (c) => {
  try {
    const budgetsQuery = `
      SELECT id, empresa, evento, fecha, form_data, items_data, monto 
      FROM budgets 
      WHERE estatus = 'APROBADO' 
        AND (json_extract(form_data, '$.tipoEvento') = 'ALQUILER DE EQUIPOS' OR evento LIKE '%ALQUILER%')
    `;
    const budgetsResult = await c.env.DB.prepare(budgetsQuery).all();
    const approvedBudgets = budgetsResult.results || [];

    for (const b of approvedBudgets) {
      await c.env.DB.prepare(`INSERT OR IGNORE INTO rentals (budget_id) VALUES (?)`).bind(b.id).run();
    }

    const rentalsQuery = `
      SELECT r.*, b.empresa, b.evento, b.fecha, b.form_data, b.items_data, b.monto
      FROM rentals r
      JOIN budgets b ON r.budget_id = b.id
      ORDER BY b.fecha ASC
    `;
    const rentalsResult = await c.env.DB.prepare(rentalsQuery).all();

    return c.json({ success: true, rentals: rentalsResult.results });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.post('/api/rentals/:budget_id/status', async (c) => {
  try {
    const budgetId = c.req.param('budget_id');
    const body = await c.req.json();
    const { status, notes, type, signature, photos, receiver_name, receiver_id, verified_items } = body;

    // Si viene información de firma y fotos (conformidad completa)
    if (type === 'delivery' || type === 'retrieval') {
      let signatureUrl = null;
      if (signature && signature.startsWith('data:image')) {
        const filename = `rentals/${budgetId}/${type}_signature_${Date.now()}.png`;
        await saveBase64ToR2(c.env, signature, filename);
        signatureUrl = filename;
      }

      let photoUrls: string[] = [];
      if (photos && Array.isArray(photos)) {
        for (let i = 0; i < photos.length; i++) {
          if (photos[i] && photos[i].startsWith('data:image')) {
            const filename = `rentals/${budgetId}/${type}_photo_${i}_${Date.now()}.jpg`;
            await saveBase64ToR2(c.env, photos[i], filename);
            photoUrls.push(filename);
          }
        }
      }

      // Concatenar ítems verificados a las notas
      let finalNotes = notes || '';
      if (verified_items && verified_items.length > 0) {
        finalNotes += `\nÍtems verificados (${type}): ` + verified_items.join(', ');
      }

      const existing = await c.env.DB.prepare('SELECT delivery_photos, retrieval_photos FROM rentals WHERE budget_id = ?').bind(budgetId).first<any>();

      if (type === 'delivery') {
        const allPhotos = [...(existing?.delivery_photos ? JSON.parse(existing.delivery_photos) : []), ...photoUrls];
        await c.env.DB.prepare(`
          UPDATE rentals SET 
            status = ?, 
            notes = ?,
            delivery_photos = ?, 
            delivery_signature = COALESCE(?, delivery_signature),
            delivery_receiver_name = ?,
            delivery_receiver_id = ?
          WHERE budget_id = ?
        `).bind(status, finalNotes, JSON.stringify(allPhotos), signatureUrl, receiver_name, receiver_id, budgetId).run();
      } else if (type === 'retrieval') {
        const allPhotos = [...(existing?.retrieval_photos ? JSON.parse(existing.retrieval_photos) : []), ...photoUrls];
        await c.env.DB.prepare(`
          UPDATE rentals SET 
            status = ?, 
            notes = ?,
            retrieval_photos = ?, 
            retrieval_signature = COALESCE(?, retrieval_signature),
            retrieval_receiver_name = ?,
            retrieval_receiver_id = ?
          WHERE budget_id = ?
        `).bind(status, finalNotes, JSON.stringify(allPhotos), signatureUrl, receiver_name, receiver_id, budgetId).run();
      }
    } else {
      // Cambio de estado simple
      await c.env.DB.prepare(`
        UPDATE rentals SET status = ?, notes = ? WHERE budget_id = ?
      `).bind(status, notes || null, budgetId).run();
    }

    // Si el status final es 'completed', crear registro en event_reports
    const finalStatus = status;
    if (finalStatus === 'completed') {
      const budget = await c.env.DB.prepare('SELECT * FROM budgets WHERE id = ?').bind(budgetId).first<any>();
      if (budget) {
        const existingReport = await c.env.DB.prepare('SELECT id FROM event_reports WHERE session_name = ? AND event_type = ?').bind(budget.evento || budgetId, 'alquiler de equipos').first<any>();
        if (!existingReport) {
          // Contar personal asignado al presupuesto (del form_data si existe)
          let totalStaff = 0;
          try {
            const fd = budget.form_data ? JSON.parse(budget.form_data) : {};
            totalStaff = parseInt(fd.personal || fd.staff || '0') || 0;
          } catch (e) { }
          await c.env.DB.prepare(`
            INSERT INTO event_reports (session_id, session_name, event_type, total_vehicles, total_staff, closed_at)
            VALUES (0, ?, 'alquiler de equipos', 0, ?, datetime('now'))
          `).bind(budget.evento || budgetId, totalStaff).run();
        }
      }
    }

    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.post('/api/rentals/:budget_id/soportes', async (c) => {
  try {
    const budgetId = c.req.param('budget_id');
    const { type, photos, signature } = await c.req.json(); // type: 'delivery' or 'retrieval'

    let signatureUrl = null;
    if (signature && signature.startsWith('data:image')) {
      const filename = `rentals/${budgetId}/${type}_signature_${Date.now()}.png`;
      await saveBase64ToR2(c.env, signature, filename);
      signatureUrl = filename;
    }

    let photoUrls: string[] = [];
    if (photos && Array.isArray(photos)) {
      for (let i = 0; i < photos.length; i++) {
        if (photos[i] && photos[i].startsWith('data:image')) {
          const filename = `rentals/${budgetId}/${type}_photo_${i}_${Date.now()}.jpg`;
          await saveBase64ToR2(c.env, photos[i], filename);
          photoUrls.push(filename);
        }
      }
    }

    // Get current arrays if appending (to be safe, though right now we overwrite)
    const existing = await c.env.DB.prepare('SELECT delivery_photos, retrieval_photos FROM rentals WHERE budget_id = ?').bind(budgetId).first<any>();

    if (type === 'delivery') {
      const allPhotos = [...(existing?.delivery_photos ? JSON.parse(existing.delivery_photos) : []), ...photoUrls];
      await c.env.DB.prepare(`
        UPDATE rentals SET delivery_photos = ?, delivery_signature = COALESCE(?, delivery_signature) WHERE budget_id = ?
      `).bind(JSON.stringify(allPhotos), signatureUrl, budgetId).run();
    } else {
      const allPhotos = [...(existing?.retrieval_photos ? JSON.parse(existing.retrieval_photos) : []), ...photoUrls];
      await c.env.DB.prepare(`
        UPDATE rentals SET retrieval_photos = ?, retrieval_signature = COALESCE(?, retrieval_signature) WHERE budget_id = ?
      `).bind(JSON.stringify(allPhotos), signatureUrl, budgetId).run();
    }

    return c.json({ success: true, signatureUrl, photoUrls });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.get('/api/sessions/concluded', async (c) => {
  const result = await c.env.DB.prepare('SELECT * FROM sessions WHERE status = "closed" ORDER BY id DESC').all();
  const sessions = result.results || [];

  for (let s of sessions) {
    const staffRes = await c.env.DB.prepare("SELECT name FROM users WHERE current_session_id = ? OR instr(',' || current_session_id || ',', ',' || CAST(? AS TEXT) || ',') > 0").bind(String(s.id), String(s.id)).all();
    s.assigned_staff = (staffRes.results || []).map(u => u.name).join(', ');
  }

  return c.json({ sessions });
});

app.get('/api/sessions/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const res = await c.env.DB.prepare(`SELECT * FROM sessions WHERE id = ?`).bind(id).first();
    return c.json({ success: true, data: res });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.get('/api/staff/:id/sessions', async (c) => {
  const userId = c.req.param('id');
  const query = `
    SELECT DISTINCT s.id, s.name, s.started_at, u.role
    FROM sessions s
    JOIN staff_attendance a ON s.id = a.session_id
    JOIN users u ON a.user_id = u.id
    WHERE a.user_id = ?
      AND s.id NOT IN (
        SELECT session_id 
        FROM payroll_submissions 
        WHERE user_id = ? AND status != 'rejected'
      )
    ORDER BY s.started_at DESC
  `;
  const result = await c.env.DB.prepare(query).bind(userId, userId).all();
  return c.json({ sessions: result.results || [] });
});

app.post('/api/sessions/:id/assign-staff', async (c) => {
  const sessionId = c.req.param('id');
  const { user_id } = await c.req.json();
  if (!user_id) return c.json({ error: 'User ID requerido' }, 400);

  // REGLA: Verificar si el empleado ya está asignado a otra sesión activa
  const user = await c.env.DB.prepare('SELECT current_session_id, name FROM users WHERE id = ?').bind(user_id).first<{ current_session_id: string | null, name: string }>();

  if (user && user.current_session_id) {
    const assignedIds = user.current_session_id.toString().split(',').map(x => x.trim()).filter(Boolean);
    for (const otherId of assignedIds) {
      if (otherId !== sessionId.toString()) {
        const otherSession = await c.env.DB.prepare('SELECT name FROM sessions WHERE id = ? AND status = "active"').bind(otherId).first<{ name: string }>();
        if (otherSession) {
          return c.json({ error: `EL EMPLEADO ${user.name} YA ESTÁ ASIGNADO AL EVENTO "${otherSession.name}"` }, 400);
        }
      }
    }
  }

  const currentIds = user && user.current_session_id ? user.current_session_id.toString().split(',').map(x => x.trim()).filter(Boolean) : [];
  if (!currentIds.includes(sessionId.toString())) {
    currentIds.push(sessionId.toString());
  }

  await c.env.DB.prepare('UPDATE users SET current_session_id = ? WHERE id = ?')
    .bind(currentIds.join(','), user_id)
    .run();

  return c.json({ success: true });
});

app.post('/api/sessions/:id/unassign-staff', async (c) => {
  const sessionId = c.req.param('id');
  const { user_id } = await c.req.json();
  if (!user_id) return c.json({ error: 'User ID requerido' }, 400);

  const user = await c.env.DB.prepare('SELECT current_session_id FROM users WHERE id = ?').bind(user_id).first<{ current_session_id: string | null }>();
  let currentIds = user && user.current_session_id ? user.current_session_id.toString().split(',').map(x => x.trim()).filter(Boolean) : [];
  currentIds = currentIds.filter(x => x !== sessionId.toString());

  await c.env.DB.prepare('UPDATE users SET current_session_id = ? WHERE id = ?')
    .bind(currentIds.length > 0 ? currentIds.join(',') : null, user_id)
    .run();

  return c.json({ success: true });
});

app.post('/api/sessions/plan', async (c) => {
  const { name, type, supervisor_id, staff_ids, started_at, phone, address, contact_name, email, observations, correlativo, convocation_time, event_start_time, event_end_time, event_end_date, budget_id } = await c.req.json();
  const nowVE = new Date(new Date().getTime() - (4 * 60 * 60 * 1000));
  const dateStr = nowVE.toISOString().split('T')[0].replace(/-/g, '');
  const sessionName = name || `EVENTO_${dateStr}`;
  const sessionType = type || 'valet';
  const internalKey = correlativo ? `${sessionName} ${correlativo}` : sessionName;

  // Verificar exclusividad antes de planificar
  const allIds = [...new Set([supervisor_id, ...(staff_ids || [])])].filter(Boolean);
  if (allIds.length > 0) {
    const busyUsers: string[] = [];
    for (const userId of allIds) {
      const userObj = await c.env.DB.prepare('SELECT name, current_session_id FROM users WHERE id = ?').bind(userId).first<{ name: string, current_session_id: string | null }>();
      if (userObj?.current_session_id) {
        const assignedIds = userObj.current_session_id.toString().split(',').map(x => x.trim()).filter(Boolean);
        for (const sId of assignedIds) {
          const actSession = await c.env.DB.prepare('SELECT name FROM sessions WHERE id = ? AND status = "active"').bind(sId).first<{ name: string }>();
          if (actSession) {
            busyUsers.push(userObj.name);
            break;
          }
        }
      }
    }
    if (busyUsers.length > 0) {
      return c.json({ error: `⚠️ ERROR: ${busyUsers.join(', ')} ya están asignados a otro evento activo.` }, 400);
    }
  }

  const result = await c.env.DB.prepare(`
    INSERT INTO sessions (name, internal_key, type, status, supervisor_id, started_at, phone, address, contact_name, email, observations, convocation_time, event_start_time, event_end_time, event_end_date, budget_id) 
    VALUES (?, ?, ?, "planning", ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(sessionName, internalKey, sessionType, supervisor_id || null, started_at || null, phone || null, address || null, contact_name || null, email || null, observations || null, convocation_time || null, event_start_time || null, event_end_time || null, event_end_date || null, budget_id || null)
    .run();

  const sessionId = result.meta.last_row_id;

  // Asignar personal
  if (allIds.length > 0) {
    for (const userId of allIds) {
      const userObj = await c.env.DB.prepare('SELECT current_session_id FROM users WHERE id = ?').bind(userId).first<{ current_session_id: string | null }>();
      let currentIds = userObj && userObj.current_session_id ? userObj.current_session_id.toString().split(',').map(x => x.trim()).filter(Boolean) : [];
      if (!currentIds.includes(sessionId.toString())) {
        currentIds.push(sessionId.toString());
      }
      await c.env.DB.prepare('UPDATE users SET current_session_id = ? WHERE id = ?').bind(currentIds.join(','), userId).run();
    }
  }

  return c.json({ success: true, id: sessionId, name: sessionName, internal_key: internalKey, type: sessionType, status: 'planning' });
});

app.get('/api/guardia/:session_id/details', async (c) => {
  const sessionId = c.req.param('session_id');
  const result = await c.env.DB.prepare('SELECT * FROM guardia_details WHERE session_id = ?').bind(sessionId).first();
  return c.json({ success: true, data: result || {} });
});

app.post('/api/guardia/:session_id/details', async (c) => {
  const sessionId = c.req.param('session_id');
  const { transport, desayunos, almuerzos, cenas, materials } = await c.req.json().catch(() => ({}));
  
  const existing = await c.env.DB.prepare('SELECT session_id FROM guardia_details WHERE session_id = ?').bind(sessionId).first();
  
  if (existing) {
    await c.env.DB.prepare(`
      UPDATE guardia_details 
      SET transport = ?, desayunos = ?, almuerzos = ?, cenas = ?, materials = ?
      WHERE session_id = ?
    `).bind(transport || null, desayunos || 0, almuerzos || 0, cenas || 0, materials || null, sessionId).run();
  } else {
    await c.env.DB.prepare(`
      INSERT INTO guardia_details (session_id, transport, desayunos, almuerzos, cenas, materials)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(sessionId, transport || null, desayunos || 0, almuerzos || 0, cenas || 0, materials || null).run();
  }
  return c.json({ success: true });
});

app.post('/api/sessions/update', async (c) => {
  const { id, name, type, supervisor_id, staff_ids, started_at, phone, address, contact_name, email, observations, correlativo, convocation_time, event_start_time, event_end_time, event_end_date, budget_id } = await c.req.json();
  if (!id) return c.json({ error: 'ID requerido' }, 400);

  const internalKey = correlativo ? `${name} ${correlativo}` : name;

  // 1. Actualizar datos de la sesión
  await c.env.DB.prepare(`
    UPDATE sessions SET 
      name = ?, internal_key = ?, type = ?, supervisor_id = ?, 
      started_at = ?, phone = ?, address = ?, contact_name = ?, 
      email = ?, observations = ?,
      convocation_time = ?, event_start_time = ?, event_end_time = ?,
      event_end_date = ?, budget_id = ?
    WHERE id = ?
  `)
    .bind(name, internalKey, type.toLowerCase(), supervisor_id || null, started_at || null, phone || null, address || null, contact_name || null, email || null, observations || null, convocation_time || null, event_start_time || null, event_end_time || null, event_end_date || null, budget_id || null, id)
    .run();

  // 2. Gestionar personal
  const usersWithSession = await c.env.DB.prepare("SELECT id, current_session_id FROM users WHERE current_session_id = ? OR instr(',' || current_session_id || ',', ',' || CAST(? AS TEXT) || ',') > 0").bind(String(id), String(id)).all<{ id: number, current_session_id: string }>();
  for (const u of (usersWithSession.results || [])) {
    let currentIds = u.current_session_id ? u.current_session_id.toString().split(',').map(x => x.trim()).filter(Boolean) : [];
    currentIds = currentIds.filter(x => x !== id.toString());
    await c.env.DB.prepare('UPDATE users SET current_session_id = ? WHERE id = ?').bind(currentIds.length > 0 ? currentIds.join(',') : null, u.id).run();
  }

  const allIds = [...new Set([supervisor_id, ...(staff_ids || [])])].filter(Boolean);
  if (allIds.length > 0) {
    for (const userId of allIds) {
      const userObj = await c.env.DB.prepare('SELECT current_session_id FROM users WHERE id = ?').bind(userId).first<{ current_session_id: string | null }>();
      let currentIds = userObj && userObj.current_session_id ? userObj.current_session_id.toString().split(',').map(x => x.trim()).filter(Boolean) : [];
      if (!currentIds.includes(id.toString())) {
        currentIds.push(id.toString());
      }
      await c.env.DB.prepare('UPDATE users SET current_session_id = ? WHERE id = ?').bind(currentIds.join(','), userId).run();
    }
  }

  return c.json({ success: true });
});

app.post('/api/sessions/activate', async (c) => {
  const { id, supervisor_id, staff_ids, bypass_code } = await c.req.json();
  if (!id) return c.json({ error: 'ID requerido' }, 400);

  // 1. Validar restricción de 3 horas si es una sesión planificada
  const session = await c.env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(id).first<any>();
  if (session && session.status === 'planning') {
    const rawDate = session.started_at; // Asumimos formato YYYY-MM-DD o ISO
    const startTime = session.event_start_time || '00:00';
    const [h, m] = startTime.split(':');

    let schedDate;
    if (rawDate.includes('T')) {
      schedDate = new Date(rawDate);
    } else {
      const parts = rawDate.split('-');
      schedDate = new Date(parts[0], parts[1] - 1, parts[2]);
    }
    schedDate.setHours(parseInt(h), parseInt(m), 0, 0);

    const diffMs = schedDate.getTime() - Date.now();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours > 3 && bypass_code !== c.env.ADMIN_KEY) {
      return c.json({
        error: `RESTRICCIÓN DE SEGURIDAD: El evento está programado para las ${startTime}. No se puede iniciar con más de 3 horas de antelación sin autorización de RRHH.`
      }, 403);
    }
  }

  // 2. Activar Sesión
  await c.env.DB.prepare('UPDATE sessions SET status = "active", started_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run();

  // 3. Asignar Personal
  const allIds = [...new Set([supervisor_id, ...(staff_ids || [])])].filter(Boolean);
  for (const userId of allIds) {
    const userObj = await c.env.DB.prepare('SELECT current_session_id FROM users WHERE id = ?').bind(userId).first<{ current_session_id: string | null }>();
    let currentIds = userObj && userObj.current_session_id ? userObj.current_session_id.toString().split(',').map(x => x.trim()).filter(Boolean) : [];
    if (!currentIds.includes(id.toString())) {
      currentIds.push(id.toString());
    }
    await c.env.DB.prepare('UPDATE users SET current_session_id = ? WHERE id = ?').bind(currentIds.join(','), userId).run();
    await c.env.DB.prepare('INSERT INTO staff_attendance (user_id, session_id, type) VALUES (?, ?, "entry")').bind(userId, id).run();
  }

  // 4. Enviar Email de Confirmación
  await sendEventActivationEmail(c.env, id);

  return c.json({ success: true, status: 'active' });
});

app.get('/api/comunicacion/directo', async (c) => {
  const receiver = c.req.query('to') || c.req.query('receiver');
  const message = c.req.query('message') || c.req.query('text') || '';

  if (!receiver) {
    c.header('Content-Type', 'application/json');
    return c.json({ error: 'Receptor ("to" o "receiver") es requerido' }, 400);
  }

  const cleanedPhone = sanitizePhoneNumber(receiver);
  if (!cleanedPhone) {
    c.header('Content-Type', 'application/json');
    return c.json({ error: 'Número de teléfono inválido o formato no soportado' }, 400);
  }
  const encodedText = encodeURIComponent(message);
  const tgUrl = `https://t.me/+${cleanedPhone}?text=${encodedText}`;

  c.header('Content-Type', 'application/json');
  return c.json({
    success: true,
    phone: cleanedPhone,
    text: encodedText,
    url: tgUrl
  });
});

app.post('/api/comunicacion/directo', async (c) => {
  let to = '';
  let text = '';
  try {
    const body = await c.req.json();
    to = body.to || body.receiver;
    text = body.message || body.text || '';
  } catch (e) {
    to = c.req.query('to') || c.req.query('receiver') || '';
    text = c.req.query('message') || c.req.query('text') || '';
  }

  if (!to) {
    c.header('Content-Type', 'application/json');
    return c.json({ error: 'Receptor ("to" o "receiver") es requerido' }, 400);
  }

  const cleanedPhone = sanitizePhoneNumber(to);
  if (!cleanedPhone) {
    c.header('Content-Type', 'application/json');
    return c.json({ error: 'Número de teléfono inválido o formato no soportado' }, 400);
  }
  const encodedText = encodeURIComponent(text);
  const tgUrl = `https://t.me/+${cleanedPhone}?text=${encodedText}`;

  c.header('Content-Type', 'application/json');

  return c.json({
    success: true,
    phone: cleanedPhone,
    text: encodedText,
    url: tgUrl
  });
});

app.post('/api/comunicacion/oficina-alerta', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { event_name, incident_type, severity, description } = body;

  if (!event_name || !incident_type) {
    c.header('Content-Type', 'application/json');
    return c.json({ error: 'event_name e incident_type son requeridos' }, 400);
  }

  const now = new Date();
  const formatCaracas = now.toLocaleString('es-VE', {
    timeZone: 'America/Caracas',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).replace(',', '');

  const formattedMessage = `🚨 *ALERTA DE INCIDENCIA - GRUPO OFICINA*\n` +
    `📅 *Fecha/Hora (Caracas):* ${formatCaracas}\n` +
    `🎫 *Evento:* ${event_name.toUpperCase()}\n` +
    `⚠️ *Tipo:* ${incident_type.toUpperCase()} (Severidad: ${(severity || 'MEDIA').toUpperCase()})\n` +
    `📝 *Detalles:* ${description || 'Sin detalles adicionales.'}`;

  const officeGroupId = c.env.OFFICE_GROUP_ID || '-1001234567890';
  const token = c.env.TELEGRAM_BOT_TOKEN;

  if (token && officeGroupId) {
    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: officeGroupId,
          text: formattedMessage,
          parse_mode: 'Markdown'
        })
      });

      const tgData = await tgRes.json();
      c.header('Content-Type', 'application/json');
      return c.json({
        success: tgRes.ok,
        timestamp: formatCaracas,
        group_id: officeGroupId,
        bot_response: tgData
      }, tgRes.status as any);
    } catch (e) {
      console.error('Error enviando alerta por Telegram:', e);
      c.header('Content-Type', 'application/json');
      return c.json({ error: 'Fallo al conectar con Telegram' }, 500);
    }
  }

  c.header('Content-Type', 'application/json');
  return c.json({
    success: true,
    timestamp: formatCaracas,
    group_id: officeGroupId,
    message: formattedMessage,
    simulated_send: true
  });
});

app.post('/api/staff/update-status', async (c) => {
  const { id, is_active } = await c.req.json();
  if (!id) return c.json({ error: 'ID requerido' }, 400);

  await c.env.DB.prepare('UPDATE users SET is_active = ? WHERE id = ?')
    .bind(is_active, id)
    .run();

  return c.json({ success: true });
});

app.post('/api/reports/test-request', async (c) => {
  try {
    const { type } = await c.req.json();
    const env = c.env;
    const adminEmail = env.DIRECTOR_EMAIL ;

    if (type === 'birthday') {
      await sendMonthlyBirthdayReport(env, true);
      return c.json({ success: true, message: `Reporte de cumpleañeros forzado y enviado masivamente` });

    } else if (type === 'plantilla_rrhh') {
      const res = await env.DB.prepare('SELECT * FROM users').all();
      const list = (res.results || []) as any[];
      const eyePriority: Record<string, number> = { 'ORO': 1, 'PLATA': 2, 'BRONCE': 3, 'LOGÍSTICA': 4 };
      list.sort((a, b) => {
        const prioA = eyePriority[(a.eye_id || '').toUpperCase()] || 99;
        const prioB = eyePriority[(b.eye_id || '').toUpperCase()] || 99;
        if (prioA !== prioB) return prioA - prioB;
        return (a.name || '').localeCompare(b.name || '');
      });

      const excelData = [
          ['Item', 'Status', 'Nombre', 'Cedula', 'Email', 'Perfil Admin', 'Perfil Opera', 'EYE ID', 'Telefono', 'Direccion', 'Sector', 'Entidad Bancaria', 'Numero de Cuenta', 'Familiar', 'TelFamiliar', 'Alergias', 'Edad'],
          ...list.map((u, i) => {
              let age = '';
              if (u.birth_date) {
                  const birth = new Date(u.birth_date);
                  if (!isNaN(birth.getTime())) {
                      const today = new Date();
                      age = (today.getFullYear() - birth.getFullYear()).toString();
                      const m = today.getMonth() - birth.getMonth();
                      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
                          age = (parseInt(age) - 1).toString();
                      }
                  }
              }
              return [
                  i + 1, 
                  u.is_active === 0 ? 'INACTIVO' : 'ACTIVO', 
                  u.name || '', 
                  u.cedula || '', 
                  u.email || '',
                  u.profile_admin || '',
                  u.profile_opera || '', 
                  u.eye_id || '',
                  u.phone || '', 
                  u.address || '', 
                  u.sector || '', 
                  u.pago_movil ? 'PAGO MÓVIL' : (u.bank_name || ''), 
                  u.pago_movil ? 'N/A' : (u.bank_account || ''), 
                  u.emergency_contact || '', 
                  u.emergency_phone || '', 
                  u.allergies || '',
                  age
              ];
          })
      ];

      const ws = XLSX.utils.aoa_to_sheet(excelData);
      const colWidths = excelData[0].map((_, i) => ({ wch: i === 2 || i === 4 ? 30 : 15 }));
      ws['!cols'] = colWidths;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Plantilla RRHH");
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
      const excelBase64 = uint8ArrayToBase64(new Uint8Array(excelBuffer));

      const htmlBody = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #0f172a;">Plantilla de Recursos Humanos — EYE STAFF</h2>
        <p style="color: #334155;">Hola,</p>
        <p style="color: #334155;">Se adjunta la plantilla completa de recursos humanos con la base de datos de todo el personal en formato Excel (.xlsx).</p>
        <p style="color: #334155; font-size: 0.8rem; margin-top: 20px;">Atentamente,<br>Sistema Automatizado EYE STAFF</p>
      </div>`;

      await sendEmail(env, adminEmail, `EYE STAFF: Plantilla de Recursos Humanos`, htmlBody, [{ filename: 'Plantilla_RRHH.xlsx', content: excelBase64, content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }], [], 'plantilla_rrhh');

      return c.json({ success: true, message: `Plantilla RRHH enviada a ${adminEmail}` });

    } else if (type === 'permissions-matrix') {
      const allUsers = await env.DB.prepare("SELECT id, name, role FROM users WHERE is_active = 1 ORDER BY name ASC").all();
      const users = (allUsers.results || []) as any[];
      const allowedCfoNames = ["ADMIN", "NICOLAS BETANCOURT", "MAIFER BARRUETA"];

      // Obtener los permisos guardados
      const permRowsRes = await env.DB.prepare('SELECT * FROM user_permissions_matrix').all();
      const permRows = permRowsRes.results || [];
      const permMap = new Map(permRows.map((r: any) => [r.user_id, r]));

      let excelData = [
        ['Empleado', 'Valet Parking Ve', 'Valet Parking Mod', 'Eventos y Listas Ve', 'Eventos y Listas Mod', 'Admin General Ve', 'Admin General Mod', 'VIP Eye Staff Ve', 'VIP Eye Staff Mod', 'Seguridad (Pines) Ve', 'Seguridad (Pines) Mod']
      ];

      let htmlRows = '';

      for (const u of users) {
        const permRow: any = permMap.get(u.id);
        let valetVe, valetMod, eventosVe, eventosMod, adminVe, adminMod, vipVe, vipMod, segVe, segMod;

        if (permRow) {
          valetVe = permRow.valet_ve === 1;
          valetMod = permRow.valet_mod === 1;
          eventosVe = permRow.eventos_ve === 1;
          eventosMod = permRow.eventos_mod === 1;
          adminVe = permRow.admin_ve === 1;
          adminMod = permRow.admin_mod === 1;
          vipVe = permRow.vip_ve === 1;
          vipMod = permRow.vip_mod === 1;
          segVe = permRow.seg_ve === 1;
          segMod = permRow.seg_mod === 1;
        } else {
          const isSuperadmin = u.role === 'director';
          const isSupervisor = u.role === 'supervisor';
          const isVIP = allowedCfoNames.some(n => (u.name || '').toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(n));
          valetVe = true;
          valetMod = isSuperadmin || isSupervisor;
          eventosVe = isSuperadmin || isSupervisor;
          eventosMod = isSuperadmin || isSupervisor;
          adminVe = isSuperadmin;
          adminMod = isSuperadmin;
          vipVe = isVIP;
          vipMod = isVIP;
          segVe = isSuperadmin;
          segMod = isSuperadmin;
        }

        const toMark = (b: boolean) => b ? '✅' : '❌';

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

      await sendEmail(env, adminEmail, 'Matriz Checkbox de Permisos por Empleado — EYE STAFF', htmlBody, [
        { filename: 'Matriz_Permisos.xlsx', content: excelBase64, content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
      ], undefined, 'permisos');

      return c.json({ success: true, message: `Matriz de permisos enviada a ${adminEmail}` });
    } else if (type === 'convocation') {
      // Generar una simulación de correo de convocatoria extremadamente detallado
      const demoHtml = `
      <div style="font-family: 'Outfit', sans-serif; background: #0b0f19; color: white; padding: 30px; border-radius: 20px; border: 1px solid #1e253c; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; margin-bottom: 25px;">
           <h1 style="color: #ef4444; margin: 0; letter-spacing: 2px;">EYE STAFF</h1>
           <p style="color: #94a3b8; font-size: 0.8rem;">PRUEBA DE CONVOCATORIA DE EVENTO</p>
        </div>
        <div style="background: #161b2c; padding: 25px; border-radius: 15px; border: 1px solid rgba(255,255,255,0.05);">
          <h2 style="margin-top: 0; color: #f59e0b;">📢 Recordatorio de Convocatoria (PRUEBA)</h2>
          <p style="font-size: 1.1rem; margin-bottom: 20px;">Esta es una simulación de la notificación de convocatoria automatizada.</p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="color: #94a3b8; padding: 8px 0; font-size: 0.9rem;">EVENTO DE PRUEBA:</td>
              <td style="color: white; padding: 8px 0; font-weight: bold; text-align: right;">BODA GONZÁLEZ & RODRÍGUEZ (DEMO)</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; padding: 8px 0; font-size: 0.9rem;">TIPO:</td>
              <td style="color: white; padding: 8px 0; font-weight: bold; text-align: right;">BODA</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; padding: 8px 0; font-size: 0.9rem;">HORA CONVOCATORIA:</td>
              <td style="color: #ef4444; padding: 8px 0; font-weight: bold; text-align: right;">🕒 18:30</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; padding: 8px 0; font-size: 0.9rem;">HORA DE CITA:</td>
              <td style="color: #22c55e; padding: 8px 0; font-weight: bold; text-align: right;">🚀 19:00</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; padding: 8px 0; font-size: 0.9rem;">HORA ESTIMADA DE PERSONALIZACIÓN:</td>
              <td style="color: #3b82f6; padding: 8px 0; font-weight: bold; text-align: right;">🏁 02:30</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; padding: 8px 0; font-size: 0.9rem;">DIRECCIÓN:</td>
              <td style="color: white; padding: 8px 0; font-size: 0.85rem; text-align: right; line-height: 1.4;">📍 Quinta Esmeralda, Av. El Samán, Caracas, Venezuela</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; padding: 8px 0; font-size: 0.9rem;">CONTACTO:</td>
              <td style="color: white; padding: 8px 0; font-size: 0.85rem; text-align: right;">👤 Daniela Sescun (+58 412 9876543)</td>
            </tr>
          </table>
          
          <h3 style="color: #f59e0b; border-bottom: 2px solid #f59e0b; padding-bottom: 5px; margin-top: 25px; margin-bottom: 15px;">👥 PERSONAL CITADO</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
            <thead>
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: #94a3b8;">
                <th style="text-align: left; padding: 6px 0;">Nombre</th>
                <th style="text-align: center; padding: 6px 0;">Rol</th>
                <th style="text-align: right; padding: 6px 0;">Teléfono</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 8px 0; font-weight: bold; color: white;">NICOLÁS BETANCOURT</td>
                <td style="padding: 8px 0; text-align: center; color: #94a3b8; font-size: 0.75rem;">SUPERVISOR</td>
                <td style="padding: 8px 0; text-align: right; color: #22c55e; font-weight: bold;">+58 414 1111111</td>
              </tr>
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 8px 0; font-weight: bold; color: white;">JOSÉ GREGORIO RAMOS</td>
                <td style="padding: 8px 0; text-align: center; color: #94a3b8; font-size: 0.75rem;">DRIVER</td>
                <td style="padding: 8px 0; text-align: right; color: #22c55e; font-weight: bold;">+58 412 2222222</td>
              </tr>
            </tbody>
          </table>
          
          <div style="margin-top: 25px; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
            <div style="background: rgba(255,255,255,0.05); padding: 8px 12px; font-size: 0.75rem; color: #f59e0b; font-weight: bold; border-bottom: 1px solid rgba(255,255,255,0.05);">📍 UBICACIÓN EN EL MAPA</div>
            <img src="https://static-maps.yandex.ru/1.x/?lang=es_ES&ll=-66.8524,10.4851&z=15&l=map&size=600,300" alt="Mapa" style="width: 100%; display: block;" />
          </div>
        </div>
        <p style="margin-top: 30px; font-size: 0.7rem; color: #475569; text-align: center;">
          © 2026 EYE STAFF — Sistema de Gestión Operativa
        </p>
      </div>
    `;
      await sendEmail(env, adminEmail, `🔔 PRUEBA DE CONVOCATORIA — EVENTO DEMO`, demoHtml, undefined, undefined, 'convocatoria');
      return c.json({ success: true, message: `Simulación de convocatoria enviada a ${adminEmail}` });
    } else if (type === 'pdf' || type === 'xlsx') {
      // Buscar la última sesión en la base de datos para simular el reporte de cierre
      const latestSession = await env.DB.prepare('SELECT id FROM sessions ORDER BY id DESC LIMIT 1').first<any>();
      if (!latestSession) {
        return c.json({ error: 'No hay eventos en la base de datos para simular un reporte de cierre.' }, 400);
      }
      try {
        await sendEventClosingReport(env, latestSession.id);
        return c.json({ success: true, message: `Reporte de cierre simulado para el evento ID ${latestSession.id} enviado a ${adminEmail}` });
      } catch (e: any) {
        console.error('Error in sendEventClosingReport test:', e);
        return c.json({ error: `Error al generar el reporte de prueba: ${e.message || e}` }, 500);
      }
  } else if (type === 'credenciales') {
    const { channel } = await c.req.json();
    const sendEmailFlag = channel === 'email' || channel === 'ambos' || !channel;
    const sendWaFlag = channel === 'whatsapp' || channel === 'ambos';
    
    const subsRes = await env.DB.prepare(`
      SELECT u.id, u.name, u.email, u.phone, u.pin_hash FROM user_report_subscriptions rs
      JOIN users u ON rs.user_id = u.id
      WHERE rs.credenciales = 1 AND u.is_active = 1
    `).all();
    const subs = subsRes.results || [];
    
    if (subs.length === 0) return c.json({ error: 'No hay usuarios en la matriz con check de credenciales' }, 400);

    let sentCount = 0;
    let errors = 0;
    let lastBotError = '';

    for (const user of subs) {
      let sentAny = false;
      const firstName = (user.name as string).split(' ')[0];
      const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background:#0b0f19; font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px; margin:40px auto; background:#131929; border-radius:20px; overflow:hidden; border:1px solid rgba(255,255,255,0.08);">
    <div style="background:linear-gradient(135deg,#1a1f35 0%,#0f172a 100%); padding:40px 40px 30px; text-align:center; border-bottom:1px solid rgba(255,255,255,0.06);">
      <h1 style="margin:0; color:#ffffff; font-size:1.6rem; font-weight:900; letter-spacing:-0.5px;">EYE STAFF</h1>
    </div>
    <div style="padding:35px 40px;">
      <p style="color:#94a3b8; font-size:0.95rem; margin:0 0 25px;">Hola <strong style="color:#fff;">${firstName}</strong>, aquí están tus credenciales de acceso a la plataforma:</p>
      <div style="background:#0f172a; border-radius:14px; border:1px solid rgba(234,179,8,0.25); padding:25px; margin-bottom:25px;">
        <div style="margin-bottom:18px;">
          <div style="font-size:0.65rem; color:#64748b; letter-spacing:2px; text-transform:uppercase; margin-bottom:6px;">🌐 URL de Acceso</div>
          <div style="font-size:1rem; color:#eab308; font-weight:700;">https://eye-staff.app</div>
        </div>
        <div style="border-top:1px solid rgba(255,255,255,0.06); padding-top:18px; margin-bottom:18px;">
          <div style="font-size:0.65rem; color:#64748b; letter-spacing:2px; text-transform:uppercase; margin-bottom:6px;">👤 Nombre de Usuario</div>
          <div style="font-size:1.1rem; color:#ffffff; font-weight:900; letter-spacing:1px;">${user.name}</div>
        </div>
        <div style="border-top:1px solid rgba(255,255,255,0.06); padding-top:18px;">
          <div style="font-size:0.65rem; color:#64748b; letter-spacing:2px; text-transform:uppercase; margin-bottom:6px;">🔑 Contraseña (PIN)</div>
          <div style="font-size:1.3rem; color:#eab308; font-weight:900; letter-spacing:3px; font-family:monospace;">${user.pin_hash}</div>
        </div>
      </div>
      <p style="color:#94a3b8; font-size:0.8rem; letter-spacing:2px; text-transform:uppercase; margin-bottom:14px;">Cómo ingresar:</p>
      <div>
        <div style="display:flex; align-items:flex-start; gap:14px; padding:12px 0;">
          <div style="color:#cbd5e1; font-size:0.9rem; padding-top:3px;">Ingresa tu contraseña y pulsa <strong style="color:#fff;">ENTRAR</strong>. ¡Listo!</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

      if (sendEmailFlag && user.email) {
        try {
          await sendEmail(env, [user.email as string], '🔐 Credenciales de Acceso - EYE STAFF', htmlBody);
          sentAny = true;
        } catch(e) {
          console.error(e);
          if (!sendWaFlag) errors++;
        }
      } else if (sendEmailFlag && !user.email) {
        if (!sendWaFlag) errors++;
      }

      if (sendWaFlag && user.phone) {
        const waMessage = `Hola *${firstName}* 👋🏼\n\nAquí están tus credenciales de acceso a la plataforma *EYE STAFF*:\n\n🌐 URL: https://eye-staff.app\n👤 Usuario: *${user.name}*\n🔑 Contraseña (PIN): *${user.pin_hash}*\n\n🔒 _Mantén tu contraseña segura. Si deseas cambiarla, contacta al administrador._`;
        const res = await sendWhatsAppMessage(env, user.phone as string, waMessage);
        if (res.ok) {
          sentAny = true;
        } else {
          if (res.error) lastBotError = res.error;
          if (!sendEmailFlag) errors++;
        }
      } else if (sendWaFlag && !user.phone) {
        if (!sendEmailFlag) errors++;
      }

      if (sentAny) sentCount++;
    }

    if (sentCount === 0) {
      const errSuffix = lastBotError ? ` Error de WhatsApp: ${lastBotError}` : '';
      return c.json({ error: 'No se pudo enviar ninguna solicitud.' + errSuffix }, 500);
    }
    return c.json({ success: true, message: `Enviado a ${sentCount} empleados (${errors} errores)` });
  } else if (type === 'bbdd_eventos') {
      const events = await env.DB.prepare('SELECT id, session_id, event_type, closed_at, total_vehicles, total_staff FROM event_reports ORDER BY closed_at DESC LIMIT 100').all();
      let excelData = [['ID', 'Session ID', 'Tipo', 'Fecha (Cierre)', 'Vehículos', 'Staff']];
      for (const e of (events.results || [])) {
        excelData.push([e.id, (e as any).session_id, (e as any).event_type, (e as any).closed_at, (e as any).total_vehicles, (e as any).total_staff]);
      }
      const ws = XLSX.utils.aoa_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Eventos");
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
      const excelBase64 = uint8ArrayToBase64(new Uint8Array(excelBuffer));
      await sendEmail(env, adminEmail, 'Base de Datos de Eventos Cerrados', '<p>Adjunto encontrarás la base de datos de los últimos 100 eventos cerrados.</p>', [{ filename: 'BBDD_Eventos.xlsx', content: excelBase64, content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }]);
      return c.json({ success: true, message: `BBDD de eventos enviada a ${adminEmail}` });
    } else if (type === 'vehiculos') {
      const vehicles = await env.DB.prepare('SELECT plate, brand, color, owner_phone, status, session_id FROM vehicles ORDER BY id DESC LIMIT 500').all();
      let excelData = [['Placa', 'Marca', 'Color', 'Teléfono', 'Estado', 'Session ID']];
      for (const v of (vehicles.results || [])) {
        excelData.push([(v as any).plate, (v as any).brand, (v as any).color, (v as any).owner_phone, (v as any).status, (v as any).session_id]);
      }
      const ws = XLSX.utils.aoa_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Vehiculos");
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
      const excelBase64 = uint8ArrayToBase64(new Uint8Array(excelBuffer));
      await sendEmail(env, adminEmail, 'Base de Datos de Vehículos', '<p>Adjunto encontrarás la base de datos de los últimos 500 vehículos.</p>', [{ filename: 'BBDD_Vehiculos.xlsx', content: excelBase64, content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }]);
      return c.json({ success: true, message: `BBDD de vehículos enviada a ${adminEmail}` });
    } else if (type === 'personal') {
      const users = await env.DB.prepare('SELECT id, name, role, is_active, phone FROM users ORDER BY name ASC').all();
      let excelData = [['ID', 'Nombre', 'Rol', 'Activo', 'Teléfono']];
      for (const u of (users.results || [])) {
        excelData.push([u.id, (u as any).name, (u as any).role, (u as any).is_active ? 'Sí' : 'No', (u as any).phone]);
      }
      const ws = XLSX.utils.aoa_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Personal");
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
      const excelBase64 = uint8ArrayToBase64(new Uint8Array(excelBuffer));
      await sendEmail(env, adminEmail, 'Matriz Completa de Personal', '<p>Adjunto encontrarás la matriz completa de personal.</p>', [{ filename: 'Matriz_Personal.xlsx', content: excelBase64, content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }]);
      return c.json({ success: true, message: `Matriz de personal enviada a ${adminEmail}` });
    } else if (type === 'nominas') {
      // Para simplificar ya que staff_payroll u otra tabla de nómina puede no existir, devolvemos un reporte de sesiones
      const sessions = await env.DB.prepare('SELECT id, name, status, started_at FROM sessions ORDER BY started_at DESC LIMIT 100').all();
      let excelData = [['Session ID', 'Nombre', 'Estado', 'Fecha']];
      for (const s of (sessions.results || [])) {
        excelData.push([s.id, (s as any).name, (s as any).status, (s as any).started_at]);
      }
      const ws = XLSX.utils.aoa_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Nominas");
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
      const excelBase64 = uint8ArrayToBase64(new Uint8Array(excelBuffer));
      await sendEmail(env, adminEmail, 'Resumen Contable de Nóminas (MOCK)', '<p>Adjunto encontrarás una simulación del resumen contable de nóminas.</p>', [{ filename: 'Nominas.xlsx', content: excelBase64, content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }]);
      return c.json({ success: true, message: `Resumen de nóminas enviado a ${adminEmail}` });
    } else if (type === 'cierre_pago') {
      const html = `<div style="font-family: sans-serif; padding: 20px;"><h2>Cierre de Ciclo de Pago</h2><p>Este es un correo simulado de cierre de ciclo de pago. Se han marcado los eventos aprobados como PAGADOS.</p></div>`;
      await sendEmail(env, adminEmail, 'Cierre de Ciclo de Pago', html);
      return c.json({ success: true, message: `Correo de cierre enviado a ${adminEmail}` });
    } else {
      return c.json({ error: 'Tipo de reporte de prueba no soportado' }, 400);
    }
  } catch (e: any) {
    console.error('Error global en test-request:', e);
    return c.json({ error: 'Error del servidor procesando la prueba: ' + e.message }, 500);
  }
});

app.post('/api/reports/send-credentials', async (c) => {
  try {
    const { user_id } = await c.req.json();
    if (!user_id) return c.json({ error: 'user_id requerido' }, 400);

    const user = await c.env.DB.prepare('SELECT name, email, pin_hash FROM users WHERE id = ?').bind(user_id).first<any>();
    if (!user) return c.json({ error: 'Usuario no encontrado' }, 404);

    const firstName = user.name.split(' ')[0];
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background:#0b0f19; font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px; margin:40px auto; background:#131929; border-radius:20px; overflow:hidden; border:1px solid rgba(255,255,255,0.08);">
    <div style="background:linear-gradient(135deg,#1a1f35 0%,#0f172a 100%); padding:40px 40px 30px; text-align:center; border-bottom:1px solid rgba(255,255,255,0.06);">
      <div style="font-size:2.5rem; margin-bottom:10px;">👑</div>
      <h1 style="margin:0; color:#ffffff; font-size:1.6rem; font-weight:900; letter-spacing:-0.5px;">EYE STAFF</h1>
      <p style="margin:6px 0 0; color:#64748b; font-size:0.75rem; letter-spacing:3px; text-transform:uppercase;">Plataforma Integral de Operaciones</p>
    </div>
    <div style="padding:35px 40px;">
      <p style="color:#94a3b8; font-size:0.95rem; margin:0 0 25px;">Hola <strong style="color:#fff;">${firstName}</strong>, aquí están tus credenciales de acceso a la plataforma:</p>
      <div style="background:#0f172a; border-radius:14px; border:1px solid rgba(234,179,8,0.25); padding:25px; margin-bottom:25px;">
        <div style="margin-bottom:18px;">
          <div style="font-size:0.65rem; color:#64748b; letter-spacing:2px; text-transform:uppercase; margin-bottom:6px;">🌐 URL de Acceso</div>
          <div style="font-size:1rem; color:#eab308; font-weight:700;">https://eye-staff.app</div>
        </div>
        <div style="border-top:1px solid rgba(255,255,255,0.06); padding-top:18px; margin-bottom:18px;">
          <div style="font-size:0.65rem; color:#64748b; letter-spacing:2px; text-transform:uppercase; margin-bottom:6px;">👤 Nombre de Usuario</div>
          <div style="font-size:1.1rem; color:#ffffff; font-weight:900; letter-spacing:1px;">${user.name}</div>
        </div>
        <div style="border-top:1px solid rgba(255,255,255,0.06); padding-top:18px;">
          <div style="font-size:0.65rem; color:#64748b; letter-spacing:2px; text-transform:uppercase; margin-bottom:6px;">🔑 Contraseña (PIN)</div>
          <div style="font-size:1.3rem; color:#eab308; font-weight:900; letter-spacing:3px; font-family:monospace;">${user.pin_hash}</div>
        </div>
      </div>
      <p style="color:#94a3b8; font-size:0.8rem; letter-spacing:2px; text-transform:uppercase; margin-bottom:14px;">Cómo ingresar:</p>
      <div>
        <div style="display:flex; align-items:flex-start; gap:14px; padding:12px 0; border-bottom:1px solid rgba(255,255,255,0.04);">
          <div style="min-width:26px; height:26px; border-radius:50%; background:rgba(234,179,8,0.15); border:1px solid rgba(234,179,8,0.3); color:#eab308; font-size:0.75rem; font-weight:900; line-height:26px; text-align:center;">1</div>
          <div style="color:#cbd5e1; font-size:0.9rem; padding-top:3px;">Abre <strong style="color:#eab308;">https://eye-staff.app</strong> en tu teléfono o computadora.</div>
        </div>
        <div style="display:flex; align-items:flex-start; gap:14px; padding:12px 0; border-bottom:1px solid rgba(255,255,255,0.04);">
          <div style="min-width:26px; height:26px; border-radius:50%; background:rgba(234,179,8,0.15); border:1px solid rgba(234,179,8,0.3); color:#eab308; font-size:0.75rem; font-weight:900; line-height:26px; text-align:center;">2</div>
          <div style="color:#cbd5e1; font-size:0.9rem; padding-top:3px;">Escribe tu nombre: <strong style="color:#fff;">${user.name}</strong></div>
        </div>
        <div style="display:flex; align-items:flex-start; gap:14px; padding:12px 0;">
          <div style="min-width:26px; height:26px; border-radius:50%; background:rgba(234,179,8,0.15); border:1px solid rgba(234,179,8,0.3); color:#eab308; font-size:0.75rem; font-weight:900; line-height:26px; text-align:center;">3</div>
          <div style="color:#cbd5e1; font-size:0.9rem; padding-top:3px;">Ingresa tu contraseña y pulsa <strong style="color:#fff;">ENTRAR</strong>. ¡Listo!</div>
        </div>
      </div>
      <div style="margin-top:25px; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2); border-radius:10px; padding:14px 18px;">
        <p style="margin:0; color:#fca5a5; font-size:0.8rem;">🔒 <strong>Mantén tu contraseña segura.</strong> Si deseas cambiarla, contacta al administrador.</p>
      </div>
    </div>
    <div style="padding:20px 40px 30px; text-align:center; border-top:1px solid rgba(255,255,255,0.06);">
      <p style="margin:0; color:#334155; font-size:0.7rem; letter-spacing:1px;">EYE STAFF 2026 — Todos los derechos reservados</p>
    </div>
  </div>
</body>
</html>`;
    await sendEmail(c.env, c.env.DIRECTOR_EMAIL, `👑 Credenciales de acceso de ${user.name} — EYE STAFF App`, html);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete('/api/sessions/:id', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Falta ID de sesión' }, 400);

  try {
    // 0. Si tiene presupuesto asociado, cambiar su estatus a NO APROBADO
    const session = await c.env.DB.prepare('SELECT budget_id FROM sessions WHERE id = ?').bind(id).first<{ budget_id: string }>();
    if (session && session.budget_id) {
      await c.env.DB.prepare('UPDATE budgets SET estatus = "NO APROBADO" WHERE id = ?').bind(session.budget_id).run();
    }

    // 1. Quitar la sesión de los usuarios que la tengan asignada
    const usersWithSession = await c.env.DB.prepare("SELECT id, current_session_id FROM users WHERE current_session_id = ? OR instr(',' || current_session_id || ',', ',' || CAST(? AS TEXT) || ',') > 0").bind(String(id), String(id)).all<{ id: number, current_session_id: string }>();
    for (const u of (usersWithSession.results || [])) {
      let currentIds = u.current_session_id ? u.current_session_id.toString().split(',').map(x => x.trim()).filter(Boolean) : [];
      currentIds = currentIds.filter(x => x !== id.toString());
      await c.env.DB.prepare('UPDATE users SET current_session_id = ? WHERE id = ?').bind(currentIds.length > 0 ? currentIds.join(',') : null, u.id).run();
    }

    // 2. Eliminar toda la data asociada y finalmente la sesión
    await Promise.all([
      c.env.DB.prepare('DELETE FROM payroll_submissions WHERE session_id = ?').bind(id).run(),
      c.env.DB.prepare('DELETE FROM chat_messages WHERE session_id = ?').bind(id).run(),
      c.env.DB.prepare('DELETE FROM access_control_guests WHERE session_id = ?').bind(id).run(),
      c.env.DB.prepare('DELETE FROM access_logs WHERE session_id = ?').bind(id).run(),
      c.env.DB.prepare('DELETE FROM guest_list WHERE session_id = ?').bind(id).run(),
      c.env.DB.prepare('DELETE FROM staff_attendance WHERE session_id = ?').bind(id).run(),
      c.env.DB.prepare('DELETE FROM guardia_details WHERE session_id = ?').bind(id).run(),
      c.env.DB.prepare('DELETE FROM event_reports WHERE session_id = ?').bind(id).run(),
      c.env.DB.prepare('DELETE FROM photos WHERE vehicle_id IN (SELECT id FROM vehicles WHERE session_id = ?)').bind(id).run(),
      c.env.DB.prepare('DELETE FROM events WHERE vehicle_id IN (SELECT id FROM vehicles WHERE session_id = ?)').bind(id).run(),
      c.env.DB.prepare('DELETE FROM vehicles WHERE session_id = ?').bind(id).run(),
      c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run()
    ]);

    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/sessions/close', async (c) => {
  let { id, pin, status } = await c.req.json().catch(() => ({}));

  // Decodificar JWT manualmente (esta ruta está antes del middleware de auth)
  const authHeader = c.req.header('Authorization');
  let currentUserId: number | null = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const payload = await verify(token, c.env.JWT_SECRET || 'secret', 'HS256') as any;
      currentUserId = payload.id;
    } catch (e) {
      return c.json({ error: 'Token inválido o expirado' }, 401);
    }
  }

  if (!currentUserId) {
    return c.json({ error: 'No autorizado - Token requerido' }, 401);
  }

  if (!id) {
    const active = await c.env.DB.prepare('SELECT id FROM sessions WHERE status = "active" ORDER BY id DESC LIMIT 1').first<{ id: number }>();
    id = active ? active.id : null;
  }

  if (!id) return c.json({ error: 'No hay sesión activa para cerrar' }, 400);

  if (status === 'budgeted') {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();

    const usersWithSession = await c.env.DB.prepare("SELECT id, current_session_id FROM users WHERE current_session_id = ? OR instr(',' || current_session_id || ',', ',' || CAST(? AS TEXT) || ',') > 0").bind(String(id), String(id)).all<{ id: number, current_session_id: string }>();
    for (const u of (usersWithSession.results || [])) {
      let currentIds = u.current_session_id ? u.current_session_id.toString().split(',').map(x => x.trim()).filter(Boolean) : [];
      currentIds = currentIds.filter(x => x !== id.toString());
      await c.env.DB.prepare('UPDATE users SET current_session_id = ? WHERE id = ?').bind(currentIds.length > 0 ? currentIds.join(',') : null, u.id).run();
    }

    return c.json({ success: true, status: 'budgeted', session_id: id });
  }

  if (!pin) {
    return c.json({ error: 'Debe ingresar su clave personal de seguridad para cerrar el evento' }, 400);
  }

  let dbUser: any = null;
  if (currentUserId === 1) {
    dbUser = { name: 'ADMIN', pin_hash: 'corifede1416' };
  } else {
    dbUser = await c.env.DB.prepare('SELECT pin_hash, name FROM users WHERE id = ?').bind(currentUserId).first<any>();
  }
  if (!dbUser || (dbUser.pin_hash || '').toString().toLowerCase() !== pin.toString().trim().toLowerCase()) {
    return c.json({ error: 'La clave ingresada es incorrecta. No se pudo finalizar el evento.' }, 400);
  }

  await c.env.DB.prepare('UPDATE sessions SET status = "closed", ended_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run();

  // Liberar personal asignado al cerrar
  const usersWithSession = await c.env.DB.prepare("SELECT id, current_session_id FROM users WHERE current_session_id = ? OR instr(',' || current_session_id || ',', ',' || CAST(? AS TEXT) || ',') > 0").bind(String(id), String(id)).all<{ id: number, current_session_id: string }>();
  for (const u of (usersWithSession.results || [])) {
    let currentIds = u.current_session_id ? u.current_session_id.toString().split(',').map(x => x.trim()).filter(Boolean) : [];
    currentIds = currentIds.filter(x => x !== id.toString());
    await c.env.DB.prepare('UPDATE users SET current_session_id = ? WHERE id = ?').bind(currentIds.length > 0 ? currentIds.join(',') : null, u.id).run();
  }

  // Registrar auditoría
  await logAudit(c.env, currentUserId, 'CERRAR_EVENTO', `Evento ID ${id} cerrado exitosamente por ${dbUser.name}`, c);

  // Generar reporte detallado y enviar por email
  const reportData = await sendEventClosingReport(c.env, id);

  return c.json({ success: true, status: 'closed', session_id: id, report: reportData });
});

// ===================== BBDD DE EVENTOS =====================
app.get('/api/event-reports', async (c) => {
  const type = c.req.query('type');
  let query = 'SELECT * FROM event_reports';
  const params: any[] = [];
  if (type && type !== 'TODOS') {
    query += ' WHERE event_type = ?';
    params.push(type);
  }
  query += ' ORDER BY closed_at DESC';
  const res = params.length > 0
    ? await c.env.DB.prepare(query).bind(...params).all<any>()
    : await c.env.DB.prepare(query).all<any>();
  return c.json({ reports: res.results || [] });
});

app.get('/api/event-reports/:id/details', async (c) => {
  try {
    const reportId = c.req.param('id');
    const report = await c.env.DB.prepare('SELECT * FROM event_reports WHERE id = ?').bind(reportId).first<any>();
    if (!report) return c.json({ error: 'Reporte no encontrado' }, 404);

    const sessionId = report.session_id;

    // 1. Obtener detalles de la sesión
    const session = await c.env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(sessionId).first<any>();
    if (!session) return c.json({ error: 'Sesión no encontrada' }, 404);

    // 2. Obtener vehículos
    const vehiclesRes = await c.env.DB.prepare(`
      SELECT v.*,
        (SELECT COUNT(*) FROM vehicles v2 WHERE v2.plate = v.plate AND v2.session_id != ?) as recurrence_count
      FROM vehicles v WHERE v.session_id = ?
      ORDER BY v.created_at DESC
    `).bind(String(sessionId), String(sessionId)).all<any>();
    const vehicles = vehiclesRes.results || [];

    // 3. Obtener personal con asistencia
    const staffRes = await c.env.DB.prepare(`
      SELECT DISTINCT u.id, u.name, u.role
      FROM users u
      JOIN staff_attendance sa ON sa.user_id = u.id AND sa.session_id = ?
      ORDER BY u.name ASC
    `).bind(sessionId).all<any>();
    const staffList = staffRes.results || [];

    const staffWithAttendance: any[] = [];
    const allAttendanceLogs: any[] = [];

    for (const member of staffList) {
      const attRes = await c.env.DB.prepare(
        `SELECT type, timestamp FROM staff_attendance WHERE user_id = ? AND session_id = ? ORDER BY timestamp ASC`
      ).bind(member.id, sessionId).all<any>();
      const att = attRes.results || [];

      // Guardar para el timeline
      for (const log of att) {
        allAttendanceLogs.push({
          user_name: member.name,
          role: member.role,
          type: log.type,
          timestamp: log.timestamp
        });
      }

      const entry = att.find((a: any) => a.type === 'entry');
      const exit = att.find((a: any) => a.type === 'exit');
      const breaks = att.filter((a: any) => a.type === 'break_start' || a.type === 'break_end');

      let breakMins = 0;
      for (let i = 0; i < breaks.length - 1; i += 2) {
        if (breaks[i].type === 'break_start' && breaks[i + 1]?.type === 'break_end') {
          breakMins += Math.round((new Date(breaks[i + 1].timestamp).getTime() - new Date(breaks[i].timestamp).getTime()) / 60000);
        }
      }

      let totalMins = 0;
      if (entry && exit) {
        totalMins = Math.round((new Date(exit.timestamp).getTime() - new Date(entry.timestamp).getTime()) / 60000) - breakMins;
      } else if (entry) {
        totalMins = Math.round((Date.now() - new Date(entry.timestamp).getTime()) / 60000) - breakMins;
      }

      const vehiclesAttended = vehicles.filter((v: any) => {
        if (!entry) return false;
        const checkIn = new Date(v.created_at).getTime();
        const entryTs = new Date(entry.timestamp).getTime();
        const exitTs = exit ? new Date(exit.timestamp).getTime() : Date.now();
        return checkIn >= entryTs && checkIn <= exitTs;
      }).length;

      staffWithAttendance.push({
        ...member,
        entry_time: entry ? entry.timestamp : null,
        exit_time: exit ? exit.timestamp : null,
        break_mins: breakMins,
        total_mins: totalMins,
        vehicles_attended: vehiclesAttended,
      });
    }

    // 4. Crear línea de tiempo (timeline) cronológica (de más reciente a más antiguo)
    const timeline: any[] = [];

    // Agregar eventos de la sesión
    if (session.started_at) {
      timeline.push({
        type: 'session_start',
        title: '🏁 INICIO DEL EVENTO',
        description: `Evento "${session.name}" se inició formalmente.`,
        timestamp: session.started_at,
        icon: '🏁',
        color: '#22c55e'
      });
    }
    if (session.ended_at) {
      timeline.push({
        type: 'session_end',
        title: '🔒 CIERRE DEL EVENTO',
        description: `Evento "${session.name}" finalizado y cerrado de forma segura.`,
        timestamp: session.ended_at,
        icon: '🔒',
        color: '#ef4444'
      });
    }

    // Agregar entradas y salidas de vehículos
    for (const v of vehicles) {
      if (v.created_at) {
        timeline.push({
          type: 'vehicle_in',
          title: `🚗 ENTRADA: ${v.plate}`,
          description: `Vehículo ${v.brand || ''} ${v.color || ''} en custodia. Cliente: ${v.owner_name || 'Particular'}.`,
          timestamp: v.created_at,
          icon: '🚗',
          color: '#3b82f6',
          meta: { plate: v.plate, owner: v.owner_name, phone: v.owner_phone }
        });
      }
      if (v.check_out_at) {
        const duration = v.created_at ? Math.round((new Date(v.check_out_at).getTime() - new Date(v.created_at).getTime()) / 60000) : null;
        timeline.push({
          type: 'vehicle_out',
          title: `🔑 SALIDA: ${v.plate}`,
          description: `Vehículo entregado al propietario exitosamente. ${duration ? `Estancia: ${duration} min.` : ''}`,
          timestamp: v.check_out_at,
          icon: '🔑',
          color: '#10b981',
          meta: { plate: v.plate, owner: v.owner_name, duration }
        });
      }
    }

    // Agregar eventos de asistencia
    for (const log of allAttendanceLogs) {
      let title = '';
      let description = '';
      let icon = '';
      let color = '';

      if (log.type === 'entry') {
        title = `👤 ENTRADA: ${log.user_name}`;
        description = `Inicio de jornada como ${log.role.toUpperCase()}.`;
        icon = '👤';
        color = '#a855f7';
      } else if (log.type === 'exit') {
        title = `👤 SALIDA: ${log.user_name}`;
        description = `Fin de jornada.`;
        icon = '🏃';
        color = '#f97316';
      } else if (log.type === 'break_start') {
        title = `☕ DESCANSO: ${log.user_name}`;
        description = `Inicio de receso de descanso.`;
        icon = '☕';
        color = '#eab308';
      } else if (log.type === 'break_end') {
        title = `💼 REGRESO: ${log.user_name}`;
        description = `Regreso de receso a posición de trabajo.`;
        icon = '💼';
        color = '#06b6d4';
      }

      timeline.push({
        type: `staff_${log.type}`,
        title,
        description,
        timestamp: log.timestamp,
        icon,
        color
      });
    }

    // Ordenar timeline por timestamp DESC (más reciente a más antiguo)
    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return c.json({
      report,
      session,
      vehicles,
      staff: staffWithAttendance,
      timeline
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/api/event-reports/:id/download/:filetype', async (c) => {
  const reportId = c.req.param('id');
  const filetype = c.req.param('filetype'); // 'pdf' or 'excel'
  const report = await c.env.DB.prepare('SELECT * FROM event_reports WHERE id = ?').bind(reportId).first<any>();
  if (!report) return c.json({ error: 'Reporte no encontrado' }, 404);

  const key = filetype === 'pdf' ? report.pdf_r2_key : report.excel_r2_key;
  if (!key) return c.json({ error: 'Archivo no disponible' }, 404);

  const obj = await c.env.PHOTOS.get(key);
  if (!obj) return c.json({ error: 'Archivo no encontrado en almacenamiento' }, 404);

  const contentType = filetype === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const filename = key.split('/').pop() || `reporte.${filetype === 'pdf' ? 'pdf' : 'xlsx'}`;

  return new Response(obj.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    }
  });
});

app.post('/api/event-reports/:id/send-email', async (c) => {
  try {
    const reportId = c.req.param('id');
    const body = await c.req.json<{ additionalEmails?: string[], ccEmail?: string }>().catch(() => ({}) as any);

    const report = await c.env.DB.prepare('SELECT * FROM event_reports WHERE id = ?').bind(reportId).first<any>();
    if (!report) return c.json({ error: 'Reporte no encontrado' }, 404);

    let session = await c.env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(report.session_id).first<any>();
    if (!session) {
      // Reporte sintético de alquiler — usar datos del event_report directamente
      session = { id: 0, name: report.session_name || 'Alquiler', event_type: report.event_type || 'alquiler de equipos' };
    }

    let pdfBase64 = '';
    let excelBase64 = '';
    const safeName = session.name.replace(/[^a-zA-Z0-9_\-]/g, '_');

    try {
      if (report.pdf_r2_key) {
        const pdfObj = await c.env.PHOTOS.get(report.pdf_r2_key);
        if (pdfObj) {
          const buffer = await pdfObj.arrayBuffer();
          pdfBase64 = uint8ArrayToBase64(new Uint8Array(buffer));
        }
      }
      if (report.excel_r2_key) {
        const excelObj = await c.env.PHOTOS.get(report.excel_r2_key);
        if (excelObj) {
          const buffer = await excelObj.arrayBuffer();
          excelBase64 = uint8ArrayToBase64(new Uint8Array(buffer));
        }
      }
    } catch (e: any) {
      console.error('Error fetching files from R2 for email resend:', e);
    }

    const attachments: any[] = [];
    if (excelBase64) {
      attachments.push({ filename: `Reporte_${safeName}.xlsx`, content: excelBase64, content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }
    if (pdfBase64) {
      attachments.push({ filename: `Reporte_${safeName}.pdf`, content: pdfBase64, content_type: 'application/pdf' });
    }

    // Recuperar vehículos y personal para el HTML del email
    const vehiclesRes = await c.env.DB.prepare('SELECT * FROM vehicles WHERE session_id = ?').bind(report.session_id).all<any>();
    const vehicles = vehiclesRes.results || [];

    const assignedStaffRes = await c.env.DB.prepare(`
      SELECT DISTINCT u.id, u.name, u.role
      FROM users u
      JOIN staff_attendance sa ON sa.user_id = u.id AND sa.session_id = ?
      ORDER BY u.name ASC
    `).bind(report.session_id).all<any>().catch(async () => {
      // Intenta con fallback si no hay staff_attendance
      return await c.env.DB.prepare(`
        SELECT DISTINCT u.id, u.name, u.role
        FROM users u
        WHERE u.current_session_id = ? OR instr(',' || u.current_session_id || ',', ',' || CAST(? AS TEXT) || ',') > 0
      `).bind(report.session_id, report.session_id).all<any>();
    });
    const staffList = assignedStaffRes.results || [];

    const staffWithAttendance: any[] = [];
    for (const member of staffList) {
      const attRes = await c.env.DB.prepare(
        `SELECT type, timestamp FROM staff_attendance WHERE user_id = ? AND session_id = ? ORDER BY timestamp ASC`
      ).bind(member.id, report.session_id).all<any>();
      const att = attRes.results || [];
      const entry = att.find((a: any) => a.type === 'entry');
      const exit = att.find((a: any) => a.type === 'exit');
      const breaks = att.filter((a: any) => a.type === 'break_start' || a.type === 'break_end');
      let breakMins = 0;
      for (let i = 0; i < breaks.length - 1; i += 2) {
        if (breaks[i].type === 'break_start' && breaks[i + 1]?.type === 'break_end') {
          breakMins += Math.round((new Date(breaks[i + 1].timestamp).getTime() - new Date(breaks[i].timestamp).getTime()) / 60000);
        }
      }
      let totalMins = 0;
      if (entry && exit) {
        totalMins = Math.round((new Date(exit.timestamp).getTime() - new Date(entry.timestamp).getTime()) / 60000) - breakMins;
      }
      const vehiclesAttended = vehicles.filter((v: any) => {
        if (!entry) return false;
        const checkIn = new Date(v.created_at).getTime();
        const entryTs = new Date(entry.timestamp).getTime();
        const exitTs = exit ? new Date(exit.timestamp).getTime() : Date.now();
        return checkIn >= entryTs && checkIn <= exitTs;
      }).length;

      staffWithAttendance.push({
        ...member,
        entry_time: entry ? fmtTime(new Date(entry.timestamp)) : '—',
        exit_time: exit ? fmtTime(new Date(exit.timestamp)) : '—',
        break_mins: breakMins,
        total_mins: totalMins,
        vehicles_attended: vehiclesAttended,
      });
    }

    const summary = report.summary_json ? JSON.parse(report.summary_json) : {};
    const html = buildClosingEmailHtml(session, vehicles, staffWithAttendance, summary);

    const primaryEmail = c.env.DIRECTOR_EMAIL;

    // Agregar CCs
    const ccEmailsSet = new Set<string>();
    if (body.ccEmail) {
      const cleanCc = body.ccEmail.trim().toLowerCase();
      if (cleanCc && cleanCc !== primaryEmail) ccEmailsSet.add(cleanCc);
    }
    if (body.additionalEmails && Array.isArray(body.additionalEmails)) {
      body.additionalEmails.forEach((email: string) => {
        const cleanEmail = email.trim().toLowerCase();
        if (cleanEmail && cleanEmail !== primaryEmail) ccEmailsSet.add(cleanEmail);
      });
    }
    const ccList = Array.from(ccEmailsSet);

    await sendEmail(c.env, primaryEmail, `EYE STAFF: Reporte Final (Reenvío) — ${session.name}`, html, attachments, ccList);

    // Actualizar el historial de emails enviados en el reporte
    let currentHistory: string[] = [];
    try {
      currentHistory = report.sent_emails_history ? JSON.parse(report.sent_emails_history) : [];
      if (!Array.isArray(currentHistory)) currentHistory = [];
    } catch (e) {
      currentHistory = [];
    }

    // Agregar los nuevos emails enviados al historial
    ccList.forEach(email => {
      if (!currentHistory.includes(email)) {
        currentHistory.push(email);
      }
    });

    await c.env.DB.prepare('UPDATE event_reports SET sent_emails_history = ? WHERE id = ?')
      .bind(JSON.stringify(currentHistory), reportId)
      .run();

    return c.json({ success: true, sent_emails: ccList, full_history: currentHistory });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

async function sendEventClosingReport(env: Env, sessionId: number) {
  const session = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(sessionId).first<any>();
  if (!session) return null;

  // --- Recopilar datos de vehículos ---
  const vehiclesRes = await env.DB.prepare(`
    SELECT v.*,
      (SELECT COUNT(*) FROM vehicles v2 WHERE v2.plate = v.plate AND v2.session_id != ?) as recurrence_count
    FROM vehicles v WHERE v.session_id = ?
    ORDER BY v.daily_seq ASC
  `).bind(String(sessionId), String(sessionId)).all<any>();
  const vehicles = vehiclesRes.results || [];

  // --- Recopilar datos de personal con asistencia ---
  const assignedStaffRes = await env.DB.prepare(`
    SELECT DISTINCT u.id, u.name, u.role
    FROM users u
    JOIN staff_attendance sa ON sa.user_id = u.id AND sa.session_id = ?
    ORDER BY u.name ASC
  `).bind(sessionId).all<any>();
  const staffList = assignedStaffRes.results || [];

  // Obtener registros de asistencia por persona
  const staffWithAttendance: any[] = [];
  for (const member of staffList) {
    const attRes = await env.DB.prepare(
      `SELECT type, timestamp FROM staff_attendance WHERE user_id = ? AND session_id = ? ORDER BY timestamp ASC`
    ).bind(member.id, sessionId).all<any>();
    const att = attRes.results || [];

    const isAbsent = att.some((a: any) => a.type === 'absent');
    const entry = att.find((a: any) => a.type === 'entry');
    const exit = att.find((a: any) => a.type === 'exit');
    const breaks = att.filter((a: any) => a.type === 'break_start' || a.type === 'break_end');

    let breakMins = 0;
    for (let i = 0; i < breaks.length - 1; i += 2) {
      if (breaks[i].type === 'break_start' && breaks[i + 1]?.type === 'break_end') {
        breakMins += Math.round((new Date(breaks[i + 1].timestamp).getTime() - new Date(breaks[i].timestamp).getTime()) / 60000);
      }
    }

    let totalMins = 0;
    if (entry && exit) {
      totalMins = Math.round((new Date(exit.timestamp).getTime() - new Date(entry.timestamp).getTime()) / 60000) - breakMins;
    }

    // Vehículos atendidos: checkins/checkouts registrados durante su turno
    const vehiclesAttended = vehicles.filter((v: any) => {
      if (!entry) return false;
      const checkIn = new Date(v.created_at).getTime();
      const entryTs = new Date(entry.timestamp).getTime();
      const exitTs = exit ? new Date(exit.timestamp).getTime() : Date.now();
      return checkIn >= entryTs && checkIn <= exitTs;
    }).length;

    staffWithAttendance.push({
      ...member,
      entry_time: isAbsent ? 'INASISTENTE' : (entry ? fmtTime(new Date(entry.timestamp)) : '—'),
      exit_time: isAbsent ? 'INASISTENTE' : (exit ? fmtTime(new Date(exit.timestamp)) : '—'),
      break_mins: breakMins,
      total_mins: totalMins,
      vehicles_attended: vehiclesAttended,
    });
  }

  // --- Estadísticas resumen ---
  const delivered = vehicles.filter((v: any) => ['delivered', 'retrieved'].includes(v.status)).length;
  const inCustody = vehicles.length - delivered;
  const eventStart = session.started_at ? new Date(session.started_at) : new Date();
  const eventEnd = session.ended_at ? new Date(session.ended_at) : new Date();
  const durationMins = Math.round((eventEnd.getTime() - eventStart.getTime()) / 60000);
  const avgStayMins = vehicles.length > 0
    ? Math.round(vehicles.reduce((acc: number, v: any) => {
      if (!v.check_out_at) return acc;
      return acc + (new Date(v.check_out_at).getTime() - new Date(v.created_at).getTime()) / 60000;
    }, 0) / (delivered || 1))
    : 0;

  const summaryData = {
    session_id: sessionId,
    session_name: session.name,
    event_type: session.type || 'valet',
    location: session.address || 'N/A',
    contact: session.contact_name || 'N/A',
    started_at: session.started_at,
    ended_at: session.ended_at,
    duration_mins: durationMins,
    total_vehicles: vehicles.length,
    total_delivered: delivered,
    total_in_custody: inCustody,
    avg_stay_mins: avgStayMins,
    total_staff: staffWithAttendance.length,
  };

  const safeName = session.name.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const dateStr = new Date().toISOString().slice(0, 10);

  // ===================== 1. EXCEL (XLSX) =====================
  const wb = XLSX.utils.book_new();

  // Hoja 1: Vehículos
  const vehHeaders = ['#', 'PLACA', 'PROPIETARIO', 'MARCA', 'MODELO', 'COLOR', 'TIPO', 'ESTADO', 'ENTRADA', 'SALIDA', 'TIEMPO(min)', 'RECURRENTE', 'SECUENCIA'];
  const vehRows = vehicles.map((v: any, i: number) => {
    const entry = v.created_at ? new Date(v.created_at) : null;
    const exit = v.check_out_at ? new Date(v.check_out_at) : null;
    const mins = (entry && exit) ? Math.round((exit.getTime() - entry.getTime()) / 60000) : '';
    const status = v.status === 'retrieved' || v.status === 'delivered' ? 'ENTREGADO' : 'EN CUSTODIA';
    return [
      i + 1, v.plate, v.owner_name || '', v.brand || '', v.model || '', v.color || '',
      v.vehicle_type || 'auto', status,
      entry ? fmtTime(entry) : '', exit ? fmtTime(exit) : '', mins,
      v.recurrence_count > 0 ? 'SÍ' : 'NO', v.daily_seq || ''
    ];
  });
  const wsVeh = XLSX.utils.aoa_to_sheet([vehHeaders, ...vehRows]);
  XLSX.utils.book_append_sheet(wb, wsVeh, 'VEHÍCULOS');

  // Hoja 2: Personal
  const staffHeaders = ['NOMBRE', 'ROL', 'ENTRADA', 'SALIDA', 'DESCANSO(min)', 'JORNADA(min)', 'VEHÍCULOS ATENDIDOS'];
  const staffRows = staffWithAttendance.map((s: any) => [
    s.name, s.role, s.entry_time, s.exit_time, s.break_mins, s.total_mins, s.vehicles_attended
  ]);
  const wsStaff = XLSX.utils.aoa_to_sheet([staffHeaders, ...staffRows]);
  XLSX.utils.book_append_sheet(wb, wsStaff, 'PERSONAL');

  // Hoja 3: Resumen Ejecutivo
  const summaryRows = [
    ['RESUMEN EJECUTIVO DEL EVENTO'],
    [],
    ['EVENTO', summaryData.session_name],
    ['TIPO', summaryData.event_type.toUpperCase()],
    ['UBICACIÓN', summaryData.location],
    ['CONTACTO', summaryData.contact],
    ['INICIO', formatFull24h(eventStart)],
    ['FIN', formatFull24h(eventEnd)],
    ['DURACIÓN (min)', summaryData.duration_mins],
    [],
    ['--- VEHÍCULOS ---'],
    ['Total Recibidos', summaryData.total_vehicles],
    ['Total Entregados', summaryData.total_delivered],
    ['En Custodia al Cierre', summaryData.total_in_custody],
    ['Tiempo Promedio Estancia (min)', summaryData.avg_stay_mins],
    [],
    ['--- PERSONAL ---'],
    ['Total Personal', summaryData.total_staff],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'RESUMEN EJECUTIVO');

  const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  // ===================== 2. PDF DETALLADO =====================
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageW = 595, pageH = 842; // A4
  const margin = 40;
  let page = pdfDoc.addPage([pageW, pageH]);
  let y = pageH - margin;

  const newPage = () => { page = pdfDoc.addPage([pageW, pageH]); y = pageH - margin; };
  const ensureSpace = (needed: number) => { if (y < margin + needed) newPage(); };

  // Header de página
  const drawPageHeader = () => {
    page.drawRectangle({ x: 0, y: pageH - 60, width: pageW, height: 60, color: rgb(0.06, 0.09, 0.15) });
    page.drawText('EYE STAFF', { x: margin, y: pageH - 38, size: 20, font: bold, color: rgb(0.94, 0.27, 0.27) });
    page.drawText('REPORTE OFICIAL DE CIERRE DE EVENTO', { x: margin, y: pageH - 55, size: 8, font, color: rgb(0.6, 0.6, 0.6) });
    page.drawText(`${session.name}  |  ID: ${sessionId}`, { x: 300, y: pageH - 38, size: 11, font: bold, color: rgb(1, 1, 1) });
    page.drawText(`Generado: ${formatFull24h(new Date())}`, { x: 300, y: pageH - 55, size: 7, font, color: rgb(0.6, 0.6, 0.6) });
    y = pageH - 75;
  };

  drawPageHeader();

  // Sección 1: Datos del evento
  page.drawRectangle({ x: margin, y: y - 5, width: pageW - 2 * margin, height: 16, color: rgb(0.94, 0.27, 0.27) });
  page.drawText('INFORMACIÓN DEL EVENTO', { x: margin + 5, y: y + 2, size: 9, font: bold, color: rgb(1, 1, 1) });
  y -= 22;

  const infoItems = [
    ['Evento:', session.name], ['Tipo:', (session.type || 'Valet Parking').toUpperCase()],
    ['Ubicación:', session.address || 'N/A'], ['Contacto:', session.contact_name || 'N/A'],
    ['Inicio:', formatFull24h(eventStart)], ['Fin:', formatFull24h(eventEnd)],
    ['Duración:', `${durationMins} minutos`], ['Total Vehículos:', String(vehicles.length)],
    ['Entregados:', String(delivered)], ['Personal:', String(staffWithAttendance.length)],
  ];
  for (const [label, value] of infoItems) {
    ensureSpace(15);
    page.drawText(label, { x: margin, y, size: 8, font: bold });
    page.drawText(value, { x: margin + 90, y, size: 8, font });
    y -= 13;
  }

  y -= 10;

  // Sección 2: Tabla de vehículos
  ensureSpace(30);
  page.drawRectangle({ x: margin, y: y - 5, width: pageW - 2 * margin, height: 16, color: rgb(0.06, 0.09, 0.15) });
  page.drawText('DETALLE DE VEHÍCULOS', { x: margin + 5, y: y + 2, size: 9, font: bold, color: rgb(1, 1, 1) });
  y -= 22;

  // Encabezado tabla
  const colsV = [40, 60, 90, 60, 55, 55, 60, 45, 45];
  const headV = ['#', 'PLACA', 'PROPIETARIO', 'MARCA', 'COLOR', 'ENTRADA', 'SALIDA', 'ESTADO', 'REC.'];
  let xCol = margin;
  page.drawRectangle({ x: margin, y: y - 2, width: pageW - 2 * margin, height: 14, color: rgb(0.92, 0.93, 0.94) });
  for (let ci = 0; ci < headV.length; ci++) {
    page.drawText(headV[ci], { x: xCol + 2, y: y + 1, size: 6, font: bold });
    xCol += colsV[ci];
  }
  y -= 16;

  for (let i = 0; i < vehicles.length; i++) {
    ensureSpace(12);
    if (i % 2 === 0) {
      page.drawRectangle({ x: margin, y: y - 2, width: pageW - 2 * margin, height: 12, color: rgb(0.97, 0.98, 0.99) });
    }
    const v = vehicles[i];
    const tIn = v.created_at ? fmtTime(new Date(v.created_at)) : '';
    const tOut = v.check_out_at ? fmtTime(new Date(v.check_out_at)) : '—';
    const status = ['delivered', 'retrieved'].includes(v.status) ? 'ENTREGADO' : 'CUSTODIA';
    const rec = v.recurrence_count > 0 ? 'SÍ' : 'NO';
    const row = [String(i + 1), v.plate || '', (v.owner_name || '').substring(0, 14), v.brand || '', v.color || '', tIn, tOut, status, rec];
    xCol = margin;
    for (let ci = 0; ci < row.length; ci++) {
      page.drawText(row[ci], { x: xCol + 2, y: y + 1, size: 6, font });
      xCol += colsV[ci];
    }
    y -= 12;
  }

  y -= 10;

  // Sección 3: Personal
  ensureSpace(30);
  page.drawRectangle({ x: margin, y: y - 5, width: pageW - 2 * margin, height: 16, color: rgb(0.06, 0.09, 0.15) });
  page.drawText('PERSONAL Y JORNADA LABORAL', { x: margin + 5, y: y + 2, size: 9, font: bold, color: rgb(1, 1, 1) });
  y -= 22;

  const colsS = [140, 80, 50, 50, 60, 70, 70];
  const headS = ['NOMBRE', 'ROL', 'ENTRADA', 'SALIDA', 'DESC.(min)', 'JORNADA(min)', 'VEH. ATENDIDOS'];
  xCol = margin;
  page.drawRectangle({ x: margin, y: y - 2, width: pageW - 2 * margin, height: 14, color: rgb(0.92, 0.93, 0.94) });
  for (let ci = 0; ci < headS.length; ci++) {
    page.drawText(headS[ci], { x: xCol + 2, y: y + 1, size: 6, font: bold });
    xCol += colsS[ci];
  }
  y -= 16;

  for (let i = 0; i < staffWithAttendance.length; i++) {
    ensureSpace(12);
    if (i % 2 === 0) {
      page.drawRectangle({ x: margin, y: y - 2, width: pageW - 2 * margin, height: 12, color: rgb(0.97, 0.98, 0.99) });
    }
    const s = staffWithAttendance[i];
    const srow = [s.name.substring(0, 22), s.role.substring(0, 12), s.entry_time, s.exit_time, String(s.break_mins), String(s.total_mins), String(s.vehicles_attended)];
    xCol = margin;
    for (let ci = 0; ci < srow.length; ci++) {
      page.drawText(srow[ci], { x: xCol + 2, y: y + 1, size: 6, font });
      xCol += colsS[ci];
    }
    y -= 12;
  }

  y -= 15;

  // Sección 4: Resumen ejecutivo
  ensureSpace(80);
  page.drawRectangle({ x: margin, y: y - 5, width: pageW - 2 * margin, height: 16, color: rgb(0.94, 0.27, 0.27) });
  page.drawText('RESUMEN EJECUTIVO', { x: margin + 5, y: y + 2, size: 9, font: bold, color: rgb(1, 1, 1) });
  y -= 22;

  const execLines = [
    `El evento "${session.name}" se desarrolló en ${session.address || 'la ubicación acordada'}.`,
    `Inicio: ${formatFull24h(eventStart)}  |  Fin: ${formatFull24h(eventEnd)}  |  Duración total: ${durationMins} minutos.`,
    `Se recibieron ${vehicles.length} vehículos, de los cuales ${delivered} fueron entregados (${inCustody} en custodia al cierre).`,
    `El tiempo promedio de estancia por vehículo fue de ${avgStayMins} minutos.`,
    `El equipo operativo estuvo compuesto por ${staffWithAttendance.length} persona(s).`,
    ``,
    `Este reporte ha sido generado automáticamente por EYE STAFF v2.4.41 al cierre del evento.`,
    `Para notas adicionales, contacte al coordinador responsable del evento.`,
  ];
  for (const line of execLines) {
    ensureSpace(14);
    page.drawText(line, { x: margin, y, size: 7.5, font: line === '' ? font : font, color: rgb(0.15, 0.15, 0.15) });
    y -= 13;
  }

  // Footer en última página
  page.drawLine({ start: { x: margin, y: margin + 20 }, end: { x: pageW - margin, y: margin + 20 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  page.drawText('EYE STAFF 2026 — Sistema de Gestión de Eventos y Personal  |  eye-staff.app', { x: margin, y: margin + 8, size: 6, font, color: rgb(0.6, 0.6, 0.6) });

  const pdfBytes = await pdfDoc.save();
  const pdfBase64 = uint8ArrayToBase64(pdfBytes);

  // ===================== 3. GUARDAR EN R2 =====================
  const pdfKey = `event-reports/${dateStr}/${safeName}_ID${sessionId}.pdf`;
  const excelKey = `event-reports/${dateStr}/${safeName}_ID${sessionId}.xlsx`;

  try {
    await env.PHOTOS.put(pdfKey, pdfBytes, { httpMetadata: { contentType: 'application/pdf' } });
    await env.PHOTOS.put(excelKey, xlsxBuffer, { httpMetadata: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
  } catch (e) { console.error('R2 Report Save Error:', e); }

  // ===================== 4. GUARDAR EN D1 =====================
  await env.DB.prepare(`
    INSERT INTO event_reports (session_id, session_name, event_type, total_vehicles, total_staff, pdf_r2_key, excel_r2_key, summary_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(sessionId, session.name, session.type || 'valet', vehicles.length, staffWithAttendance.length, pdfKey, excelKey, JSON.stringify(summaryData)).run();

  // ===================== 5. EMAIL CON ADJUNTOS =====================
  const html = buildClosingEmailHtml(session, vehicles, staffWithAttendance, summaryData);
  const xlsxBase64 = uint8ArrayToBase64(new Uint8Array(xlsxBuffer));
  const attachments = [
    { filename: `Reporte_${safeName}.xlsx`, content: xlsxBase64, content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    { filename: `Reporte_${safeName}.pdf`, content: pdfBase64, content_type: 'application/pdf' },
  ];
  const adminEmail = env.DIRECTOR_EMAIL ;

  const cierreSubs = await getSubscribedEmails(env, 'cierre_html');
  const dossierSubs = await getSubscribedEmails(env, 'dossier');
  const excelSubs = await getSubscribedEmails(env, 'excel');
  const ccList = [...new Set([...cierreSubs, ...dossierSubs, ...excelSubs])];

  await sendEmail(env, adminEmail, `EYE STAFF: Reporte Final — ${session.name}`, html, attachments, ccList);

  return { summaryData, vehicles, staffWithAttendance };
}

function fmtTime(d: Date): string {
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

function buildClosingEmailHtml(session: any, vehicles: any[], staff: any[], summary: any): string {
  return `<div style="font-family:Arial,sans-serif;color:#333;max-width:800px;margin:0 auto;border:1px solid #eee;">
    <div style="background:#0b0f19;padding:24px;text-align:center;">
      <h1 style="color:#ef4444;margin:0;letter-spacing:2px;">EYE STAFF</h1>
      <p style="color:#94a3b8;margin:4px 0 0 0;font-size:0.8rem;">REPORTE OFICIAL DE CIERRE DE EVENTO</p>
    </div>
    <div style="padding:24px;">
      <h2 style="margin-top:0;">${session.name}</h2>
      <p><b>Inicio:</b> ${formatFull24h(new Date(session.started_at))} &nbsp;|&nbsp; <b>Fin:</b> ${formatFull24h(new Date(session.ended_at || Date.now()))}</p>
      <p><b>Duración:</b> ${summary.duration_mins} min &nbsp;|&nbsp; <b>Ubicación:</b> ${summary.location}</p>
      <h3 style="color:#ef4444;border-bottom:2px solid #ef4444;padding-bottom:4px;">VEHÍCULOS (${vehicles.length})</h3>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <tr style="background:#f1f5f9;"><th style="border:1px solid #ddd;padding:6px;">PLACA</th><th style="border:1px solid #ddd;padding:6px;">MARCA/COLOR</th><th style="border:1px solid #ddd;padding:6px;">PROPIETARIO</th><th style="border:1px solid #ddd;padding:6px;">ENTRADA</th><th style="border:1px solid #ddd;padding:6px;">SALIDA</th><th style="border:1px solid #ddd;padding:6px;">ESTADO</th></tr>
        ${vehicles.map((v: any) => `<tr><td style="border:1px solid #ddd;padding:6px;font-weight:bold;">${v.plate}</td><td style="border:1px solid #ddd;padding:6px;">${v.brand || ''} ${v.color || ''}</td><td style="border:1px solid #ddd;padding:6px;">${v.owner_name || '—'}</td><td style="border:1px solid #ddd;padding:6px;">${v.created_at ? fmtTime(new Date(v.created_at)) : ''}</td><td style="border:1px solid #ddd;padding:6px;">${v.check_out_at ? fmtTime(new Date(v.check_out_at)) : 'EN CUSTODIA'}</td><td style="border:1px solid #ddd;padding:6px;">${['delivered', 'retrieved'].includes(v.status) ? 'ENTREGADO' : 'CUSTODIA'}</td></tr>`).join('')}
      </table>
      <h3 style="color:#ef4444;border-bottom:2px solid #ef4444;padding-bottom:4px;margin-top:24px;">PERSONAL (${staff.length})</h3>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <tr style="background:#f1f5f9;"><th style="border:1px solid #ddd;padding:6px;">NOMBRE</th><th style="border:1px solid #ddd;padding:6px;">ROL</th><th style="border:1px solid #ddd;padding:6px;">ENTRADA</th><th style="border:1px solid #ddd;padding:6px;">SALIDA</th><th style="border:1px solid #ddd;padding:6px;">DESCANSO</th><th style="border:1px solid #ddd;padding:6px;">JORNADA</th><th style="border:1px solid #ddd;padding:6px;">VEH.</th></tr>
        ${staff.map((s: any) => `<tr><td style="border:1px solid #ddd;padding:6px;font-weight:bold;">${s.name}</td><td style="border:1px solid #ddd;padding:6px;">${s.role}</td><td style="border:1px solid #ddd;padding:6px;">${s.entry_time}</td><td style="border:1px solid #ddd;padding:6px;">${s.exit_time}</td><td style="border:1px solid #ddd;padding:6px;">${s.break_mins}min</td><td style="border:1px solid #ddd;padding:6px;">${s.total_mins}min</td><td style="border:1px solid #ddd;padding:6px;">${s.vehicles_attended}</td></tr>`).join('')}
      </table>
      <div style="background:#f8fafc;border-left:4px solid #ef4444;padding:16px;margin-top:24px;border-radius:4px;">
        <h3 style="margin-top:0;color:#ef4444;">RESUMEN EJECUTIVO</h3>
        <p>Se recibieron <b>${summary.total_vehicles}</b> vehículos, de los cuales <b>${summary.total_delivered}</b> fueron entregados y <b>${summary.total_in_custody}</b> permanecieron en custodia al momento del cierre. El tiempo promedio de estancia fue de <b>${summary.avg_stay_mins} minutos</b>. El equipo estuvo integrado por <b>${summary.total_staff}</b> persona(s). Duración total del evento: <b>${summary.duration_mins} minutos</b>.</p>
      </div>
    </div>
    <div style="background:#0b0f19;padding:12px;text-align:center;font-size:10px;color:#94a3b8;">EYE STAFF 2026 · eye-staff.app · Reporte adjunto en PDF y Excel</div>
  </div>`;
}

async function sendEventActivationEmail(env: Env, sessionId: number) {
  const session = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(sessionId).first<any>();
  if (!session) return;

  const staffRes = await env.DB.prepare("SELECT u.name, u.role FROM users u WHERE u.current_session_id = ? OR instr(',' || u.current_session_id || ',', ',' || CAST(? AS TEXT) || ',') > 0").bind(String(sessionId), String(sessionId)).all<any>();
  const staff = staffRes.results || [];

  const html = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 800px; margin: 0 auto; border: 1px solid #eee; padding: 20px;">
      <div style="background: #22c55e; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0;">CONFIRMACIÓN DE INICIO DE EVENTO</h1>
        <p style="margin: 5px 0 0 0; opacity: 0.8;">${session.name} | ID: ${sessionId}</p>
      </div>
      <div style="padding: 20px;">
        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #22c55e;">
          <p style="margin: 0 0 8px;"><b>📅 Fecha de Inicio:</b> ${formatFull24h(new Date())}</p>
          <p style="margin: 0 0 8px;"><b>🚗 Tipo de Evento:</b> ${session.type ? session.type.toUpperCase() : 'VALET PARKING'}</p>
          <p style="margin: 0 0 8px;"><b>📍 Ubicación:</b> <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(session.address || '')}" target="_blank" style="color: #22c55e; font-weight: bold; text-decoration: underline;">${session.address || 'N/A'}</a></p>
          <p style="margin: 0;"><b>📞 Contacto:</b> ${session.contact_name || 'N/A'} (${session.phone || 'N/A'})</p>
        </div>

        <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #16a34a; display: flex; flex-direction: column; gap: 8px;">
          <p style="margin: 0;"><b>🕒 Hora de Convocatoria:</b> ${session.convocation_time || 'N/A'}</p>
          <p style="margin: 0;"><b>⚡ Hora de Inicio de Evento:</b> ${session.event_start_time || 'N/A'}</p>
          <p style="margin: 0;"><b>🏁 Tentativa de Culminación:</b> ${session.event_end_time || 'N/A'}${session.event_end_date ? ` (${session.event_end_date.split('-').reverse().join('/')})` : ''}</p>
        </div>

        <h3 style="color: #22c55e; border-bottom: 2px solid #22c55e; padding-bottom: 5px;">PERSONAL ASIGNADO</h3>
        <ul style="list-style: none; padding: 0;">
          ${staff.map((u: any) => `
            <li style="padding: 8px 0; border-bottom: 1px solid #eee;">
              <b>${u.name.toUpperCase()}</b> - <span style="color: #666; font-size: 0.8em;">${u.role.toUpperCase()}</span>
            </li>
          `).join('')}
        </ul>
        <p style="margin-top: 30px; font-size: 0.8em; color: #777; text-align: center;">EYE STAFF 2026 - Control Operativo en Tiempo Real</p>
      </div>
    </div>
  `;

  const emails = await getSubscribedEmails(env, 'apertura_evento');
  if (emails.length > 0) {
    for (const email of emails) {
      await sendEmail(env, email, `EYE STAFF: Inicio de Evento - ${session.name}`, html);
    }
  } else {
    const adminEmail = env.DIRECTOR_EMAIL;
    if (adminEmail) await sendEmail(env, adminEmail, `EYE STAFF: Inicio de Evento - ${session.name}`, html);
  }
}



// Ayudante para correos
function wrapInCorporateTemplate(content: string) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0; padding:0; background-color:#f8fafc; font-family:'Inter', Arial, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc; padding:40px 20px;">
        <tr>
          <td align="center">
            <table width="100%" max-width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 10px 25px rgba(0,0,0,0.05); max-width:600px; margin:0 auto;">
              <tr>
                <td align="center" style="background-color:#0f172a; padding:30px 20px; border-bottom:3px solid #6366f1;">
                  <img src="https://eye-staff.app/logo-eye-staff.jpeg" alt="EYE STAFF" style="height:50px; display:block; margin-bottom:10px;" />
                  <h2 style="color:#ffffff; margin:0; font-size:20px; font-weight:800; letter-spacing:1px;">SISTEMA AUTOMATIZADO</h2>
                </td>
              </tr>
              <tr>
                <td style="padding:40px 30px; color:#334155; line-height:1.6;">
                  ${content}
                </td>
              </tr>
              <tr>
                <td style="background-color:#f1f5f9; padding:20px; text-align:center; border-top:1px solid #e2e8f0;">
                  <p style="margin:0; color:#64748b; font-size:12px;">
                    Este es un mensaje generado automáticamente por la plataforma EYE STAFF.<br>
                    Por favor no respondas directamente a este correo.
                  </p>
                  <p style="margin:10px 0 0 0; color:#94a3b8; font-size:11px;">
                    © ${new Date().getFullYear()} EYE STAFF. Todos los derechos reservados.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

async function sendEmail(env: Env, to: string | string[] | undefined, subject: string, html: string, attachments?: any[], cc?: string[], reportId?: string, senderName?: string) {
  if (!env.BREVO_API_KEY) {
      throw new Error('BREVO_API_KEY no configurado en este entorno.');
  }
  try {
    let toArray = (Array.isArray(to) ? to : [to]).filter(e => e && typeof e === 'string' && e.trim() !== '') as string[];
    let ccArray = cc || [];

    if (reportId) {
      const subs = await getSubscribedEmails(env, reportId);
      ccArray = [...new Set([...ccArray, ...subs])].filter(e => e && typeof e === 'string' && e.trim() !== '');
    }

    if (toArray.length === 0) {
        if (ccArray.length > 0) {
            toArray.push(ccArray.shift() as string);
        } else {
            console.log('Skipping email since no recipients are defined.');
            return true;
        }
    }

    // Brevo format
    const payload: any = {
      sender: { name: senderName || 'EYE STAFF', email: 'no-reply@eye-staff.app' },
      to: toArray.map(e => ({ email: e.trim() })),
      subject,
      htmlContent: wrapInCorporateTemplate(html)
    };
    
    if (ccArray && ccArray.length > 0) {
      payload.cc = ccArray.map((email: string) => ({ email: email.trim() }));
    }
    
    if (attachments && attachments.length > 0) {
      payload.attachment = attachments.map((att: any) => ({
        content: att.content,
        name: att.filename || att.name
      }));
    }
    
    if (env.IS_STAGING === "true") {
      payload.subject = `[🔴 DESARROLLO] ${payload.subject}`;
      payload.htmlContent = `<div style="background-color: #ff0000; color: white; padding: 10px; text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 20px; border-radius: 5px; font-family: sans-serif;">⚠️ ENTORNO DE DESARROLLO ⚠️</div>` + payload.htmlContent;
    }
    
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': env.BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('Brevo API Error details:', errText);
      throw new Error(`Brevo API Error: ${res.status} - ${errText}`);
    }
  } catch (e: any) {
    console.error('Email Error:', e);
    throw new Error(e.message || 'Error al enviar el email');
  }
}



// Lógica de Notificaciones Programadas (Cron)
async function checkScheduledNotifications(env: Env) {
  // Obtenemos la hora actual ajustada al timezone del usuario (+02:00)
  const now = new Date();
  const offset = -4; // Ajustado a Venezuela (GMT-4)
  const localTime = new Date(now.getTime() + (offset * 60 * 60 * 1000));

  const hh = localTime.getUTCHours().toString().padStart(2, '0');
  const mm = localTime.getUTCMinutes().toString().padStart(2, '0');
  const currentTime = `${hh}:${mm}`;
  const today = localTime.toISOString().split('T')[0];

  console.log(`[CRON] Revisando notificaciones para ${today} ${currentTime}...`);

  // Buscamos sesiones en planificación para hoy que no hayan sido notificadas aún
  const sessionsRes = await env.DB.prepare(
    "SELECT * FROM sessions WHERE status = 'planning' AND started_at = ? AND convocation_time = ? AND (notified IS NULL OR notified = 0)"
  ).bind(today, currentTime).all();

  const sessions = sessionsRes.results || [];

  for (const session of sessions as any[]) {
    // 1. Obtener personal citado y sus teléfonos
    const staffRes = await env.DB.prepare(
      "SELECT name, role, phone FROM users WHERE (current_session_id = ? OR instr(',' || current_session_id || ',', ',' || CAST(? AS TEXT) || ',') > 0) AND is_active = 1"
    ).bind(session.id, session.id).all();
    const staff = staffRes.results || [];

    // 2. Geocodificar dirección para obtener mapa estático
    let mapHtml = '';
    if (session.address) {
      try {
        const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(session.address)}&format=json&limit=1`;
        const geoRes = await fetch(geoUrl, { headers: { 'Accept-Language': 'es', 'User-Agent': 'EYESTAFF/1.0' } });
        const geoData = await geoRes.json() as any[];
        if (geoData && geoData[0]) {
          const lat = geoData[0].lat;
          const lon = geoData[0].lon;
          const mapUrl = `https://static-maps.yandex.ru/1.x/?lang=es_ES&ll=${lon},${lat}&z=15&l=map&size=600,300`;
          mapHtml = `
            <div style="margin-top: 25px; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
              <div style="background: rgba(255,255,255,0.05); padding: 8px 12px; font-size: 0.75rem; color: #f59e0b; font-weight: bold; border-bottom: 1px solid rgba(255,255,255,0.05);">📍 UBICACIÓN EN EL MAPA</div>
              <img src="${mapUrl}" alt="Mapa del Evento" style="width: 100%; max-width: 600px; height: auto; display: block;" />
            </div>
          `;
        }
      } catch (e) {
        console.error('Error geocoding address for convocatoria email:', e);
      }
    }

    const email = env.DIRECTOR_EMAIL;
    const subject = `🔔 CONVOCATORIA: ${session.name}`;
    const html = `
      <div style="font-family: 'Outfit', sans-serif; background: #0b0f19; color: white; padding: 30px; border-radius: 20px; border: 1px solid #1e253c; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; margin-bottom: 25px;">
           <h1 style="color: #ef4444; margin: 0; letter-spacing: 2px;">EYE STAFF</h1>
           <p style="color: #94a3b8; font-size: 0.8rem;">NOTIFICACIÓN AUTOMÁTICA</p>
        </div>
        
        <div style="background: #161b2c; padding: 25px; border-radius: 15px; border: 1px solid rgba(255,255,255,0.05);">
          <h2 style="margin-top: 0; color: #f59e0b;">📢 Recordatorio de Convocatoria</h2>
          <p style="font-size: 1.1rem; margin-bottom: 20px;">Hola, ha llegado la hora de la convocatoria para el siguiente evento:</p>
          
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="color: #94a3b8; padding: 8px 0; font-size: 0.9rem;">EVENTO:</td>
              <td style="color: white; padding: 8px 0; font-weight: bold; text-align: right; font-size: 1rem;">${session.name}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; padding: 8px 0; font-size: 0.9rem;">TIPO:</td>
              <td style="color: white; padding: 8px 0; font-weight: bold; text-align: right;">${(session.type || 'Valet').toUpperCase()}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; padding: 8px 0; font-size: 0.9rem;">HORA CONVOCATORIA:</td>
              <td style="color: #ef4444; padding: 8px 0; font-weight: bold; text-align: right; font-size: 1rem;">🕒 ${session.convocation_time || 'N/A'}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; padding: 8px 0; font-size: 0.9rem;">HORA DE CITA:</td>
              <td style="color: #22c55e; padding: 8px 0; font-weight: bold; text-align: right; font-size: 1rem;">🚀 ${session.event_start_time || 'N/A'}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; padding: 8px 0; font-size: 0.9rem;">HORA PERSONALIZACIÓN:</td>
              <td style="color: #3b82f6; padding: 8px 0; font-weight: bold; text-align: right; font-size: 1rem;">🏁 ${session.event_end_time || 'N/A'}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; padding: 8px 0; font-size: 0.9rem;">DIRECCIÓN:</td>
              <td style="color: white; padding: 8px 0; font-size: 0.85rem; text-align: right; line-height: 1.4;">📍 ${session.address || 'N/A'}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; padding: 8px 0; font-size: 0.9rem;">CONTACTO:</td>
              <td style="color: white; padding: 8px 0; font-size: 0.85rem; text-align: right;">👤 ${session.contact_name || 'N/A'} (${session.phone || 'N/A'})</td>
            </tr>
          </table>

          <h3 style="color: #f59e0b; border-bottom: 2px solid #f59e0b; padding-bottom: 5px; margin-top: 25px; margin-bottom: 15px;">👥 PERSONAL CITADO</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
            <thead>
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: #94a3b8;">
                <th style="text-align: left; padding: 6px 0;">Nombre</th>
                <th style="text-align: center; padding: 6px 0;">Rol</th>
                <th style="text-align: right; padding: 6px 0;">Teléfono</th>
              </tr>
            </thead>
            <tbody>
              ${staff.length > 0 ? staff.map((u: any) => `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                  <td style="padding: 8px 0; font-weight: bold; color: white;">${u.name.toUpperCase()}</td>
                  <td style="padding: 8px 0; text-align: center; color: #94a3b8; font-size: 0.75rem;">${(u.role || '').toUpperCase()}</td>
                  <td style="padding: 8px 0; text-align: right; color: #22c55e; font-weight: bold;">${u.phone || 'S/T'}</td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="3" style="padding: 10px 0; color: #94a3b8; text-align: center; font-style: italic;">Sin personal citado en este evento</td>
                </tr>
              `}
            </tbody>
          </table>
          
          ${mapHtml}
        </div>
        
        <div style="margin-top: 30px; text-align: center;">
          <a href="https://eye-staff.app" style="background: #ef4444; color: white; padding: 12px 30px; border-radius: 10px; text-decoration: none; font-weight: bold; display: inline-block;">IR AL PORTAL</a>
        </div>
        
        <p style="margin-top: 30px; font-size: 0.7rem; color: #475569; text-align: center;">
          © 2026 EYE STAFF — Sistema de Gestión Operativa
        </p>
      </div>
    `;
    await sendEmail(env, email, subject, html, undefined, undefined, 'convocatoria');



    // Marcar como notificado
    await env.DB.prepare("UPDATE sessions SET notified = 1 WHERE id = ?").bind(session.id).run();

    console.log(`[CRON] Notificación enviada para: ${session.name}`);
  }

  // --- REPORTE DE CUMPLEAÑEROS MENSUAL (DÍA 30 A LAS 12:00) ---
  const dateNum = localTime.getUTCDate();
  const monthNum = localTime.getUTCMonth();
  const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const isFebruaryLastDay = monthNum === 1 && (
    (dateNum === 29 && isLeapYear(localTime.getUTCFullYear())) ||
    (dateNum === 28 && !isLeapYear(localTime.getUTCFullYear()))
  );

  const isSendDay = dateNum === 30 || isFebruaryLastDay;
  if (isSendDay && currentTime === '12:00') {
    try {
      await sendMonthlyBirthdayReport(env);
    } catch (e) {
      console.error('Error enviando reporte mensual de cumpleañeros en Cron:', e);
    }
  }
}

async function generateBirthdayPDF(guys: any[], monthName: string) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.276, 841.89]); // A4
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);



  // Header con colores corporativos EYE STAFF (Dark/Indigo)
  page.drawRectangle({
    x: 0,
    y: height - 100,
    width: width,
    height: 100,
    color: rgb(0.06, 0.09, 0.16),
  });

  page.drawText('GRUPO EYE STAFF', {
    x: 40,
    y: height - 55,
    size: 24,
    font: boldFont,
    color: rgb(0.388, 0.4, 0.945),
  });

  page.drawText(`REPORTE DE CUMPLEAÑEROS - MES: ${monthName.toUpperCase()}`, {
    x: 40,
    y: height - 80,
    size: 12,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  let currentY = height - 150;

  // Header tabla
  page.drawRectangle({
    x: 40,
    y: currentY - 10,
    width: width - 80,
    height: 25,
    color: rgb(0.96, 0.97, 0.98),
  });

  page.drawText('NOMBRE', { x: 50, y: currentY - 2, size: 10, font: boldFont, color: rgb(0.06, 0.09, 0.16) });
  page.drawText('DÍA', { x: 260, y: currentY - 2, size: 10, font: boldFont, color: rgb(0.06, 0.09, 0.16) });
  page.drawText('EDAD', { x: 350, y: currentY - 2, size: 10, font: boldFont, color: rgb(0.06, 0.09, 0.16) });
  page.drawText('EYE ID', { x: 460, y: currentY - 2, size: 10, font: boldFont, color: rgb(0.06, 0.09, 0.16) });

  currentY -= 20;

  const now = new Date();

  for (const guy of guys) {
    currentY -= 25;
    page.drawRectangle({
      x: 40,
      y: currentY - 5,
      width: width - 80,
      height: 22,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.93, 0.94, 0.95),
      borderWidth: 0.5,
    });

    const birthDate = guy.birth_date || 'S/D';
    let day = 'S/D';
    if (birthDate && birthDate.includes('-')) {
      day = birthDate.split('-')[2];
    }

    // Calcular edad
    let age = 'S/D';
    if (guy.birth_date) {
      const birth = new Date(guy.birth_date);
      if (!isNaN(birth.getTime())) {
        const diff = now.getFullYear() - birth.getFullYear();
        let calculatedAge = diff;
        const m = now.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
          calculatedAge = diff - 1;
        }
        age = `${calculatedAge} años`;
      }
    }

    page.drawText(guy.name.toUpperCase(), { x: 50, y: currentY + 3, size: 9, font: font, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(day, { x: 260, y: currentY + 3, size: 9, font: boldFont, color: rgb(0.388, 0.4, 0.945) });
    page.drawText(age, { x: 350, y: currentY + 3, size: 9, font: font, color: rgb(0.1, 0.1, 0.1) });
    page.drawText((guy.eye_id || 'LOGISTICA').toUpperCase(), { x: 460, y: currentY + 3, size: 9, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
  }

  page.drawText(`Generado automaticamente por el sistema de gestion de personal EYE STAFF.`, {
    x: 40,
    y: 30,
    size: 8,
    font: font,
    color: rgb(0.5, 0.5, 0.5),
  });

  return await pdfDoc.save();
}

async function sendMonthlyBirthdayReport(env: Env, forceTest: boolean = false) {
  if (!env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY no configurado');
    return;
  }

  // Obtener fecha en Venezuela (GMT-4)
  const now = new Date();
  const offset = -4;
  const localTime = new Date(now.getTime() + (offset * 60 * 60 * 1000));

  const monthNum = localTime.getUTCMonth();

  // Proximo mes (1-12)
  const nextMonth = ((monthNum + 1) % 12) + 1;
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const nextMonthName = monthNames[nextMonth - 1];

  // Obtener usuarios activos
  const usersRes = await env.DB.prepare("SELECT name, eye_id, birth_date, email FROM users WHERE is_active = 1").all();
  const allUsers = usersRes.results || [];

  const nextMonthStr = nextMonth.toString().padStart(2, '0');

  const birthdayGuys = (allUsers as any[]).filter(u => {
    if (!u.birth_date) return false;
    const parts = u.birth_date.split('-');
    return parts[1] === nextMonthStr;
  });

  if (birthdayGuys.length === 0 && !forceTest) {
    console.log(`No hay cumpleaneros para ${nextMonthName}`);
    return;
  }

  // Ordenar por día de cumpleaños (de menor a mayor) y luego alfabéticamente por nombre (de A a Z)
  birthdayGuys.sort((a, b) => {
    const dayA = parseInt(a.birth_date.split('-')[2], 10);
    const dayB = parseInt(b.birth_date.split('-')[2], 10);
    if (dayA !== dayB) {
      return dayA - dayB;
    }
    const nameA = (a.name || '').toUpperCase();
    const nameB = (b.name || '').toUpperCase();
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return 0;
  });

  // Excel
  const excelData = [
    ['Item', 'Nombre', 'EYE ID', 'Fecha de Nacimiento', 'Dia de Cumpleanos', 'Edad', 'Email'],
    ...birthdayGuys.map((u, i) => {
      let age = '';
      if (u.birth_date) {
        const birth = new Date(u.birth_date);
        if (!isNaN(birth.getTime())) {
          age = (now.getFullYear() - birth.getFullYear()).toString();
          const m = now.getMonth() - birth.getMonth();
          if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
            age = (parseInt(age) - 1).toString();
          }
        }
      }
      const day = u.birth_date ? u.birth_date.split('-')[2] : 'S/D';
      return [
        i + 1,
        u.name.toUpperCase(),
        (u.eye_id || 'LOGISTICA').toUpperCase(),
        u.birth_date || 'S/D',
        day,
        age,
        u.email || 'S/D'
      ];
    })
  ];

  const ws = XLSX.utils.aoa_to_sheet(excelData);

  // Ajustar el ancho de las columnas dinámicamente según el contenido
  const colWidths: number[] = [];
  excelData.forEach(row => {
    row.forEach((val: any, colIdx: number) => {
      const strVal = val !== undefined && val !== null ? val.toString() : '';
      const len = strVal.length;
      if (!colWidths[colIdx] || len > colWidths[colIdx]) {
        colWidths[colIdx] = len;
      }
    });
  });
  ws['!cols'] = colWidths.map(w => ({ wch: Math.max(w + 4, 10) }));

  // Añadir autofiltro en la fila 1 para todas las columnas que tienen datos
  const maxColLetter = XLSX.utils.encode_col(excelData[0].length - 1);
  ws['!autofilter'] = { ref: `A1:${maxColLetter}${excelData.length}` };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cumpleaneros");
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  const excelBase64 = uint8ArrayToBase64(new Uint8Array(excelBuffer));

  // PDF
  const pdfBytes = await generateBirthdayPDF(birthdayGuys, nextMonthName);
  const pdfBase64 = uint8ArrayToBase64(pdfBytes);

  const recipient = env.DIRECTOR_EMAIL;

  let listHtml = '';
  for (const guy of birthdayGuys) {
    const day = guy.birth_date ? guy.birth_date.split('-')[2] : 'S/D';

    // Calcular edad
    let age = 'S/D';
    if (guy.birth_date) {
      const birth = new Date(guy.birth_date);
      if (!isNaN(birth.getTime())) {
        const diff = now.getFullYear() - birth.getFullYear();
        let calculatedAge = diff;
        const m = now.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
          calculatedAge = diff - 1;
        }
        age = `${calculatedAge} años`;
      }
    }

    listHtml += `
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:12px 15px; color:#1e293b; font-weight:700;">${guy.name.toUpperCase()}</td>
        <td style="padding:12px 15px; color:#6366f1; font-weight:900; text-align:center;">${day}</td>
        <td style="padding:12px 15px; color:#475569; text-align:center; font-weight:bold;">${age}</td>
        <td style="padding:12px 15px; text-align:center;"><span style="background:#f1f5f9; padding:4px 10px; border-radius:12px; font-size:0.75rem; font-weight:bold; color:#1e293b;">${(guy.eye_id || 'LOGISTICA').toUpperCase()}</span></td>
      </tr>
    `;
  }

  const htmlContent = `
    <div style="font-family:sans-serif; max-width:600px; margin:auto; border:1px solid #eee; border-radius:15px; overflow:hidden; border-top:6px solid #6366f1;">
      <div style="background:#0f172a; padding:35px; text-align:center;">
        <h1 style="color:#6366f1; margin:0; font-size:2rem; letter-spacing:3px;">EYE STAFF</h1>
        <p style="color:#94a3b8; font-weight:700; margin:5px 0 0; font-size:0.9rem;">REPORTE MENSUAL DE CUMPLEAÑEROS</p>
      </div>
      <div style="padding:30px; background:#fff;">
        <div style="background:#f8fafc; padding:20px; border-radius:12px; margin-bottom:25px; border-left:4px solid #6366f1;">
          <p style="margin:0 0 8px; font-size:1.1rem; color:#1e293b;"><strong>MES PROXIMO:</strong> ${nextMonthName.toUpperCase()}</p>
          <p style="margin:0 0 0; color:#475569;">A continuacion se detalla el listado de personal que celebra su cumpleanos el proximo mes, ordenado cronologicamente por dia de celebracion y alfabeticamente por nombre.</p>
        </div>

        <h3 style="color:#0f172a; margin:0 0 15px; font-size:1.1rem; border-bottom:2px solid #f1f5f9; padding-bottom:5px;">🎂 Celebrados del Mes</h3>
        <table style="width:100%; border-collapse:collapse; font-size:0.9rem; margin-bottom:25px;">
          <thead>
            <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0; text-align:left;">
              <th style="padding:10px 15px; color:#475569;">Nombre</th>
              <th style="padding:10px 15px; color:#475569; text-align:center;">Día</th>
              <th style="padding:10px 15px; color:#475569; text-align:center;">Edad</th>
              <th style="padding:10px 15px; color:#475569; text-align:center;">EYE ID</th>
            </tr>
          </thead>
          <tbody>
            ${listHtml || '<tr><td colspan="4" style="text-align:center; padding:20px; color:#94a3b8;">No se encontraron cumpleañeros para este mes.</td></tr>'}
          </tbody>
        </table>

        <div style="background:#e0e7ff; border:1px solid #c7d2fe; border-radius:10px; padding:15px; margin-top:20px;">
          <p style="margin:0; color:#3730a3; font-weight:bold; font-size:0.85rem; text-align:center;">📦 Reporte completo adjunto en formatos EXCEL (.xlsx) y PDF para administracion.</p>
        </div>

        <p style="color:#94a3b8; font-size:0.75rem; text-align:center; margin-top:30px;">
          GRUPO EYE STAFF — Sistema de Gestion Automatizado de Personal
        </p>
      </div>
    </div>
  `;

  await sendEmail(env, recipient, `🎂 REPORTE CUMPLEAÑEROS - MES DE ${nextMonthName.toUpperCase()}`, htmlContent, [
    {
      filename: `Cumpleaneros_${nextMonthName}.xlsx`,
      content: excelBase64
    },
    {
      filename: `Cumpleaneros_${nextMonthName}.pdf`,
      content: pdfBase64
    }
  ], undefined, 'cumpleanos');
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
  const deliveryTime = formatFull24h(new Date());

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #d1fae5; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 20px rgba(16,185,129,0.15);">
      <!-- HEADER -->
      <div style="background: linear-gradient(135deg, #059669, #10b981); color: white; padding: 35px 30px; text-align: center;">
        <h1 style="margin: 0; font-size: 26px; letter-spacing: 3px; font-weight: 900;">EYE STAFF</h1>
        <p style="margin: 8px 0 0 0; opacity: 0.9; font-weight: bold; font-size: 16px; letter-spacing: 1px;">✅ VEHÍCULO ENTREGADO CON ÉXITO</p>
      </div>

      <!-- BODY -->
      <div style="padding: 35px 40px; color: #334155; line-height: 1.7;">
        <p style="font-size: 18px; margin-bottom: 5px;">Hola <b>${(vehicle.owner_name || 'Cliente').toUpperCase()}</b>,</p>
        <p style="color: #64748b; margin-top: 0;">Tu vehículo ha sido entregado correctamente. Aquí están los detalles:</p>

        <!-- VEHICLE CARD -->
        <div style="background: #f0fdf4; border: 2px solid #10b981; border-radius: 14px; padding: 25px; margin: 25px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">🚘 PLACA</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 900; font-size: 20px; letter-spacing: 2px; color: #065f46;">${(vehicle.plate || '—').toUpperCase()}</td>
            </tr>
            ${vehicle.brand ? `<tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px; border-top: 1px solid #d1fae5;">🏷️ MARCA / MODELO</td><td style="padding: 6px 0; text-align: right; font-weight: 700; color: #134e4a; border-top: 1px solid #d1fae5;">${vehicle.brand || ''} ${vehicle.model || ''}</td></tr>` : ''}
            ${vehicle.color ? `<tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px; border-top: 1px solid #d1fae5;">🎨 COLOR</td><td style="padding: 6px 0; text-align: right; font-weight: 700; color: #134e4a; border-top: 1px solid #d1fae5;">${vehicle.color}</td></tr>` : ''}
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 13px; border-top: 1px solid #d1fae5;">📅 FECHA Y HORA</td>
              <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #134e4a; border-top: 1px solid #d1fae5;">${deliveryTime}</td>
            </tr>
            ${vehicle.ticket_code ? `<tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px; border-top: 1px solid #d1fae5;">🎟️ TICKET</td><td style="padding: 6px 0; text-align: right; font-weight: 700; color: #134e4a; border-top: 1px solid #d1fae5;">${vehicle.ticket_code}</td></tr>` : ''}
          </table>
        </div>

        <p style="text-align: center; color: #10b981; font-weight: 700; font-size: 16px; margin: 25px 0;">¡Gracias por confiar en EYE STAFF!</p>
        <p style="text-align: center; color: #94a3b8; font-size: 13px;">Esperamos verte en nuestro próximo evento.</p>
      </div>

      <!-- FOOTER -->
      <div style="background: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
        &copy; 2026 EYE STAFF — Valet Parking System &nbsp;|&nbsp; eye-staff.app
      </div>
    </div>
  `;

  const adminCopy = env.DIRECTOR_EMAIL ;

  // Enviar al cliente si tiene email
  if (vehicle.owner_email) {
    await sendEmail(env, vehicle.owner_email, `✅ VEHÍCULO ENTREGADO: ${vehicle.plate}`, html);
  }

  // Siempre enviar copia al admin (confirmación interna)
  const adminHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 14px; overflow: hidden;">
      <div style="background: #1e293b; color: white; padding: 20px; text-align: center;">
        <h2 style="margin: 0; font-size: 18px; letter-spacing: 2px;">EYE STAFF — COPIA INTERNA</h2>
        <p style="margin: 5px 0 0 0; color: #94a3b8; font-size: 13px;">Confirmación de entrega registrada</p>
      </div>
      <div style="padding: 25px; color: #334155;">
        <p><b>🚘 Placa:</b> ${(vehicle.plate || '—').toUpperCase()}</p>
        ${vehicle.owner_name ? `<p><b>👤 Cliente:</b> ${vehicle.owner_name}</p>` : ''}
        ${vehicle.owner_email ? `<p><b>📧 Email cliente:</b> ${vehicle.owner_email}</p>` : '<p style="color:#ef4444;"><b>⚠️ Sin email de cliente registrado</b></p>'}
        ${vehicle.brand ? `<p><b>🏷️ Vehículo:</b> ${vehicle.brand} ${vehicle.model || ''} — ${vehicle.color || ''}</p>` : ''}
        ${vehicle.ticket_code ? `<p><b>🎟️ Ticket:</b> ${vehicle.ticket_code}</p>` : ''}
        <p><b>📅 Entregado a las:</b> ${deliveryTime}</p>
      </div>
      <div style="background: #f8fafc; padding: 15px; text-align: center; font-size: 11px; color: #94a3b8;">
        EYE STAFF 2026 — Copia de seguridad enviada a ${adminCopy}
      </div>
    </div>
  `;
  await sendEmail(env, adminCopy, `📋 [COPIA] ENTREGA: ${(vehicle.plate || '').toUpperCase()} — ${deliveryTime}`, adminHtml);
}

function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  let binary = '';
  const len = uint8Array.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

async function sendBrevoEmail(env: any, toEmails: string[], subject: string, htmlContent: string, attachment?: { content: string, name: string }) {
  if (!env.BREVO_API_KEY) {
    console.log('BREVO_API_KEY not set. Cannot send email to:', toEmails);
    return false;
  }

  const to = toEmails.map(email => ({ email }));

  const body: any = {
    sender: { name: 'EYE STAFF', email: 'no-reply@eye-staff.app' },
    to: to,
    subject: subject,
    htmlContent: htmlContent
  };

  if (attachment) {
    body.attachment = [
      { content: attachment.content, name: attachment.name }
    ];
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': env.BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    console.log('Brevo response:', data);
    return res.ok;
  } catch (error) {
    console.error('Brevo error:', error);
    return false;
  }
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

  page.drawText('GRUPO EYE STAFF', {
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
    formatFull24h(new Date())
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

  const to = c.env.DIRECTOR_EMAIL ;

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
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #475569;">Fecha: ${formatFull24h(new Date())}</p>
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
app.get('/sw.js', (c) => {
  c.header('Content-Type', 'application/javascript');
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate');
  return c.text(`
// EYE STAFF SW - Limpieza silenciosa v2.0
self.addEventListener('install', (e) => {
    self.skipWaiting();
});
self.addEventListener('activate', (e) => {
    e.waitUntil(
        (async () => {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
            await self.clients.claim();
            await self.registration.unregister();
        })()
    );
});
`, 200);
});
app.get('/reset', async (c) => c.env.ASSETS.fetch(new Request(c.req.url.replace('/reset', '/reset.html'))));
app.get('/reset.html', async (c) => c.env.ASSETS.fetch(c.req.raw));

// Settings endpoint moved to unified section below


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
                
                // 3. Auth (DESACTIVADO TEMPORALMENTE)
                const token = localStorage.getItem('token');
                if (!token) {
                    // renderLoginWall(); // Bypass
                    document.getElementById('app').style.display = 'flex';
                    document.getElementById('login-view').style.display = 'none';
                } else {
                    const loginView = document.getElementById('login-view');
                    if (loginView) loginView.style.display = 'none';
                    document.getElementById('app').style.display = 'flex';
                    
                    // Actualizar info de usuario en nav
                    try {
                        const user = JSON.parse(localStorage.getItem('user'));
                        if (user) {
                            document.getElementById('nav-user-name').textContent = user.name;
                            document.getElementById('nav-user-role').textContent = (user.is_superadmin ? 'SUPERADMIN' : user.role).toUpperCase();
                        }
                    } catch(e) {}
                }

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

// PÚBLICO: ENVIAR REPORTE DE PRUEBA DE CUMPLEAÑOS
app.post('/api/public/test-birthday-report', async (c) => {
  try {
    await sendMonthlyBirthdayReport(c.env, true);
    return c.json({ success: true, message: 'Reporte de cumpleaños enviado a eyestaff.ncarrillo@gmail.com' });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});


// ===============================
// LOGIN (Frontend con RBAC y Normalización)
// ===============================
app.post('/api/staff/login', async (c) => {
  try {
    const { name, cedula } = await c.req.json();
    const password = cedula;
    const inputName = name.trim().toLowerCase();
    const lowerPass = (password || "").trim().toLowerCase();

    // 0. Caso especial: Empleado de Prueba INVITADO (Sólo Lectura, Acceso Director/Oro)
    if (inputName.includes('invitado') || inputName === 'guest') {
      const isAllowedGuestPass = lowerPass === 'invitado' || lowerPass === '1234' || lowerPass.includes('corifede');
      if (isAllowedGuestPass) {
        const token = await sign({
          id: 999,
          name: 'EMPLEADO INVITADO (DEMO)',
          role: 'director',
          is_superadmin: true,
          profile_admin: 'DIRECTOR',
          profile_opera: 'JEFE DE GRUPO',
          eye_id: 'ORO',
          is_guest: true,
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 10
        }, c.env.JWT_SECRET || 'secret', 'HS256');

        await logAudit(c.env, 999, 'LOGIN', `Acceso bypass invitado: ${inputName}`, c);

        return c.json({
          id: 999,
          name: 'EMPLEADO INVITADO (DEMO)',
          role: 'director',
          is_superadmin: true,
          profile_admin: 'DIRECTOR',
          profile_opera: 'JEFE DE GRUPO',
          eye_id: 'ORO',
          is_guest: true,
          web_session_id: Date.now().toString(),
          token
        });
      }
    }


    // 2. Verificación en Base de Datos (Para Nelson, Nicolas y el resto)
    const stripAccents = (str: string) => {
      return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    };

    // Buscamos ignorando tildes, espacios y permitiendo cédula
    const cleanInput = stripAccents(inputName).replace(/\s+/g, '').toLowerCase();

    const allActiveUsers = await c.env.DB.prepare("SELECT * FROM users WHERE is_active = 1").all();
    const usersList = (allActiveUsers && allActiveUsers.results) ? allActiveUsers.results : [];

    const dbUser: any = usersList.find((u: any) => {
      const cleanDBName = stripAccents(u.name || '').replace(/\s+/g, '').toLowerCase();
      const cleanCedula = (u.cedula || '').toString().trim();
      // Comparación EXACTA: el nombre ingresado debe coincidir completamente
      return cleanDBName === cleanInput || cleanCedula === inputName.trim();
    });

    if (dbUser && (dbUser.pin_hash || '').toString().toLowerCase() === lowerPass) {
      let finalRole = dbUser.role || 'valet';
      const isActuallyDirector = finalRole === 'director' ||
        inputName.includes('nelson') ||
        inputName.includes('nicolas') ||
        inputName.includes('billy') ||
        inputName.includes('ramos') ||
        dbUser.profile_admin === 'DIRECTOR' ||
        dbUser.profile_admin === 'ADMIN' ||
        dbUser.profile_admin === 'RRHH';

      if (isActuallyDirector) finalRole = 'director';

      const isGuestUser = dbUser.id === 999 || dbUser.name.toLowerCase().includes('invitado');

      const token = await sign({
        id: dbUser.id,
        name: dbUser.name,
        role: finalRole,
        is_superadmin: finalRole === 'director',
        profile_admin: dbUser.profile_admin || 'NO APLICA',
        profile_opera: dbUser.profile_opera || 'NO APLICA',
        eye_id: dbUser.eye_id || null,
        is_guest: isGuestUser,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 10
      }, c.env.JWT_SECRET || 'secret', 'HS256');

      await logAudit(c.env, dbUser.id, 'LOGIN', `Acceso exitoso: ${dbUser.name}`, c);

      const device = c.req.header('User-Agent') || 'Unknown';
      const ip = c.req.header('cf-connecting-ip') || 'unknown';
      const sessionId = Date.now().toString();

      // Actualizar último login y dispositivo en la tabla de usuarios
      await c.env.DB.prepare('UPDATE users SET last_login = datetime("now"), current_device = ? WHERE id = ?')
        .bind(device, dbUser.id)
        .run();

      // Limitar concurrencia de sesiones a 3 dispositivos máximo por usuario.
      // Se mantienen las 2 más recientes activas para que con la actual sumen 3.
      await c.env.DB.prepare(`
        UPDATE web_sessions 
        SET is_active = 0, logout_at = datetime("now") 
        WHERE user_id = ? AND is_active = 1 
        AND id NOT IN (
          SELECT id FROM web_sessions 
          WHERE user_id = ? AND is_active = 1 
          ORDER BY last_activity_at DESC 
          LIMIT 2
        )
      `).bind(dbUser.id, dbUser.id).run();

      // Registrar sesión activa
      const sessionResult = await c.env.DB.prepare('INSERT INTO web_sessions (user_id, device, ip, is_active, last_activity_at) VALUES (?, ?, ?, 1, datetime("now"))')
        .bind(dbUser.id, device, ip)
        .run();

      const webSessionId = sessionResult.meta.last_row_id?.toString() || Date.now().toString();

      // Obtener permisos personalizados o calcular defaults
      const permRow = await c.env.DB.prepare('SELECT * FROM user_permissions_matrix WHERE user_id = ?').bind(dbUser.id).first<any>();
      let permissions = permRow;
      if (!permRow) {
        const isSuperadmin = finalRole === 'director' || dbUser.profile_admin === 'ADMIN' || dbUser.profile_admin === 'RRHH' || dbUser.profile_admin === 'DIRECTOR';
        const isSupervisor = finalRole === 'supervisor';
        const allowedCfoNames = ["ADMIN", "NICOLAS BETANCOURT", "MAIFER BARRUETA"];
        const isVIP = allowedCfoNames.some(n => (dbUser.name || '').toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(n));
        permissions = {
          valet_ve: 1,
          valet_mod: (isSuperadmin || isSupervisor) ? 1 : 0,
          eventos_ve: (isSuperadmin || isSupervisor) ? 1 : 0,
          eventos_mod: (isSuperadmin || isSupervisor) ? 1 : 0,
          admin_ve: isSuperadmin ? 1 : 0,
          admin_mod: isSuperadmin ? 1 : 0,
          vip_ve: isVIP ? 1 : 0,
          vip_mod: isVIP ? 1 : 0,
          seg_ve: isSuperadmin ? 1 : 0,
          seg_mod: isSuperadmin ? 1 : 0,
          loc_ve: 1,
          loc_mod: (isSuperadmin || isSupervisor) ? 1 : 0
        };
      }

      return c.json({
        id: dbUser.id,
        name: dbUser.name,
        role: finalRole,
        is_superadmin: finalRole === 'director',
        profile_admin: dbUser.profile_admin || 'NO APLICA',
        profile_opera: dbUser.profile_opera || 'NO APLICA',
        eye_id: dbUser.eye_id || null,
        is_guest: isGuestUser,
        web_session_id: webSessionId,
        pin_hash: dbUser.pin_hash,
        token,
        permissions
      });
    }

    // 3. Verificación de Emergencia (Bypass con clave maestra — credenciales EXACTAS)
    const isEmergencyPass = lowerPass === 'corifede1416';
    const isDirectorName = inputName === 'admin' || inputName === 'nicolas' ||
      inputName === 'billy' || inputName === 'ramos' ||
      inputName === 'admin';

    if (isDirectorName && isEmergencyPass) {
      const token = await sign({
        id: 1,
        name: name.trim().toUpperCase(),
        role: 'director',
        is_superadmin: true,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 10
      }, c.env.JWT_SECRET || 'secret', 'HS256');

      await logAudit(c.env, 1, 'LOGIN', `Acceso bypass maestro: ${inputName}`, c);

      return c.json({
        id: 1,
        name: name.trim().toUpperCase(),
        role: 'director',
        is_superadmin: true,
        is_guest: false,
        web_session_id: Date.now().toString(),
        pin_hash: lowerPass,
        eye_id: 'ORO',
        token
      });
    }

    return c.json({ error: `ACCESO DENEGADO PARA: [${inputName.toUpperCase()}]` }, 401);
  } catch (e: any) {
    return c.json({ error: 'Error: ' + e.message }, 500);
  }
});

app.post('/api/auth/refresh', async (c) => {
  const payload = c.get('jwtPayload');
  if (!payload) return c.json({ success: false }, 401);
  const token = await sign(
    { ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 10 },
    c.env.JWT_SECRET || 'secret',
    'HS256'
  );
  return c.json({ success: true, token });
});

app.post('/api/staff/logout', async (c) => {
  const { session_id, user_id } = await c.req.json();
  if (session_id) {
    await c.env.DB.prepare('UPDATE web_sessions SET logout_at = CURRENT_TIMESTAMP, is_active = 0 WHERE id = ?').bind(session_id).run();
    if (user_id) {
      await logAudit(c.env, user_id, 'LOGOUT', 'Cierre de sesión manual', c);
    }
  }
  return c.json({ success: true });
});

app.post('/api/staff/change-password', async (c) => {
  const user = c.get('user');
  const { newPassword } = await c.req.json();
  if (!newPassword) return c.json({ error: 'Nueva clave requerida' }, 400);

  const cleanNewPassword = newPassword.toString().trim().toLowerCase();
  await c.env.DB.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').bind(cleanNewPassword, user.id).run();
  await logAudit(c.env, user.id, 'CHANGE_PASSWORD', 'Clave actualizada por el usuario');

  return c.json({ success: true, message: 'Clave actualizada correctamente' });
});

app.post('/api/auth/change-pin', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'No autorizado' }, 401);

  const { current_pin, new_pin } = await c.req.json();
  if (!current_pin || !new_pin) return c.json({ error: 'Campos requeridos' }, 400);

  const cleanCurrentPin = current_pin.toString().trim().toLowerCase();
  const cleanNewPin = new_pin.toString().trim().toLowerCase();

  // Verificar pin actual
  const existing: any = await c.env.DB.prepare('SELECT pin_hash FROM users WHERE id = ?').bind(user.id).first();
  if (!existing || (existing.pin_hash || "").toString().trim().toLowerCase() !== cleanCurrentPin) {
    return c.json({ error: 'El PIN actual es incorrecto' }, 400);
  }

  await c.env.DB.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').bind(cleanNewPin, user.id).run();
  await logAudit(c.env, user.id, 'CHANGE_PIN', 'PIN de acceso personalizado por el usuario');

  return c.json({ success: true });
});

// ===============================
// Middleware JWT (RBAC)
// ===============================
app.use('/api/*', async (c, next) => {
  const path = c.req.path;
  const authHeader = c.req.header('Authorization');

  // Permitir login y fotos sin token (para <img> tags), rutas públicas
  if (path.includes('/api/staff/login') || path.includes('/api/photos/') || path.includes('/api/telegram/') || path.includes('/api/public/') || path.includes('/api/chat/stream')) {
    return await next();
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'No autorizado - Token faltante' }, 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload: any = await verify(token, c.env.JWT_SECRET || 'secret', 'HS256');
    c.set('user', payload);

    // Bloquear modificaciones si es un usuario Invitado (Demo)
    const method = c.req.method.toUpperCase();
    const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);
    if (payload.is_guest && isMutation && !path.includes('/api/staff/logout')) {
      return c.json({
        error: 'MODO DEMOSTRACIÓN: Las modificaciones de datos están desactivadas para el usuario INVITADO.'
      }, 403);
    }

    // Rastreo de actividad en tiempo real y verificación de sesión única
    const webSessionId = c.req.header('X-Web-Session-ID');
    if (webSessionId) {
      const sessionCheck = await c.env.DB.prepare('SELECT is_active FROM web_sessions WHERE id = ?').bind(webSessionId).first<any>();
      if (sessionCheck && sessionCheck.is_active === 0) {
        return c.json({ error: 'Sesión terminada. Has iniciado sesión en otro dispositivo.' }, 401);
      }
      c.executionCtx.waitUntil(
        c.env.DB.prepare('UPDATE web_sessions SET last_activity_at = datetime("now") WHERE id = ?').bind(webSessionId).run()
      );
    }

    await next();
  } catch (e: any) {
    return c.json({ error: 'Token inválido o expirado' }, 401);
  }
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
});// --- WhatsApp Backup Endpoints ---
app.post('/api/whatsapp/backup', async (c) => {
  const authHeader = c.req.header('Authorization') || '';
  const expectedKey = c.env.TELEGRAM_BOT_TOKEN || 'dev-local-api-key';
  if (authHeader !== `Bearer ${expectedKey}`) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.arrayBuffer();
  await c.env.PHOTOS.put('whatsapp_auth.zip', body);
  return c.json({ success: true });
});

app.get('/api/whatsapp/backup', async (c) => {
  const authHeader = c.req.header('Authorization') || '';
  const expectedKey = c.env.TELEGRAM_BOT_TOKEN || 'dev-local-api-key';
  if (authHeader !== `Bearer ${expectedKey}`) return c.json({ error: 'Unauthorized' }, 401);

  const file = await c.env.PHOTOS.get('whatsapp_auth.zip');
  if (!file) return c.json({ error: 'Not found' }, 404);

  const headers = new Headers();
  file.writeHttpMetadata(headers);
  headers.set('etag', file.httpEtag);
  headers.set('Content-Type', 'application/zip');
  return new Response(file.body, { headers });
});

// POST /api/staff/location — llamado desde el bot de WhatsApp al recibir una ubicación
app.post('/api/staff/location', async (c) => {
  try {
    const authHeader = c.req.header('Authorization') || '';
    const expectedKey = c.env.TELEGRAM_BOT_TOKEN || 'dev-local-api-key';
    if (authHeader !== `Bearer ${expectedKey}`) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const body = await c.req.json() as { phone: string; lat: number; lon: number; accuracy?: number; name?: string };
    const { phone, lat, lon, accuracy, name } = body;
    if (!phone || lat === undefined || lon === undefined) {
      return c.json({ error: 'Missing phone, lat or lon' }, 400);
    }
    // Intentar encontrar el staff_id por teléfono
    const userRow = await c.env.DB.prepare(
      "SELECT id, name FROM users WHERE phone = ? OR phone = ? LIMIT 1"
    ).bind(phone, phone.replace(/^\+/, '')).first() as any;

    const staffId = userRow?.id || null;
    const resolvedName = userRow?.name || name || phone;

    await c.env.DB.prepare(`
      INSERT INTO staff_live_locations (phone, name, staff_id, lat, lon, accuracy, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(phone) DO UPDATE SET
        lat = excluded.lat,
        lon = excluded.lon,
        accuracy = excluded.accuracy,
        name = excluded.name,
        staff_id = excluded.staff_id,
        updated_at = datetime('now')
    `).bind(phone, resolvedName, staffId, lat, lon, accuracy || null).run();

    return c.json({ success: true, name: resolvedName });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /api/staff/live-locations — devuelve ubicaciones activas (últimas 15 min) para el mapa
app.get('/api/staff/live-locations', async (c) => {
  try {
    const rows = await c.env.DB.prepare(`
      SELECT phone, name, staff_id, lat, lon, accuracy, updated_at
      FROM staff_live_locations
      WHERE updated_at >= datetime('now', '-15 minutes')
      ORDER BY updated_at DESC
    `).all();
    return c.json({ locations: rows.results || [] });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /api/reports/gps-history — Histórico de ubicaciones para Auditoría
app.get('/api/reports/gps-history', async (c) => {
  try {
    const rows = await c.env.DB.prepare(`
      SELECT l.latitude as lat, l.longitude as lon, l.accuracy, l.timestamp, u.name, u.phone
      FROM locations l
      JOIN users u ON l.entity_id = u.id
      WHERE l.entity_type = 'staff'
      ORDER BY l.timestamp DESC
      LIMIT 100
    `).all();
    return c.json({ history: rows.results || [] });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get('/api/reports/subscriptions', async (c) => {
  try {
    const subs = await c.env.DB.prepare('SELECT user_id, report_id FROM report_subscriptions').all();
    const formatted: Record<string, string[]> = {};
    if (subs.results) {
      subs.results.forEach((row: any) => {
        if (!formatted[row.user_id]) formatted[row.user_id] = [];
        formatted[row.user_id].push(row.report_id);
      });
    }
    return c.json({ success: true, subscriptions: formatted });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.post('/api/reports/subscriptions', async (c) => {
  const current = c.get('user');
  if (current && current.role !== 'director') {
    return c.json({ success: false, error: 'No autorizado' }, 403);
  }

  const { user_id, report_id, active } = await c.req.json();
  if (!user_id || !report_id) {
    return c.json({ success: false, error: 'Faltan datos' }, 400);
  }

  try {
    if (active) {
      await c.env.DB.prepare('INSERT OR IGNORE INTO report_subscriptions (user_id, report_id) VALUES (?, ?)')
        .bind(user_id, report_id)
        .run();
    } else {
      await c.env.DB.prepare('DELETE FROM report_subscriptions WHERE user_id = ? AND report_id = ?')
        .bind(user_id, report_id)
        .run();
    }
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.post('/api/staff', async (c) => {
  const current = c.get('user');
  // Si no hay usuario en el contexto (debido al bypass de seguridad), permitimos la acción por ahora
  if (current && current.role !== 'supervisor' && current.role !== 'director') {
    return c.json({ error: 'No autorizado' }, 403);
  }

  const { name, pin_hash, role, cedula, phone, address, sector, bank_name, bank_account, pago_movil, carnet, profile_admin, profile_opera, eye_id, email, birth_date, emergency_contact, emergency_phone, is_allergic, is_chofer } = await c.req.json();
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

  const mappedRole = mapRole(role || 'driver');

  await c.env.DB.prepare('INSERT INTO users (name, pin_hash, role, cedula, phone, address, sector, bank_name, bank_account, pago_movil, carnet_url, profile_admin, profile_opera, eye_id, email, birth_date, emergency_contact, emergency_phone, is_allergic, is_chofer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(cleanName, pin_hash, mappedRole, cedula || null, phone || null, address || null, sector || null, bank_name || null, bank_account || null, pago_movil || 0, carnetKey, profile_admin || null, profile_opera || null, eye_id || null, email || null, birth_date || null, emergency_contact || null, emergency_phone || null, is_allergic || null, is_chofer ? 1 : 0)
    .run();

  return c.json({ message: 'Personal registrado correctamente', name: cleanName });
});

app.post('/api/admin/send-staff-list', async (c) => {
  const current = c.get('user');
  if (current && current.role !== 'director') {
    return c.json({ error: 'No autorizado' }, 403);
  }

  const staff = await c.env.DB.prepare('SELECT name, cedula, pin_hash, profile_admin, profile_opera, eye_id FROM users ORDER BY name ASC').all();
  if (!staff.results || staff.results.length === 0) {
    return c.json({ error: 'No se encontraron empleados' }, 404);
  }

  let tableRows = '';
  staff.results.forEach((u: any) => {
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
      <div style="margin-top: 30px; text-align: center; color: #94a3b8; font-size: 0.8rem;">
        Plataforma Integral EYE STAFF © 2026 — Control Operativo de Valet Parking
      </div>
    </div>
  `;

  const adminEmail = c.env.DIRECTOR_EMAIL ;
  await sendEmail(c.env, adminEmail, 'EYE STAFF — Listado Completo de Accesos y Pines', html);

  return c.json({ success: true, message: `Correo enviado con éxito a ${adminEmail}` });
});

app.post('/api/admin/verify-pin-and-query', async (c) => {
  const current = c.get('user');
  if (!current) return c.json({ error: 'No autorizado' }, 401);

  // Verificar rol del usuario
  const isAuthorized = (
    current.profile_admin === 'DIRECTOR' || current.profile_admin === 'ADMIN' || current.profile_admin === 'RRHH' ||
    current.profile_admin === 'COORDINADOR' ||
    current.role === 'director'
  );
  if (!isAuthorized) {
    return c.json({ error: 'No autorizado' }, 403);
  }

  const { admin_pin } = await c.req.json();
  if (!admin_pin) {
    return c.json({ error: 'PIN de verificación requerido' }, 400);
  }

  // Fetch current administrator record
  let adminUser: any = null;
  if (current.id === 1) {
    adminUser = { name: 'ADMIN', pin_hash: 'corifede1416' };
  } else {
    adminUser = await c.env.DB.prepare('SELECT name, pin_hash FROM users WHERE id = ?').bind(current.id).first();
  }
  if (!adminUser) {
    return c.json({ error: 'Usuario no encontrado' }, 404);
  }

  if ((adminUser.pin_hash || '').toString().toLowerCase() !== admin_pin.trim().toLowerCase()) {
    // Audit failed attempt
    await logAudit(c.env, current.id, 'CONSULTA_PIN_FALLIDO', `Intento fallido de consulta de PINs por ${adminUser.name}`);
    return c.json({ error: 'PIN de confirmación incorrecto' }, 400);
  }

  // Audit successful access
  await logAudit(c.env, current.id, 'CONSULTA_PIN', `Consola de consulta de PINs operacionales accedida por ${adminUser.name}`);

  // Fetch all staff members' codes
  const staff = await c.env.DB.prepare('SELECT id, name, cedula, pin_hash, profile_admin, profile_opera, eye_id, is_active FROM users ORDER BY name ASC').all();

  return c.json({ success: true, staff: staff.results || [] });
});

app.delete('/api/staff/:id', async (c) => {
  const current = c.get('user');
  if (current && current.role !== 'supervisor' && current.role !== 'director') {
    return c.json({ error: 'No autorizado' }, 403);
  }

  const id = c.req.param('id');
  const force = c.req.query('force') === 'true';

  if (force) {
    try {
      // Borrar registros relacionados para permitir el borrado físico (cascada manual total v5)
      // El orden es CRÍTICO: primero tablas que dependen de sesiones, luego sesiones, luego usuario.
      await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM access_logs WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?)').bind(id),
        c.env.DB.prepare('DELETE FROM guest_list WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?)').bind(id),
        c.env.DB.prepare('DELETE FROM payroll_submissions WHERE user_id = ?').bind(id),
        c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
        c.env.DB.prepare('DELETE FROM web_sessions WHERE user_id = ?').bind(id),
        c.env.DB.prepare('DELETE FROM audit_logs WHERE user_id = ?').bind(id),
        c.env.DB.prepare('DELETE FROM staff_attendance WHERE user_id = ?').bind(id),
        c.env.DB.prepare('DELETE FROM shifts WHERE user_id = ?').bind(id),
        c.env.DB.prepare('DELETE FROM geofence_alerts WHERE user_id = ?').bind(id),
        c.env.DB.prepare('DELETE FROM events WHERE user_id = ?').bind(id),
        c.env.DB.prepare('DELETE FROM subscriptions WHERE user_id = ?').bind(id),
        c.env.DB.prepare('DELETE FROM chat_messages WHERE sender_id = ? OR recipient_id = ?').bind(String(id), String(id)),
        c.env.DB.prepare('DELETE FROM locations WHERE entity_id = ? AND entity_type = "staff"').bind(id),
        c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id)
      ]);
      return c.json({ success: true, message: 'Registro y todo su historial eliminados definitivamente de la base de datos (v6)' });
    } catch (e: any) {
      console.error('Force delete error:', e);
      return c.json({ error: 'No se pudo eliminar. Verifique dependencias en access_logs, nóminas o listas de invitados.' }, 500);
    }
  }

  try {
    // Comportamiento estándar: intentar borrado físico
    await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return c.json({ success: true, message: 'Registro eliminado físicamente' });
  } catch (e: any) {
    // Si falla por foreign keys, hacemos soft-delete (Desactivar)
    await c.env.DB.prepare('UPDATE users SET is_active = 0 WHERE id = ?').bind(id).run();
    return c.json({ success: true, message: 'Registro desactivado' });
  }
});

app.post('/api/staff/update', async (c) => {
  const { id, field, value } = await c.req.json();
  if (!id || !field) return c.json({ error: 'Faltan datos' }, 400);

  const allowedFields = ['name', 'cedula', 'role', 'phone', 'email', 'address', 'sector', 'bank_name', 'bank_account', 'pago_movil', 'profile_admin', 'profile_opera', 'eye_id', 'is_active', 'pin_hash', 'emergency_contact', 'emergency_phone', 'is_allergic'];
  if (!allowedFields.includes(field)) return c.json({ error: 'Campo no permitido' }, 400);

  await c.env.DB.prepare(`UPDATE users SET ${field} = ? WHERE id = ?`)
    .bind(value, id)
    .run();

  return c.json({ success: true });
});

app.post('/api/staff/update-bulk', async (c) => {
  const { id, updates } = await c.req.json();
  if (!id || !updates) return c.json({ error: 'Faltan datos' }, 400);

  const allowedFields = ['name', 'cedula', 'role', 'phone', 'email', 'birth_date', 'address', 'sector', 'bank_name', 'bank_account', 'pago_movil', 'profile_admin', 'profile_opera', 'eye_id', 'is_active', 'pin_hash', 'emergency_contact', 'emergency_phone', 'is_allergic', 'carnet_url', 'is_chofer'];

  const setClauses = [];
  const values = [];

  for (const [field, value] of Object.entries(updates)) {
    if (allowedFields.includes(field)) {
      setClauses.push(`${field} = ?`);
      values.push(value);
    }
  }

  if (setClauses.length === 0) return c.json({ error: 'No hay campos válidos para actualizar' }, 400);

  values.push(id);
  await c.env.DB.prepare(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  return c.json({ success: true });
});

// ===============================
// STAFF PHOTO UPLOAD
// ===============================
app.post('/api/staff/:id/photo', async (c) => {
  const id = c.req.param('id');
  const { image } = await c.req.json();
  if (!image) return c.json({ error: 'No se recibió imagen' }, 400);

  const key = `staff/${id}/photo_${Date.now()}.jpg`;
  const base64Data = image.includes(',') ? image.split(',')[1] : image;
  const binaryString = atob(base64Data);
  const binaryData = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    binaryData[i] = binaryString.charCodeAt(i);
  }

  await c.env.PHOTOS.put(key, binaryData, {
    httpMetadata: { contentType: 'image/jpeg' }
  });

  const publicUrl = `/api/photos/${key}`;
  await c.env.DB.prepare('UPDATE users SET carnet_url = ? WHERE id = ?').bind(publicUrl, id).run();

  return c.json({ success: true, url: publicUrl });
});



// ===============================
// INTERNAL CHAT API
// ===============================
app.get('/api/chat/newest', async (c) => {
  const userId = c.req.query('userId');
  if (!userId || userId === 'undefined') return c.json({ max_id: 0, max_created_at: null });

  try {
    const parsedUserId = parseInt(userId.toString());

    // Obtener rol del usuario
    const userRes = await c.env.DB.prepare('SELECT role, current_session_id FROM users WHERE id = ?').bind(parsedUserId).first<any>();
    if (!userRes) return c.json({ max_id: 0, max_created_at: null });

    const isAdmin = ['director', 'supervisor'].includes(userRes.role);
    const currentSessionId = userRes.current_session_id;

    let query = `
      SELECT MAX(m.id) as max_id, MAX(m.created_at) as max_created_at
      FROM chat_messages m
      WHERE m.sender_id != ? AND (
        -- 1. Chat Global
        (m.recipient_id IS NULL AND m.session_id IS NULL)
        -- 2. Chat Privado para el usuario
        OR (m.recipient_id = ?)
    `;

    const binds = [parsedUserId, parsedUserId];

    if (isAdmin) {
      // 3. Admin ve chats de todos los eventos activos
      query += `
        OR (m.session_id IS NOT NULL AND m.session_id IN (SELECT id FROM sessions WHERE status IN ('planning', 'active')))
      `;
    } else if (currentSessionId) {
      // 3. Usuario regular ve chat de su evento asignado
      const assignedIds = currentSessionId.toString().split(',').map((x: string) => x.trim()).filter(Boolean);
      if (assignedIds.length > 0) {
        query += `
          OR (m.session_id IS NOT NULL AND m.session_id IN (${assignedIds.join(',')}))
        `;
      }
    }

    query += ` ) `;

    const res = await c.env.DB.prepare(query).bind(...binds).first<any>();
    return c.json({
      max_id: res?.max_id || 0,
      max_created_at: res?.max_created_at || null
    });
  } catch (e) {
    return c.json({ max_id: 0, max_created_at: null });
  }
});

app.get('/api/chat/users', async (c) => {
  const userId = c.req.query('userId');

  const allUsersRes = await c.env.DB.prepare(
    "SELECT id, name, role FROM users WHERE is_active = 1 ORDER BY name ASC"
  ).all();
  const allUsers = allUsersRes.results || [];

  let activeContacts: any[] = [];
  if (userId && userId !== 'undefined') {
    const activeRes = await c.env.DB.prepare(`
      SELECT id, name, role FROM users WHERE id IN (
        SELECT DISTINCT 
          CASE 
            WHEN sender_id = ? THEN recipient_id 
            ELSE sender_id 
          END as contact_id
        FROM chat_messages
        WHERE (sender_id = ? OR recipient_id = ?) AND recipient_id IS NOT NULL
      ) AND is_active = 1 ORDER BY name ASC
    `).bind(userId, userId, userId).all();
    activeContacts = activeRes.results || [];
  }

  return c.json({
    users: allUsers,
    activeConversations: activeContacts
  });
});



app.get('/api/admin/applications', async (c) => {
  const res = await c.env.DB.prepare('SELECT * FROM job_applications ORDER BY created_at DESC').all();
  return c.json({ applications: res.results || [] });
});

app.post('/api/admin/applications/:id/status', async (c) => {
  const id = c.req.param('id');
  const { status } = await c.req.json();
  await c.env.DB.prepare('UPDATE job_applications SET status = ? WHERE id = ?').bind(status, id).run();
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
    // Usar regex para dividir por comas respetando comas dentro de comillas
    const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((c: string) => c.trim().replace(/^"|"$/g, ''));

    if (cols.length < 5) continue; // Línea inválida

    // Nuevo mapeo según plantilla v2.3.76:
    // 0:Item, 1:Status, 2:Nombre, 3:Cedula, 4:Email, 5:P_Admin, 6:P_Opera, 7:EYE_ID, 8:Tel, 9:Dir, 10:Sector, 11:Bank, 12:Account, 13:Fam, 14:TelFam, 15:Alergias
    const pin = '1234';
    const name = cols[2] || '';
    const cedula = cols[3] || '';
    const email = cols[4] || '';
    const pAdmin = cols[5] || '';
    const pOpera = cols[6] || '';
    const eye_id = cols[7] || '';
    const phone = cols[8] || '';
    const address = cols[9] || '';
    const sector = cols[10] || '';
    const bank_name = cols[11] || '';
    const bank_account = cols[12] || '';
    const e_contact = cols[13] || '';
    const e_phone = cols[14] || '';
    const allergies = cols[15] || '';

    // Inferir ROL legacy
    let role = 'driver';
    if (pAdmin === 'DIRECTOR') role = 'director';
    else if (pAdmin === 'COORDINADOR' || ['JEFE DE GRUPO', 'SUPERVISOR', 'COORDINADOR GENERAL'].includes(pOpera)) role = 'supervisor';

    // Limpieza de nombre
    let cleanName = name;
    if (name.includes(',')) {
      const parts = name.split(',');
      const fName = parts[1]?.trim().split(' ')[0] || '';
      const lName = parts[0]?.trim().split(' ')[0] || '';
      cleanName = `${fName} ${lName}`.trim().toUpperCase();
    }

    if (!cleanName) continue;

    // Buscar por cédula primero (Identificador Único Real)
    const existing = await c.env.DB.prepare('SELECT id FROM users WHERE cedula = ?').bind(cedula).first<{ id: number }>();

    if (existing) {
      // Actualizar registro existente por ID (unifica aunque cambie el nombre o tildes)
      await c.env.DB.prepare(`
        UPDATE users SET 
          name = ?, pin_hash = ?, role = ?, email = ?, phone = ?, 
          address = ?, sector = ?, bank_name = ?, bank_account = ?, 
          emergency_contact = ?, emergency_phone = ?, is_allergic = ?, 
          profile_admin = ?, profile_opera = ?, eye_id = ?, is_active = 1
        WHERE id = ?
      `).bind(
        cleanName, pin, role, email, phone,
        address, sector, bank_name, bank_account,
        e_contact, e_phone, allergies,
        pAdmin, pOpera, eye_id,
        existing.id
      ).run();
    } else {
      // Insertar nuevo si no existe la cédula
      await c.env.DB.prepare(`
        INSERT INTO users (
          name, pin_hash, role, cedula, email, phone, address, sector, 
          bank_name, bank_account, emergency_contact, emergency_phone, 
          is_allergic, profile_admin, profile_opera, eye_id, is_active
        ) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).bind(
        cleanName, pin, role, cedula, email, phone, address, sector,
        bank_name, bank_account, e_contact, e_phone,
        allergies, pAdmin, pOpera, eye_id
      ).run();
    }

    count++;
  }

  return c.json({ success: true, count });
});

app.post('/api/staff/purge-duplicates', async (c) => {
  const current = c.get('user');
  if (current && current.role !== 'supervisor' && current.role !== 'director') {
    return c.json({ error: 'No autorizado' }, 403);
  }

  // Borrar inactivos que tengan la misma cédula que uno activo
  await c.env.DB.prepare(`
    DELETE FROM users 
    WHERE is_active = 0 
    AND cedula IN (SELECT cedula FROM users WHERE is_active = 1)
  `).run();

  return c.json({ success: true, message: 'Duplicados inactivos depurados' });
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

// Nuevas rutas para matriz interactiva de permisos
app.get('/api/my-permissions', async (c) => {
  const user = c.get('user');
  if (!user || !user.id) return c.json({ error: 'No autorizado' }, 401);

  const permRow = await c.env.DB.prepare('SELECT * FROM user_permissions_matrix WHERE user_id = ?').bind(user.id).first<any>();
  let permissions = permRow;
  if (!permRow) {
    const isSuperadmin = user.role === 'director';
    const isSupervisor = user.role === 'supervisor';
    const allowedCfoNames = ["ADMIN", "NICOLAS BETANCOURT", "MAIFER BARRUETA"];
    const isVIP = allowedCfoNames.some(n => (user.name || '').toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(n));
    permissions = {
      valet_ve: 1,
      valet_mod: (isSuperadmin || isSupervisor) ? 1 : 0,
      accesos_ve: (isSuperadmin || isSupervisor) ? 1 : 0,
      accesos_mod: (isSuperadmin || isSupervisor) ? 1 : 0,
      alquiler_ve: (isSuperadmin || isSupervisor) ? 1 : 0,
      alquiler_mod: (isSuperadmin || isSupervisor) ? 1 : 0,
      traslados_ve: (isSuperadmin || isSupervisor) ? 1 : 0,
      traslados_mod: (isSuperadmin || isSupervisor) ? 1 : 0,
      guardia_ve: (isSuperadmin || isSupervisor) ? 1 : 0,
      guardia_mod: (isSuperadmin || isSupervisor) ? 1 : 0,
      custodia_ve: (isSuperadmin || isSupervisor) ? 1 : 0,
      custodia_mod: (isSuperadmin || isSupervisor) ? 1 : 0,
      eventos_ve: (isSuperadmin || isSupervisor) ? 1 : 0,
      eventos_mod: (isSuperadmin || isSupervisor) ? 1 : 0,
      admin_ve: isSuperadmin ? 1 : 0,
      admin_mod: isSuperadmin ? 1 : 0,
      vip_ve: isVIP ? 1 : 0,
      vip_mod: isVIP ? 1 : 0,
      seg_ve: isSuperadmin ? 1 : 0,
      seg_mod: isSuperadmin ? 1 : 0
    };
  }
  return c.json({ success: true, permissions });
});

app.get('/api/admin/user-permissions', async (c) => {
  const user = c.get('user');
  if (user.role !== 'director') return c.json({ error: 'No autorizado' }, 403);

  const staffRes = await c.env.DB.prepare('SELECT id, name, role, eye_id FROM users WHERE is_active = 1 ORDER BY name ASC').all();
  const staff = staffRes.results || [];

  const permRowsRes = await c.env.DB.prepare('SELECT * FROM user_permissions_matrix').all();
  const permRows = permRowsRes.results || [];
  const permMap = new Map(permRows.map((r: any) => [r.user_id, r]));

  const allowedCfoNames = ["ADMIN", "NICOLAS BETANCOURT", "MAIFER BARRUETA"];

  const permissions = staff.map((u: any) => {
    const permRow = permMap.get(u.id);
    if (permRow) {
      return {
        user_id: u.id,
        name: u.name,
        role: u.role,
        valet_ve: permRow.valet_ve,
        valet_mod: permRow.valet_mod,
        accesos_ve: permRow.accesos_ve,
        accesos_mod: permRow.accesos_mod,
        alquiler_ve: permRow.alquiler_ve,
        alquiler_mod: permRow.alquiler_mod,
        traslados_ve: permRow.traslados_ve,
        traslados_mod: permRow.traslados_mod,
        guardia_ve: permRow.guardia_ve,
        guardia_mod: permRow.guardia_mod,
        custodia_ve: permRow.custodia_ve,
        custodia_mod: permRow.custodia_mod,
        eventos_ve: permRow.eventos_ve,
        eventos_mod: permRow.eventos_mod,
        admin_ve: permRow.admin_ve,
        admin_mod: permRow.admin_mod,
        vip_ve: permRow.vip_ve,
        vip_mod: permRow.vip_mod,
        seg_ve: permRow.seg_ve,
        seg_mod: permRow.seg_mod,
        loc_ve: permRow.loc_ve,
        loc_mod: permRow.loc_mod
      };
    } else {
      const isSuperadmin = u.role === 'director';
      const isSupervisor = u.role === 'supervisor';
      const isVIP = allowedCfoNames.some(n => (u.name || '').toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(n));
      return {
        user_id: u.id,
        name: u.name,
        role: u.role,
        valet_ve: 1,
        valet_mod: (isSuperadmin || isSupervisor) ? 1 : 0,
        accesos_ve: (isSuperadmin || isSupervisor) ? 1 : 0,
        accesos_mod: (isSuperadmin || isSupervisor) ? 1 : 0,
        alquiler_ve: (isSuperadmin || isSupervisor) ? 1 : 0,
        alquiler_mod: (isSuperadmin || isSupervisor) ? 1 : 0,
        traslados_ve: (isSuperadmin || isSupervisor) ? 1 : 0,
        traslados_mod: (isSuperadmin || isSupervisor) ? 1 : 0,
        guardia_ve: (isSuperadmin || isSupervisor) ? 1 : 0,
        guardia_mod: (isSuperadmin || isSupervisor) ? 1 : 0,
        custodia_ve: (isSuperadmin || isSupervisor) ? 1 : 0,
        custodia_mod: (isSuperadmin || isSupervisor) ? 1 : 0,
        eventos_ve: (isSuperadmin || isSupervisor) ? 1 : 0,
        eventos_mod: (isSuperadmin || isSupervisor) ? 1 : 0,
        admin_ve: isSuperadmin ? 1 : 0,
        admin_mod: isSuperadmin ? 1 : 0,
        vip_ve: isVIP ? 1 : 0,
        vip_mod: isVIP ? 1 : 0,
        seg_ve: isSuperadmin ? 1 : 0,
        seg_mod: isSuperadmin ? 1 : 0,
        loc_ve: 1,
        loc_mod: (isSuperadmin || isSupervisor) ? 1 : 0
      };
    }
  });

  return c.json({ success: true, permissions });
});

app.post('/api/admin/user-permissions', async (c) => {
  const user = c.get('user');
  if (user.role !== 'director') return c.json({ error: 'No autorizado' }, 403);

  const { user_id, field, value } = await c.req.json();
  if (!user_id || !field) return c.json({ error: 'Faltan datos' }, 400);

  const validFields = ['valet_ve', 'valet_mod', 'accesos_ve', 'accesos_mod', 'alquiler_ve', 'alquiler_mod', 'traslados_ve', 'traslados_mod', 'guardia_ve', 'guardia_mod', 'custodia_ve', 'custodia_mod', 'eventos_ve', 'eventos_mod', 'admin_ve', 'admin_mod', 'vip_ve', 'vip_mod', 'seg_ve', 'seg_mod', 'loc_ve', 'loc_mod'];
  if (!validFields.includes(field)) {
    return c.json({ error: 'Campo inválido' }, 400);
  }

  const targetUser = await c.env.DB.prepare('SELECT name, role FROM users WHERE id = ?').bind(user_id).first<any>();
  if (!targetUser) return c.json({ error: 'Usuario no encontrado' }, 404);

  const isSuperadmin = targetUser.role === 'director';
  const isSupervisor = targetUser.role === 'supervisor';
  const allowedCfoNames = ["ADMIN", "NICOLAS BETANCOURT", "MAIFER BARRUETA"];
  const isVIP = allowedCfoNames.some(n => (targetUser.name || '').toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(n));

  const d_valet_ve = 1;
  const d_valet_mod = (isSuperadmin || isSupervisor) ? 1 : 0;
  const d_accesos_ve = (isSuperadmin || isSupervisor) ? 1 : 0;
  const d_accesos_mod = (isSuperadmin || isSupervisor) ? 1 : 0;
  const d_alquiler_ve = (isSuperadmin || isSupervisor) ? 1 : 0;
  const d_alquiler_mod = (isSuperadmin || isSupervisor) ? 1 : 0;
  const d_traslados_ve = (isSuperadmin || isSupervisor) ? 1 : 0;
  const d_traslados_mod = (isSuperadmin || isSupervisor) ? 1 : 0;
  const d_guardia_ve = (isSuperadmin || isSupervisor) ? 1 : 0;
  const d_guardia_mod = (isSuperadmin || isSupervisor) ? 1 : 0;
  const d_custodia_ve = (isSuperadmin || isSupervisor) ? 1 : 0;
  const d_custodia_mod = (isSuperadmin || isSupervisor) ? 1 : 0;
  const d_eventos_ve = (isSuperadmin || isSupervisor) ? 1 : 0;
  const d_eventos_mod = (isSuperadmin || isSupervisor) ? 1 : 0;
  const d_admin_ve = isSuperadmin ? 1 : 0;
  const d_admin_mod = isSuperadmin ? 1 : 0;
  const d_vip_ve = isVIP ? 1 : 0;
  const d_vip_mod = isVIP ? 1 : 0;
  const d_seg_ve = isSuperadmin ? 1 : 0;
  const d_seg_mod = isSuperadmin ? 1 : 0;
  const d_loc_ve = 1;
  const d_loc_mod = (isSuperadmin || isSupervisor) ? 1 : 0;

  await c.env.DB.prepare(`
    INSERT OR IGNORE INTO user_permissions_matrix 
    (user_id, valet_ve, valet_mod, accesos_ve, accesos_mod, alquiler_ve, alquiler_mod, traslados_ve, traslados_mod, guardia_ve, guardia_mod, custodia_ve, custodia_mod, eventos_ve, eventos_mod, admin_ve, admin_mod, vip_ve, vip_mod, seg_ve, seg_mod, loc_ve, loc_mod) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(user_id, d_valet_ve, d_valet_mod, d_accesos_ve, d_accesos_mod, d_alquiler_ve, d_alquiler_mod, d_traslados_ve, d_traslados_mod, d_guardia_ve, d_guardia_mod, d_custodia_ve, d_custodia_mod, d_eventos_ve, d_eventos_mod, d_admin_ve, d_admin_mod, d_vip_ve, d_vip_mod, d_seg_ve, d_seg_mod, d_loc_ve, d_loc_mod)
    .run();

  const intVal = value ? 1 : 0;
  await c.env.DB.prepare(`UPDATE user_permissions_matrix SET ${field} = ? WHERE user_id = ?`)
    .bind(intVal, user_id)
    .run();

  return c.json({ success: true });
});

// ===============================
// REPORT SUBSCRIPTIONS
// ===============================
app.get('/api/admin/report-subscriptions', async (c) => {
  const user = c.get('user');
  if (user.role !== 'director') return c.json({ error: 'No autorizado' }, 403);

  const staffRes = await c.env.DB.prepare('SELECT id, name, role, eye_id, email FROM users WHERE is_active = 1 ORDER BY name ASC').all();
  const staff = staffRes.results || [];

  const subRowsRes = await c.env.DB.prepare('SELECT * FROM user_report_subscriptions').all();
  const subRows = subRowsRes.results || [];
  const subMap = new Map(subRows.map((r: any) => [r.user_id, r]));

  const subscriptions = staff.map((u: any) => {
    const subRow = subMap.get(u.id);
    if (subRow) {
      return {
        user_id: u.id,
        name: u.name,
        email: u.email,
        convocatoria: subRow.convocatoria,
        cumpleanos: subRow.cumpleanos,
        dossier_pdf: subRow.dossier_pdf,
        bbdd_excel: subRow.bbdd_excel,
        nominas: subRow.nominas,
        permisos: subRow.permisos,
        plantilla_rrhh: subRow.plantilla_rrhh || 0,
        credenciales: subRow.credenciales || 0,
        actualizacion_datos: subRow.actualizacion_datos || 0,
        cierre_html: subRow.cierre_html || 0
      };
    } else {
      return {
        user_id: u.id,
        name: u.name,
        email: u.email,
        convocatoria: 0,
        cumpleanos: 0,
        dossier_pdf: 0,
        bbdd_excel: 0,
        nominas: 0,
        permisos: 0,
        plantilla_rrhh: 0,
        credenciales: 0,
        actualizacion_datos: 0,
        cierre_html: 0
      };
    }
  });

  return c.json({ success: true, subscriptions });
});

app.post('/api/admin/report-subscriptions', async (c) => {
  const user = c.get('user');
  if (user.role !== 'director') return c.json({ error: 'No autorizado' }, 403);

  const { user_id, field, value } = await c.req.json();
  if (!user_id || !field) return c.json({ error: 'Faltan datos' }, 400);

  const validFields = ['convocatoria', 'cumpleanos', 'dossier_pdf', 'bbdd_excel', 'nominas', 'permisos', 'plantilla_rrhh', 'actualizacion_datos', 'credenciales', 'cierre_html'];
  if (!validFields.includes(field)) {
    return c.json({ error: 'Campo inválido' }, 400);
  }

  const targetUser = await c.env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(user_id).first<any>();
  if (!targetUser) return c.json({ error: 'Usuario no encontrado' }, 404);

  await c.env.DB.prepare(`
    INSERT OR IGNORE INTO user_report_subscriptions 
    (user_id, convocatoria, cumpleanos, dossier_pdf, bbdd_excel, nominas, permisos, plantilla_rrhh, actualizacion_datos, credenciales, cierre_html) 
    VALUES (?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
  `).bind(user_id).run();

  const intVal = value ? 1 : 0;
  await c.env.DB.prepare(`UPDATE user_report_subscriptions SET ${field} = ? WHERE user_id = ?`)
    .bind(intVal, user_id)
    .run();

  return c.json({ success: true });
});

app.post('/api/admin/send-update-requests', async (c) => {
  const user = c.get('user');
  if (user.role !== 'director') return c.json({ error: 'No autorizado' }, 403);

  const { type, userIds, channel } = await c.req.json();
  const sendEmailFlag = channel === 'email' || channel === 'ambos' || !channel;
  const sendWaFlag = channel === 'whatsapp' || channel === 'ambos';

  let targetUsers: {id: number, email: string, name: string, phone: string}[] = [];

  if (type === 'matrix') {
    const subs = await c.env.DB.prepare(`
      SELECT u.id, u.email, u.name, u.phone FROM user_report_subscriptions rs
      JOIN users u ON rs.user_id = u.id
      WHERE rs.actualizacion_datos = 1 AND u.is_active = 1
    `).all();
    targetUsers = subs.results as any;
  } else if (userIds && Array.isArray(userIds) && userIds.length > 0) {
    const placeholders = userIds.map(() => '?').join(',');
    const subs = await c.env.DB.prepare(`
      SELECT id, email, name, phone FROM users 
      WHERE id IN (${placeholders}) AND is_active = 1
    `).bind(...userIds).all();
    targetUsers = subs.results as any;
  }

  if (targetUsers.length === 0) {
    return c.json({ error: 'No se encontraron empleados.' }, 400);
  }

  let sentCount = 0;
  let errors = 0;
  let sentNames: string[] = [];
  let lastBotError = '';

  for (const emp of targetUsers) {
    let sentAny = false;
    const token = crypto.randomUUID();
    await c.env.DB.prepare(`
      INSERT INTO employee_data_updates (token, user_id, status)
      VALUES (?, ?, 'pending_user')
    `).bind(token, emp.id).run();

    const link = `https://eye-staff.app/#actualizar-datos?token=${token}`;
    const firstName = emp.name.split(' ')[0];

    if (sendEmailFlag && emp.email) {
      const html = `
        <div style="text-align: center;">
          <h2 style="color: #1e293b; margin-bottom: 20px;">Hola ${emp.name},</h2>
          <p style="font-size: 16px; color: #475569; margin-bottom: 30px;">
            El departamento de Recursos Humanos de EYE STAFF requiere que actualices o verifiques tus datos personales.
          </p>
          <a href="${link}" style="display: inline-block; background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
            📋 ACTUALIZAR MIS DATOS
          </a>
          <p style="margin-top: 30px; font-size: 12px; color: #94a3b8;">
            Este enlace es único y personal. Por favor no lo compartas con nadie.
          </p>
        </div>
      `;
      try {
        await sendEmail(c.env, emp.email, '⚠️ Acción Requerida: Actualización de Datos', html);
        sentAny = true;
      } catch (e) {
        console.error(`Failed to send email to ${emp.email}`, e);
        if (!sendWaFlag) errors++;
      }
    } else if (sendEmailFlag && !emp.email) {
      if (!sendWaFlag) errors++;
    }

    if (sendWaFlag && emp.phone) {
      const waMessage = `Hola *${firstName}* 👋🏼\n\nEl departamento de Recursos Humanos de *EYE STAFF* requiere que actualices o verifiques tus datos personales (foto, cuenta bancaria, etc).\n\nIngresa al siguiente enlace único y seguro para hacerlo:\n\n🔗 ${link}\n\n_⚠️ Este enlace es personal, por favor no lo compartas con nadie._`;
      const res = await sendWhatsAppMessage(c.env, emp.phone, waMessage);
      if (res.ok) {
        sentAny = true;
      } else {
        if (res.error) lastBotError = res.error;
        if (!sendEmailFlag) errors++;
      }
    } else if (sendWaFlag && !emp.phone) {
      if (!sendEmailFlag) errors++;
    }

    if (sentAny) {
      sentCount++;
      sentNames.push(emp.name);
    }
  }

  if (sentCount === 0) {
    const errSuffix = lastBotError ? ` Error de WhatsApp: ${lastBotError}` : '';
    return c.json({ error: 'No se pudo enviar ninguna solicitud.' + errSuffix }, 500);
  }

  return c.json({ success: true, sent: sentCount, total: targetUsers.length, recipients: sentNames, errors });
});

app.get('/api/admin/pending-updates', async (c) => {
  const user = c.get('user');
  if (user.role !== 'director') return c.json({ error: 'No autorizado' }, 403);

  const updates = await c.env.DB.prepare(`
    SELECT e.*, u.name as user_name, u.cedula as user_cedula, u.photo_url as current_photo, u.email as user_email
    FROM employee_data_updates e
    JOIN users u ON e.user_id = u.id
    WHERE e.status = 'pending_review'
    ORDER BY e.created_at DESC
  `).all();

  return c.json(updates.results);
});

app.post('/api/admin/approve-data-update/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'director') return c.json({ error: 'No autorizado' }, 403);

  const id = c.req.param('id');
  const { pin, modifiedData } = await c.req.json();

  let adminUser: any = null;
  if (user.id === 1) {
    adminUser = { pin_hash: 'corifede1416' };
  } else {
    adminUser = await c.env.DB.prepare('SELECT pin_hash FROM users WHERE id = ?').bind(user.id).first();
  }

  if (!adminUser || !pin || pin.trim().toLowerCase() !== (adminUser.pin_hash || '').toString().toLowerCase()) {
    return c.json({ error: 'PIN incorrecto' }, 403);
  }

  const update = await c.env.DB.prepare('SELECT * FROM employee_data_updates WHERE id = ?').bind(id).first<any>();
  if (!update || update.status !== 'pending_review') return c.json({ error: 'Solicitud inválida' }, 400);

  const proposed = modifiedData || JSON.parse(update.proposed_data || '{}');

  // Convertir fecha de YYYY-MM-DD a unix timestamp para 'birth_date'
  let birthDateUnix = null;
  if (proposed.birth_date) {
    birthDateUnix = Math.floor(new Date(proposed.birth_date).getTime());
  }

  let photoUrl = null;
  if (update.photo_base64) {
    const base64Data = update.photo_base64.split(',')[1];
    if (base64Data) {
      const binaryData = Uint8Array.from(atob(base64Data), char => char.charCodeAt(0));
      const key = `staff/${update.user_id}_${Date.now()}.jpg`;
      await c.env.PHOTOS.put(key, binaryData, { httpMetadata: { contentType: 'image/jpeg' } });
      photoUrl = `/api/photos/${key}`;
    }
  }

  let updateQuery = `
    UPDATE users SET
      phone = COALESCE(?, phone),
      address = COALESCE(?, address),
      sector = COALESCE(?, sector),
      bank_name = COALESCE(?, bank_name),
      bank_account = COALESCE(?, bank_account),
      pago_movil = COALESCE(?, pago_movil),
      emergency_contact = COALESCE(?, emergency_contact),
      emergency_phone = COALESCE(?, emergency_phone),
      is_allergic = COALESCE(?, is_allergic)
  `;
  const params: any[] = [
    proposed.phone || null,
    proposed.address || null,
    proposed.sector || null,
    proposed.bank_name || null,
    proposed.bank_account || null,
    proposed.pago_movil !== undefined ? proposed.pago_movil : null,
    proposed.emergency_contact || null,
    proposed.emergency_phone || null,
    proposed.is_allergic || null
  ];

  if (birthDateUnix) {
    updateQuery += `, birth_date = ?`;
    params.push(birthDateUnix);
  }
  if (photoUrl) {
    updateQuery += `, photo_url = ?`;
    params.push(photoUrl);
  }

  updateQuery += ` WHERE id = ?`;
  params.push(update.user_id);

  await c.env.DB.prepare(updateQuery).bind(...params).run();
  await c.env.DB.prepare("UPDATE employee_data_updates SET status = 'approved', photo_base64 = NULL WHERE id = ?").bind(id).run();

  return c.json({ success: true });
});

app.delete('/api/admin/delete-data-update/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'director' && user.profile_admin !== 'ADMIN' && user.profile_admin !== 'RRHH') return c.json({ error: 'No autorizado' }, 403);

  const id = c.req.param('id');
  await c.env.DB.prepare("DELETE FROM employee_data_updates WHERE id = ?").bind(id).run();

  return c.json({ success: true });
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
        (plate, status, ticket_code, owner_name, owner_phone, brand, model, color, parking_spot, damage_notes, damage_json, fee_amount, session_id, daily_seq, auth_token_1, auth_token_2, retrieval_token, vehicle_type) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      data.plate.toUpperCase(), 'parked', ticketCode, data.owner_name || null, data.owner_phone || null,
      cleanBrand || null, cleanModel || null, cleanColor || null, data.parking_spot || null, data.damage_notes || null, data.damage_json || null, data.fee_amount || 0,
      sessionId, nextSeq, authToken1, authToken2, retrievalToken, data.vehicle_type || 'car'
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
app.post('/api/events/verify-qr', async (c) => {
  const { id } = await c.req.json();
  const user = c.get('user');
  const vehicle = await c.env.DB.prepare('SELECT plate FROM vehicles WHERE id = ?').bind(id).first<any>();
  if (vehicle) {
    await logAudit(c.env, user.id, 'QR_VERIFY', `Identidad verificada QR para: ${vehicle.plate}`, c);
  }
  return c.json({ success: true });
});

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

  // Enviar email de confirmación de entrega (al cliente si tiene, siempre copia al admin)
  const v = await c.env.DB.prepare('SELECT * FROM vehicles WHERE id = ?').bind(vehicle.id).first<any>();
  if (v) {
    await sendDeliveryConfirmationEmail(c.env, v);
  }

  return c.json({ message: 'Check-out registrado', plate: vehicle.plate });
});

app.post('/api/events/override-checkout', async (c) => {
  const { vehicle_id, reason, supervisor_pin } = await c.req.json();
  const user = c.get('user');

  // Validar PIN de supervisor
  const cleanPin = (supervisor_pin || '').toString().trim().toLowerCase();
  const supervisor = await c.env.DB.prepare('SELECT id FROM users WHERE pin_hash = ? AND role IN ("supervisor", "director")')
    .bind(cleanPin).first();

  if (!supervisor) {
    return c.json({ error: 'PIN de Supervisor inválido' }, 401);
  }

  await c.env.DB.prepare(
    'UPDATE vehicles SET status = ?, check_out_at = CURRENT_TIMESTAMP, damage_notes = COALESCE(damage_notes, "") || ? WHERE id = ?'
  ).bind('retrieved', ` [OVERRIDE: ${reason}]`, vehicle_id).run();

  await logEvent(c.env, vehicle_id, user.id, 'delivered', `Entrega MANUAL (Override) por ${user.name}. Motivo: ${reason}`);

  const v = await c.env.DB.prepare('SELECT * FROM vehicles WHERE id = ?').bind(vehicle_id).first<any>();
  if (v) {
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

  const to = c.env.DIRECTOR_EMAIL ;

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
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #475569;">Fecha: ${formatFull24h(new Date())}</p>
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
  const to = c.env.DIRECTOR_EMAIL ;
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
  const last = await c.env.DB.prepare('SELECT id, name FROM sessions ORDER BY id DESC LIMIT 1').first<{ id: number, name: string }>();
  if (!last) return c.json({ error: 'No hay sesiones' });

  const stats = await c.env.DB.prepare(`
    SELECT COUNT(*) as total, SUM(fee_amount) as revenue
    FROM vehicles WHERE session_id = ? AND status != 'pre-registered'
  `).bind(last.id).first<{ total: number, revenue: number }>();

  const to = c.env.DIRECTOR_EMAIL ;
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

  const result = await c.env.DB.prepare(query).bind(String(id), String(id)).all();
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

    await sendEmail(c.env, c.env.DIRECTOR_EMAIL, `💰 NUEVO REPORTE DE COBRO: ${staff?.name || 'EMPLEADO'}`, `
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
        `, undefined, undefined, 'nominas');
  } catch (e) { console.error('Email error:', e); }

  return c.json({ success: true });
});


app.use('*', async (c, next) => {
  await initDatabase(c.env.DB);
  await next();
});

// --- ASISTENCIA (FICHAJE) ---

app.post('/api/attendance/log', async (c) => {
  const { type, session_id, user_id, bypass_custody } = await c.req.json().catch(() => ({}));
  const user = c.get('user');
  const targetUserId = user_id || (user ? user.id : null);

  if (!session_id || !type || !targetUserId) return c.json({ error: 'Faltan datos' }, 400);

  if (type === 'absent') {
    await c.env.DB.prepare('INSERT INTO staff_attendance (user_id, session_id, type) VALUES (?, ?, ?)')
      .bind(targetUserId, session_id, 'absent')
      .run();
    
    const userObj = await c.env.DB.prepare('SELECT current_session_id FROM users WHERE id = ?').bind(targetUserId).first<{ current_session_id: string | null }>();
    if (userObj && userObj.current_session_id) {
      let currentIds = userObj.current_session_id.toString().split(',').map(x => x.trim()).filter(Boolean);
      currentIds = currentIds.filter(x => x !== session_id.toString());
      await c.env.DB.prepare('UPDATE users SET current_session_id = ? WHERE id = ?').bind(currentIds.length > 0 ? currentIds.join(',') : null, targetUserId).run();
    }
    return c.json({ success: true, status: 'absent' });
  }

  // REGLA DE EXCLUSIVIDAD: Si es entrada, verificar si ya tiene una entrada activa en OTRO evento
  if (type === 'entry') {
    const activeEntry = await c.env.DB.prepare(`
      SELECT s.name 
      FROM staff_attendance a
      JOIN sessions s ON a.session_id = s.id
      WHERE a.user_id = ? AND a.type = 'entry' AND s.status = 'active' AND a.session_id != ?
      ORDER BY a.timestamp DESC LIMIT 1
    `).bind(targetUserId, session_id).first<{ name: string }>();

    if (activeEntry) {
      return c.json({ error: `⚠️ NO PUEDES ENTRAR: Ya tienes una entrada activa en el evento "${activeEntry.name}". Marca SALIDA allí primero.` }, 400);
    }
  }

  // REGLA DE DESCANSO MÍNIMO: No permitir que todos los empleados estén en descanso. Al menos uno debe estar activo.
  if (type === 'break_start') {
    const assignedStaff = await c.env.DB.prepare(
      "SELECT id FROM users WHERE current_session_id = ? OR instr(',' || current_session_id || ',', ',' || CAST(? AS TEXT) || ',') > 0"
    ).bind(session_id, session_id).all();
    const staffList = assignedStaff.results || [];

    let activeStaffCount = 0;
    for (const staff of staffList) {
      if (staff.id === targetUserId) continue; // Excluir al que quiere ir a descanso
      const latestAtt = await c.env.DB.prepare(
        "SELECT type FROM staff_attendance WHERE user_id = ? AND session_id = ? ORDER BY id DESC LIMIT 1"
      ).bind(staff.id, session_id).first<{ type: string }>();

      if (latestAtt && latestAtt.type === 'entry') {
        activeStaffCount++;
      }
    }

    if (activeStaffCount === 0) {
      return c.json({ error: '⚠️ REGLA DE OPERACIÓN: No se puede iniciar el descanso. Debe haber al menos un empleado activo en el evento.' }, 400);
    }
  }

  // REGLA DE CUSTODIA MÍNIMA (Salida): Si es salida, verificar si quedan vehículos en custodia
  if (type === 'exit') {
    const custodyCountRes = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM vehicles WHERE session_id = ? AND status = 'parked'"
    ).bind(session_id).first<{ count: number }>();
    const hasCustodyVehicles = custodyCountRes && custodyCountRes.count > 0;

    if (hasCustodyVehicles) {
      // Verificar si es el último empleado activo
      const assignedStaff = await c.env.DB.prepare(
        "SELECT id, name FROM users WHERE current_session_id = ? OR instr(',' || current_session_id || ',', ',' || CAST(? AS TEXT) || ',') > 0"
      ).bind(session_id, session_id).all();
      const staffList = assignedStaff.results || [];

      let activeStaffCount = 0;
      for (const staff of staffList) {
        if (staff.id === targetUserId) continue; // Excluir al que quiere salir
        const latestAtt = await c.env.DB.prepare(
          "SELECT type FROM staff_attendance WHERE user_id = ? AND session_id = ? ORDER BY id DESC LIMIT 1"
        ).bind(staff.id, session_id).first<{ type: string }>();

        if (latestAtt && latestAtt.type !== 'exit') {
          activeStaffCount++;
        }
      }

      if (activeStaffCount === 0) {
        if (!bypass_custody) {
          return c.json({
            error_code: 'LAST_EMPLOYEE_CUSTODIA',
            error: '⚠️ OPERACIÓN DE SEGURIDAD: Aún quedan vehículos en custodia y usted es el último empleado activo.',
            custody_count: custodyCountRes.count
          }, 400);
        } else {
          // Enviar correo de alerta crítica al director
          try {
            const adminEmail = c.env.DIRECTOR_EMAIL ;
            const sessionInfo = await c.env.DB.prepare("SELECT name FROM sessions WHERE id = ?").bind(session_id).first<{ name: string }>();
            const sessionName = sessionInfo ? sessionInfo.name : 'Evento';

            const clockOutUser = await c.env.DB.prepare("SELECT name FROM users WHERE id = ?").bind(targetUserId).first<{ name: string }>();
            const clockOutUserName = clockOutUser ? clockOutUser.name : 'Empleado';
            const supervisorName = user ? user.name : 'N/A';

            const custodyVehicles = await c.env.DB.prepare(
              "SELECT id, plate, brand, color FROM vehicles WHERE session_id = ? AND status = 'parked'"
            ).bind(session_id).all();
            const vehicles = custodyVehicles.results || [];

            const vehicleRows = vehicles.map((v: any) => `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px; font-weight: bold; color: #1e293b;">${(v.plate || 'S/P').toUpperCase()}</td>
                <td style="padding: 12px; color: #475569;">${v.brand || '---'}</td>
                <td style="padding: 12px; color: #475569;">${v.color || '---'}</td>
              </tr>
            `).join('');

            const emailHtml = `
              <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #fecaca; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                <div style="background: #dc2626; color: white; padding: 24px; text-align: center;">
                  <h1 style="margin: 0; font-size: 1.5rem; font-weight: 800; letter-spacing: 1px;">🚨 ALERTA CRÍTICA DE SEGURIDAD</h1>
                  <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 0.9rem;">VEHÍCULOS EN CUSTODIA SIN PERSONAL OPERATIVO</p>
                </div>
                <div style="padding: 24px; background: #ffffff; color: #334155;">
                  <p style="font-size: 1.05rem; line-height: 1.6;">
                    Se ha registrado la <strong>salida (clock-out)</strong> del último empleado activo en el evento, lo que significa que el equipo de valet parking se ha retirado pero <strong>quedaron vehículos en el recinto sin custodia.</strong>
                  </p>
                  
                  <div style="background: #f8fafc; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px; margin: 20px 0;">
                    <h3 style="margin: 0 0 8px 0; color: #0f172a; font-size: 0.95rem;">DETALLES DEL RETIRO:</h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                      <tr>
                        <td style="padding: 4px 0; color: #64748b; font-weight: 600; width: 140px;">Evento:</td>
                        <td style="padding: 4px 0; color: #1e293b; font-weight: bold;">${sessionName.toUpperCase()}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; color: #64748b; font-weight: 600;">Último Empleado:</td>
                        <td style="padding: 4px 0; color: #1e293b;">${clockOutUserName.toUpperCase()}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; color: #64748b; font-weight: 600;">Autorizado Por:</td>
                        <td style="padding: 4px 0; color: #1e293b; font-weight: bold; color: #ef4444;">${supervisorName.toUpperCase()}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; color: #64748b; font-weight: 600;">Fecha y Hora:</td>
                        <td style="padding: 4px 0; color: #1e293b;">${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}</td>
                      </tr>
                    </table>
                  </div>

                  <h3 style="color: #dc2626; border-bottom: 2px solid #fee2e2; padding-bottom: 8px; margin-top: 24px; font-size: 1.1rem; letter-spacing: 0.5px;">🚗 VEHÍCULOS QUE QUEDARON EN EL RECINTO (${vehicles.length}):</h3>
                  <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.9rem; text-align: left;">
                    <thead>
                      <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
                        <th style="padding: 10px; color: #475569; font-weight: 700;">PLACA</th>
                        <th style="padding: 10px; color: #475569; font-weight: 700;">MARCA</th>
                        <th style="padding: 10px; color: #475569; font-weight: 700;">COLOR</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${vehicleRows}
                    </tbody>
                  </table>
                  
                  <div style="margin-top: 30px; text-align: center; font-size: 0.8rem; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                    EYE STAFF • Sistema de Monitoreo de Seguridad Operativa Automático
                  </div>
                </div>
              </div>
            `;

            await sendEmail(c.env, adminEmail, `🚨 [ALERTA OPERATIVA] Vehículos abandonados en recinto - ${sessionName}`, emailHtml);
            await logAudit(c.env, targetUserId, 'ABANDONO_VEHICULOS', `Alerta de abandono enviada por retiro del último personal (${clockOutUserName}) en evento ${sessionName}. Quedaron ${vehicles.length} vehículos sin custodia.`, c);
          } catch (emailErr) {
            console.error('Error sending custody abandonment email:', emailErr);
          }
        }
      }
    }
  }

  await c.env.DB.prepare('INSERT INTO staff_attendance (user_id, session_id, type) VALUES (?, ?, ?)')
    .bind(targetUserId, session_id, type)
    .run();

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
    SELECT p.*, u.name as user_name, COALESCE(s.name, 'EVENTO GENERAL / OPERACIÓN EXTRA') as session_name 
    FROM payroll_submissions p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN sessions s ON p.session_id = s.id
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
      COALESCE(s.name, 'EVENTO GENERAL / OPERACIÓN EXTRA') as session_name,
      p.role_at_event,
      COUNT(p.id) as count,
      SUM(p.amount) as total_amount
    FROM payroll_submissions p
    LEFT JOIN sessions s ON p.session_id = s.id
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
      u.pago_movil,
      COALESCE(s.name, 'EVENTO GENERAL / OPERACIÓN EXTRA') as event_name,
      s.supervisor_id
    FROM payroll_submissions ps
    JOIN users u ON u.id = ps.user_id
    LEFT JOIN sessions s ON s.id = ps.session_id
    ORDER BY ps.created_at DESC
  `).all<any>();
  return c.json({ success: true, submissions: submissions.results || [] });
});

// ADMIN: Obtener todos los eventos cerrados donde trabajaron los empleados pero no han enviado reporte de cobro
app.get('/api/admin/pending-payroll-events', async (c) => {
  const query = `
    SELECT DISTINCT u.id as user_id, u.name as staff_name, s.id as session_id, s.name as event_name, s.ended_at, u.role as role
    FROM staff_attendance sa
    JOIN sessions s ON sa.session_id = s.id
    JOIN users u ON sa.user_id = u.id
    WHERE s.status = 'closed'
    AND NOT EXISTS (
      SELECT 1 FROM payroll_submissions ps 
      WHERE ps.session_id = s.id AND ps.user_id = u.id
    )
    ORDER BY staff_name, s.ended_at DESC
  `;
  const { results } = await c.env.DB.prepare(query).all();
  return c.json({ success: true, events: results || [] });
});

// ADMIN: Actualizar monto o estado de un reporte
app.post('/api/admin/update-payroll-submission', async (c) => {
  const { id, amount, status } = await c.req.json();
  await c.env.DB.prepare('UPDATE payroll_submissions SET amount = ?, status = ? WHERE id = ?')
    .bind(amount, status, id)
    .run();
  return c.json({ success: true });
});

// Cerrar ciclo de pago: marca todos los 'approved' de un empleado como 'paid'
app.post('/api/admin/payroll/close-cycle', async (c) => {
  const { user_id } = await c.req.json();
  if (!user_id) return c.json({ error: 'user_id requerido' }, 400);
  const result = await c.env.DB.prepare(
    "UPDATE payroll_submissions SET status = 'paid', approved_at = CURRENT_TIMESTAMP WHERE user_id = ? AND status = 'approved'"
  ).bind(user_id).run();
  const user = await c.env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(user_id).first<{ name: string }>();
  await logAudit(c.env, user_id, 'CIERRE_CICLO_PAGO', `Ciclo de pago cerrado para ${user?.name || user_id}. ${result.meta?.changes || 0} reportes marcados como PAGADO.`, c);
  return c.json({ success: true, closed: result.meta?.changes || 0 });
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

app.get('/api/admin/online-now', async (c) => {
  const query = `
    SELECT 
      u.id, u.name, u.role, u.last_login, u.current_session_id,
      s.name as session_name,
      ws.ip as last_ip,
      ws.device as last_device,
      MAX(ws.last_activity_at) as max_activity
    FROM users u
    JOIN web_sessions ws ON u.id = ws.user_id
    LEFT JOIN sessions s ON (u.current_session_id = s.id OR instr(',' || u.current_session_id || ',', ',' || CAST(s.id AS TEXT) || ',') > 0)
    WHERE datetime(ws.last_activity_at) >= datetime('now', '-15 minutes')
    GROUP BY u.id
    ORDER BY max_activity DESC
  `;
  const { results } = await c.env.DB.prepare(query).all();
  return c.json({ success: true, users: results || [] });
});

app.get('/api/admin/audit-logs', async (c) => {
  // Consulta mejorada para incluir desconexión y recurrencia de dispositivo
  const query = `
    SELECT 
      a.*, 
      u.name as user_name, 
      u.role as user_role,
      (SELECT logout_at FROM web_sessions ws WHERE ws.user_id = a.user_id AND ws.login_at <= a.timestamp ORDER BY ws.login_at DESC LIMIT 1) as logout_at,
      (SELECT COUNT(*) FROM web_sessions ws2 WHERE ws2.user_id = a.user_id AND ws2.device = a.device) as device_usage_count
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.timestamp DESC LIMIT 30
  `;
  const { results } = await c.env.DB.prepare(query).all();
  return c.json({ logs: results || [] });
});

app.delete('/api/admin/applications/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM job_applications WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

app.get('/api/admin/active-sessions', async (c) => {
  const query = `
    SELECT 
      ws.*, 
      u.name as user_name, 
      u.role as user_role,
      (SELECT COUNT(*) FROM web_sessions ws2 WHERE ws2.user_id = ws.user_id AND ws2.device = ws.device) as total_logins_this_device
    FROM web_sessions ws
    JOIN users u ON ws.user_id = u.id
    WHERE ws.is_active = 1 
      AND datetime(ws.last_activity_at) >= datetime('now', '-30 minutes')
    ORDER BY ws.last_activity_at DESC
  `;
  const { results } = await c.env.DB.prepare(query).all();

  const active = (results || []).map((s: any) => ({
    ...s,
    is_recurrent: s.total_logins_this_device > 3
  }));

  return c.json({ active });
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
  const settings = (result.results || []).reduce((acc: any, curr: any) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {});

  return c.json({
    company_name: 'GRUPO EYE STAFF',
    currency: '€',
    version: '2.3.52',
    theme: 'dark',
    ...settings
  });
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

  if (entity_type === 'staff') {
    const user: any = await c.env.DB.prepare('SELECT id, name, phone FROM users WHERE id = ?').bind(entity_id).first();
    if (user) {
      await c.env.DB.prepare(`
        INSERT INTO staff_live_locations (phone, name, staff_id, lat, lon, accuracy, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-12 minutes'))
        ON CONFLICT(phone) DO UPDATE SET
          lat = excluded.lat,
          lon = excluded.lon,
          accuracy = excluded.accuracy,
          updated_at = datetime('now', '-12 minutes')
      `).bind(user.phone || ('tg_' + user.id), user.name || 'Staff', user.id, lat, lon, accuracy || null).run();
    }
  }

  return c.json({ success: true });
});

app.post('/api/location/live', async (c) => {
  let user = c.get('user');
  if (!user) {
    const authHeader = c.req.header('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.split(' ')[1];
        user = await verify(token, c.env.JWT_SECRET || 'secret', 'HS256');
      } catch (e) { }
    }
  }
  if (!user) return c.json({ error: 'No autorizado' }, 401);

  const { lat, lon, accuracy } = await c.req.json();
  if (!lat || !lon) return c.json({ error: 'Faltan datos' }, 400);

  // Guardar en histórico
  await c.env.DB.prepare('INSERT INTO locations (entity_id, entity_type, latitude, longitude, accuracy) VALUES (?, ?, ?, ?, ?)')
    .bind(user.id, 'staff', lat, lon, accuracy || null).run();

  // Guardar en vivos
  await c.env.DB.prepare(`
    INSERT INTO staff_live_locations (phone, name, staff_id, lat, lon, accuracy, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(phone) DO UPDATE SET
      lat = excluded.lat,
      lon = excluded.lon,
      accuracy = excluded.accuracy,
      updated_at = datetime('now')
  `).bind(user.phone || ('tg_' + user.id), user.name || 'Staff', user.id, lat, lon, accuracy || null).run();

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

// Settings endpoint moved to unified section above

function formatVenezuelanPhone(phone: string): string {
  if (!phone) return '';
  let cleanPhone = phone.replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '58' + cleanPhone.substring(1);
  } else if ((cleanPhone.startsWith('41') || cleanPhone.startsWith('42')) && cleanPhone.length === 10) {
    cleanPhone = '58' + cleanPhone;
  }
  return cleanPhone;
}

app.all('/api/valet/notificar', async (c) => {
  const isPost = c.req.method === 'POST';
  const data = isPost ? await c.req.json().catch(() => ({})) : c.req.query();
  const { nombre, vehiculo, placa, telefono } = data;

  if (!telefono) return c.json({ error: 'Teléfono requerido' }, 400);

  const formattedPhone = formatVenezuelanPhone(telefono);

  const timeString = new Date().toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit', hour12: true });

  const text = `Hola ${nombre || 'Cliente'}, su vehículo ${vehiculo || ''} (Placa: ${placa || ''}) está listo. Notificación enviada a las ${timeString}.`;

  const waUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`;

  return c.json({ url: waUrl });
});

app.all('/api/staff/alerta', async (c) => {
  const isPost = c.req.method === 'POST';
  const data = isPost ? await c.req.json().catch(() => ({})) : c.req.query();
  const { personal_id, mensaje, telefono } = data;

  if (!telefono) return c.json({ error: 'Teléfono requerido' }, 400);

  const formattedPhone = formatVenezuelanPhone(telefono);
  const timeString = new Date().toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit', hour12: true });

  const text = `🚨 *ALERTA EYE STAFF*\n\n${mensaje || 'Alerta generada'}\n\n🕒 ${timeString}`;

  const waUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`;

  return c.json({ url: waUrl });
});

// ===============================
// TELEGRAM BOT INTEGRATION
// ===============================
app.post('/api/telegram/send-direct', async (c) => {
  let user = c.get('user');
  if (!user) {
    const authHeader = c.req.header('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.split(' ')[1];
        user = await verify(token, c.env.JWT_SECRET || 'secret', 'HS256');
      } catch (e) { }
    }
  }
  if (!user || (user.role !== 'director' && user.role !== 'supervisor')) return c.json({ error: 'No autorizado' }, 403);

  const { targetUserId, message } = await c.req.json();
  if (!targetUserId || !message) return c.json({ error: 'Faltan datos' }, 400);

  const target = await c.env.DB.prepare('SELECT telegram_chat_id FROM users WHERE id = ?').bind(targetUserId).first<any>();
  if (!target || !target.telegram_chat_id) {
    return c.json({ error: 'El empleado no tiene Telegram vinculado' }, 400);
  }

  const token = c.env.TELEGRAM_BOT_TOKEN;
  if (!token) return c.json({ error: 'Bot no configurado' }, 500);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: target.telegram_chat_id,
      text: `🔔 *MENSAJE DE ADMINISTRACIÓN*\n\n${message}`,
      parse_mode: 'Markdown'
    })
  });

  const data: any = await res.json();
  if (!data.ok) return c.json({ error: 'Error enviando mensaje por Telegram' }, 500);

  return c.json({ success: true });
});

app.get('/api/telegram/set-webhook', async (c) => {
  const token = c.env.TELEGRAM_BOT_TOKEN;
  if (!token) return c.json({ error: 'Falta TELEGRAM_BOT_TOKEN' }, 500);

  const webhookUrl = `https://eye-staff.app/api/telegram/webhook`;
  const tgUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${webhookUrl}`;
  const res = await fetch(tgUrl);
  const data = await res.json();
  return c.json(data);
});
app.get('/api/telegram/users', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, name, role FROM users').all();
  return c.json({ users: results || [] });
});

app.post('/api/telegram/webhook', async (c) => {
  try {
    const body: any = await c.req.json();
    const token = c.env.TELEGRAM_BOT_TOKEN;
    if (!token) return c.json({ ok: true });

    // Handle Live Location updates
    const msg = body.edited_message || body.message;
    if (msg && msg.location) {
      const chatId = msg.chat.id.toString();
      const lat = msg.location.latitude;
      const lon = msg.location.longitude;
      const isLive = !!msg.location.live_period;

      const user: any = await c.env.DB.prepare('SELECT id, name, phone FROM users WHERE telegram_chat_id = ?').bind(chatId).first();

      if (user) {
        const acc = msg.location.horizontal_accuracy || null;

        // Guardar siempre en el histórico
        await c.env.DB.prepare('INSERT INTO locations (entity_id, entity_type, latitude, longitude, accuracy) VALUES (?, ?, ?, ?, ?)')
          .bind(user.id, 'staff', lat, lon, acc)
          .run();

        if (isLive) {
          // Es ubicación en tiempo real (tiene live_period) -> Actualizar mapa en vivo
          await c.env.DB.prepare(`
            INSERT INTO staff_live_locations (phone, name, staff_id, lat, lon, accuracy, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(phone) DO UPDATE SET
              lat = excluded.lat,
              lon = excluded.lon,
              accuracy = excluded.accuracy,
              updated_at = datetime('now')
          `).bind(user.phone || ('tg_' + user.id), user.name || 'Staff', user.id, lat, lon, acc).run();
        } else if (body.message && !isLive) {
          // Es una ubicación estática (nuevo mensaje sin live_period) -> Añadir al mapa con 12 minutos vencidos para que dure 3 minutos en la ventana de 15 min
          await c.env.DB.prepare(`
            INSERT INTO staff_live_locations (phone, name, staff_id, lat, lon, accuracy, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-12 minutes'))
            ON CONFLICT(phone) DO UPDATE SET
              lat = excluded.lat,
              lon = excluded.lon,
              accuracy = excluded.accuracy,
              updated_at = datetime('now', '-12 minutes')
          `).bind(user.phone || ('tg_' + user.id), user.name || 'Staff', user.id, lat, lon, acc).run();
        } else if (body.edited_message && !isLive) {
          // Dejó de compartir (mensaje editado sin live_period) -> Eliminar inmediatamente
          await c.env.DB.prepare('DELETE FROM staff_live_locations WHERE staff_id = ?').bind(user.id).run();
        }
      }
    } else if (body.edited_message && !body.edited_message.location) {
      // Si Telegram envía una actualización pero eliminó el objeto location (dejó de compartir)
      const chatId = body.edited_message.chat.id.toString();
      const user: any = await c.env.DB.prepare('SELECT id FROM users WHERE telegram_chat_id = ?').bind(chatId).first();
      if (user) {
        await c.env.DB.prepare('DELETE FROM staff_live_locations WHERE staff_id = ?').bind(user.id).run();
      }
    }

    // Handle /start linking
    if (msg && msg.text && msg.text.startsWith('/start')) {
      const chatId = msg.chat.id;
      const parts = msg.text.split(' ');

      if (parts.length > 1 && parts[1].startsWith('link_')) {
        const userId = parseInt(parts[1].split('_')[1], 10);
        const updateRes = await c.env.DB.prepare('UPDATE users SET telegram_chat_id = ? WHERE id = ?').bind(chatId.toString(), userId).run();

        if (updateRes.meta.changes > 0) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: '✅ Cuenta vinculada exitosamente con EYE STAFF. Ya puedes enviar reportes y compartir tu ubicación en tiempo real cuando inicies turno.'
            })
          });
        } else {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: '❌ Error: ID de empleado no válido o no encontrado. Por favor, verifica tu ID en la plataforma y usa el comando correcto (Ej: /start link_15).'
            })
          });
        }
      } else {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: '👋 Bienvenido a Eye Staff. Para vincular tu cuenta, haz clic en el botón "Vincular Telegram" desde tu portal web.'
          })
        });
      }
    } else if (msg && msg.text) {
      // Guardar mensaje de texto
      const chatId = msg.chat.id.toString();
      const senderName = msg.from?.first_name || 'Desconocido';
      const tgMsgId = msg.message_id?.toString() || '';

      await c.env.DB.prepare('INSERT INTO telegram_messages (telegram_message_id, sender_chat_id, sender_name, text, is_incoming) VALUES (?, ?, ?, ?, 1)')
        .bind(tgMsgId, chatId, senderName, msg.text)
        .run();
    }

    return c.json({ ok: true });
  } catch (e) {
    console.error('Telegram Error:', e);
    return c.json({ ok: true });
  }
});

app.get('/api/telegram/messages', async (c) => {
  const lastId = c.req.query('last_id') || 0;
  const res = await c.env.DB.prepare(`
    SELECT t.*, u.role, u.current_session_id 
    FROM telegram_messages t 
    LEFT JOIN users u ON t.sender_chat_id = u.telegram_chat_id 
    WHERE t.id > ? 
    ORDER BY t.id ASC
  `).bind(lastId).all();
  return c.json({ messages: res.results || [] });
});

app.get('/api/telegram/stream', async (c) => {
  const stream = new ReadableStream({
    async start(controller) {
      let lastId = Number(c.req.query('last_id')) || 0;
      let isClosed = false;

      const poll = async () => {
        if (isClosed) return;
        try {
          const res = await c.env.DB.prepare(`
            SELECT t.*, u.role, u.current_session_id 
            FROM telegram_messages t 
            LEFT JOIN users u ON t.sender_chat_id = u.telegram_chat_id 
            WHERE t.id > ? 
            ORDER BY t.id ASC
          `).bind(lastId).all();

          if (res.results && res.results.length > 0) {
            for (const msg of res.results) {
              lastId = msg.id as number;
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(msg)}\n\n`));
            }
          }
        } catch (e) {
          console.error('SSE Poll Error', e);
        }

        if (!isClosed) {
          setTimeout(poll, 3000);
        }
      };

      c.req.raw.signal.addEventListener('abort', () => {
        isClosed = true;
        try { controller.close(); } catch (e) { }
      });

      poll();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});


// ==========================================
// CHAT INTERNAL API
// ==========================================

async function verifyToken(token: string, secret: string): Promise<any> {
  try {
    return await verify(token, secret, 'HS256');
  } catch(e) {
    return null;
  }
}

app.get('/api/chat/users', async (c) => {
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const user = await verifyToken(token, c.env.JWT_SECRET);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const res = await c.env.DB.prepare('SELECT id, name, role FROM users WHERE is_active=1 ORDER BY name ASC').all();
  return c.json({ users: res.results });
});

app.post('/api/chat/groups', async (c) => {
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const user = await verifyToken(token, c.env.JWT_SECRET);
  if (!user || (user.role !== 'admin' && user.role !== 'director')) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json();
  if (!body.name || !body.members || !Array.isArray(body.members)) return c.json({ error: 'Invalid payload' }, 400);

  const groupRes = await c.env.DB.prepare('INSERT INTO chat_groups (name, created_by) VALUES (?, ?) RETURNING id')
    .bind(body.name, user.id)
    .first();

  if (!groupRes || !groupRes.id) return c.json({ error: 'Error creating group' }, 500);

  const groupId = groupRes.id;
  const members = [...new Set([...body.members, user.id])];

  for (const memberId of members) {
    await c.env.DB.prepare('INSERT INTO chat_group_members (group_id, user_id) VALUES (?, ?)')
      .bind(groupId, memberId)
      .run();
  }

  return c.json({ success: true, groupId });
});

app.get('/api/chat/conversations', async (c) => {
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const user = await verifyToken(token, c.env.JWT_SECRET);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  // Get groups where the user is a member
  const groupsRes = await c.env.DB.prepare(`
    SELECT g.id, g.name, 'group' as type
    FROM chat_groups g
    JOIN chat_group_members gm ON g.id = gm.group_id
    WHERE gm.user_id = ?
  `).bind(user.id).all();

  // Active conversations (1-on-1)
  const activeUsersRes = await c.env.DB.prepare(`
    SELECT u.id, u.name, u.eye_id, 'user' as type, MAX(m.created_at) as last_msg_time,
           (SELECT COUNT(*) FROM chat_messages unread WHERE unread.sender_id = u.id AND unread.recipient_id = ? AND unread.is_read = 0) as unread_count,
           CASE WHEN EXISTS (
             SELECT 1 FROM web_sessions ws 
             WHERE ws.user_id = u.id AND ws.is_active = 1 AND ws.last_activity_at > datetime('now', '-5 minutes')
           ) THEN 1 ELSE 0 END as is_online
    FROM users u
    JOIN chat_messages m ON (m.sender_id = u.id AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = u.id)
    WHERE u.is_active=1 AND u.id != ?
    GROUP BY u.id
    ORDER BY last_msg_time DESC
  `).bind(user.id, user.id, user.id, user.id).all();

  // All users for the "New Chat" modal and online status
  const allUsersRes = await c.env.DB.prepare(`
    SELECT u.id, u.name, u.eye_id, 'user' as type,
           (SELECT COUNT(*) FROM web_sessions ws 
            WHERE ws.user_id = u.id AND ws.is_active = 1 AND ws.last_activity_at > datetime('now', '-5 minutes')) as active_sessions,
           CASE WHEN EXISTS (
             SELECT 1 FROM web_sessions ws 
             WHERE ws.user_id = u.id AND ws.is_active = 1 AND ws.last_activity_at > datetime('now', '-5 minutes')
           ) THEN 1 ELSE 0 END as is_online
    FROM users u
    WHERE u.is_active=1
    ORDER BY u.name ASC
  `).all();

  return c.json({
    groups: groupsRes.results || [],
    users: activeUsersRes.results || [],
    allUsers: allUsersRes.results || []
  });
});

app.get('/api/chat/messages', async (c) => {
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const user = await verifyToken(token, c.env.JWT_SECRET);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const recipient_id = c.req.query('user_id');
  const group_id = c.req.query('group_id');
  const session_id = c.req.query('session_id');

  let query = '';
  let params = [];

  if (group_id) {
    const check = await c.env.DB.prepare('SELECT 1 FROM chat_group_members WHERE group_id=? AND user_id=?').bind(group_id, user.id).first();
    if (!check) return c.json({ error: 'Forbidden' }, 403);

    query = `
      SELECT m.*, u.name as sender_name,
             CASE WHEN m.sender_id = ? THEN 0 ELSE 1 END as is_incoming
      FROM chat_messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.group_id = ?
      ORDER BY m.id ASC
    `;
    params = [user.id, group_id];
  } else if (recipient_id) {
    // Mark incoming messages from this user as read
    await c.env.DB.prepare(`
      UPDATE chat_messages 
      SET is_read = 1 
      WHERE sender_id = ? AND recipient_id = ? AND is_read = 0
    `).bind(recipient_id, user.id).run();

    query = `
      SELECT m.*, u.name as sender_name,
             CASE WHEN m.sender_id = ? THEN 0 ELSE 1 END as is_incoming
      FROM chat_messages m
      JOIN users u ON m.sender_id = u.id
      WHERE (m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?)
      ORDER BY m.id ASC
    `;
    params = [user.id, user.id, recipient_id, recipient_id, user.id];
  } else if (session_id) {
    query = `
      SELECT m.*, u.name as sender_name,
             CASE WHEN m.sender_id = ? THEN 0 ELSE 1 END as is_incoming
      FROM chat_messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.session_id = ?
      ORDER BY m.id ASC
    `;
    params = [user.id, session_id];
  } else {
    // Si no manda recipient, traemos todos los mensajes del user
    query = `
      SELECT m.*, u.name as sender_name,
             CASE WHEN m.sender_id = ? THEN 0 ELSE 1 END as is_incoming
      FROM chat_messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.sender_id = ? OR m.recipient_id = ?
      ORDER BY m.id ASC
    `;
    params = [user.id, user.id, user.id];
  }

  const stmt = c.env.DB.prepare(query);
  // Max 5 params
  const res = await (params.length === 2 ? stmt.bind(params[0], params[1]) : 
                     params.length === 3 ? stmt.bind(params[0], params[1], params[2]) :
                     params.length === 5 ? stmt.bind(params[0], params[1], params[2], params[3], params[4]) : stmt).all();

  return c.json({ messages: res.results || [] });
});

app.post('/api/chat/messages', async (c) => {
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const user = await verifyToken(token, c.env.JWT_SECRET);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json();
  if (!body.message && !body.attachment_url) return c.json({ error: 'Message or attachment required' }, 400);

  const recipient_id = body.recipient_id || null;
  const group_id = body.group_id || null;
  const session_id = body.session_id || null;
  const attachment_url = body.attachment_url || null;
  const attachment_type = body.attachment_type || null;

  if (!recipient_id && !group_id && !session_id) {
    return c.json({ error: 'Target required' }, 400);
  }

  try {
    await c.env.DB.prepare(
      'INSERT INTO chat_messages (sender_id, recipient_id, group_id, session_id, message, attachment_url, attachment_type) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(user.id, recipient_id, group_id, session_id, body.message || '', attachment_url, attachment_type).run();
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete('/api/chat/messages', async (c) => {
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const user = await verifyToken(token, c.env.JWT_SECRET);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json();
  const recipient_id = body.recipient_id;

  if (!recipient_id) return c.json({ error: 'recipient_id required' }, 400);

  try {
    await c.env.DB.prepare(
      'DELETE FROM chat_messages WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)'
    ).bind(user.id, recipient_id, recipient_id, user.id).run();
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/chat/upload', async (c) => {
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const user = await verifyToken(token, c.env.JWT_SECRET);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    
    if (!file || !(file instanceof File)) {
      return c.json({ error: 'File is missing or invalid' }, 400);
    }
    
    const ext = file.name.split('.').pop() || 'tmp';
    const key = `chat_${user.id}_${Date.now()}.${ext}`;
    
    await c.env.PHOTOS.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type }
    });
    
    const url = `https://fotos.eye-staff.app/${key}`;
    return c.json({ url });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get('/api/chat/stream', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const user = await verifyToken(token, c.env.JWT_SECRET);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const stream = new ReadableStream({
    async start(controller) {
      let lastId = Number(c.req.query('last_id')) || 0;
      let isClosed = false;

      const poll = async () => {
        if (isClosed) return;
        try {
          const res = await c.env.DB.prepare(`
            SELECT m.*, u.name as sender_name,
                   CASE WHEN m.sender_id = ? THEN 0 ELSE 1 END as is_incoming
            FROM chat_messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.id > ? AND (m.sender_id = ? OR m.recipient_id = ?)
            ORDER BY m.id ASC
          `).bind(user.id, lastId, user.id, user.id).all();

          if (res.results && res.results.length > 0) {
            for (const msg of res.results) {
              lastId = msg.id as number;
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(msg)}\n\n`));
            }
          }
        } catch (e) {
          console.error('SSE Poll Error', e);
        }

        if (!isClosed) {
          setTimeout(poll, 3000);
        }
      };

      c.req.raw.signal.addEventListener('abort', () => {
        isClosed = true;
        try { controller.close(); } catch (e) { }
      });

      poll();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

app.get('/api/public/update-data/:token', async (c) => {
  const token = c.req.param('token');
  const update = await c.env.DB.prepare('SELECT * FROM employee_data_updates WHERE token = ?').bind(token).first<any>();
  
  if (!update) return c.json({ error: 'Token inválido o expirado' }, 404);
  if (update.status !== 'pending_user') return c.json({ error: 'El formulario ya fue enviado o procesado' }, 400);

  const user = await c.env.DB.prepare('SELECT name, cedula, sector, phone, emergency_contact, emergency_phone, is_allergic, bank_name, bank_account, pago_movil, birth_date, address, photo_url FROM users WHERE id = ?').bind(update.user_id).first<any>();
  
  if (!user) return c.json({ error: 'Usuario no encontrado' }, 404);

  return c.json({ success: true, user });
});

app.post('/api/public/update-data/:token', async (c) => {
  try {
    const token = c.req.param('token');
    const body = await c.req.json();

    const update = await c.env.DB.prepare('SELECT id, status FROM employee_data_updates WHERE token = ?').bind(token).first<any>();
    if (!update) return c.json({ error: 'Token inválido' }, 404);
    if (update.status !== 'pending_user') return c.json({ error: 'El formulario ya fue enviado o procesado' }, 400);

    const photo_base64 = body.photo_base64 || null;
    delete body.photo_base64;

    await c.env.DB.prepare(`
      UPDATE employee_data_updates 
      SET proposed_data = ?, photo_base64 = ?, status = 'pending_review'
      WHERE id = ?
    `).bind(JSON.stringify(body), photo_base64, update.id).run();

    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: 'Error procesando la solicitud: ' + e.message }, 500);
  }
});


export function sanitizeWhatsAppNumber(phone: string): string | null {
  if (!phone) return null;
  let cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    cleaned = '58' + cleaned.substring(1);
  } else if (cleaned.length === 10 && (cleaned.startsWith('4') || cleaned.startsWith('2'))) {
    cleaned = '58' + cleaned;
  }
  return cleaned;
}

export async function sendWhatsAppMessage(env: Env, phone: string, message: string): Promise<{ok: boolean, error?: string}> {
  const botUrl = env.WHATSAPP_BOT_URL;
  const botApiKey = env.WHATSAPP_BOT_API_KEY;
  if (!botUrl || !botApiKey) return { ok: false, error: 'Credenciales del bot no configuradas' };

  const cleanedPhone = sanitizeWhatsAppNumber(phone);
  if (!cleanedPhone) return { ok: false, error: 'Número de teléfono inválido' };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const botRes = await fetch(botUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${botApiKey}`,
        'Bypass-Tunnel-Reminder': 'true'
      },
      body: JSON.stringify({
        to: cleanedPhone + '@s.whatsapp.net',
        message: message
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!botRes.ok) {
      const errorText = await botRes.text();
      console.error(`WhatsApp Bot error for ${cleanedPhone}: status=${botRes.status}, body=${errorText}`);
      try {
        const errObj = JSON.parse(errorText);
        return { ok: false, error: errObj.error || 'Error del bot de WhatsApp' };
      } catch (e) {
        return { ok: false, error: 'Error del bot de WhatsApp' };
      }
    }
    return { ok: true };
  } catch (e: any) {
    console.error('Error enviando a WhatsApp Bot:', e);
    if (e.name === 'AbortError') {
      return { ok: false, error: 'El bot de WhatsApp está iniciando (timeout). Intente nuevamente en 1 minuto.' };
    }
    return { ok: false, error: e.message || 'Error de conexión con el bot' };
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    env.DIRECTOR_EMAIL = undefined;
    return app.fetch(request, env, ctx);
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    env.DIRECTOR_EMAIL = undefined;
    ctx.waitUntil(checkScheduledNotifications(env));

    // Ping WhatsApp bot to prevent it from sleeping on Render
    if (env.WHATSAPP_BOT_URL) {
      try {
        const pingUrl = new URL(env.WHATSAPP_BOT_URL).origin + '/ping';
        ctx.waitUntil(fetch(pingUrl).then(res => res.text()).catch(() => {}));
      } catch (e) {}
    }
  },
  async email(message: any, env: Env, ctx: ExecutionContext) {
    env.DIRECTOR_EMAIL = undefined;
    try {
      const parser = new PostalMime();
      const email = await parser.parse(message.raw);

      const bodyText = (email.text || '').toLowerCase();
      const keywords = [
        'empleo', 'solicitud empleo', 'trabajo', 'me pongo a la orden', 'estoy interesado',
        'formar parte del equipo', 'candidatura', 'postulación', 'búsqueda activa',
        'perfil profesional', 'trayectoria', 'aportar', 'potencial', 'expectativa',
        'desafío', 'oportunidad', 'versatilidad', 'inquietud', 'evolución', 'sinergia', 'entusiasmo'
      ];

      const isJobRequest = keywords.some(k => bodyText.includes(k));

      if (!isJobRequest) {
        console.log('Correo recibido pero no catalogado como postulación.');
        return;
      }

      // EXTRAER ADJUNTOS (FOTOS)
      let photoUrl = '';
      if (email.attachments && email.attachments.length > 0) {
        const image = email.attachments.find((a: any) => a.contentType && a.contentType.startsWith('image/'));
        if (image) {
          const key = `job_app_${Date.now()}_${image.filename}`;
          await env.PHOTOS.put(key, image.content, {
            httpMetadata: { contentType: (image as any).contentType }
          });
          photoUrl = key;
        }
      }

      const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        prompt: `Eres un extractor de datos profesional para RRHH. Analiza el correo y devuelve EXCLUSIVAMENTE un JSON con: name, cedula, email, phone, address, birth_date, experience.
        Resume la experiencia en máximo 200 caracteres basándote en lo que el candidato dice que puede APORTAR o su TRAYECTORIA.
        
        CORREO:
        Remitente: ${email.from?.address || ''}
        Asunto: ${email.subject}
        Texto: ${email.text}`
      }) as any;

      const responseText = aiResponse.response || '';
      const rawJson = responseText.match(/\{[\s\S]*\}/)?.[0];

      if (rawJson) {
        const data = JSON.parse(rawJson);
        if (data.name && data.name.trim() !== "") {
          await env.DB.prepare('INSERT INTO job_applications (name, cedula, email, phone, address, birth_date, experience, category, status, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(data.name.toUpperCase(), data.cedula || 'S/D', data.email || email.from?.address || '', data.phone || 'S/D', data.address || '', data.birth_date || '', data.experience || email.text, 'solicitud_empleo', 'pending', photoUrl)
            .run();

          /* DESACTIVADO TEMPORALMENTE - AUTO-RESPUESTA
          if (env.RESEND_API_KEY && data.email) {
            try {
              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  from: 'EYE STAFF <noreply@eye-staff.app>',
                  to: [data.email],
                  subject: 'Confirmación de Postulación — GRUPO EYE STAFF',
                  html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                      <h2 style="color: #6366f1;">¡Hola, ${data.name}!</h2>
                      <p>Hemos recibido tu postulación correctamente y ya forma parte de nuestra base de datos para futuras vacantes.</p>
                      <p>Agradecemos tu interés en formar parte del equipo de <strong>GRUPO EYE STAFF</strong>.</p>
                      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                      <p style="font-size: 0.9rem; color: #666;">
                        ¿Conoces a alguien más que quiera unirse a nosotros? <br>
                        <strong>Postúlate aquí:</strong> <a href="https://eye-staff.app/join" style="color: #6366f1; text-decoration: none; font-weight: bold;">https://eye-staff.app/join</a>
                      </p>
                    </div>
                  `
                })
              });
            } catch (resendError) {
              console.error('Resend Error:', resendError);
            }
          }
          */
        }
      }
    } catch (e) {
      console.error('Email Processing Error:', e);
    }
  }
};

