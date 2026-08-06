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

async function getSubscribedEmails(env: Env, reportId: string, sessionId?: number): Promise<string[]> {
  try {
    let fieldMap: any = {
        'convocatoria': 'convocatoria',
        'cumpleanos': 'cumpleanos',
        'dossier': 'dossier_pdf',
        'excel': 'bbdd_excel',
        'nominas': 'nominas',
        'permisos': 'permisos',
        'plantilla_rrhh': 'plantilla_rrhh',
        'cierre_html': 'cierre_html',
        'backup': 'backup'
    };
    let field = fieldMap[reportId] || reportId;
    const validFields = ['convocatoria', 'cumpleanos', 'nominas', 'permisos', 'plantilla_rrhh', 'actualizacion_datos', 'credenciales', 'cierre_html', 'apertura_evento', 'pre_inicio_evento', 'cierre_diario', 'postulacion_empleo', 'inventarios', 'backup', 'estado_documentacion'];
    if (!validFields.includes(field)) return [];

    let emailSet = new Set<string>();

    const subs = await env.DB.prepare(`
      SELECT u.email FROM user_report_subscriptions rs
      JOIN users u ON rs.user_id = u.id
      WHERE rs.${field} IN (2, 3) AND u.email IS NOT NULL AND u.email != '' AND u.is_active = 1
    `).all();
    if (subs && subs.results) {
      subs.results.forEach((r: any) => emailSet.add(r.email));
    }

    if (sessionId) {
      const settingsRes = await env.DB.prepare("SELECT key, value FROM settings WHERE key IN (?, ?)").bind(`filter_sup_${field}`, `filter_reg_${field}`).all();
      let supEnabled = true;
      let regEnabled = true;
      if (settingsRes && settingsRes.results) {
         settingsRes.results.forEach((s: any) => {
             if (s.key === `filter_sup_${field}`) supEnabled = s.value === '1';
             if (s.key === `filter_reg_${field}`) regEnabled = s.value === '1';
         });
      }

      if (supEnabled || regEnabled) {
          const rolesToInclude = [];
          if (supEnabled) rolesToInclude.push("'supervisor'", "'director'");
          if (regEnabled) rolesToInclude.push("'employee'", "'logistics'");
          if (rolesToInclude.length > 0) {
              const eventStaff = await env.DB.prepare(`
                  SELECT DISTINCT u.email 
                  FROM staff_attendance sa
                  JOIN users u ON sa.user_id = u.id
                  WHERE sa.session_id = ? AND u.email IS NOT NULL AND u.email != '' AND u.is_active = 1
                  AND u.role IN (${rolesToInclude.join(',')})
              `).bind(sessionId).all();
              if (eventStaff && eventStaff.results) {
                  eventStaff.results.forEach((r: any) => emailSet.add(r.email));
              }
          }
      }
    }

    return Array.from(emailSet);
  } catch (e) {
    console.error('Error fetching subscriptions for ' + reportId, e);
  }
  return [];
}

function formatFull24h(date: Date): string {
  const parts = new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date);
  return parts.toUpperCase().replace(',', '');
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
  try { await db.prepare('ALTER TABLE user_report_subscriptions ADD COLUMN pre_inicio_evento INTEGER DEFAULT 0').run(); } catch (e) { }
  try { await db.prepare('ALTER TABLE user_report_subscriptions ADD COLUMN inventarios INTEGER DEFAULT 0').run(); } catch (e) { }
  try { await db.prepare('ALTER TABLE user_report_subscriptions ADD COLUMN formato_pago INTEGER DEFAULT 0').run(); } catch (e) { }
  try { await db.prepare('ALTER TABLE payment_format_events ADD COLUMN monto REAL DEFAULT 0').run(); } catch (e) { }
  try { await db.prepare('ALTER TABLE sessions ADD COLUMN pre_start_notified INTEGER DEFAULT 0').run(); } catch (e) { }

  // Tabla de Inventarios
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT,
      size TEXT,
      serial_number TEXT,
      quantity INTEGER DEFAULT 0,
      location TEXT,
      notes TEXT,
      last_updated_by INTEGER,
      last_updated_by_name TEXT,
      last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      session_id INTEGER,
      quantity_change INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('assignment', 'return', 'manual_adjustment')),
      user_name TEXT,
      notes TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(item_id) REFERENCES inventory_items(id),
      FOREIGN KEY(session_id) REFERENCES sessions(id)
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS inventory_pending_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      session_name TEXT,
      item_id INTEGER,
      item_name TEXT,
      declared_qty INTEGER,
      notes TEXT,
      declared_by INTEGER,
      declared_by_name TEXT,
      declared_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'pending', 
      verified_qty INTEGER,
      verified_by INTEGER,
      verified_by_name TEXT,
      verified_at DATETIME,
      discrepancy_notes TEXT
    )
  `).run();
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

async function getSubscribedPhones(env: Env, reportId: string, sessionId?: number): Promise<string[]> {
  try {
    let fieldMap: any = {
        'convocatoria': 'convocatoria',
        'cumpleanos': 'cumpleanos',
        'dossier': 'dossier_pdf',
        'excel': 'bbdd_excel',
        'nominas': 'nominas',
        'permisos': 'permisos',
        'plantilla_rrhh': 'plantilla_rrhh',
        'cierre_html': 'cierre_html',
        'backup': 'backup'
    };
    let field = fieldMap[reportId] || reportId;
    const validFields = ['convocatoria', 'cumpleanos', 'nominas', 'permisos', 'plantilla_rrhh', 'actualizacion_datos', 'credenciales', 'cierre_html', 'apertura_evento', 'pre_inicio_evento', 'cierre_diario', 'postulacion_empleo', 'inventarios', 'backup', 'estado_documentacion'];
    if (!validFields.includes(field)) return [];

    let phoneSet = new Set<string>();

    const subs = await env.DB.prepare(`
      SELECT u.phone FROM user_report_subscriptions rs
      JOIN users u ON rs.user_id = u.id
      WHERE rs.${field} IN (1, 3) AND u.phone IS NOT NULL AND u.phone != '' AND u.is_active = 1
    `).all();
    if (subs && subs.results) {
        subs.results.forEach((r: any) => phoneSet.add(r.phone));
    }

    if (sessionId) {
      const settingsRes = await env.DB.prepare("SELECT key, value FROM settings WHERE key IN (?, ?)").bind(`filter_sup_${field}`, `filter_reg_${field}`).all();
      let supEnabled = true;
      let regEnabled = true;
      if (settingsRes && settingsRes.results) {
         settingsRes.results.forEach((s: any) => {
             if (s.key === `filter_sup_${field}`) supEnabled = s.value === '1';
             if (s.key === `filter_reg_${field}`) regEnabled = s.value === '1';
         });
      }

      if (supEnabled || regEnabled) {
          const rolesToInclude = [];
          if (supEnabled) rolesToInclude.push("'supervisor'", "'director'");
          if (regEnabled) rolesToInclude.push("'employee'", "'logistics'");
          if (rolesToInclude.length > 0) {
              const eventStaff = await env.DB.prepare(`
                  SELECT DISTINCT u.phone 
                  FROM staff_attendance sa
                  JOIN users u ON sa.user_id = u.id
                  WHERE sa.session_id = ? AND u.phone IS NOT NULL AND u.phone != '' AND u.is_active = 1
                  AND u.role IN (${rolesToInclude.join(',')})
              `).bind(sessionId).all();
              if (eventStaff && eventStaff.results) {
                  eventStaff.results.forEach((r: any) => phoneSet.add(r.phone));
              }
          }
      }
    }

    return Array.from(phoneSet);
  } catch (e) {
    console.error('Error fetching subscribed phones', e);
    return [];
  }
}

async function logAudit(env: Env, userId: number | null, action: string, details: string = '', c?: any) {
  const ip = c ? c.req.header('cf-connecting-ip') || 'unknown' : 'system';
  const device = c ? c.req.header('user-agent') || 'unknown' : 'system';
  try {
    await env.DB.prepare('INSERT INTO audit_logs (user_id, action, details, ip, device) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, action, details, ip, device)
      .run();
  } catch (e) { console.error('Audit Error:', e); }
}

function mapRole(role: string): 'employee' | 'supervisor' | 'director' | 'logistics' {
  const r = role.toLowerCase().trim();
  if (r.includes('logistica') || r === 'logistics') return 'logistics';
  if (r.includes('valet') || r.includes('operador') || r === 'driver' || r === 'employee') return 'employee';
  if (r.includes('supervisor')) return 'supervisor';
  if (r.includes('director') || r.includes('admin') || r.includes('administrativo')) return 'director';
  return 'employee';
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

// --- ACTUALIZACION DE PERFIL (PUBLICO) ---
app.get('/actualizar', async (c) => {
  const res = await c.env.ASSETS.fetch(new Request(new URL('/actualizar.html', c.req.url)));
  const response = new Response(res.body, res);
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  return response;
});

// --- FORMATO DE PAGO PUBLIC ---
app.get('/formato-pago', async (c) => {
  const res = await c.env.ASSETS.fetch(new Request(new URL('/formato-pago.html', c.req.url)));
  const response = new Response(res.body, res);
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  return response;
});

app.post('/api/scan-formato', async (c) => {
  try {
    const { image } = await c.req.json();
    if (!image) return c.json({ success: false, error: 'No image provided' }, 400);

    // Convert base64 to byte array
    const base64Data = image.split(',')[1];
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    const prompt = `Actúa como un procesador de datos experto. Extrae la información de este formato de pago.
TU ÚNICA SALIDA DEBE SER UN JSON VÁLIDO. NO ESCRIBAS NADA MÁS. NI SALUDOS, NI EXPLICACIONES, NI FORMATO MARKDOWN. SOLO LLAVES { }.

{
  "nombre": "string",
  "cedula": "string",
  "telefono_celular": "string",
  "observacion": "string",
  "events": [
    {
      "evento": "string",
      "fecha": "YYYY-MM-DD",
      "fecha_fin": "YYYY-MM-DD",
      "lugar": "string",
      "actividad": "string"
    }
  ]
}

REGLAS ESTRICTAS:
1. Ignora completamente las filas vacías de la tabla.
2. Convierte las fechas a YYYY-MM-DD.
3. Si un campo no existe, usa string vacío "".
4. NO uses texto en negrita ni markdown (**texto**).
5. RESPOND SOLO CON EL JSON VÁLIDO.`;

    let response;
    try {
      response = await c.env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
        prompt,
        image: [...bytes]
      });
    } catch (err: any) {
      if (err.message && err.message.includes('5016')) {
        try {
          await c.env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', { prompt: 'agree' });
        } catch(e) {}
        
        response = await c.env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
          prompt,
          image: [...bytes]
        });
      } else {
        throw err;
      }
    }

    let jsonStr = response.response || '';
    jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // Find the first { and last } to avoid any surrounding text
    const startIdx = jsonStr.indexOf('{');
    const endIdx = jsonStr.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      jsonStr = jsonStr.substring(startIdx, endIdx + 1);
    }
    
    // Fix common JSON syntax errors from LLMs
    jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1'); // Remove trailing commas
    jsonStr = jsonStr.replace(/}\s*{/g, '},{'); // Add missing comma between objects
    jsonStr = jsonStr.replace(/]\s*\[/g, '],['); // Add missing comma between arrays
    
    let data;
    try {
      data = JSON.parse(jsonStr);
    } catch (parseError: any) {
      console.error('Failed to parse AI output:', jsonStr);
      throw new Error('Error de formato de IA. RAW: ' + jsonStr.substring(0, 150));
    }

    return c.json({ success: true, data });
  } catch (e: any) {
    console.error('OCR Error:', e);
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.post('/api/payment-formats', async (c) => {
  try {
    const { fecha, nombre, cedula, telefono_celular, telefono_fijo, observacion, events, enviarCopia, enviarRRHH } = await c.req.json();
    
    // Fetch active period
    const periodRes = await c.env.DB.prepare("SELECT id FROM payroll_periods WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").first<{id: number}>();
    const period_id = periodRes ? periodRes.id : null;

    // Insert into payment_formats
    const formatRes = await c.env.DB.prepare(
      'INSERT INTO payment_formats (fecha, nombre, cedula, telefono_celular, telefono_fijo, observacion, period_id) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id'
    ).bind(fecha, nombre, cedula, telefono_celular, telefono_fijo, observacion, period_id).first<{id: number}>();
    
    if (!formatRes || !formatRes.id) {
      throw new Error('Failed to create payment format record');
    }
    const formatId = formatRes.id;

    // Insert events
    if (events && Array.isArray(events)) {
      for (const ev of events) {
        await c.env.DB.prepare(
          'INSERT INTO payment_format_events (format_id, numero, evento, fecha, fecha_fin, lugar, actividad, monto) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(formatId, ev.numero, ev.evento, ev.fecha, ev.fecha_fin || '', ev.lugar, ev.actividad, ev.monto || 0).run();
      }
    }

    // Fetch user email
    const userRec = await c.env.DB.prepare('SELECT email FROM users WHERE cedula = ? AND email IS NOT NULL AND email != ""').bind(cedula).first<{email: string}>();
    
    // Calculate Correlativo String based on User's requested format: AAMMDD-XXX
    let yy = '';
    let mo = '';
    let day = '';
    if (fecha && fecha.includes('-')) {
        const parts = fecha.split('-');
        if (parts.length >= 3) {
            yy = parts[0].slice(-2);
            mo = parts[1].padStart(2, '0');
            day = parts[2].padStart(2, '0');
        }
    }
    // Fallback if fecha is invalid
    if (!yy) {
        const d = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Caracas"}));
        yy = String(d.getFullYear()).slice(-2);
        mo = String(d.getMonth() + 1).padStart(2, '0');
        day = String(d.getDate()).padStart(2, '0');
    }
    
    // Calculate daily sequence by counting records of the same date having ID <= formatId
    const seqRes = await c.env.DB.prepare('SELECT COUNT(*) as count FROM payment_formats WHERE fecha = ? AND id <= ?').bind(fecha, formatId).first<{count: number}>();
    const seq = seqRes ? seqRes.count : 1;
    
    const correlativoStr = `${yy}${mo}${day}-${String(seq).padStart(3, '0')}`;

    // Generate PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Fetch logo
    let logoImage;
    try {
        const logoRes = await fetch('https://eye-staff.com/wp-content/uploads/2024/02/LOGO-EYE-STAFF-150x150.png');
        const logoBytes = await logoRes.arrayBuffer();
        logoImage = await pdfDoc.embedPng(logoBytes);
    } catch (e) { console.error('Logo error', e); }

    const drawHeader = (p: any) => {
        const { width, height } = p.getSize();
        if (logoImage) {
            p.drawImage(logoImage, { x: 40, y: height - 80, width: 50, height: 50 });
        }
        p.drawText('FORMATO DE COBRO - EYE STAFF', { x: 105, y: height - 48, size: 14, font: bold, color: rgb(0.1, 0.1, 0.1) });
        p.drawText(`CORRELATIVO: ${correlativoStr}`, { x: 105, y: height - 63, size: 9, font: bold, color: rgb(0.4, 0.4, 0.4) });
        p.drawText(`FECHA DE ENVÍO: ${fecha}`, { x: 105, y: height - 75, size: 8, font: font, color: rgb(0.4, 0.4, 0.4) });
    };

    let page = pdfDoc.addPage([595, 842]); // A4
    const { width, height } = page.getSize();
    drawHeader(page);
    
    let y = height - 120;
    
    // Empleado info box
    page.drawRectangle({ x: 40, y: y - 50, width: width - 80, height: 45, color: rgb(0.97, 0.97, 0.97), borderColor: rgb(0.9, 0.9, 0.9), borderWidth: 1 });
    page.drawText(`EMPLEADO: ${nombre.toUpperCase()}`, { x: 50, y: y - 25, size: 10, font: bold, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(`C.I: ${cedula}`, { x: 350, y: y - 25, size: 10, font: font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(`TELÉFONO: ${telefono_celular}`, { x: 50, y: y - 40, size: 10, font: font, color: rgb(0.2, 0.2, 0.2) });
    y -= 80;
    
    // Event headers
    const drawTableHeaders = (p: any, currentY: number) => {
        p.drawRectangle({ x: 40, y: currentY - 15, width: width - 80, height: 20, color: rgb(0.06, 0.72, 0.5) });
        p.drawText('N°', { x: 50, y: currentY - 10, size: 9, font: bold, color: rgb(1,1,1) });
        p.drawText('FECHA', { x: 80, y: currentY - 10, size: 9, font: bold, color: rgb(1,1,1) });
        p.drawText('EVENTO', { x: 150, y: currentY - 10, size: 9, font: bold, color: rgb(1,1,1) });
        p.drawText('LUGAR', { x: 300, y: currentY - 10, size: 9, font: bold, color: rgb(1,1,1) });
        p.drawText('ACTIVIDAD', { x: 450, y: currentY - 10, size: 9, font: bold, color: rgb(1,1,1) });
    };

    drawTableHeaders(page, y);
    y -= 35;
    
    if (events && Array.isArray(events)) {
        for (const ev of events) {
            if (y < 50) {
                page = pdfDoc.addPage([595, 842]);
                drawHeader(page);
                y = height - 120;
                drawTableHeaders(page, y);
                y -= 35;
            }
            page.drawText(String(ev.numero), { x: 50, y, size: 8, font, color: rgb(0.2, 0.2, 0.2) });
            page.drawText(String(ev.fecha).substring(0,10), { x: 80, y, size: 8, font, color: rgb(0.2, 0.2, 0.2) });
            page.drawText(String(ev.evento).substring(0,25).toUpperCase(), { x: 150, y, size: 8, font, color: rgb(0.2, 0.2, 0.2) });
            page.drawText(String(ev.lugar).substring(0,25).toUpperCase(), { x: 300, y, size: 8, font, color: rgb(0.2, 0.2, 0.2) });
            page.drawText(String(ev.actividad).substring(0,20).toUpperCase(), { x: 450, y, size: 8, font, color: rgb(0.2, 0.2, 0.2) });
            
            // Add a subtle line
            page.drawLine({ start: { x: 40, y: y - 8 }, end: { x: width - 40, y: y - 8 }, color: rgb(0.9, 0.9, 0.9), thickness: 1 });
            y -= 25;
        }
    }
    
    if (observacion) {
        y -= 20;
        if (y < 100) {
            page = pdfDoc.addPage([595, 842]);
            drawHeader(page);
            y = height - 120;
        }
        page.drawText('OBSERVACIÓN:', { x: 40, y, size: 9, font: bold, color: rgb(0.2, 0.2, 0.2) });
        y -= 15;
        const obsLines = observacion.toUpperCase().match(/.{1,100}/g) || [];
        for (const line of obsLines) {
            if (y < 50) {
                page = pdfDoc.addPage([595, 842]);
                drawHeader(page);
                y = height - 120;
            }
            page.drawText(line, { x: 40, y, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
            y -= 15;
        }
    }
    
    const pdfBytes = await pdfDoc.save();

    // Guardar PDF en R2
    const safeName = nombre.replace(/[^a-zA-Z0-9]/g, '_');
    const dateStr = new Date().toISOString().split('T')[0];
    const pdfKey = `formatos-pago/${dateStr}/${safeName}_ID${formatId}.pdf`;
    await c.env.PHOTOS.put(pdfKey, pdfBytes, { httpMetadata: { contentType: 'application/pdf' } });
    
    // Actualizar Base de Datos con la Key
    await c.env.DB.prepare('UPDATE payment_formats SET pdf_r2_key = ? WHERE id = ?').bind(pdfKey, formatId).run();

    if (enviarCopia || enviarRRHH) {
        const pdfBase64 = uint8ArrayToBase64(pdfBytes);
        const htmlBody = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                <h2 style="color: #10b981; text-transform: uppercase;">NUEVO FORMATO DE COBRO ENVIADO</h2>
                <p>El empleado <strong>${nombre.toUpperCase()}</strong> (C.I: ${cedula}) ha enviado su relación de eventos.</p>
                <p>Correlativo: <strong>${correlativoStr}</strong></p>
                <p>Fecha de envío: <strong>${fecha}</strong></p>
                
                <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; text-transform: uppercase;">
                    <thead>
                        <tr style="background-color: #f3f4f6; color: #374151;">
                            <th style="padding: 10px; border: 1px solid #e5e7eb; text-align: center;">N°</th>
                            <th style="padding: 10px; border: 1px solid #e5e7eb; text-align: left;">FECHA</th>
                            <th style="padding: 10px; border: 1px solid #e5e7eb; text-align: left;">EVENTO</th>
                            <th style="padding: 10px; border: 1px solid #e5e7eb; text-align: left;">LUGAR</th>
                            <th style="padding: 10px; border: 1px solid #e5e7eb; text-align: left;">ACTIVIDAD</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(events || []).map((ev: any) => `
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">${ev.numero}</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">${String(ev.fecha).substring(0,10)}</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">${String(ev.evento)}</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">${String(ev.lugar)}</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">${String(ev.actividad)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${observacion ? `<p style="margin-top:20px; font-size:12px; color:#555;"><strong>OBSERVACIÓN:</strong> ${observacion.toUpperCase()}</p>` : ''}
                <p style="margin-top: 20px;">Se adjunta el formato detallado en PDF.</p>
            </div>
        `;
        
        let toEmails: string[] = [];
        if (enviarCopia && userRec && userRec.email) {
            toEmails.push(userRec.email);
        }

        let ccEmails: string[] = [];
        if (enviarRRHH) {
            const adminUsers = await c.env.DB.prepare("SELECT email FROM users WHERE name IN ('RRHH', 'ADMIN') AND email IS NOT NULL AND email != ''").all();
            if (adminUsers && adminUsers.results) {
                adminUsers.results.forEach((r: any) => ccEmails.push(r.email));
            }
        }

        await sendEmail(
            c.env, 
            toEmails.length > 0 ? toEmails : undefined, 
            `Formato de Cobro ${correlativoStr} - EYE STAFF`, 
            htmlBody, 
            [{ filename: `Formato_${correlativoStr}.pdf`, content: pdfBase64, content_type: 'application/pdf' }], 
            ccEmails, 
            'formato_pago'
        );
    }

    return c.json({ success: true, correlativo: correlativoStr });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.get('/api/admin/payment-formats', async (c) => {
  try {
    const formatsRes = await c.env.DB.prepare('SELECT * FROM payment_formats ORDER BY id DESC').all();
    const formats = formatsRes.results || [];
    
    for (let f of formats) {
      const eventsRes = await c.env.DB.prepare('SELECT * FROM payment_format_events WHERE format_id = ? ORDER BY numero ASC').bind(f.id).all();
      f.events = eventsRes.results || [];
    }
    
    // Also fetch payroll periods
    const periodsRes = await c.env.DB.prepare('SELECT * FROM payroll_periods ORDER BY id DESC').all();
    const periods = periodsRes.results || [];
    
    return c.json({ success: true, data: formats, periods: periods });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.put('/api/admin/payment-formats/:id/process', async (c) => {
  try {
    const id = c.req.param('id');
    const { procesado } = await c.req.json();
    await c.env.DB.prepare('UPDATE payment_formats SET procesado = ? WHERE id = ?').bind(procesado ? 1 : 0, id).run();
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.put('/api/admin/payment-formats/:id/status', async (c) => {
  try {
    const id = c.req.param('id');
    const { status } = await c.req.json();
    await c.env.DB.prepare('UPDATE payment_formats SET status = ? WHERE id = ?').bind(status, id).run();
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.post('/api/admin/payroll-periods', async (c) => {
  try {
    const userPayload = c.get('user');
    const { name, cutoff_date } = await c.req.json();
    
    // Close any previous OPEN periods
    await c.env.DB.prepare("UPDATE payroll_periods SET status = 'REVIEWING' WHERE status = 'OPEN'").run();
    
    // Insert new period
    await c.env.DB.prepare('INSERT INTO payroll_periods (name, cutoff_date, created_by) VALUES (?, ?, ?)')
      .bind(name, cutoff_date, userPayload?.name || 'Admin').run();
      
    // Optionally update any PENDING payment formats that missed the previous cutoff, to belong to this new period?
    // Usually, they just get attached as they come in.
    // Wait, any formats without period_id can be assigned to the new open period:
    const newPeriodIdRes = await c.env.DB.prepare("SELECT id FROM payroll_periods WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").first<{id: number}>();
    if(newPeriodIdRes) {
       await c.env.DB.prepare('UPDATE payment_formats SET period_id = ? WHERE period_id IS NULL').bind(newPeriodIdRes.id).run();
    }
      
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.put('/api/admin/payroll-periods/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { name, cutoff_date } = await c.req.json();
    await c.env.DB.prepare('UPDATE payroll_periods SET name = ?, cutoff_date = ? WHERE id = ?').bind(name, cutoff_date, id).run();
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.put('/api/admin/payroll-periods/:id/status', async (c) => {
  try {
    const id = c.req.param('id');
    const { status } = await c.req.json();
    await c.env.DB.prepare('UPDATE payroll_periods SET status = ? WHERE id = ?').bind(status, id).run();
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.put('/api/admin/payroll-periods/:id/pay', async (c) => {
  try {
    const id = c.req.param('id');
    // Update period status
    await c.env.DB.prepare("UPDATE payroll_periods SET status = 'PAID' WHERE id = ?").bind(id).run();
    // Update formats status
    await c.env.DB.prepare("UPDATE payment_formats SET status = 'PAID' WHERE period_id = ? AND status != 'REJECTED'").bind(id).run();
    
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.put('/api/admin/payment-formats/:id/unlink-period', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('UPDATE payment_formats SET period_id = NULL WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});
app.put('/api/admin/payment-formats/events/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { monto } = await c.req.json();
    await c.env.DB.prepare('UPDATE payment_format_events SET monto = ? WHERE id = ?').bind(monto || 0, id).run();
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.delete('/api/admin/payment-formats/events/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM payment_format_events WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.delete('/api/admin/payment-formats/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM payment_format_events WHERE format_id = ?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM payment_formats WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.get('/api/admin/test-weekend', async (c) => {
    const sessionsRes = await c.env.DB.prepare("SELECT * FROM sessions WHERE DATE(started_at) >= '2026-06-19' AND DATE(started_at) <= '2026-06-21'").all();
    const sessions = sessionsRes.results || [];
    let html = `<div style="font-family: Arial, sans-serif;"><h1>Reporte de Prueba (19 al 21 Jun)</h1><table border="1" cellpadding="5" cellspacing="0" style="width: 100%; border-collapse: collapse;"><tr><th style="background:#f1f5f9; padding:8px; text-align:left;">Evento</th><th style="background:#f1f5f9; padding:8px;">Tipo</th><th style="background:#f1f5f9; padding:8px;">Inicio</th></tr>`;
    for (const s of sessions as any[]) {
       html += `<tr><td style="padding:8px;">${s.name}</td><td style="padding:8px;">${s.type}</td><td style="padding:8px;">${s.started_at}</td></tr>`;
    }
    html += `</table></div>`;
    // await sendEmail(c.env, 'eyestaff.ncarrillo@gmail.com', 'Reporte Prueba Fin de Semana', html);
    return c.json({ success: true, count: sessions.length, note: 'Envío omitido' });
});



app.post('/api/admin/payment-formats/send', async (c) => {
  try {
    const { excelBase64, pdfBase64 } = await c.req.json();
    if (!excelBase64 || !pdfBase64) {
      return c.json({ error: 'Faltan parámetros' }, 400);
    }

    const excelFilename = `reports/Matriz_Formatos_${Date.now()}.xlsx`;
    const pdfFilename = `reports/Matriz_Formatos_${Date.now()}.pdf`;

    const excelBytes = Uint8Array.from(atob(excelBase64), char => char.charCodeAt(0));
    const pdfBytes = Uint8Array.from(atob(pdfBase64), char => char.charCodeAt(0));

    await c.env.PHOTOS.put(excelFilename, excelBytes.buffer, { httpMetadata: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
    await c.env.PHOTOS.put(pdfFilename, pdfBytes.buffer, { httpMetadata: { contentType: 'application/pdf' } });

    const excelUrl = `https://eye-staff.app/files/${excelFilename}`;
    const pdfUrl = `https://eye-staff.app/files/${pdfFilename}`;

    const staffList = await c.env.DB.prepare('SELECT * FROM staff WHERE UPPER(name) IN (\'ADMINISTRACION\', \'ADMINISTRACIÓN\', \'ORO 5\')').all();
    if (!staffList.results || staffList.results.length === 0) {
      return c.json({ error: 'No se encontraron los usuarios Administración u Oro 5' }, 404);
    }

    for (const emp of staffList.results) {
      if (emp.email) {
        const html = `<h2>Matriz de Formatos de Pago</h2><p>Hola ${emp.name},</p><p>Se ha generado la matriz de formatos de pago (Transición).</p><p>Puedes descargar los archivos adjuntos o verlos en los siguientes enlaces:</p><ul><li><a href="${excelUrl}">Descargar Excel</a></li><li><a href="${pdfUrl}">Ver PDF</a></li></ul>`;
        const attachments = [
          { content: excelBase64, filename: 'Matriz_Formatos.xlsx' },
          { content: pdfBase64, filename: 'Matriz_Formatos.pdf' }
        ];
        await sendEmail(c.env, emp.email as string, 'Matriz de Formatos de Pago', html, attachments, undefined, undefined, 'EYE STAFF');
      }
    }

    return c.json({ success: true });
  } catch(e: any) {
    console.error('Error enviando matriz', e);
    return c.json({ error: e.message }, 500);
  }
});


app.get('/api/admin/report-schedules/:reportId', async (c) => {
  try {
    const reportId = c.req.param('reportId');
    const schedule = await c.env.DB.prepare('SELECT * FROM report_schedules WHERE report_id = ?').bind(reportId).first();
    return c.json({ schedule });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/admin/report-schedules', async (c) => {
  try {
    const { report_id, frequency, day_of_week, day_of_month, send_time, is_active } = await c.req.json();
    await c.env.DB.prepare(`
      INSERT INTO report_schedules (report_id, frequency, day_of_week, day_of_month, send_time, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(report_id) DO UPDATE SET
        frequency=excluded.frequency,
        day_of_week=excluded.day_of_week,
        day_of_month=excluded.day_of_month,
        send_time=excluded.send_time,
        is_active=excluded.is_active,
        updated_at=CURRENT_TIMESTAMP
    `).bind(report_id, frequency, day_of_week, day_of_month, send_time, is_active).run();
    return c.json({ success: true });
  } catch(e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/admin/reports/send', async (c) => {
  try {
    const { recipients, channel, globalBase64, detailedBase64 } = await c.req.json();
    if (!recipients || !channel || !globalBase64 || !detailedBase64) {
      return c.json({ error: 'Faltan parámetros' }, 400);
    }
    
    const globalFilename = `reports/Global_Consolidado_${Date.now()}.xlsx`;
    const detailedFilename = `reports/Detallado_Consolidado_${Date.now()}.xlsx`;
    
    const globalBytes = Uint8Array.from(atob(globalBase64), char => char.charCodeAt(0));
    const detailedBytes = Uint8Array.from(atob(detailedBase64), char => char.charCodeAt(0));
    
    await c.env.PHOTOS.put(globalFilename, globalBytes.buffer, { httpMetadata: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
    await c.env.PHOTOS.put(detailedFilename, detailedBytes.buffer, { httpMetadata: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
    
    const globalUrl = `https://eye-staff.app/files/${globalFilename}`;
    const detailedUrl = `https://eye-staff.app/files/${detailedFilename}`;
    
    const sendEmailFlag = channel === 'email' || channel === 'ambos';
    const sendWaFlag = channel === 'whatsapp' || channel === 'ambos';
    
    const staffIds = Array.isArray(recipients) ? recipients : [recipients];
    
    for (const id of staffIds) {
      const emp = await c.env.DB.prepare('SELECT * FROM staff WHERE id = ?').bind(id).first();
      if (!emp) continue;
      
      if (sendWaFlag && emp.phone) {
        const waMsg = `*REPORTES DE PAGOS*\n\nHola ${emp.name}, se han generado los reportes de pagos consolidados.\n\n📊 *Reporte Global:*\n${globalUrl}\n\n📑 *Reporte Detallado:*\n${detailedUrl}`;
        await sendWhatsAppMessage(c.env, emp.phone as string, waMsg);
      }
      
      if (sendEmailFlag && emp.email) {
        const html = `<h2>Reportes de Pagos Consolidados</h2><p>Hola ${emp.name},</p><p>Adjunto a este correo encontrarás los reportes Global y Detallado de pagos consolidados.</p><p><a href="${globalUrl}">Descargar Global</a> | <a href="${detailedUrl}">Descargar Detallado</a></p>`;
        const attachments = [
          { content: globalBase64, filename: 'Reporte_Global.xlsx' },
          { content: detailedBase64, filename: 'Reporte_Detallado.xlsx' }
        ];
        await sendEmail(c.env, emp.email as string, 'Reportes Consolidados de Pagos', html, attachments, undefined, undefined, 'EYE STAFF');
      }
    }
    
    return c.json({ success: true });
  } catch(e: any) {
    console.error('Error enviando reportes', e);
    return c.json({ error: e.message }, 500);
  }
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

    // Always fetch guardia_details for equipment, meals, and transport which apply to many event types
    const gRes = await c.env.DB.prepare('SELECT * FROM guardia_details WHERE session_id = ?').bind(s.id).first();
    s.guardia_details = gRes || null;

    // Staff details
    const staffRes = await c.env.DB.prepare("SELECT u.id, u.name, u.role, u.cedula, sr.event_function FROM users u LEFT JOIN session_staff_roles sr ON u.id = sr.user_id AND sr.session_id = ? WHERE u.current_session_id = ? OR instr(',' || u.current_session_id || ',', ',' || CAST(? AS TEXT) || ',') > 0").bind(s.id, String(s.id), String(s.id)).all();
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
    WITH CombinedB2B AS (
        SELECT 
            UPPER(TRIM(name)) as owner_name, 
            phone as owner_phone, 
            '' as owner_id_ref,
            1 as total_visits,
            'PRESUPUESTO|' || created_at || '|N/A' as visit_history,
            event_type as event_type
        FROM valet_clients

        UNION ALL

        SELECT 
            UPPER(TRIM(COALESCE(client, contact_name))) as owner_name, 
            phone as owner_phone, 
            '' as owner_id_ref,
            1 as total_visits,
            name || '|' || started_at || '|N/A' as visit_history,
            type as event_type
        FROM sessions
        WHERE (client IS NOT NULL AND client != '') OR (contact_name IS NOT NULL AND contact_name != '')
    )
    SELECT 
        owner_name, 
        GROUP_CONCAT(DISTINCT owner_phone) as owner_phone, 
        MAX(owner_id_ref) as owner_id_ref, 
        SUM(total_visits) as total_visits,
        GROUP_CONCAT(visit_history, '::') as visit_history,
        GROUP_CONCAT(DISTINCT event_type) as event_types
    FROM CombinedB2B
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

app.get('/api/admin/guests', async (c) => {
  const query = `
    WITH CombinedGuests AS (
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
        UPPER(TRIM(ac.name)) as owner_name,
        ac.phone as owner_phone,
        '' as owner_id_ref,
        COUNT(ac.id) as total_visits,
        GROUP_CONCAT(s.name || '|' || ac.created_at || '|N/A', '::') as visit_history,
        'CONTROL DE ACCESOS' as event_type
      FROM access_control_guests ac
      JOIN sessions s ON ac.session_id = s.id
      WHERE ac.name IS NOT NULL AND ac.name != '' AND ac.status = 'approved'
      GROUP BY UPPER(TRIM(ac.name)), ac.phone
    )
    SELECT 
        owner_name, 
        GROUP_CONCAT(DISTINCT owner_phone) as owner_phone, 
        MAX(owner_id_ref) as owner_id_ref, 
        SUM(total_visits) as total_visits,
        GROUP_CONCAT(visit_history, '::') as visit_history,
        GROUP_CONCAT(DISTINCT event_type) as event_types
    FROM CombinedGuests
    GROUP BY owner_name
    ORDER BY owner_name ASC
  `;
  const result = await c.env.DB.prepare(query).all();
  const guests = (result.results || []).map((cl: any) => ({
    ...cl,
    event_types: cl.event_types || 'N/A',
    history: ((cl.visit_history as string) || '').split('::').filter((h: string) => h.includes('|')).map((h: string) => {
      const [event, date, plate] = h.split('|');
      return { event: event || 'S/E', date, plate };
    })
  }));
  return c.json({ clients: guests }); // Use 'clients' in json to avoid breaking frontend immediately, though I will update frontend to use 'guests' variable.
});

app.post('/api/admin/clients/delete', async (c) => {
  try {
    const { owner_name } = await c.req.json();
    if (!owner_name) {
      return c.json({ success: false, error: 'Owner name is required' }, 400);
    }
    
    // Delete from vehicles
    await c.env.DB.prepare('DELETE FROM vehicles WHERE UPPER(TRIM(owner_name)) = UPPER(TRIM(?))').bind(owner_name).run();
    // Delete from valet_clients
    await c.env.DB.prepare('DELETE FROM valet_clients WHERE UPPER(TRIM(name)) = UPPER(TRIM(?))').bind(owner_name).run();
    // Clear from sessions (so dynamically derived B2B clients also disappear)
    await c.env.DB.prepare('UPDATE sessions SET client = NULL, contact_name = NULL WHERE UPPER(TRIM(COALESCE(client, contact_name))) = UPPER(TRIM(?))').bind(owner_name).run();
    
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
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
        // Usa BREVO usando variables de entorno
        if (c.env.BREVO_API_KEY) {
          await sendEmail(c.env, mailPayload.to, mailPayload.subject, mailPayload.html, undefined, undefined, undefined, 'EYE STAFF');
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
        AND (UPPER(json_extract(form_data, '$.tipoEvento')) = 'ALQUILER DE EQUIPOS' OR UPPER(evento) LIKE '%ALQUILER%')
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
    let allRentals = rentalsResult.results || [];

    const sessionsQuery = `
      SELECT * FROM sessions 
      WHERE LOWER(type) = 'alquiler de equipos' 
        AND status != 'closed' 
        AND status != 'completed'
        AND budget_id IS NULL
    `;
    const sessionsResult = await c.env.DB.prepare(sessionsQuery).all();
    const sessions = sessionsResult.results || [];
    
    const sessionRentals = sessions.map((s: any) => ({
      budget_id: 'session-' + s.id,
      status: s.status === 'planning' ? 'planning' : s.status, 
      evento: s.name,
      empresa: s.client || 'PARTICULAR',
      fecha: s.started_at,
      form_data: JSON.stringify({
        atencion: s.contact_name || 'N/A',
        inicio: s.event_start_time || '',
        direccion: s.address || 'N/A',
        lugar: s.address || 'N/A',
        ciudad: ''
      })
    }));

    allRentals = [...allRentals, ...sessionRentals];

    return c.json({ success: true, rentals: allRentals });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.post('/api/rentals/:budget_id/status', async (c) => {
  try {
    const budgetId = c.req.param('budget_id');
    const body = await c.req.json();
    const { status, notes, type, signature, photos, receiver_name, receiver_id, verified_items } = body;

    if (budgetId.startsWith('session-')) {
      const sessionId = budgetId.replace('session-', '');
      await c.env.DB.prepare('UPDATE sessions SET status = ? WHERE id = ?').bind(status, sessionId).run();
      return c.json({ success: true });
    }

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
    
    if (budgetId.startsWith('session-')) {
      return c.json({ success: false, error: "Los soportes fotográficos no están disponibles para alquileres creados como sesión. Deben ser creados a través de un presupuesto." });
    }

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

app.delete('/api/rentals/:budget_id', async (c) => {
  try {
    const budgetId = c.req.param('budget_id');
    if (budgetId.startsWith('session-')) {
      const sessionId = budgetId.replace('session-', '');
      await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
      return c.json({ success: true });
    }
    await c.env.DB.prepare('DELETE FROM rentals WHERE budget_id = ?').bind(budgetId).run();
    await c.env.DB.prepare('UPDATE budgets SET estatus = "CANCELADO" WHERE id = ?').bind(budgetId).run();
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.get('/api/sessions/concluded', async (c) => {
  const result = await c.env.DB.prepare('SELECT * FROM sessions WHERE status IN ("closed", "completed") ORDER BY id DESC').all();
  const sessions = result.results || [];

  for (let s of sessions) {
    const staffRes = await c.env.DB.prepare(`
      SELECT DISTINCT u.id, u.name, u.role, u.cedula 
      FROM users u 
      JOIN staff_attendance a ON u.id = a.user_id 
      WHERE a.session_id = ?
    `).bind(s.id).all();
    const staff = staffRes.results || [];
    s.assigned_staff_list = staff;
    s.assigned_staff = staff.map((u: any) => u.name).join(', ');

    const gRes = await c.env.DB.prepare('SELECT * FROM guardia_details WHERE session_id = ?').bind(s.id).first();
    s.guardia_details = gRes || null;
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
    SELECT DISTINCT s.id, s.name, s.started_at, s.status, u.role
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

  // REGLA: Verificar si el empleado ya está asignado a otra sesión activa CON SOLAPAMIENTO DE FECHAS
  const user = await c.env.DB.prepare('SELECT current_session_id, name FROM users WHERE id = ?').bind(user_id).first<{ current_session_id: string | null, name: string }>();

  // Obtener fechas de la sesión destino
  const targetSession = await c.env.DB.prepare('SELECT started_at, event_end_date FROM sessions WHERE id = ?').bind(sessionId).first<{ started_at: string | null, event_end_date: string | null }>();
  const newStart = targetSession?.started_at ? targetSession.started_at.split('T')[0] : null;
  const newEnd = targetSession?.event_end_date ? targetSession.event_end_date.split('T')[0] : newStart;

  if (user && user.current_session_id) {
    const assignedIds = user.current_session_id.toString().split(',').map(x => x.trim()).filter(Boolean);
    for (const otherId of assignedIds) {
      if (otherId !== sessionId.toString()) {
        const otherSession = await c.env.DB.prepare('SELECT name, started_at, event_end_date FROM sessions WHERE id = ? AND status = "active"').bind(otherId).first<{ name: string, started_at: string | null, event_end_date: string | null }>();
        if (otherSession) {
          const actStart = otherSession.started_at ? otherSession.started_at.split('T')[0] : null;
          const actEnd = otherSession.event_end_date ? otherSession.event_end_date.split('T')[0] : actStart;
          
          // Si no hay fechas, permitir (no se puede determinar solapamiento)
          if (!newStart || !actStart) continue;
          
          const overlaps = newStart <= (actEnd || actStart) && (newEnd || newStart) >= actStart;
          if (overlaps) {
            return c.json({ error: `EL EMPLEADO ${user.name} YA ESTÁ ASIGNADO AL EVENTO "${otherSession.name}" EN LA MISMA FECHA` }, 400);
          }
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
  const { name, type, supervisor_id, staff_ids, staff_roles, started_at, phone, address, contact_name, email, observations, correlativo, convocation_time, event_start_time, event_end_time, event_end_date, budget_id, is_executed } = await c.req.json();
  const nowVE = new Date(new Date().getTime() - (4 * 60 * 60 * 1000));
  const targetDate = started_at ? new Date(started_at) : nowVE;
  const yy = targetDate.getFullYear().toString().slice(-2);
  const mm = (targetDate.getMonth() + 1).toString().padStart(2, '0');
  const dd = targetDate.getDate().toString().padStart(2, '0');
  
  const prefix = `${yy}${mm}${dd}`;
  const rows = await c.env.DB.prepare("SELECT name FROM sessions WHERE name LIKE ?").bind(`${prefix}_%`).all<{ name: string }>();
  let maxN = 0;
  if (rows && rows.results) {
    for (const row of rows.results) {
      const match = row.name.match(new RegExp(`^${prefix}_(\\d+)`));
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxN) maxN = num;
      }
    }
  }
  const nn = maxN + 1;
  const finalPrefix = `${prefix}_${nn} `;

  const dateStr = nowVE.toISOString().split('T')[0].replace(/-/g, '');
  const rawName = name || `EVENTO_${dateStr}`;
  const sessionName = rawName.startsWith(prefix) ? rawName : `${finalPrefix}${rawName}`;
  
  const sessionType = type || 'valet';
  const internalKey = correlativo ? `${sessionName} ${correlativo}` : sessionName;

  // Verificar exclusividad antes de planificar — SOLO bloquear si hay solapamiento de fechas
  const allIds = [...new Set([supervisor_id, ...(staff_ids || [])])].filter(Boolean);
  if (allIds.length > 0 && !is_executed) {
    // Determinar rango de fechas del nuevo evento
    const newStart = started_at ? started_at.split('T')[0] : null;
    const newEnd = event_end_date ? event_end_date.split('T')[0] : newStart;

    const busyUsers: string[] = [];
    for (const userId of allIds) {
      const userObj = await c.env.DB.prepare('SELECT name, current_session_id FROM users WHERE id = ?').bind(userId).first<{ name: string, current_session_id: string | null }>();
      if (userObj?.current_session_id) {
        const assignedIds = userObj.current_session_id.toString().split(',').map(x => x.trim()).filter(Boolean);
        for (const sId of assignedIds) {
          const actSession = await c.env.DB.prepare('SELECT name, started_at, event_end_date, status FROM sessions WHERE id = ? AND status = "active"').bind(sId).first<{ name: string, started_at: string | null, event_end_date: string | null, status: string }>();
          if (actSession) {
            // Comparar solapamiento de fechas
            const actStart = actSession.started_at ? actSession.started_at.split('T')[0] : null;
            const actEnd = actSession.event_end_date ? actSession.event_end_date.split('T')[0] : actStart;
            
            // Si no hay fechas definidas en alguno de los dos, no se puede determinar solapamiento → permitir
            if (!newStart || !actStart) continue;
            
            // Hay solapamiento si: newStart <= actEnd AND newEnd >= actStart
            const overlaps = newStart <= (actEnd || actStart) && (newEnd || newStart) >= actStart;
            if (overlaps) {
              busyUsers.push(`${userObj.name} (conflicto con "${actSession.name}")`);
              break;
            }
          }
        }
      }
    }
    if (busyUsers.length > 0) {
      return c.json({ error: `⚠️ ERROR: ${busyUsers.join(', ')} — solapamiento de horario con evento activo.` }, 400);
    }
  }

  const finalStatus = is_executed ? 'completed' : 'planning';
  const result = await c.env.DB.prepare(`
    INSERT INTO sessions (name, internal_key, type, status, supervisor_id, started_at, phone, address, contact_name, email, observations, convocation_time, event_start_time, event_end_time, event_end_date, budget_id) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(sessionName, internalKey, sessionType, finalStatus, supervisor_id || null, started_at || null, phone || null, address || null, contact_name || null, email || null, observations || null, convocation_time || null, event_start_time || null, event_end_time || null, event_end_date || null, budget_id || null)
    .run();

  const sessionId = result.meta.last_row_id;

  // Asignar personal
  if (allIds.length > 0) {
    for (const userId of allIds) {
      if (!is_executed) {
        const userObj = await c.env.DB.prepare('SELECT current_session_id FROM users WHERE id = ?').bind(userId).first<{ current_session_id: string | null }>();
        let currentIds = userObj && userObj.current_session_id ? userObj.current_session_id.toString().split(',').map(x => x.trim()).filter(Boolean) : [];
        if (!currentIds.includes(sessionId.toString())) {
          currentIds.push(sessionId.toString());
        }
        await c.env.DB.prepare('UPDATE users SET current_session_id = ? WHERE id = ?').bind(currentIds.join(','), userId).run();
      }
      const role = (staff_roles && staff_roles[userId]) ? staff_roles[userId] : null;
      await c.env.DB.prepare('INSERT OR REPLACE INTO session_staff_roles (session_id, user_id, event_function) VALUES (?, ?, ?)').bind(sessionId, userId, role).run();

      if (is_executed) {
        const startDateStr = started_at ? started_at.split('T')[0] : nowVE.toISOString().split('T')[0];
        const inTime = convocation_time ? `${startDateStr} ${convocation_time}:00` : nowVE.toISOString().replace('T', ' ').split('.')[0];
        
        await c.env.DB.prepare('INSERT INTO staff_attendance (user_id, session_id, type, timestamp) VALUES (?, ?, ?, ?)').bind(userId, sessionId, 'entry', inTime).run();
        
        const outDateStr = event_end_date ? event_end_date.split('T')[0] : startDateStr;
        const outTime = event_end_time ? `${outDateStr} ${event_end_time}:00` : inTime;
        await c.env.DB.prepare('INSERT INTO staff_attendance (user_id, session_id, type, timestamp) VALUES (?, ?, ?, ?)').bind(userId, sessionId, 'exit', outTime).run();
      }
    }
    
    if (is_executed) {
      const summaryData = {
        session_name: sessionName,
        event_type: sessionType,
        total_vehicles: 0,
        total_staff: allIds.length,
        delivered_vehicles: 0,
        custody_vehicles: 0,
        avg_stay_mins: 0,
        duration_mins: 0
      };
      const reportTime = nowVE.toISOString().replace('T', ' ').split('.')[0];
      await c.env.DB.prepare(`
        INSERT INTO event_reports (session_id, session_name, event_type, total_vehicles, total_staff, summary_json, closed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(sessionId, sessionName, sessionType, 0, allIds.length, JSON.stringify(summaryData), reportTime).run();
    }
  }

  return c.json({ success: true, id: sessionId, name: sessionName, internal_key: internalKey, type: sessionType, status: finalStatus });
});

app.get('/api/guardia/:session_id/details', async (c) => {
  const sessionId = c.req.param('session_id');
  const result = await c.env.DB.prepare('SELECT * FROM guardia_details WHERE session_id = ?').bind(sessionId).first();
  return c.json({ success: true, data: result || {} });
});

app.post('/api/guardia/:session_id/details', async (c) => {
  const sessionId = c.req.param('session_id');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { transport, desayunos, almuerzos, cenas, materials, proveedor, horas_solicitadas } = body;
  
  const existing = await c.env.DB.prepare('SELECT session_id, materials FROM guardia_details WHERE session_id = ?').bind(sessionId).first<any>();
  
  // Logic to calculate differences in inventory
  let oldItems: Record<string, number> = {};
  let newItems: Record<string, number> = {};

  if (existing && existing.materials) {
    try {
      const parsedOld = JSON.parse(existing.materials);
      if (parsedOld && parsedOld.items) {
        parsedOld.items.forEach((i: any) => { oldItems[i.name] = i.qty; });
      }
    } catch(e) {}
  }
  if (materials) {
    try {
      const parsedNew = JSON.parse(materials);
      if (parsedNew && parsedNew.items) {
        parsedNew.items.forEach((i: any) => { newItems[i.name] = i.qty; });
      }
    } catch(e) {}
  }

  // Get current inventory to match IDs by name
  const inventoryDb = await c.env.DB.prepare('SELECT id, name FROM inventory_items').all<any>();
  const inventoryMap: Record<string, number> = {};
  if (inventoryDb.results) {
    inventoryDb.results.forEach(i => { inventoryMap[i.name] = i.id; });
  }

  // Process differences
  const allKeys = new Set([...Object.keys(oldItems), ...Object.keys(newItems)]);
  const statements: any[] = [];
  const userName = user?.name || 'Sistema';

  for (const key of allKeys) {
    const oldQ = oldItems[key] || 0;
    const newQ = newItems[key] || 0;
    const diff = newQ - oldQ; // e.g. 5 - 2 = +3 assigned more (so -3 from physical inventory)
    
    if (diff !== 0) {
      const itemId = inventoryMap[key];
      if (itemId) {
        const physicalChange = -diff; // Assigned more -> reduce physical
        statements.push(
          c.env.DB.prepare('UPDATE inventory_items SET quantity = quantity + ?, last_updated_by = ?, last_updated_by_name = ?, last_updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .bind(physicalChange, user?.id || 0, userName, itemId)
        );
        statements.push(
          c.env.DB.prepare('INSERT INTO inventory_movements (item_id, session_id, quantity_change, type, user_name, notes) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(itemId, sessionId, physicalChange, diff > 0 ? 'assignment' : 'return', userName, `Ajuste por asignación en evento`)
        );
      }
    }
  }

  if (existing) {
    statements.unshift(
      c.env.DB.prepare(`
        UPDATE guardia_details 
        SET transport = ?, desayunos = ?, almuerzos = ?, cenas = ?, materials = ?, proveedor = ?, horas_solicitadas = ?
        WHERE session_id = ?
      `).bind(transport || null, desayunos || 0, almuerzos || 0, cenas || 0, materials || null, proveedor || null, horas_solicitadas || null, sessionId)
    );
  } else {
    statements.unshift(
      c.env.DB.prepare(`
        INSERT INTO guardia_details (session_id, transport, desayunos, almuerzos, cenas, materials, proveedor, horas_solicitadas)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(sessionId, transport || null, desayunos || 0, almuerzos || 0, cenas || 0, materials || null, proveedor || null, horas_solicitadas || null)
    );
  }

  if (statements.length > 0) {
    await c.env.DB.batch(statements);
  }

  return c.json({ success: true });
});

app.post('/api/sessions/update', async (c) => {
  const { id, name, type, supervisor_id, staff_ids, staff_roles, started_at, phone, address, contact_name, email, observations, correlativo, convocation_time, event_start_time, event_end_time, event_end_date, budget_id, is_executed } = await c.req.json();
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

  if (is_executed) {
    await c.env.DB.prepare('UPDATE sessions SET status = "completed" WHERE id = ?').bind(id).run();
  }

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
      if (!is_executed) {
        const userObj = await c.env.DB.prepare('SELECT current_session_id FROM users WHERE id = ?').bind(userId).first<{ current_session_id: string | null }>();
        let currentIds = userObj && userObj.current_session_id ? userObj.current_session_id.toString().split(',').map(x => x.trim()).filter(Boolean) : [];
        if (!currentIds.includes(id.toString())) {
          currentIds.push(id.toString());
        }
        await c.env.DB.prepare('UPDATE users SET current_session_id = ? WHERE id = ?').bind(currentIds.join(','), userId).run();
      }
      const role = (staff_roles && staff_roles[userId]) ? staff_roles[userId] : null;
      await c.env.DB.prepare('INSERT OR REPLACE INTO session_staff_roles (session_id, user_id, event_function) VALUES (?, ?, ?)').bind(id, userId, role).run();

      if (is_executed) {
        const nowVE = new Date(new Date().getTime() - (4 * 60 * 60 * 1000));
        const startDateStr = started_at ? started_at.split('T')[0] : nowVE.toISOString().split('T')[0];
        const inTime = convocation_time ? `${startDateStr} ${convocation_time}:00` : nowVE.toISOString().replace('T', ' ').split('.')[0];
        
        const existingAtt = await c.env.DB.prepare('SELECT id FROM staff_attendance WHERE user_id = ? AND session_id = ?').bind(userId, id).first();
        if (!existingAtt) {
            await c.env.DB.prepare('INSERT INTO staff_attendance (user_id, session_id, type, timestamp) VALUES (?, ?, ?, ?)').bind(userId, id, 'entry', inTime).run();
            const outDateStr = event_end_date ? event_end_date.split('T')[0] : startDateStr;
            const outTime = event_end_time ? `${outDateStr} ${event_end_time}:00` : inTime;
            await c.env.DB.prepare('INSERT INTO staff_attendance (user_id, session_id, type, timestamp) VALUES (?, ?, ?, ?)').bind(userId, id, 'exit', outTime).run();
        }
      }
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
    if (rawDate) {
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

app.post('/api/reports/send-documentacion', async (c) => {
  try {
    const { pdfBase64, htmlBody } = await c.req.json();
    const env = c.env;
    
    if (!pdfBase64) return c.json({ error: 'PDF base64 requerido' }, 400);

    const subsRes = await env.DB.prepare('SELECT u.id, u.email, u.name, u.phone, rs.estado_documentacion as sub_channel FROM user_report_subscriptions rs JOIN users u ON u.id = rs.user_id WHERE rs.estado_documentacion IN (1, 2, 3) AND u.is_active = 1').all();
    const subscribers = (subsRes.results || []) as any[];

    if (subscribers.length === 0) {
      return c.json({ success: true, message: 'Nadie está suscrito a este reporte', sent: 0 });
    }

    let sent = 0;
    const base64Data = pdfBase64.split('base64,')[1] || pdfBase64;

    for (const sub of subscribers) {
      const isWa = (sub.sub_channel === 1 || sub.sub_channel === 3);
      const isEmail = (sub.sub_channel === 2 || sub.sub_channel === 3);

      if (isEmail && sub.email) {
        await sendEmail(env, sub.email, `EYE STAFF: Reporte de Documentación Vencida`, htmlBody, [{ filename: 'Estado_Documentacion.pdf', content: base64Data, content_type: 'application/pdf' }], [], 'estado_documentacion');
        sent++;
      }
      
      if (isWa && sub.phone) {
        await sendWhatsAppDocument(env, sub.phone, base64Data, 'Estado_Documentacion.pdf', `📱 *EYE STAFF: REPORTE DE DOCUMENTACIÓN VENCIDA*\n\nHola ${sub.name},\nSe adjunta el reporte de Estado de Documentación actualizado.\n\n_Sistema Automatizado EYE STAFF_`);
        sent++;
      }
    }

    return c.json({ success: true, sent });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
app.post('/api/reports/test-request', async (c) => {
  try {
    const { type } = await c.req.json();
    const env = c.env;
    const adminEmail = env.DIRECTOR_EMAIL ;

    if (type === 'birthday') {
      await sendWeeklyBirthdayReport(env, true);
      return c.json({ success: true, message: `Reporte de cumpleañeros forzado y enviado semanalmente` });

    } else if (type === 'applications') {
      await sendWeeklyApplicationsReport(env, true);
      return c.json({ success: true, message: `Reporte de postulaciones forzado y enviado semanalmente` });

    } else if (type === 'plantilla_rrhh') {
      const res = await env.DB.prepare('SELECT * FROM users').all();
      let list = (res.results || []) as any[];
      
      const excludedAdmins = ["ADMIN", "ADMINISTRACION", "EQUIPOS", "OPERACIONES", "ORO 1", "ORO 2", "ORO 4", "ORO 5", "RRHH", "TRANSPORTE"];
      list = list.filter(u => !excludedAdmins.includes((u.name || '').toUpperCase().trim()));

      const eyePriority: Record<string, number> = { 'ORO': 1, 'PLATA': 2, 'BRONCE': 3, 'LOGÍSTICA': 4 };
      list.sort((a, b) => {
        const prioA = eyePriority[(a.eye_id || '').toUpperCase()] || 99;
        const prioB = eyePriority[(b.eye_id || '').toUpperCase()] || 99;
        if (prioA !== prioB) return prioA - prioB;
        return (a.name || '').localeCompare(b.name || '');
      });

      const excelData = [
          ['ITEM', 'STATUS', 'NOMBRE', 'CEDULA', 'EMAIL', 'PERFIL ADMIN', 'PERFIL OPERA', 'EYE ID', 'TELEFONO', 'DIRECCION', 'SECTOR', 'ENTIDAD BANCARIA', 'NUMERO DE CUENTA', 'TELEFONO PAGO MOVIL', 'FAMILIAR', 'TELFAMIILIAR', 'ALERGIAS', 'EDAD'],
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
                  (u.name || '').toUpperCase(), 
                  (u.cedula || '').toUpperCase(), 
                  (u.email || '').toUpperCase(),
                  (u.profile_admin || '').toUpperCase(),
                  (u.profile_opera || '').toUpperCase(), 
                  (u.eye_id || '').toUpperCase(),
                  (u.phone || '').toUpperCase(), 
                  (u.address || '').toUpperCase(), 
                  (u.sector || '').toUpperCase(), 
                  (u.bank_name || '').toUpperCase(), 
                  (u.bank_account || '').toUpperCase(), 
                  (u.pago_movil_phone || '').toUpperCase(),
                  (u.emergency_contact || '').toUpperCase(), 
                  (u.emergency_phone || '').toUpperCase(), 
                  (u.allergies || '').toUpperCase(),
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
      const permMap = new Map<any, any>(permRows.map((r: any) => [r.user_id, r]));

      let excelData = [
        ['EMPLEADO', 'VALET PARKING VE', 'VALET PARKING MOD', 'EVENTOS Y LISTAS VE', 'EVENTOS Y LISTAS MOD', 'ADMIN GENERAL VE', 'ADMIN GENERAL MOD', 'VIP EYE STAFF VE', 'VIP EYE STAFF MOD', 'SEGURIDAD (PINES) VE', 'SEGURIDAD (PINES) MOD']
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
    } else if (type === 'cierre_html') {
      const { session_id, channel } = await c.req.json();
      if (!session_id) return c.json({ error: 'Falta el ID del evento' }, 400);
      try {
        await sendEventClosingReport(env, session_id, channel);
        return c.json({ success: true, message: `Reporte enviado para el evento ${session_id}` });
      } catch (e: any) {
        return c.json({ error: `Error: ${e.message}` }, 500);
      }
    } else if (type === 'apertura_evento') {
      // Buscar la última sesión en la base de datos para simular el reporte de apertura si no se provee session_id (aunque en realidad viene en sessionId pero se envía null desde el frontend)
      const { session_id, channel } = await c.req.json();
      let sessionIdToUse = session_id;
      if (!sessionIdToUse) {
        const latestSession = await env.DB.prepare('SELECT id FROM sessions ORDER BY id DESC LIMIT 1').first<any>();
        if (!latestSession) return c.json({ error: 'No hay eventos en la base de datos para simular la apertura.' }, 400);
        sessionIdToUse = latestSession.id;
      }
      try {
        await sendEventActivationEmail(env, sessionIdToUse, channel);
        return c.json({ success: true, message: `Confirmación de Inicio de Evento enviada (ID ${sessionIdToUse})` });
      } catch (e: any) {
        console.error('Error in sendEventActivationEmail test:', e);
        return c.json({ error: `Error: ${e.message}` }, 500);
      }
    } else if (type === 'credenciales') {
    const { channel } = await c.req.json();
    const sendEmailFlag = channel === 'email' || channel === 'ambos' || !channel;
    const sendWaFlag = channel === 'whatsapp' || channel === 'ambos';
    
    const subsRes = await env.DB.prepare(`
      SELECT u.id, u.name, u.email, u.phone, u.pin_hash, rs.credenciales as sub_channel FROM user_report_subscriptions rs
      JOIN users u ON rs.user_id = u.id
      WHERE rs.credenciales IN (1, 2, 3) AND u.is_active = 1
    `).all();
    const subs = subsRes.results || [];
    
    if (subs.length === 0) return c.json({ error: 'No hay usuarios en la matriz con check de credenciales' }, 400);

    let sentCount = 0;
    let errors = 0;
    let lastBotError = '';

    for (const user of subs) {
      let sentAny = false;
      const uChannel = (user as any).sub_channel || 0;
      const emailOk = sendEmailFlag && (channel ? true : (uChannel === 2 || uChannel === 3));
      const waOk = sendWaFlag && (channel ? true : (uChannel === 1 || uChannel === 3));
      
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

      if (emailOk && user.email) {
        try {
          await sendEmail(env, [user.email as string], '🔐 Credenciales de Acceso - EYE STAFF', htmlBody);
          sentAny = true;
        } catch(e) {
          console.error(e);
          if (!waOk) errors++;
        }
      } else if (emailOk && !user.email) {
        if (!waOk) errors++;
      }

      if (waOk && user.phone) {
        const waMessage = `Hola *${firstName}* 👋🏼\n\nAquí están tus credenciales de acceso a la plataforma *EYE STAFF*:\n\n🌐 URL: https://eye-staff.app\n👤 Usuario: *${user.name}*\n🔑 Contraseña (PIN): *${user.pin_hash}*\n\n🔒 _Mantén tu contraseña segura. Si deseas cambiarla, contacta al administrador._`;
        const res = await sendWhatsAppMessage(env, user.phone as string, waMessage);
        if (res.ok) {
          sentAny = true;
        } else {
          if (res.error) lastBotError = res.error;
          if (!emailOk) errors++;
        }
      } else if (waOk && !user.phone) {
        if (!emailOk) errors++;
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
      let excelData = [['ID', 'SESSION ID', 'TIPO', 'FECHA (CIERRE)', 'VEHÍCULOS', 'STAFF']];
      for (const e of (events.results || [])) {
        excelData.push([e.id, ((e as any).session_id || '').toUpperCase(), ((e as any).event_type || '').toUpperCase(), ((e as any).closed_at || '').toUpperCase(), (e as any).total_vehicles, (e as any).total_staff]);
      }
      const ws = XLSX.utils.aoa_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Eventos");
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
      const excelBase64 = uint8ArrayToBase64(new Uint8Array(excelBuffer));
      // Extracciones de Bases de Datos eliminadas a petición del usuario
      // await sendEmail(env, adminEmail, 'Base de Datos de Eventos Cerrados', '<p>Adjunto encontrarás la base de datos de los últimos 100 eventos cerrados.</p>', [{ filename: 'BBDD_Eventos.xlsx', content: excelBase64, content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }]);
      return c.json({ success: true, message: `BBDD de eventos generada (envío omitido)` });
    } else if (type === 'vehiculos') {
      const vehicles = await env.DB.prepare('SELECT plate, brand, color, owner_phone, status, session_id FROM vehicles ORDER BY id DESC LIMIT 500').all();
      let excelData = [['PLACA', 'MARCA', 'COLOR', 'TELÉFONO', 'ESTADO', 'SESSION ID']];
      for (const v of (vehicles.results || [])) {
        excelData.push([((v as any).plate || '').toUpperCase(), ((v as any).brand || '').toUpperCase(), ((v as any).color || '').toUpperCase(), ((v as any).owner_phone || '').toUpperCase(), ((v as any).status || '').toUpperCase(), ((v as any).session_id || '').toUpperCase()]);
      }
      const ws = XLSX.utils.aoa_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Vehiculos");
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
      const excelBase64 = uint8ArrayToBase64(new Uint8Array(excelBuffer));
      // Extracciones de Bases de Datos eliminadas a petición del usuario
      // await sendEmail(env, adminEmail, 'Base de Datos de Vehículos', '<p>Adjunto encontrarás la base de datos de los últimos 500 vehículos.</p>', [{ filename: 'BBDD_Vehiculos.xlsx', content: excelBase64, content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }]);
      return c.json({ success: true, message: `BBDD de vehículos generada (envío omitido)` });
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
      // Extracciones de Bases de Datos eliminadas a petición del usuario
      // await sendEmail(env, adminEmail, 'Matriz Completa de Personal', '<p>Adjunto encontrarás la matriz completa de personal.</p>', [{ filename: 'Matriz_Personal.xlsx', content: excelBase64, content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }]);
      return c.json({ success: true, message: `Matriz de personal generada (envío omitido)` });
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
      // Reportes Contables / Cierres eliminados a petición del usuario
      // await sendEmail(env, adminEmail, 'Resumen Contable de Nóminas (MOCK)', '<p>Adjunto encontrarás una simulación del resumen contable de nóminas.</p>', [{ filename: 'Nominas.xlsx', content: excelBase64, content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }]);
      return c.json({ success: true, message: `Resumen de nóminas generado (envío omitido)` });
    } else if (type === 'cierre_pago') {
      const html = `<div style="font-family: sans-serif; padding: 20px;"><h2>Cierre de Ciclo de Pago</h2><p>Este es un correo simulado de cierre de ciclo de pago. Se han marcado los eventos aprobados como PAGADOS.</p></div>`;
      await sendEmail(env, adminEmail, 'Cierre de Ciclo de Pago', html);
      return c.json({ success: true, message: `Correo de cierre enviado a ${adminEmail}` });
    } else if (type === 'cumpleanos') {
      await sendWeeklyBirthdayReport(env, true);
      return c.json({ success: true, message: `Reporte real de cumpleañeros forzado y enviado` });
    } else if (type === 'postulacion_empleo') {
      await sendWeeklyApplicationsReport(env, true);
      return c.json({ success: true, message: `Reporte real de postulaciones forzado y enviado` });
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
    // Copias de Accesos a Director eliminadas a petición del usuario
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

    // 2. Eliminar toda la data asociada y finalmente la sesión secuencialmente
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM payroll_submissions WHERE session_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM chat_messages WHERE session_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM access_control_guests WHERE session_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM access_logs WHERE session_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM guest_list WHERE session_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM staff_attendance WHERE session_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM guardia_details WHERE session_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM event_reports WHERE session_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM photos WHERE vehicle_id IN (SELECT id FROM vehicles WHERE session_id = ?)').bind(id),
      c.env.DB.prepare('DELETE FROM events WHERE vehicle_id IN (SELECT id FROM vehicles WHERE session_id = ?)').bind(id),
      c.env.DB.prepare('DELETE FROM vehicles WHERE session_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM staff_locations WHERE session_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM inventory_movements WHERE session_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id)
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
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM payroll_submissions WHERE session_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM chat_messages WHERE session_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM access_control_guests WHERE session_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM access_logs WHERE session_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM guest_list WHERE session_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM staff_attendance WHERE session_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM guardia_details WHERE session_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM event_reports WHERE session_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM photos WHERE vehicle_id IN (SELECT id FROM vehicles WHERE session_id = ?)').bind(id),
      c.env.DB.prepare('DELETE FROM events WHERE vehicle_id IN (SELECT id FROM vehicles WHERE session_id = ?)').bind(id),
      c.env.DB.prepare('DELETE FROM vehicles WHERE session_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM staff_locations WHERE session_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM inventory_movements WHERE session_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id)
    ]);

    const usersWithSession = await c.env.DB.prepare("SELECT id, current_session_id FROM users WHERE current_session_id = ? OR instr(',' || current_session_id || ',', ',' || CAST(? AS TEXT) || ',') > 0").bind(String(id), String(id)).all<{ id: number, current_session_id: string }>();
    for (const u of (usersWithSession.results || [])) {
      let currentIds = u.current_session_id ? u.current_session_id.toString().split(',').map(x => x.trim()).filter(Boolean) : [];
      currentIds = currentIds.filter(x => x !== id.toString());
      await c.env.DB.prepare('UPDATE users SET current_session_id = ? WHERE id = ?').bind(currentIds.length > 0 ? currentIds.join(',') : null, u.id).run();
    }

    return c.json({ success: true, status: 'budgeted', session_id: id });
  }

  let dbUser: any = null;
  if (currentUserId === 1) {
    dbUser = { name: 'ADMIN' };
  } else {
    dbUser = await c.env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(currentUserId).first<any>();
  }

  // VALIDACIÓN: Evitar que se cierre múltiples veces el mismo evento
  const currentSession = await c.env.DB.prepare('SELECT status FROM sessions WHERE id = ?').bind(id).first<{status: string}>();
  if (!currentSession) {
    return c.json({ error: 'Sesión no encontrada' }, 404);
  }
  if (currentSession.status === 'closed') {
    return c.json({ error: 'Este evento ya ha sido cerrado previamente' }, 400);
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

  c.executionCtx.waitUntil((async () => {
    try {
      const sRes = await c.env.DB.prepare('SELECT name FROM sessions WHERE id = ?').bind(id).first<{name: string}>();
      if (sRes) {
        // WhatsApp de Debugging eliminado a petición del usuario
        // await sendAdminDebugWa(c.env, `El evento *${sRes.name}* ha finalizado (cerrado).`);
      }
    } catch(e){}
  })());

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

app.delete('/api/event-reports/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM event_reports WHERE id = ?').bind(id).run();
    return c.json({ success: true, message: 'Reporte eliminado' });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
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

    const guardiaDetails = await c.env.DB.prepare('SELECT * FROM guardia_details WHERE session_id = ?').bind(sessionId).first<any>();
    session.guardia_details = guardiaDetails || null;

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
        entry_time: isAbsent ? 'INASISTENTE' : (entry ? entry.timestamp : null),
        exit_time: isAbsent ? 'INASISTENTE' : (exit ? exit.timestamp : null),
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
        entry_time: entry ? fmtDateTime(new Date(entry.timestamp)) : '—',
        exit_time: exit ? fmtDateTime(new Date(exit.timestamp)) : '—',
        break_mins: breakMins,
        total_mins: totalMins,
        vehicles_attended: vehiclesAttended,
      });
    }

    const summary = report.summary_json ? JSON.parse(report.summary_json) : {};
    const isLogistico = (session.event_type || session.type || '').toUpperCase().includes('LOGISTICO');
    const html = buildClosingEmailHtml(session, vehicles, staffWithAttendance, summary, isLogistico);

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

    // Reenvío Manual de Reporte Final eliminado a petición del usuario
    // await sendEmail(c.env, primaryEmail, `EYE STAFF: Reporte Final (Reenvío) — ${session.name}`, html, attachments, ccList);

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

async function sendEventClosingReport(env: Env, sessionId: number, channel: string = 'email') {
  const session = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(sessionId).first<any>();
  if (!session) return null;
  const guardiaDetails = await env.DB.prepare('SELECT * FROM guardia_details WHERE session_id = ?').bind(sessionId).first<any>();
  session.guardia_details = guardiaDetails || null;
  const isLogistico = (session.type || '').toUpperCase().includes('LOGISTICO') || (session.type || '').toUpperCase().includes('GUARDIA');
  const formatHHMM = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

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

    const sessionSupervisorIds = String(session.supervisor_id || '').split(',').map((id: string) => id.trim());
    const roleStr = sessionSupervisorIds.includes(String(member.id)) ? 'SUPERVISOR' : 'LOGÍSTICA';

    staffWithAttendance.push({
      ...member,
      role: roleStr,
      entry_time: isAbsent ? 'INASISTENTE' : (entry ? fmtDateTime(new Date(entry.timestamp)) : '—'),
      exit_time: isAbsent ? 'INASISTENTE' : (exit ? fmtDateTime(new Date(exit.timestamp)) : '—'),
      break_mins: breakMins,
      total_mins: totalMins,
      vehicles_attended: vehiclesAttended,
    });
  }

  // Sort personnel: SUPERVISOR first, then alphabetical
  staffWithAttendance.sort((a: any, b: any) => {
    const isSupA = a.role && a.role.toUpperCase() === 'SUPERVISOR';
    const isSupB = b.role && b.role.toUpperCase() === 'SUPERVISOR';
    if (isSupA && !isSupB) return -1;
    if (!isSupA && isSupB) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

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
      entry ? fmtDateTime(entry) : '', exit ? fmtDateTime(exit) : '', mins,
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
    if (isLogistico) {
      page.drawText(`${session.name}`, { x: 300, y: pageH - 38, size: 11, font: bold, color: rgb(1, 1, 1) });
    } else {
      page.drawText(`${session.name}  |  ID: ${sessionId}`, { x: 300, y: pageH - 38, size: 11, font: bold, color: rgb(1, 1, 1) });
    }
    page.drawText(`Generado: ${formatFull24h(new Date())}`, { x: 300, y: pageH - 55, size: 7, font, color: rgb(0.6, 0.6, 0.6) });
    y = pageH - 75;
  };

  drawPageHeader();

  // Sección 1: Datos del evento
  page.drawRectangle({ x: margin, y: y - 5, width: pageW - 2 * margin, height: 16, color: rgb(0.94, 0.27, 0.27) });
  page.drawText('INFORMACIÓN DEL EVENTO', { x: margin + 5, y: y + 2, size: 9, font: bold, color: rgb(1, 1, 1) });
  y -= 22;

  const infoItems = [
    ['EVENTO:', session.name.toUpperCase()], ['TIPO:', (session.type || 'Valet Parking').toUpperCase()],
    ['UBICACIÓN:', (session.address || 'N/A').toUpperCase()], ['CONTACTO:', (session.contact_name || 'N/A').toUpperCase()],
    ['INICIO:', formatFull24h(eventStart).toUpperCase()], ['FIN:', formatFull24h(eventEnd).toUpperCase()],
    ['DURACIÓN:', isLogistico ? formatHHMM(durationMins) + ' HRS' : `${durationMins} MINUTOS`],
  ];

  let equiposTxtPdf = '';
  let materialesTxtPdf = '';
  const gdPdf = session.guardia_details;
  if (gdPdf && gdPdf.transport) {
    try {
      const trans = JSON.parse(gdPdf.transport);
      equiposTxtPdf = trans.equipos || '';
    } catch(e) {}
  }
  if (gdPdf && gdPdf.materials) {
    try {
      const matObj = JSON.parse(gdPdf.materials);
      let matItems = [];
      if (matObj.items && Array.isArray(matObj.items)) {
        matItems = matObj.items.map((i: any) => {
          let s = `${i.qty}x ${i.name}`;
          if (i.serials) s += ` (Serials: ${i.serials})`;
          return s;
        });
      }
      materialesTxtPdf = matItems.join(', ');
      if (matObj.notes) materialesTxtPdf += ` | Notas: ${matObj.notes}`;
    } catch(e) {
      materialesTxtPdf = gdPdf.materials;
    }
  }

  if (equiposTxtPdf) {
    infoItems.push(['LOGÍSTICA:', equiposTxtPdf.toUpperCase()]);
  }
  if (materialesTxtPdf) {
    infoItems.push(['MATERIALES:', materialesTxtPdf.toUpperCase()]);
  }

  if (!isLogistico) {
    infoItems.push(['TOTAL VEHÍCULOS:', String(vehicles.length)]);
    infoItems.push(['ENTREGADOS:', String(delivered)]);
  }
  infoItems.push(['PERSONAL:', String(staffWithAttendance.length)]);
  for (const [label, value] of infoItems) {
    ensureSpace(15);
    page.drawText(label, { x: margin, y, size: 8, font: bold });
    page.drawText(value, { x: margin + 90, y, size: 8, font });
    y -= 13;
  }

  let xCol = margin;

  // Sección 2: Tabla de vehículos
  if (!isLogistico) {
  ensureSpace(30);
  page.drawRectangle({ x: margin, y: y - 5, width: pageW - 2 * margin, height: 16, color: rgb(0.06, 0.09, 0.15) });
  page.drawText('DETALLE DE VEHÍCULOS', { x: margin + 5, y: y + 2, size: 9, font: bold, color: rgb(1, 1, 1) });
  y -= 22;

  // Encabezado tabla
  const colsV = [40, 60, 90, 60, 55, 55, 60, 45, 45];
  const headV = ['#', 'PLACA', 'PROPIETARIO', 'MARCA', 'COLOR', 'ENTRADA', 'SALIDA', 'ESTADO', 'REC.'];
  xCol = margin;
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
    const tIn = v.created_at ? fmtDateTime(new Date(v.created_at)) : '';
    const tOut = v.check_out_at ? fmtDateTime(new Date(v.check_out_at)) : '—';
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
  }

  y -= 10;

  // Sección 3: Personal
  ensureSpace(30);
  page.drawRectangle({ x: margin, y: y - 5, width: pageW - 2 * margin, height: 16, color: rgb(0.06, 0.09, 0.15) });
  page.drawText('PERSONAL Y JORNADA LABORAL', { x: margin + 5, y: y + 2, size: 9, font: bold, color: rgb(1, 1, 1) });
  y -= 22;

  const colsS = isLogistico ? [140, 100, 70, 70, 90] : [140, 80, 50, 50, 60, 70, 70];
  const headS = isLogistico ? ['NOMBRE', 'ROL', 'ENTRADA', 'SALIDA', 'JORNADA'] : ['NOMBRE', 'ROL', 'ENTRADA', 'SALIDA', 'DESC.(min)', 'JORNADA(min)', 'VEH. ATENDIDOS'];
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
    let srow = [];
    if (isLogistico) {
       srow = [s.name.toUpperCase().substring(0, 22), s.role.substring(0, 15), s.entry_time, s.exit_time, formatHHMM(s.total_mins)];
    } else {
       srow = [s.name.toUpperCase().substring(0, 22), s.role.substring(0, 12), s.entry_time, s.exit_time, String(s.break_mins), String(s.total_mins), String(s.vehicles_attended)];
    }
    xCol = margin;
    for (let ci = 0; ci < srow.length; ci++) {
      page.drawText(srow[ci], { x: xCol + 2, y: y + 1, size: 6, font });
      xCol += colsS[ci];
    }
    y -= 12;
  }

  y -= 15;

  // Sección 4: Resumen ejecutivo
  if (!isLogistico) {
    ensureSpace(80);
    page.drawRectangle({ x: margin, y: y - 5, width: pageW - 2 * margin, height: 16, color: rgb(0.94, 0.27, 0.27) });
    page.drawText('RESUMEN EJECUTIVO', { x: margin + 5, y: y + 2, size: 9, font: bold, color: rgb(1, 1, 1) });
    y -= 22;

    const execLines = [
      `SE RECIBIERON ${vehicles.length} VEHÍCULOS, DE LOS CUALES ${delivered} FUERON ENTREGADOS Y ${inCustody} PERMANECIERON EN`,
      `CUSTODIA AL CIERRE. EL TIEMPO PROMEDIO DE ESTANCIA FUE DE ${avgStayMins} MINUTOS. EL EQUIPO`,
      `ESTUVO INTEGRADO POR ${staffWithAttendance.length} PERSONA(S). DURACIÓN TOTAL DEL EVENTO: ${durationMins} MINUTOS.`,
      ``,
      `EL REPORTE COMPLETO HA SIDO ENVIADO POR CORREO ELECTRÓNICO E INCLUYE UN ARCHIVO EXCEL`,
      `(.XLSX) CON 3 HOJAS DE ANÁLISIS Y UN PDF OFICIAL CON FORMATO EYE STAFF. LOS ARCHIVOS TAMBIÉN`,
      `HAN SIDO GUARDADOS EN LA BBDD DE EVENTOS PARA CONSULTA POSTERIOR.`
    ];
    for (const line of execLines) {
      ensureSpace(14);
      page.drawText(line, { x: margin, y, size: 7.5, font: line === '' ? font : font, color: rgb(0.15, 0.15, 0.15) });
      y -= 13;
    }
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
  const html = buildClosingEmailHtml(session, vehicles, staffWithAttendance, summaryData, isLogistico);
  const attachments = [
    { filename: `Reporte_${safeName}.pdf`, content: pdfBase64, content_type: 'application/pdf' },
  ];
  const adminEmail = env.DIRECTOR_EMAIL ;

  const sendEmailFlag = channel === 'email' || channel === 'ambos';
  const sendWaFlag = channel === 'whatsapp' || channel === 'ambos';

  if (sendEmailFlag) {
    const cierreSubs = await getSubscribedEmails(env, 'cierre_html', session.id);
    const ccList = [...new Set([...cierreSubs])];
    await sendEmail(env, adminEmail, `EYE STAFF: Reporte de Cierre de Evento — ${session.name}`, html, attachments, ccList);
  }

  if (sendWaFlag) {
    const phones = await getSubscribedPhones(env, 'cierre_html', session.id);
    const waPhones = [...new Set([...phones])];
    const pdfUrl = `https://eye-staff.app/files/${pdfKey}`;
    const waMsg = `*REPORTE DE CIERRE DE EVENTO*\n\nHola, se ha cerrado el evento *${session.name}*.\n\n📊 *Resumen en PDF:*\n${pdfUrl}`;
    
    for (const phone of waPhones) {
      await sendWhatsAppMessage(env, phone, waMsg);
    }
  }

  return { summaryData, vehicles, staffWithAttendance };
}

function fmtTime(d: Date): string {
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

function fmtDateTime(d: Date): string {
  const parts = new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    weekday: 'short', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(d);
  return parts.toUpperCase().replace(',', '');
}

function buildClosingEmailHtml(session: any, vehicles: any[], staff: any[], summary: any, isLogistico: boolean = false): string {
  const formatHHMM = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const startDt = new Date(session.started_at);
  const endDt = new Date(session.ended_at || Date.now());

  return `
  <div style="font-family:'Inter',Arial,sans-serif; background-color:#ffffff; color:#334155; max-width:600px; margin:0 auto; padding:20px; text-transform:uppercase; font-size:12px;">
    
    <!-- HEADER -->
    <div style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:24px; text-align:center; margin-bottom:20px;">
      <div style="font-size:24px; margin-bottom:10px;">🏁</div>
      <h1 style="color:#EF4444; font-size:20px; font-weight:800; letter-spacing:1px; margin:0 0 8px 0;">REPORTE DE CIERRE</h1>
      <div style="color:#64748b; font-size:12px; font-weight:600; letter-spacing:0.5px;">${session.name}</div>
    </div>

    <!-- CARDS -->
    ${isLogistico ? '' : `
    <div style="display:flex; gap:10px; margin-bottom:20px;">
      <div style="flex:1; background-color:#f8fafc; border:1px solid #e2e8f0; border-top:3px solid #22C55E; border-radius:8px; padding:16px 10px; text-align:center;">
        <div style="color:#22C55E; font-size:28px; font-weight:900; margin-bottom:4px;">${summary.total_vehicles}</div>
        <div style="color:#64748b; font-size:9px; font-weight:700; letter-spacing:1px;">VEHÍCULOS</div>
      </div>
      <div style="flex:1; background-color:#f8fafc; border:1px solid #e2e8f0; border-top:3px solid #F59E0B; border-radius:8px; padding:16px 10px; text-align:center;">
        <div style="color:#F59E0B; font-size:28px; font-weight:900; margin-bottom:4px;">${summary.total_delivered}</div>
        <div style="color:#64748b; font-size:9px; font-weight:700; letter-spacing:1px;">ENTREGADOS</div>
      </div>
      <div style="flex:1; background-color:#f8fafc; border:1px solid #e2e8f0; border-top:3px solid #6366F1; border-radius:8px; padding:16px 10px; text-align:center;">
        <div style="color:#6366F1; font-size:28px; font-weight:900; margin-bottom:4px;">${summary.duration_mins}</div>
        <div style="color:#64748b; font-size:9px; font-weight:700; letter-spacing:1px;">MINUTOS</div>
      </div>
    </div>
    `}

    <!-- DATOS DEL EVENTO -->
    <div style="background-color:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:20px; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
      <div style="color:#EF4444; font-size:11px; font-weight:800; letter-spacing:1px; margin-bottom:16px;">📋 DATOS DEL EVENTO</div>
      <table style="width:100%; font-size:11px; border-collapse:collapse;">
        <tr><td style="color:#64748b; padding:8px 0; border-bottom:1px solid #e2e8f0; width:130px;">EVENTO</td><td style="color:#0f172a; font-weight:700; text-align:right; padding:8px 0; border-bottom:1px solid #e2e8f0;">${session.name}</td></tr>
        <tr><td style="color:#64748b; padding:8px 0; border-bottom:1px solid #e2e8f0;">TIPO</td><td style="color:#0f172a; font-weight:700; text-align:right; padding:8px 0; border-bottom:1px solid #e2e8f0;">${summary.event_type}</td></tr>
        <tr><td style="color:#64748b; padding:8px 0; border-bottom:1px solid #e2e8f0;">UBICACIÓN</td><td style="color:#0f172a; font-weight:700; text-align:right; padding:8px 0; border-bottom:1px solid #e2e8f0;">${summary.location}</td></tr>
        <tr><td style="color:#64748b; padding:8px 0; border-bottom:1px solid #e2e8f0;">CONTACTO</td><td style="color:#0f172a; font-weight:700; text-align:right; padding:8px 0; border-bottom:1px solid #e2e8f0;">${summary.contact}</td></tr>
        <tr><td style="color:#64748b; padding:8px 0; border-bottom:1px solid #e2e8f0;">INICIO</td><td style="color:#0f172a; font-weight:700; text-align:right; padding:8px 0; border-bottom:1px solid #e2e8f0;">${fmtDateTime(startDt)}</td></tr>
        <tr><td style="color:#64748b; padding:8px 0; border-bottom:1px solid #e2e8f0;">FIN</td><td style="color:#0f172a; font-weight:700; text-align:right; padding:8px 0; border-bottom:1px solid #e2e8f0;">${fmtDateTime(endDt)}</td></tr>
        ${isLogistico ? '' : `<tr><td style="color:#64748b; padding:8px 0;">ESTANCIA PROMEDIO</td><td style="color:#0f172a; font-weight:700; text-align:right; padding:8px 0;">${summary.avg_stay_mins} MIN</td></tr>`}
      </table>
    </div>

    <!-- VEHICULOS -->
    ${isLogistico ? '' : `
    <div style="background-color:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:20px; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
      <div style="color:#22C55E; font-size:11px; font-weight:800; letter-spacing:1px; margin-bottom:16px;">🚗 VEHÍCULOS (${vehicles.length})</div>
      <div style="overflow-x:auto;">
        <table style="width:100%; font-size:10px; border-collapse:collapse; text-align:left;">
          <tr style="color:#64748b; border-bottom:1px solid #e2e8f0;">
            <th style="padding:8px 4px;">#</th><th style="padding:8px 4px;">PLACA</th><th style="padding:8px 4px;">PROPIETARIO</th>
            <th style="padding:8px 4px;">MARCA</th><th style="padding:8px 4px;">ENTRADA</th><th style="padding:8px 4px;">SALIDA</th><th style="padding:8px 4px;">ESTADO</th>
          </tr>
          ${vehicles.map((v, i) => `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:8px 4px; color:#64748b;">${i+1}</td>
            <td style="padding:8px 4px; font-weight:700; color:#0f172a;">${v.plate}</td>
            <td style="padding:8px 4px; color:#0f172a;">${(v.owner_name || '—').substring(0, 14)}</td>
            <td style="padding:8px 4px; color:#0f172a;">${v.brand || '—'}</td>
            <td style="padding:8px 4px; color:#334155;">${v.created_at ? fmtDateTime(new Date(v.created_at)) : '—'}</td>
            <td style="padding:8px 4px; color:#334155;">${v.check_out_at ? fmtDateTime(new Date(v.check_out_at)) : '—'}</td>
            <td style="padding:8px 4px; font-weight:700; color:${['delivered', 'retrieved'].includes(v.status) ? '#22C55E' : '#F59E0B'};">${['delivered', 'retrieved'].includes(v.status) ? 'ENTREGADO' : 'CUSTODIA'}</td>
          </tr>`).join('')}
        </table>
      </div>
    </div>
    `}

    <!-- PERSONAL -->
    <div style="background-color:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:20px; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
      <div style="color:#6366F1; font-size:11px; font-weight:800; letter-spacing:1px; margin-bottom:16px;">👥 PERSONAL (${staff.length})</div>
      <div style="overflow-x:auto;">
        <table style="width:100%; font-size:10px; border-collapse:collapse; text-align:left;">
          <tr style="color:#64748b; border-bottom:1px solid #e2e8f0;">
            <th style="padding:8px 4px;">NOMBRE</th><th style="padding:8px 4px;">ROL</th>
            <th style="padding:8px 4px;">ENTRADA</th><th style="padding:8px 4px;">SALIDA</th>
            <th style="padding:8px 4px;">JORNADA</th>${isLogistico ? '' : '<th style="padding:8px 4px;">VEH.</th>'}
          </tr>
          ${staff.map(s => {
            const entryLines = s.entry_time !== 'INASISTENTE' && s.entry_time !== '—' ? s.entry_time.split(' ') : ['—',''];
            const exitLines = s.exit_time !== 'INASISTENTE' && s.exit_time !== '—' ? s.exit_time.split(' ') : ['—',''];
            return `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:10px 4px; font-weight:700; color:#0f172a;">${s.name.toUpperCase().substring(0, 16)}</td>
            <td style="padding:10px 4px; color:#64748b;">${s.role}</td>
            <td style="padding:10px 4px; color:#334155;">${entryLines[0]}<br><span style="color:#94a3b8;">${entryLines[1]||''}</span></td>
            <td style="padding:10px 4px; color:#334155;">${exitLines[0]}<br><span style="color:#94a3b8;">${exitLines[1]||''}</span></td>
            <td style="padding:10px 4px; font-weight:700; color:#22C55E;">${isLogistico ? formatHHMM(s.total_mins) : s.total_mins + 'M'}</td>
            ${isLogistico ? '' : `<td style="padding:10px 4px; font-weight:700; color:#0f172a;">${s.vehicles_attended}</td>`}
          </tr>`}
          ).join('')}
        </table>
      </div>
    </div>

    <!-- RESUMEN EJECUTIVO -->
    ${isLogistico ? '' : `
    <div style="background-color:#ffffff; border:1px solid #e2e8f0; border-left:4px solid #EF4444; border-radius:12px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
      <div style="color:#EF4444; font-size:11px; font-weight:800; letter-spacing:1px; margin-bottom:12px;">📊 RESUMEN EJECUTIVO</div>
      <p style="color:#475569; font-size:12px; line-height:1.6; margin:0 0 16px 0;">
        SE RECIBIERON <span style="color:#22C55E; font-weight:700;">${summary.total_vehicles}</span> VEHÍCULOS, DE LOS CUALES <span style="color:#22C55E; font-weight:700;">${summary.total_delivered}</span> FUERON ENTREGADOS Y <span style="color:#F59E0B; font-weight:700;">${summary.total_in_custody}</span> PERMANECIERON EN CUSTODIA AL CIERRE. EL TIEMPO PROMEDIO DE ESTANCIA FUE DE <span style="color:#6366F1; font-weight:700;">${summary.avg_stay_mins} MINUTOS</span>. EL EQUIPO ESTUVO INTEGRADO POR <b>${summary.total_staff}</b> PERSONA(S). DURACIÓN TOTAL DEL EVENTO: <span style="color:#EF4444; font-weight:700;">${summary.duration_mins} MINUTOS</span>.
      </p>
      <div style="background-color:#f8fafc; padding:12px; border-radius:6px; display:flex; align-items:flex-start; gap:10px; border:1px solid #e2e8f0;">
        <span style="font-size:16px;">📧</span>
        <p style="color:#64748b; font-size:10px; line-height:1.5; margin:0;">
          EL REPORTE COMPLETO HA SIDO ENVIADO POR CORREO ELECTRÓNICO E INCLUYE UN ARCHIVO <b style="color:#334155;">EXCEL (.XLSX)</b> CON 3 HOJAS DE ANÁLISIS Y UN <b style="color:#334155;">PDF</b> OFICIAL CON FORMATO EYE STAFF. LOS ARCHIVOS TAMBIÉN HAN SIDO GUARDADOS EN LA <b style="color:#334155;">BBDD DE EVENTOS</b> PARA CONSULTA POSTERIOR.
        </p>
      </div>
    </div>
    `}

  </div>
  `;
}

async function sendEventActivationEmail(env: Env, sessionId: number, channel: string = 'ambos') {
  const session = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(sessionId).first<any>();
  if (!session) return;

  const staffRes = await env.DB.prepare("SELECT u.id, u.name, u.role, u.phone, u.email FROM users u WHERE u.current_session_id = ? OR instr(',' || u.current_session_id || ',', ',' || CAST(? AS TEXT) || ',') > 0").bind(String(sessionId), String(sessionId)).all<any>();
  const staff = staffRes.results || [];

  const sessionSupervisorIds = String(session.supervisor_id || '').split(',').map((id: string) => id.trim());

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
          ${staff.map((u: any) => {
            const isSup = sessionSupervisorIds.includes(String(u.id));
            const eventRole = isSup ? 'SUPERVISOR' : 'LOGÍSTICA';
            const phoneStr = u.phone ? u.phone : 'Sin teléfono';
            return `
            <li style="padding: 8px 0; border-bottom: 1px solid #eee;">
              <b>${u.name.toUpperCase()}</b> - <span style="color: #666; font-size: 0.8em;">${eventRole}</span> <span style="color: #22c55e; font-size: 0.8em; font-weight: bold;">(${phoneStr})</span>
            </li>
            `;
          }).join('')}
        </ul>
        <p style="margin-top: 30px; font-size: 0.8em; color: #777; text-align: center;">EYE STAFF 2026 - Control Operativo en Tiempo Real</p>
      </div>
    </div>
  `;

  const sendEmailFlag = channel === 'email' || channel === 'ambos' || !channel;
  const sendWaFlag = channel === 'whatsapp' || channel === 'ambos' || !channel;

  let attachments: any[] = [];
  try {
    // Generar PDF de Nota de Entrega si hay materiales
    const gdRes = await env.DB.prepare('SELECT materials FROM guardia_details WHERE session_id = ?').bind(sessionId).first<any>();
    let assignedItems = [];
    if (gdRes && gdRes.materials) {
      const parsed = JSON.parse(gdRes.materials);
      if (parsed && parsed.items) assignedItems = parsed.items;
    }

    if (assignedItems.length > 0) {
      const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([595.276, 841.89]); // A4
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      let y = 800;
      page.drawText('NOTA DE ENTREGA AL CLIENTE', { x: 50, y, font: bold, size: 18, color: rgb(0,0,0) });
      y -= 30;
      page.drawText(`Evento: ${session.name}`, { x: 50, y, font: bold, size: 12 });
      y -= 20;
      page.drawText(`ID: ${sessionId} | Fecha: ${new Date().toLocaleDateString()}`, { x: 50, y, font, size: 12 });
      y -= 30;
      
      page.drawText('ÍTEM', { x: 50, y, font: bold, size: 12 });
      page.drawText('CANT.', { x: 300, y, font: bold, size: 12 });
      y -= 15;
      page.drawLine({ start: { x: 50, y }, end: { x: 400, y }, thickness: 1, color: rgb(0.8,0.8,0.8) });
      y -= 15;

      for (const item of assignedItems as any[]) {
        page.drawText(item.name.substring(0, 40), { x: 50, y, font, size: 10 });
        page.drawText(String(item.qty), { x: 300, y, font, size: 10 });
        y -= 20;
        if (y < 100) { // basic pagination logic not strictly needed if small list, but good practice
          // assuming not more than ~35 items for now to keep it simple
        }
      }
      
      y -= 40;
      page.drawText('RECIBE CONFORME:', { x: 50, y, font: bold, size: 12 });
      y -= 50;
      page.drawLine({ start: { x: 50, y }, end: { x: 300, y }, thickness: 1, color: rgb(0,0,0) });
      y -= 15;
      page.drawText('Firma del Cliente', { x: 50, y, font, size: 10 });

      const pdfBytes = await pdfDoc.save();
      let base64 = '';
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      const bytes = new Uint8Array(pdfBytes);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i += 3) {
        base64 += chars[bytes[i] >> 2];
        base64 += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
        base64 += chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
        base64 += chars[bytes[i + 2] & 63];
      }
      if ((len % 3) === 2) { base64 = base64.substring(0, base64.length - 1) + "="; }
      else if (len % 3 === 1) { base64 = base64.substring(0, base64.length - 2) + "=="; }

      attachments.push({ name: `Nota_de_Entrega_${session.name.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: base64, content_type: 'application/pdf' });
    }
  } catch(e) {
    console.error('Error generando nota de entrega PDF:', e);
  }

  if (sendEmailFlag) {
    const allEmails = await getSubscribedEmails(env, 'apertura_evento', sessionId);
    if (allEmails.length > 0) {
      for (const email of allEmails) {
        await sendEmail(env, email, `EYE STAFF: Inicio de Evento - ${session.name}`, html, attachments);
      }
    }
  }

  if (sendWaFlag) {
    let staffText = staff.map((u: any) => {
      const isSup = sessionSupervisorIds.includes(String(u.id));
      const eventRole = isSup ? 'SUPERVISOR' : 'LOGÍSTICA';
      const phoneStr = u.phone ? u.phone : 'Sin teléfono';
      return `👤 *${u.name.toUpperCase()}*\n└ ${eventRole} (${phoneStr})`;
    }).join('\\n\\n');

    const waMsg = `🟢 *CONFIRMACIÓN DE INICIO DE EVENTO* 🟢
_${session.name} | ID: ${sessionId}_

───────────────
📅 *Fecha de Inicio:* ${formatFull24h(new Date())}
🚗 *Tipo de Evento:* ${session.type ? session.type.toUpperCase() : 'VALET PARKING'}
📍 *Ubicación:* ${session.address || 'N/A'}
📞 *Contacto:* ${session.contact_name || 'N/A'} (${session.phone || 'N/A'})

───────────────
🕒 *Hora de Convocatoria:* ${session.convocation_time || 'N/A'}
⚡ *Hora de Inicio de Evento:* ${session.event_start_time || 'N/A'}
🏁 *Tentativa de Culminación:* ${session.event_end_time || 'N/A'}${session.event_end_date ? ` (${session.event_end_date.split('-').reverse().join('/')})` : ''}

───────────────
👥 *PERSONAL ASIGNADO*
${staffText}

_EYE STAFF ${new Date().getFullYear()} - Control Operativo en Tiempo Real_`;
    const allPhones = await getSubscribedPhones(env, 'apertura_evento', sessionId);

    for (const phone of allPhones) {
      try {
        await sendWhatsAppMessage(env, phone, waMsg);
      } catch (e) {
        console.error('Error sending WA event activation notification:', e);
      }
    }
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

    const subscribedEmails = await getSubscribedEmails(env, 'convocatoria');
    const sessionSupervisorIds = String(session.supervisor_id || '').split(',').map((id: string) => id.trim());
    // Regla especial de Supervisores eliminada a petición del usuario
    const allEmails = [...new Set([...subscribedEmails])].filter(Boolean) as string[];

    const subject = `📢 CONVOCATORIA - ${session.name}`;
    let html = `<h2>Convocatoria para ${session.name}</h2>
    <p><strong>Hora:</strong> ${session.convocation_time || 'N/A'}</p>
    <p><strong>Ubicación:</strong> ${session.address || 'N/A'}</p>
    <p><strong>Contacto:</strong> ${session.contact_name || 'N/A'} (${session.phone || 'N/A'})</p>
    <p>El personal convocado es el siguiente:</p><ul>`;
    for(const u of staff) {
        html += `<li>${u.name} (${u.role}) - ${u.phone || 'Sin teléfono'}</li>`;
    }
    html += `</ul>${mapHtml}`;

    if (allEmails.length > 0) {
      for (const e of allEmails) {
        await sendEmail(env, e, subject, html);
      }
    }

    // WhatsApp para suscritos
    const subscribedPhonesRes = await env.DB.prepare(`
      SELECT u.phone FROM user_report_subscriptions rs
      JOIN users u ON rs.user_id = u.id
      WHERE rs.convocatoria IN (1, 3) AND u.phone IS NOT NULL AND u.phone != '' AND u.is_active = 1
    `).all<any>();
    const subscribedPhones = (subscribedPhonesRes.results || []).map((r: any) => r.phone);
    // Regla especial de Supervisores eliminada a petición del usuario
    const allPhones = [...new Set([...subscribedPhones])].filter(Boolean) as string[];

    for (const phone of allPhones) {
      const waMsg = `*EYE STAFF - 📢 NOTIFICACIÓN DE CONVOCATORIA*\n\nHa llegado la hora de convocatoria para el evento *${session.name}*.\n\n🕒 *Hora:* ${session.convocation_time || 'N/A'}\n📍 *Ubicación:* ${session.address || 'N/A'}\n👤 *Contacto:* ${session.contact_name || 'N/A'} (${session.phone || 'N/A'})\n\n_Revisa tu correo para ver el mapa y la lista completa del personal citado._`;
      try {
        await sendWhatsAppMessage(env, phone, waMsg);
      } catch (e) {
        console.error('Error sending WA convocation notification:', e);
      }
    }

    // Marcar como notificado
    await env.DB.prepare("UPDATE sessions SET notified = 1 WHERE id = ?").bind(session.id).run();
    // WhatsApp de Debugging eliminado a petición del usuario
    // await sendAdminDebugWa(env, `📢 [HORA CONVOCATORIA] Ha llegado la hora de convocatoria del evento *${session.name}*.`);

    console.log(`[CRON] Notificación enviada para: ${session.name}`);
  }

  // --- REVISIÓN HORA DE INICIO EVENTO (ADMIN ALERTS) ---
  const startSessionsRes = await env.DB.prepare(
    "SELECT id, name FROM sessions WHERE status IN ('planning', 'active') AND started_at = ? AND event_start_time = ? AND (pre_start_notified IS NULL OR pre_start_notified = 0)"
  ).bind(today, currentTime).all<any>();
  for (const s of startSessionsRes.results || []) {
    await env.DB.prepare("UPDATE sessions SET pre_start_notified = 1 WHERE id = ?").bind(s.id).run();
    // WhatsApp de Debugging eliminado a petición del usuario
    // await sendAdminDebugWa(env, `🚀 [INICIO EVENTO] Ha llegado la hora de inicio planificada del evento *${s.name}*.`);
  }

  // --- REPORTE DE HORARIO DE EVENTOS ---
  const horarioSessionsRes = await env.DB.prepare(
    "SELECT * FROM sessions WHERE status IN ('planning', 'active') AND started_at = ? AND (convocation_time = ? OR event_start_time = ? OR event_end_time = ?)"
  ).bind(today, currentTime, currentTime, currentTime).all<any>();

  const horarioSessions = horarioSessionsRes.results || [];
  
  if (horarioSessions.length > 0) {
    const subscribedHorariosRes = await env.DB.prepare(`
      SELECT u.phone, u.email, rs.horario_eventos FROM user_report_subscriptions rs
      JOIN users u ON rs.user_id = u.id
      WHERE rs.horario_eventos IN (1, 2, 3) AND u.is_active = 1
    `).all<any>();
    
    const waPhones = (subscribedHorariosRes.results || [])
        .filter((r: any) => [1, 3].includes(r.horario_eventos) && r.phone)
        .map((r: any) => r.phone);
    const emails = (subscribedHorariosRes.results || [])
        .filter((r: any) => [2, 3].includes(r.horario_eventos) && r.email)
        .map((r: any) => r.email);

    for (const s of horarioSessions) {
      let stageStr = "HORARIO DEL EVENTO";
      if (s.convocation_time === currentTime) stageStr = "HORA DE CONVOCATORIA";
      else if (s.event_start_time === currentTime) stageStr = "HORA DE INICIO";
      else if (s.event_end_time === currentTime) stageStr = "HORA DE FIN (ESTIMADA)";

      const waMsg = `*EYE STAFF - 🕒 REPORTE DE HORARIOS*\n\nSe ha alcanzado la *${stageStr}* del evento *${s.name}*.\n\n📅 *Fecha:* ${s.started_at || 'N/A'}\n📢 *Convocatoria:* ${s.convocation_time || 'N/A'}\n🚀 *Inicio:* ${s.event_start_time || 'N/A'}\n🏁 *Fin Estimado:* ${s.event_end_time || 'N/A'}`;
      
      for (const phone of [...new Set(waPhones)]) {
        try {
          await sendWhatsAppMessage(env, phone as string, waMsg);
        } catch (e) {
          console.error('Error sending WA horario notification:', e);
        }
      }

      const emailSubject = `🕒 REPORTE DE HORARIOS - ${s.name}`;
      const emailHtml = `<h2>Reporte de Horarios: ${s.name}</h2>
      <p>Se ha alcanzado la <strong>${stageStr}</strong> del evento.</p>
      <ul>
        <li><strong>Fecha:</strong> ${s.started_at || 'N/A'}</li>
        <li><strong>Convocatoria:</strong> ${s.convocation_time || 'N/A'}</li>
        <li><strong>Inicio:</strong> ${s.event_start_time || 'N/A'}</li>
        <li><strong>Fin Estimado:</strong> ${s.event_end_time || 'N/A'}</li>
      </ul>`;

      for (const email of [...new Set(emails)]) {
        try {
          await sendEmail(env, email as string, emailSubject, emailHtml);
        } catch (e) {
          console.error('Error sending Email horario notification:', e);
        }
      }
    }
  }

  // --- REVISIÓN EVENTOS SIN PERSONAL (2 HORAS ANTES) ---
  const twoHoursAhead = new Date(localTime.getTime() + (2 * 60 * 60 * 1000));
  const hh2 = twoHoursAhead.getUTCHours().toString().padStart(2, '0');
  const mm2 = twoHoursAhead.getUTCMinutes().toString().padStart(2, '0');
  const targetTime = `${hh2}:${mm2}`;
  
  const warningSessionsRes = await env.DB.prepare(
    "SELECT id, name FROM sessions WHERE status = 'planning' AND started_at = ? AND event_start_time = ? AND (staff_warning_notified IS NULL OR staff_warning_notified = 0)"
  ).bind(today, targetTime).all<any>();
  
  for (const s of warningSessionsRes.results || []) {
    const assignedStaff = await env.DB.prepare(
      "SELECT id FROM users WHERE current_session_id = ? OR instr(',' || current_session_id || ',', ',' || CAST(? AS TEXT) || ',') > 0"
    ).bind(s.id, s.id).all();
    if (!assignedStaff.results || assignedStaff.results.length === 0) {
      await env.DB.prepare("UPDATE sessions SET staff_warning_notified = 1 WHERE id = ?").bind(s.id).run();
      await sendStaffWarningWa(env, `⚠️ [ATENCIÓN] Faltan 2 horas para el inicio del evento *${s.name}* y aún NO hay personal asignado. Por favor asigne personal.`);
    }
  }

  // --- REPORTE DE CUMPLEAÑEROS Y POSTULACIONES SEMANAL (LUNES A LAS 09:00 CARACAS) ---
  const isSendDay = localTime.getUTCDay() === 1; // 1 = Lunes
  if (isSendDay && currentTime === '09:00') {
    try {
      await sendWeeklyBirthdayReport(env);
    } catch (e) {
      console.error('Error enviando reporte semanal de cumpleañeros en Cron:', e);
    }
    try {
      await sendWeeklyApplicationsReport(env);
    } catch (e) {
      console.error('Error enviando reporte semanal de postulaciones en Cron:', e);
    }
  }
}

async function generateBirthdayPDF(guys: any[], titlePart: string, highlightNames: string[] = []) {
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

  page.drawText(`REPORTE DE CUMPLEAÑEROS - ${titlePart.toUpperCase()}`, {
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
    const isHighlighted = highlightNames.includes(guy.name);
    page.drawRectangle({
      x: 40,
      y: currentY - 5,
      width: width - 80,
      height: 22,
      color: isHighlighted ? rgb(1, 1, 0.6) : rgb(1, 1, 1),
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

  page.drawText(`GENERADO AUTOMÁTICAMENTE POR EL SISTEMA DE GESTIÓN DE PERSONAL EYE STAFF.`, {
    x: 40,
    y: 30,
    size: 8,
    font: font,
    color: rgb(0.5, 0.5, 0.5),
  });

  return await pdfDoc.save();
}

async function sendWeeklyBirthdayReport(env: Env, forceTest: boolean = false) {


  // Obtener fecha en Venezuela (GMT-4)
  const now = new Date();
  const offset = -4;
  const localTime = new Date(now.getTime() + (offset * 60 * 60 * 1000));

  // Rango de la semana (Lunes a Domingo) de la semana actual
  const dayOfWeek = localTime.getUTCDay(); // 0 = Dom, 1 = Lun, ... 6 = Sab
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(localTime);
  monday.setUTCDate(monday.getUTCDate() + daysToMonday);
  
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);

  const formatDate = (d: Date) => `${d.getUTCDate().toString().padStart(2, '0')}/${(d.getUTCMonth() + 1).toString().padStart(2, '0')}/${d.getUTCFullYear()}`;
  
  const getWeekNumber = (d: Date) => {
    const dC = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = dC.getUTCDay() || 7;
    dC.setUTCDate(dC.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(dC.getUTCFullYear(), 0, 1));
    return Math.ceil((((dC.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };
  const weekNum = getWeekNumber(monday);

  const weekName = `${weekNum} DEL ${formatDate(monday)} AL ${formatDate(sunday)}`;

  // Obtener usuarios activos y excluir perfiles corporativos/administrativos
  const usersRes = await env.DB.prepare("SELECT name, eye_id, birth_date, email, is_corporate_profile FROM users WHERE is_active = 1").all();
  const allUsers = (usersRes.results || []).filter((u: any) => u.is_corporate_profile !== 1);

  const mon = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()));
  const sun = new Date(Date.UTC(sunday.getUTCFullYear(), sunday.getUTCMonth(), sunday.getUTCDate()));

  const birthdayGuys = (allUsers as any[]).filter(u => {
    if (!u.birth_date) return false;
    const parts = u.birth_date.split('-');
    const bMonth = parseInt(parts[1], 10) - 1;
    const bDay = parseInt(parts[2], 10);
    
    const d1 = new Date(Date.UTC(monday.getUTCFullYear(), bMonth, bDay));
    const d2 = new Date(Date.UTC(sunday.getUTCFullYear(), bMonth, bDay));
    return (d1 >= mon && d1 <= sun) || (d2 >= mon && d2 <= sun);
  });

  if (birthdayGuys.length === 0 && !forceTest) {
    console.log(`No hay cumpleaneros para la semana ${weekName}`);
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


  const currentMonth = localTime.getUTCMonth();
  const nextMonth = (currentMonth + 1) % 12;
  const currentMonthYear = localTime.getUTCFullYear();
  const nextMonthYear = currentMonth === 11 ? currentMonthYear + 1 : currentMonthYear;

  const currentMonthGuys = (allUsers as any[]).filter(u => {
    if (!u.birth_date) return false;
    const parts = u.birth_date.split('-');
    const bMonth = parseInt(parts[1], 10) - 1;
    return bMonth === currentMonth;
  });

  const nextMonthGuys = (allUsers as any[]).filter(u => {
    if (!u.birth_date) return false;
    const parts = u.birth_date.split('-');
    const bMonth = parseInt(parts[1], 10) - 1;
    return bMonth === nextMonth;
  });

  const sortGuys = (arr: any[]) => arr.sort((a, b) => {
    const dayA = parseInt(a.birth_date.split('-')[2], 10);
    const dayB = parseInt(b.birth_date.split('-')[2], 10);
    if (dayA !== dayB) return dayA - dayB;
    const nameA = (a.name || '').toUpperCase();
    const nameB = (b.name || '').toUpperCase();
    return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
  });

  sortGuys(currentMonthGuys);
  sortGuys(nextMonthGuys);

  const monthNames = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
  
  const currentWeekNames = birthdayGuys.map((g: any) => g.name);

  // PDF
  const currentMonthPdfBytes = await generateBirthdayPDF(currentMonthGuys, `MES DE ${monthNames[currentMonth]} ${currentMonthYear}`, currentWeekNames);
  const currentMonthPdfBase64 = uint8ArrayToBase64(currentMonthPdfBytes);

  const nextMonthPdfBytes = await generateBirthdayPDF(nextMonthGuys, `MES DE ${monthNames[nextMonth]} ${nextMonthYear}`);
  const nextMonthPdfBase64 = uint8ArrayToBase64(nextMonthPdfBytes);

  let listHtml = '';
  for (const guy of currentMonthGuys) {
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

    const isHighlighted = currentWeekNames.includes(guy.name);
    const bg = isHighlighted ? 'background:#fef08a;' : '';

    listHtml += `
      <tr style="border-bottom:1px solid #f1f5f9; ${bg}">
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
          <p style="margin:0 0 8px; font-size:1.1rem; color:#1e293b;"><strong>MES DE ${monthNames[currentMonth]} ${currentMonthYear}</strong></p>
          <p style="margin:0 0 0; color:#475569;">A CONTINUACIÓN SE DETALLA EL LISTADO DE PERSONAL QUE CELEBRA SU CUMPLEAÑOS DURANTE ESTE MES, ORDENADO CRONOLÓGICAMENTE POR DÍA DE CELEBRACIÓN Y ALFABÉTICAMENTE POR NOMBRE. LOS CUMPLEAÑEROS DE LA SEMANA ACTUAL ESTÁN RESALTADOS EN AMARILLO (SEMANA ${weekName.toUpperCase()}).</p>
        </div>

        <h3 style="color:#0f172a; margin:0 0 15px; font-size:1.1rem; border-bottom:2px solid #f1f5f9; padding-bottom:5px;">🎂 CELEBRADOS DEL MES</h3>
        <table style="width:100%; border-collapse:collapse; font-size:0.9rem; margin-bottom:25px;">
          <thead>
            <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0; text-align:left;">
              <th style="padding:10px 15px; color:#475569;">NOMBRE</th>
              <th style="padding:10px 15px; color:#475569; text-align:center;">DÍA</th>
              <th style="padding:10px 15px; color:#475569; text-align:center;">EDAD</th>
              <th style="padding:10px 15px; color:#475569; text-align:center;">EYE ID</th>
            </tr>
          </thead>
          <tbody>
            ${listHtml || '<tr><td colspan="4" style="text-align:center; padding:20px; color:#94a3b8;">NO SE ENCONTRARON CUMPLEAÑEROS PARA ESTA SEMANA.</td></tr>'}
          </tbody>
        </table>

        <div style="background:#e0e7ff; border:1px solid #c7d2fe; border-radius:10px; padding:15px; margin-top:20px;">
          <p style="margin:0; color:#3730a3; font-weight:bold; font-size:0.85rem; text-align:center;">📦 REPORTES DETALLADOS ADJUNTOS EN FORMATO PDF PARA RRHH (MES ACTUAL Y MES PRÓXIMO).</p>
        </div>

        <p style="color:#94a3b8; font-size:0.75rem; text-align:center; margin-top:30px;">
          GRUPO EYE STAFF — SISTEMA DE GESTIÓN AUTOMATIZADO DE PERSONAL
        </p>
      </div>
    </div>
  `;

  await sendEmail(env, undefined, `🎂 REPORTE MENSUAL DE CUMPLEAÑEROS - MES DE ${monthNames[currentMonth]} ${currentMonthYear}`, htmlContent, [
    {
      filename: `Cumpleaneros_Mes_${monthNames[currentMonth]}_${currentMonthYear}.pdf`,
      content: currentMonthPdfBase64
    },
    {
      filename: `Cumpleaneros_Mes_${monthNames[nextMonth]}_${nextMonthYear}.pdf`,
      content: nextMonthPdfBase64
    }
  ], undefined, 'cumpleanos');

  // WhatsApp Sending
  const subs = await env.DB.prepare('SELECT u.phone, p.cumpleanos FROM users u JOIN user_report_subscriptions p ON u.id = p.user_id WHERE p.cumpleanos IN (1, 3) AND u.is_active = 1 AND u.phone IS NOT NULL AND u.phone != ""').all<any>();
  for (const s of (subs.results || [])) {
    const waMsg = `*EYE STAFF - 🎂 REPORTE DE CUMPLEAÑEROS*\n\nEl reporte mensual de cumpleañeros (Mes de ${monthNames[currentMonth]} ${currentMonthYear}) ha sido generado.\n\n_Revisa tu correo para ver los reportes detallados en PDF._`;
    try {
      await sendWhatsAppMessage(env, s.phone, waMsg);
    } catch (e) {
      console.error('Error WA cumpleanos:', e);
    }
  }
}

async function generateApplicationsPDF(env: Env, apps: any[], weekName: string) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const drawHeader = (page: any) => {
    const { width, height } = page.getSize();
    page.drawRectangle({ x: 0, y: height - 100, width: width, height: 100, color: rgb(0.06, 0.09, 0.16) });
    page.drawText('GRUPO EYE STAFF', { x: 40, y: height - 55, size: 24, font: boldFont, color: rgb(0.388, 0.4, 0.945) });
    page.drawText(`REPORTE DE POSTULACIONES - SEMANA: ${weekName.toUpperCase()}`, { x: 40, y: height - 80, size: 12, font: boldFont, color: rgb(1, 1, 1) });
  };

  // --- PAGE 1: LIST ---
  let page = pdfDoc.addPage([595.276, 841.89]); // A4
  const { width, height } = page.getSize();
  drawHeader(page);

  let currentY = height - 150;
  
  // Resumen gerencial
  page.drawText(`RESUMEN GERENCIAL`, { x: 40, y: currentY, size: 12, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
  currentY -= 20;
  page.drawText(`A continuación se listan los postulantes recibidos esta semana para su revisión y análisis.`, { x: 40, y: currentY, size: 10, font: font, color: rgb(0.4, 0.4, 0.4) });
  currentY -= 30;

  // Header tabla
  page.drawRectangle({ x: 40, y: currentY - 10, width: width - 80, height: 25, color: rgb(0.96, 0.97, 0.98) });
  page.drawText('NOMBRE', { x: 50, y: currentY - 2, size: 10, font: boldFont, color: rgb(0.06, 0.09, 0.16) });
  page.drawText('TELÉFONO', { x: 250, y: currentY - 2, size: 10, font: boldFont, color: rgb(0.06, 0.09, 0.16) });
  page.drawText('ESTATUS', { x: 400, y: currentY - 2, size: 10, font: boldFont, color: rgb(0.06, 0.09, 0.16) });

  currentY -= 20;

  for (const a of apps) {
    if (currentY < 50) {
      page = pdfDoc.addPage([595.276, 841.89]);
      drawHeader(page);
      currentY = height - 150;
    }
    currentY -= 25;
    page.drawRectangle({
      x: 40, y: currentY - 5, width: width - 80, height: 22, color: rgb(1, 1, 1),
      borderColor: rgb(0.93, 0.94, 0.95), borderWidth: 0.5,
    });

    let statusText = a.status === 'pending' ? 'PENDIENTE' : a.status === 'hired' ? 'CONTRATADO' : a.status === 'approved' ? 'APROBADO' : a.status === 'rejected' ? 'RECHAZADO' : 'ENTREVISTADO';
    page.drawText((a.name||'').toUpperCase(), { x: 50, y: currentY + 3, size: 9, font: font, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(a.phone||'', { x: 250, y: currentY + 3, size: 9, font: font, color: rgb(0.388, 0.4, 0.945) });
    page.drawText(statusText, { x: 400, y: currentY + 3, size: 9, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
  }
  page.drawText(`Generado automaticamente por el sistema de gestion de personal EYE STAFF.`, { x: 40, y: 30, size: 8, font: font, color: rgb(0.5, 0.5, 0.5) });

  // --- PROFILES PAGES ---
  for (const a of apps) {
    page = pdfDoc.addPage([595.276, 841.89]);
    drawHeader(page);
    currentY = height - 140;

    // Photo
    if (a.photo_url) {
      try {
        const obj = await env.PHOTOS.get(a.photo_url);
        if (obj) {
          const imgBytes = await obj.arrayBuffer();
          let img;
          try { img = await pdfDoc.embedJpg(imgBytes); } catch(e) {
            try { img = await pdfDoc.embedPng(imgBytes); } catch(e2) {}
          }
          if (img) {
            const dims = img.scaleToFit(120, 120);
            page.drawImage(img, {
              x: 40,
              y: currentY - 120,
              width: dims.width,
              height: dims.height,
            });
          }
        }
      } catch (err) {
        console.error("Error loading photo for PDF", err);
      }
    }

    // Name & Details
    page.drawText((a.name||'').toUpperCase(), { x: 180, y: currentY - 20, size: 18, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(`C.I: ${a.cedula||''}`, { x: 180, y: currentY - 45, size: 12, font: boldFont, color: rgb(0.388, 0.4, 0.945) });
    page.drawText(`NACIMIENTO: ${a.birth_date||''}`, { x: 180, y: currentY - 65, size: 10, font: font, color: rgb(0.4, 0.4, 0.4) });
    
    const regDateStr = a.created_at ? new Date(a.created_at).toLocaleDateString('es-ES') : '';
    page.drawText(`REGISTRO: ${regDateStr}`, { x: 180, y: currentY - 80, size: 10, font: font, color: rgb(0.4, 0.4, 0.4) });

    currentY -= 150;

    // Contact Box
    page.drawText('DATOS DE CONTACTO', { x: 40, y: currentY, size: 10, font: boldFont, color: rgb(0.388, 0.4, 0.945) });
    currentY -= 10;
    page.drawRectangle({ x: 40, y: currentY - 65, width: width - 80, height: 65, color: rgb(0.96, 0.97, 0.98), borderColor: rgb(0.9, 0.9, 0.9), borderWidth: 1 });
    
    page.drawText(`Teléfono: ${a.phone||''}`, { x: 60, y: currentY - 20, size: 10, font: font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(`Email: ${(a.email||'').toUpperCase()}`, { x: 60, y: currentY - 38, size: 10, font: boldFont, color: rgb(0.388, 0.4, 0.945) });
    const addr = a.address || '';
    page.drawText(`Ubicación: ${addr.substring(0, 80).toUpperCase()}`, { x: 60, y: currentY - 56, size: 9, font: font, color: rgb(0.4, 0.4, 0.4) });

    currentY -= 95;

    // Experience Box
    page.drawText('EXPERIENCIA LABORAL', { x: 40, y: currentY, size: 10, font: boldFont, color: rgb(0.388, 0.4, 0.945) });
    currentY -= 10;
    
    const expWords = (a.experience || 'SIN EXPERIENCIA REGISTRADA').toUpperCase().split(' ');
    let lines = [];
    let currentLine = '';
    for (const w of expWords) {
      if ((currentLine + w).length > 80) {
        lines.push(currentLine);
        currentLine = w + ' ';
      } else {
        currentLine += w + ' ';
      }
    }
    if (currentLine.trim()) lines.push(currentLine.trim());
    
    const boxHeight = (lines.length * 15) + 20;
    page.drawRectangle({ x: 40, y: currentY - boxHeight, width: width - 80, height: boxHeight, color: rgb(0.96, 0.97, 0.98), borderColor: rgb(0.9, 0.9, 0.9), borderWidth: 1 });
    
    let textY = currentY - 20;
    for (const line of lines) {
      page.drawText(line, { x: 60, y: textY, size: 9, font: font, color: rgb(0.2, 0.2, 0.2) });
      textY -= 15;
    }

    page.drawText(`Generado automaticamente por el sistema de gestion de personal EYE STAFF.`, { x: 40, y: 30, size: 8, font: font, color: rgb(0.5, 0.5, 0.5) });
  }

  return await pdfDoc.save();
}

async function sendWeeklyApplicationsReport(env: Env, forceTest: boolean = false) {


  const now = new Date();
  const offset = -4;
  const localTime = new Date(now.getTime() + (offset * 60 * 60 * 1000));

  const dayOfWeek = localTime.getUTCDay();
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(localTime);
  monday.setUTCDate(monday.getUTCDate() + daysToMonday);
  
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);

  const formatDate = (d: Date) => `${d.getUTCDate().toString().padStart(2, '0')}/${(d.getUTCMonth() + 1).toString().padStart(2, '0')}/${d.getUTCFullYear()}`;
  
  const getWeekNumber = (d: Date) => {
    const dC = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = dC.getUTCDay() || 7;
    dC.setUTCDate(dC.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(dC.getUTCFullYear(), 0, 1));
    return Math.ceil((((dC.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };
  const weekNum = getWeekNumber(monday);

  const weekName = `${weekNum} DEL ${formatDate(monday)} AL ${formatDate(sunday)}`;

  const lastMonday = new Date(monday);
  lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);

  const lastMondayStr = `${lastMonday.getUTCFullYear()}-${(lastMonday.getUTCMonth() + 1).toString().padStart(2, '0')}-${lastMonday.getUTCDate().toString().padStart(2, '0')} 00:00:00`;
  const thisMondayStr = `${monday.getUTCFullYear()}-${(monday.getUTCMonth() + 1).toString().padStart(2, '0')}-${monday.getUTCDate().toString().padStart(2, '0')} 00:00:00`;

  const appsRes = await env.DB.prepare(
    "SELECT * FROM job_applications WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC"
  ).bind(lastMondayStr, thisMondayStr).all();
  const apps = appsRes.results || [];

  const pdfBytes = await generateApplicationsPDF(env, apps, weekName);
  const pdfBase64 = uint8ArrayToBase64(pdfBytes);


  let newHtml = '';
  let oldHtml = '';

  for (const a of apps) {
    const createdAtStr = String(a.created_at || '');
    if (createdAtStr >= thisMondayStr) {
      let statusText = a.status === 'pending' ? 'PENDIENTE' : a.status === 'approved' ? 'APROBADO' : 'OTRO';
      newHtml += `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:12px 15px; color:#1e293b; font-weight:700;">${(String(a.name) || '').toUpperCase()}</td>
          <td style="padding:12px 15px; color:#475569; text-align:center;">${a.phone}</td>
          <td style="padding:12px 15px; text-align:center;"><span style="background:#f1f5f9; padding:4px 10px; border-radius:12px; font-size:0.75rem; font-weight:bold; color:#1e293b;">${statusText}</span></td>
        </tr>
      `;
    } else {
      let statusText = 'POR VALIDACIÓN RRHH';
      oldHtml += `
        <tr style="border-bottom:1px solid #f1f5f9; background:#fffbeb;">
          <td style="padding:12px 15px; color:#b45309; font-weight:700;">${(String(a.name) || '').toUpperCase()}</td>
          <td style="padding:12px 15px; color:#b45309; text-align:center;">${a.phone}</td>
          <td style="padding:12px 15px; text-align:center;"><span style="background:#fef3c7; border:1px solid #fde68a; padding:4px 10px; border-radius:12px; font-size:0.75rem; font-weight:bold; color:#d97706;">${statusText}</span></td>
        </tr>
      `;
    }
  }

  let listHtml = newHtml;
  if (oldHtml) {
    listHtml += `
      <tr>
        <td colspan="3" style="padding:20px 15px 10px; font-weight:bold; color:#94a3b8; text-align:center; font-size:0.85rem; border-top:2px dashed #e2e8f0;">
          POSTULACIONES ANTERIORES EN ESPERA DE VALIDACIÓN
        </td>
      </tr>
      ${oldHtml}
    `;
  }

  const htmlContent = `
    <div style="font-family:sans-serif; max-width:600px; margin:auto; border:1px solid #eee; border-radius:15px; overflow:hidden; border-top:6px solid #6366f1;">
      <div style="background:#0f172a; padding:35px; text-align:center;">
        <h1 style="color:#6366f1; margin:0; font-size:2rem; letter-spacing:3px;">EYE STAFF</h1>
        <p style="color:#94a3b8; font-weight:700; margin:5px 0 0; font-size:0.9rem;">REPORTE SEMANAL DE POSTULACIONES</p>
      </div>
      <div style="padding:30px; background:#fff;">
        <div style="background:#f8fafc; padding:20px; border-radius:12px; margin-bottom:25px; border-left:4px solid #6366f1;">
          <p style="margin:0 0 8px; font-size:1.1rem; color:#1e293b;"><strong>SEMANA:</strong> ${weekName.toUpperCase()}</p>
          <p style="margin:0 0 0; color:#475569;">A continuacion se detalla el listado de postulantes captados que estan disponibles para revision en la semana en curso.</p>
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:0.9rem; margin-bottom:25px;">
          <thead>
            <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0; text-align:left;">
              <th style="padding:10px 15px; color:#475569;">Nombre</th>
              <th style="padding:10px 15px; color:#475569; text-align:center;">Teléfono</th>
              <th style="padding:10px 15px; color:#475569; text-align:center;">Estatus</th>
            </tr>
          </thead>
          <tbody>
            ${listHtml || '<tr><td colspan="3" style="text-align:center; padding:20px; color:#94a3b8;">No se encontraron postulaciones registradas esta semana.</td></tr>'}
          </tbody>
        </table>
        <div style="background:#e0e7ff; border:1px solid #c7d2fe; border-radius:10px; padding:15px; margin-top:20px;">
          <p style="margin:0; color:#3730a3; font-weight:bold; font-size:0.85rem; text-align:center;">📦 Reporte completo adjunto en formato PDF para RRHH.</p>
        </div>
      </div>
    </div>
  `;

  await sendEmail(env, undefined, `📝 REPORTE POSTULACIONES - SEMANA ${weekName.toUpperCase()}`, htmlContent, [
    { filename: `Postulaciones_Semana_${monday.getUTCDate()}_${monday.getUTCMonth()+1}.pdf`, content: pdfBase64 }
  ], undefined, 'postulacion_empleo');

  // WhatsApp Sending
  const subs = await env.DB.prepare('SELECT u.phone, p.postulacion_empleo FROM users u JOIN user_report_subscriptions p ON u.id = p.user_id WHERE p.postulacion_empleo IN (1, 3) AND u.is_active = 1 AND u.phone IS NOT NULL AND u.phone != ""').all<any>();
  for (const s of (subs.results || [])) {
    const waMsg = `*EYE STAFF - 🎓 REPORTE DE POSTULACIONES*\n\nEl reporte semanal de postulaciones de empleo (Semana ${weekName.toUpperCase()}) ha sido generado.\n\n_Revisa tu correo para ver el reporte detallado en PDF._`;
    try {
      await sendWhatsAppMessage(env, s.phone, waMsg);
    } catch (e) {
      console.error('Error WA postulaciones:', e);
    }
  }
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
  const CHUNK_SIZE = 8192;
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    binary += String.fromCharCode.apply(null, Array.from(uint8Array.subarray(i, i + CHUNK_SIZE)));
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
    const subs = await getSubscribedEmails(c.env, 'cumpleanos');
    return c.json({ success: true, subs });
  } catch(e:any) { return c.json({ error: e.message }) }
});

// PÚBLICO: ENVIAR REPORTE DE POSTULACIONES
app.post('/api/public/test-applications-report', async (c) => {
  try {
    await sendWeeklyApplicationsReport(c.env, true);
    return c.json({ success: true, message: 'Reporte de postulaciones enviado.' });
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


    // 2. Verificación en Base de Datos
    const stripAccents = (str: string) => {
      return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    };

    const cleanInput = stripAccents(inputName).replace(/\s+/g, '').toLowerCase();

    let dbUser: any = null;
    let usersList: any[] = [];
    
    // Quick path if inputName is a cedula
    if (/^\d+$/.test(inputName.trim())) {
      const userByCedula = await c.env.DB.prepare("SELECT * FROM users WHERE is_active = 1 AND cedula = ?").bind(inputName.trim()).first();
      if (userByCedula) dbUser = userByCedula;
    }

    if (!dbUser) {
      const allActiveUsers = await c.env.DB.prepare("SELECT * FROM users WHERE is_active = 1").all();
      usersList = (allActiveUsers && allActiveUsers.results) ? allActiveUsers.results : [];

      dbUser = usersList.find((u: any) => {
        const cleanDBName = stripAccents(u.name || '').replace(/\s+/g, '').toLowerCase();
        const cleanCedula = (u.cedula || '').toString().trim();
        return cleanDBName === cleanInput || cleanCedula === inputName.trim();
      });
    }

    if (dbUser && (dbUser.pin_hash || '').toString().toLowerCase() === lowerPass) {
      let finalRole = dbUser.role || 'valet';
      const isActuallyDirector = finalRole === 'director' ||
        inputName.includes('nelson') ||
        inputName.includes('nicolas') ||
        inputName.includes('billy') ||
        inputName.includes('ramos') ||
        dbUser.is_corporate_profile === 1 ||
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
        is_corporate_profile: dbUser.is_corporate_profile || 0,
        is_guest: isGuestUser,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 10
      }, c.env.JWT_SECRET || 'secret', 'HS256');

      const device = c.req.header('User-Agent') || 'Unknown';
      const ip = c.req.header('cf-connecting-ip') || 'unknown';

      // Optimizamos 5 queries en solo 2 (batch + concurrent query)
      const [batchResults, permRow] = await Promise.all([
        c.env.DB.batch([
          c.env.DB.prepare('INSERT INTO audit_logs (user_id, action, details, ip, device) VALUES (?, ?, ?, ?, ?)').bind(dbUser.id, 'LOGIN', `Acceso exitoso: ${dbUser.name}`, ip, device),
          c.env.DB.prepare('UPDATE users SET last_login = datetime("now"), current_device = ? WHERE id = ?').bind(device, dbUser.id),
          c.env.DB.prepare(`
            UPDATE web_sessions 
            SET is_active = 0, logout_at = datetime("now") 
            WHERE user_id = ? AND is_active = 1 
            AND id NOT IN (
              SELECT id FROM web_sessions 
              WHERE user_id = ? AND is_active = 1 
              ORDER BY last_activity_at DESC 
              LIMIT 2
            )
          `).bind(dbUser.id, dbUser.id),
          c.env.DB.prepare('INSERT INTO web_sessions (user_id, device, ip, is_active, last_activity_at) VALUES (?, ?, ?, 1, datetime("now"))').bind(dbUser.id, device, ip)
        ]),
        c.env.DB.prepare('SELECT * FROM user_permissions_matrix WHERE user_id = ?').bind(dbUser.id).first<any>()
      ]);

      const sessionResult = batchResults[3];
      const webSessionId = sessionResult.meta.last_row_id?.toString() || Date.now().toString();
      let permissions = permRow;
      if (!permRow) {
        const isSuperadmin = finalRole === 'director' || dbUser.is_corporate_profile === 1 || dbUser.profile_admin === 'ADMIN' || dbUser.profile_admin === 'RRHH' || dbUser.profile_admin === 'DIRECTOR';
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
        cedula: dbUser.cedula || null,
        phone: dbUser.phone || null,
        role: finalRole,
        is_superadmin: finalRole === 'director',
        profile_admin: dbUser.profile_admin || 'NO APLICA',
        profile_opera: dbUser.profile_opera || 'NO APLICA',
        eye_id: dbUser.eye_id || null,
        is_corporate_profile: dbUser.is_corporate_profile || 0,
        is_guest: isGuestUser,
        web_session_id: webSessionId,
        pin_hash: dbUser.pin_hash,
        privacy_accepted: dbUser.privacy_accepted || 0,
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
        is_corporate_profile: 1,
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

app.get('/api/public/staff-lookup/:cedula', async (c) => {
  try {
    const cedula = c.req.param('cedula');
    if (!cedula) return c.json({ error: 'Cédula requerida' }, 400);

    const searchCedula = cedula.replace(/[^0-9]/g, '');
    if (!searchCedula) return c.json({ error: 'Cédula inválida' }, 400);

    const user = await c.env.DB.prepare(`
      SELECT name, phone 
      FROM users 
      WHERE REPLACE(REPLACE(REPLACE(UPPER(cedula), 'V-', ''), 'E-', ''), '.', '') = ? 
        AND is_active = 1
    `).bind(searchCedula).first<any>();

    if (user) {
      return c.json({ success: true, name: user.name, phone: user.phone || '' });
    } else {
      return c.json({ success: false, error: 'No encontrado' }, 404);
    }
  } catch (e: any) {
    return c.json({ error: 'Error: ' + e.message }, 500);
  }
});

app.post('/api/public/forgot-pin', async (c) => {
  try {
    const { username } = await c.req.json();
    if (!username) return c.json({ error: 'Debes ingresar tu nombre de usuario.' }, 400);

    const user = await c.env.DB.prepare('SELECT id, name, email, pin_hash FROM users WHERE LOWER(name) = ? OR LOWER(name) LIKE ?')
      .bind(username.toLowerCase(), `%${username.toLowerCase()}%`)
      .first<any>();

    if (!user) {
      return c.json({ error: 'No se encontró ningún usuario con ese nombre.' }, 404);
    }

    if (!user.email) {
      return c.json({ error: 'No tienes un correo electrónico registrado en tu perfil. Por favor, contacta a RRHH o Administración para recuperar tu acceso.' }, 400);
    }

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #6366f1;">EYE STAFF - Recuperación de Acceso</h2>
        <p>Hola <strong>${user.name}</strong>,</p>
        <p>Has solicitado la recuperación de tu contraseña de acceso (PIN).</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #6b7280;">Tu PIN de acceso actual es:</p>
          <h1 style="margin: 10px 0 0 0; color: #1f2937; letter-spacing: 5px;">${user.pin_hash}</h1>
        </div>
        <p>Puedes ingresar al sistema utilizando este PIN. Por razones de seguridad, te recomendamos ir a "Personalizar PIN" dentro de la aplicación para cambiarlo por uno nuevo si lo consideras necesario.</p>
        <br>
        <p style="font-size: 12px; color: #9ca3af;">Este es un mensaje automático del sistema EYE STAFF. Si no solicitaste esta recuperación, por favor ignora este correo.</p>
      </div>
    `;

    await sendEmail(c.env, user.email, '🔐 Recuperación de Contraseña (PIN) - EYE STAFF', htmlBody, undefined, undefined, undefined, 'EYE STAFF');

    await logAudit(c.env, user.id, 'FORGOT_PIN', `Usuario ${user.name} solicitó y recibió su PIN por correo.`);

    return c.json({ success: true, message: `Te hemos enviado tu PIN actual a ${user.email}. Revisa tu bandeja de entrada o spam.` });
  } catch (e: any) {
    return c.json({ error: 'Ocurrió un error al procesar tu solicitud: ' + e.message }, 500);
  }
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

app.post('/api/auth/refresh', async (c) => {
  const payload = c.get('user');
  if (!payload) return c.json({ success: false }, 401);
  const token = await sign(
    { ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 10 },
    c.env.JWT_SECRET || 'secret',
    'HS256'
  );
  return c.json({ success: true, token });
});

app.post('/api/staff/accept-privacy', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  await c.env.DB.prepare('UPDATE users SET privacy_accepted = 1 WHERE id = ?').bind(user.id).run();
  return c.json({ success: true });
});

app.post('/api/staff/app-location', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const { latitude, longitude, session_id } = await c.req.json().catch(() => ({}));
  if (!latitude || !longitude) return c.json({ error: 'Missing coordinates' }, 400);

  // Comprobar si el usuario sigue activo (no le han dado salida)
  const userRow = await c.env.DB.prepare('SELECT current_session_id FROM users WHERE id = ?').bind(user.id).first<{ current_session_id: string | null }>();
  
  if (!userRow || !userRow.current_session_id) {
    return c.json({ stop_tracking: true });
  }

  if (session_id) {
    const activeSessions = userRow.current_session_id.toString().split(',').map(x => x.trim()).filter(Boolean);
    if (!activeSessions.includes(session_id.toString())) {
       return c.json({ stop_tracking: true });
    }
  }

  await c.env.DB.prepare(`
    INSERT INTO staff_locations (user_id, session_id, latitude, longitude, ts)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).bind(user.id, session_id || null, latitude, longitude).run();

  return c.json({ success: true });
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

// --- AI Extraction Stubs ---
app.get('/api/staff/ai-status', async (c) => {
  return c.json({ available: false, reason: 'En desarrollo' });
});

app.post('/api/staff/extract-document-data', async (c) => {
  return c.json({ error: 'Funcionalidad en desarrollo', quota_exhausted: true }, 400);
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

  const { name, pin_hash, role, cedula, phone, address, sector, bank_name, bank_account, pago_movil, pago_movil_phone, carnet, profile_admin, profile_opera, eye_id, email, birth_date, entry_date, emergency_contact, emergency_phone, is_allergic, is_chofer, is_corporate_profile } = await c.req.json();
  if (!cedula || !pin_hash || !role) return c.json({ error: 'Faltan datos' }, 400);

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

  const mappedRole = mapRole(role || 'employee');

  await c.env.DB.prepare('INSERT INTO users (name, pin_hash, role, cedula, phone, address, sector, bank_name, bank_account, pago_movil, pago_movil_phone, carnet_url, profile_admin, profile_opera, eye_id, email, birth_date, entry_date, emergency_contact, emergency_phone, is_allergic, is_chofer, is_corporate_profile) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(cleanName, pin_hash, mappedRole, cedula || null, phone || null, address || null, sector || null, bank_name || null, bank_account || null, pago_movil || 0, pago_movil_phone || null, carnetKey, profile_admin || null, profile_opera || null, eye_id || null, email || null, birth_date || null, entry_date || null, emergency_contact || null, emergency_phone || null, is_allergic || null, is_chofer ? 1 : 0, is_corporate_profile ? 1 : 0)
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
  // Listado de Accesos y Pines eliminado a petición del usuario
  // await sendEmail(c.env, adminEmail, 'EYE STAFF — Listado Completo de Accesos y Pines', html);

  return c.json({ success: true, message: `Reporte de pines generado (envío omitido)` });
});

app.post('/api/admin/verify-pin-and-query', async (c) => {
  const current = c.get('user');
  if (!current) return c.json({ error: 'No autorizado' }, 401);

  // Verificar rol del usuario
  const isAuthorized = (
    current.is_corporate_profile === 1 || current.profile_admin === 'DIRECTOR' || current.profile_admin === 'ADMIN' || current.profile_admin === 'RRHH' ||
    current.profile_admin === 'COORDINADOR' ||
    current.role === 'director'
  );
  if (!isAuthorized) {
    return c.json({ error: 'No autorizado' }, 403);
  }

  // La validación del admin_pin ha sido eliminada a petición del usuario.
  
  // Obtenemos el nombre del usuario para el log de auditoría
  let adminUser: any = null;
  if (current.id === 1) {
    adminUser = { name: 'ADMIN' };
  } else {
    adminUser = await c.env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(current.id).first();
  }
  if (!adminUser) {
    return c.json({ error: 'Usuario no encontrado' }, 404);
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

  const allowedFields = ['name', 'cedula', 'role', 'phone', 'email', 'address', 'sector', 'bank_name', 'bank_account', 'pago_movil', 'pago_movil_phone', 'profile_admin', 'profile_opera', 'eye_id', 'is_active', 'pin_hash', 'emergency_contact', 'emergency_phone', 'is_allergic', 'entry_date', 'is_corporate_profile'];
  if (!allowedFields.includes(field)) return c.json({ error: 'Campo no permitido' }, 400);

  await c.env.DB.prepare(`UPDATE users SET ${field} = ? WHERE id = ?`)
    .bind(value, id)
    .run();

  return c.json({ success: true });
});

app.post('/api/staff/update-bulk', async (c) => {
  const { id, updates } = await c.req.json();
  if (!id || !updates) return c.json({ error: 'Faltan datos' }, 400);

  const allowedFields = [
    'name', 'cedula', 'role', 'phone', 'email', 'birth_date', 'entry_date', 'address', 'sector', 'bank_name', 'bank_account', 
    'pago_movil', 'pago_movil_phone', 'profile_admin', 'profile_opera', 'eye_id', 'is_active', 'pin_hash', 'emergency_contact', 
    'emergency_phone', 'is_allergic', 'carnet_url', 'is_chofer', 'is_corporate_profile',
    'cedula_exp', 'licencia_num', 'licencia_exp', 'cert_medico_num', 'cert_medico_exp', 
    'licencia_3ra_num', 'licencia_3ra_exp', 'cert_medico_3ra_num', 'cert_medico_3ra_exp'
  ];

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

  const user = await c.env.DB.prepare('SELECT name, cedula FROM users WHERE id = ?').bind(id).first<any>();
  if (!user) return c.json({ error: 'Usuario no encontrado' }, 404);

  const safeName = (user.name || '').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  const safeCedula = (user.cedula || 'SINCEDULA').replace(/[^a-zA-Z0-9]/g, '');
  const folderName = `${safeCedula}_${safeName}`;

  const key = `staff/${folderName}/photo_${Date.now()}.jpg`;
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

app.delete('/api/staff/:id/document', async (c) => {
  const id = c.req.param('id');
  const { document_type } = await c.req.json();

  if (!document_type) {
    return c.json({ error: 'Faltan datos' }, 400);
  }

  const allowedTypes = [
    'carnet_url',
    'cedula_photo_url', 
    'licencia_photo_url', 
    'certificado_medico_url', 
    'licencia_3ra_photo_url', 
    'certificado_medico_3ra_url'
  ];
  
  if (!allowedTypes.includes(document_type)) {
    return c.json({ error: 'Tipo de documento no válido' }, 400);
  }

  await c.env.DB.prepare(`UPDATE users SET ${document_type} = NULL WHERE id = ?`).bind(id).run();

  return c.json({ success: true });
});


app.post('/api/staff/:id/document', async (c) => {
  const id = c.req.param('id');
  const { document_type, image } = await c.req.json();

  if (!document_type || !image) {
    return c.json({ error: 'Faltan datos' }, 400);
  }

  const allowedTypes = [
    'cedula_photo_url', 
    'licencia_photo_url', 
    'certificado_medico_url', 
    'licencia_3ra_photo_url', 
    'certificado_medico_3ra_url'
  ];
  
  if (!allowedTypes.includes(document_type)) {
    return c.json({ error: 'Tipo de documento no válido' }, 400);
  }

  const user = await c.env.DB.prepare('SELECT name, cedula FROM users WHERE id = ?').bind(id).first<any>();
  if (!user) return c.json({ error: 'Usuario no encontrado' }, 404);

  let contentType = 'image/jpeg';
  let ext = 'jpg';

  if (image.startsWith('data:application/pdf')) {
    contentType = 'application/pdf';
    ext = 'pdf';
  } else if (image.startsWith('data:image/png')) {
    contentType = 'image/png';
    ext = 'png';
  }

  const safeName = (user.name || '').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  const safeCedula = (user.cedula || 'SINCEDULA').replace(/[^a-zA-Z0-9]/g, '');
  const folderName = `${safeCedula}_${safeName}`;

  const key = `staff/${folderName}/${document_type}_${Date.now()}.${ext}`;
  const base64Data = image.includes(',') ? image.split(',')[1] : image;
  
  const binaryString = atob(base64Data);
  const binaryData = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    binaryData[i] = binaryString.charCodeAt(i);
  }

  await c.env.PHOTOS.put(key, binaryData, {
    httpMetadata: { contentType: contentType }
  });

  const publicUrl = `/api/photos/${key}`;
  
  await c.env.DB.prepare(`UPDATE users SET ${document_type} = ? WHERE id = ?`)
    .bind(publicUrl, id)
    .run();

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

app.post('/api/staff/submit-data-update', async (c) => {
  try {
    const data = await c.req.json();
    const userId = c.get('user')?.id;
    if (!userId) return c.json({ error: 'No autorizado' }, 401);

    // Parse the data and extract photo
    const proposedData = JSON.stringify(data.proposed_data || {});
    const photoBase64 = data.photo_base64 || null;
    const dummyToken = 'inapp_' + Math.random().toString(36).substring(2, 15);

    // Eliminar solicitudes previas pendientes del mismo usuario para evitar duplicados
    await c.env.DB.prepare("DELETE FROM employee_data_updates WHERE user_id = ? AND status = 'pending_review'")
      .bind(userId)
      .run();

    await c.env.DB.prepare('INSERT INTO employee_data_updates (user_id, token, proposed_data, photo_base64, status) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, dummyToken, proposedData, photoBase64, 'pending_review')
      .run();
    
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message, stack: e.stack }, 500);
  }
});

app.get('/api/staff/profile/me', async (c) => {
  const userId = c.get('user')?.id;
  if (!userId) return c.json({ error: 'No autorizado' }, 401);

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  if (!user) return c.json({ error: 'User not found' }, 404);

  const pendingRequest = await c.env.DB.prepare("SELECT * FROM employee_data_updates WHERE user_id = ? AND status = 'pending_review' ORDER BY created_at DESC LIMIT 1").bind(userId).first();

  return c.json({ user, pendingRequest });
});


app.get('/api/public/staff/profile-by-cedula', async (c) => {
  try {
    const cedula = c.req.query('cedula');
    if (!cedula) return c.json({ success: false, error: 'Cédula requerida' }, 400);

    const user = await c.env.DB.prepare('SELECT * FROM users WHERE cedula = ?').bind(cedula.trim()).first();
    if (!user) return c.json({ success: false, error: 'Empleado no encontrado' }, 404);

    const pendingRequest = await c.env.DB.prepare("SELECT * FROM employee_data_updates WHERE user_id = ? AND status = 'pending_review' ORDER BY created_at DESC LIMIT 1").bind(user.id).first();

    return c.json({ success: true, user, pendingRequest });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.post('/api/public/staff/submit-data-update', async (c) => {
  try {
    const data = await c.req.json();
    const cedula = data.cedula;
    if (!cedula) return c.json({ success: false, error: 'Cédula requerida' }, 400);

    const user = await c.env.DB.prepare('SELECT id FROM users WHERE cedula = ?').bind(cedula.trim()).first();
    if (!user) return c.json({ success: false, error: 'Empleado no encontrado' }, 404);
    const userId = user.id;

    // Parse the data and extract photo
    const proposedData = JSON.stringify(data.proposed_data || {});
    const photoBase64 = data.photo_base64 || null;
    const dummyToken = 'inapp_' + Math.random().toString(36).substring(2, 15);

    // Eliminar solicitudes previas pendientes del mismo usuario para evitar duplicados
    await c.env.DB.prepare("DELETE FROM employee_data_updates WHERE user_id = ? AND status = 'pending_review'")
      .bind(userId)
      .run();

    await c.env.DB.prepare('INSERT INTO employee_data_updates (user_id, token, proposed_data, photo_base64, status) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, dummyToken, proposedData, photoBase64, 'pending_review')
      .run();
    
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
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
    let role = 'employee';
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

  const staffRes = await c.env.DB.prepare('SELECT id, name, role, eye_id, profile_admin, profile_opera FROM users WHERE is_active = 1 ORDER BY name ASC').all();
  const staff = staffRes.results || [];

  const permRowsRes = await c.env.DB.prepare('SELECT * FROM user_permissions_matrix').all();
  const permRows = permRowsRes.results || [];
  const permMap = new Map<any, any>(permRows.map((r: any) => [r.user_id, r]));

  const allowedCfoNames = ["ADMIN", "NICOLAS BETANCOURT", "MAIFER BARRUETA"];

  const permissions = staff.map((u: any) => {
    const permRow = permMap.get(u.id);
    if (permRow) {
      return {
        user_id: u.id,
        name: u.name,
        role: u.role,
        eye_id: u.eye_id,
        profile_admin: u.profile_admin,
        profile_opera: u.profile_opera,
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
        loc_mod: permRow.loc_mod,
        portal_ve: permRow.portal_ve, portal_mod: permRow.portal_mod,
        operaciones_ve: permRow.operaciones_ve, operaciones_mod: permRow.operaciones_mod,
        listas_ve: permRow.listas_ve, listas_mod: permRow.listas_mod,
        administracion_ve: permRow.administracion_ve, administracion_mod: permRow.administracion_mod,
        gestion_personal_ve: permRow.gestion_personal_ve, gestion_personal_mod: permRow.gestion_personal_mod,
        captacion_ve: permRow.captacion_ve, captacion_mod: permRow.captacion_mod,
        informes_ve: permRow.informes_ve, informes_mod: permRow.informes_mod,
        cierre_eventos_ve: permRow.cierre_eventos_ve, cierre_eventos_mod: permRow.cierre_eventos_mod,
        bases_datos_ve: permRow.bases_datos_ve, bases_datos_mod: permRow.bases_datos_mod,
        inventarios_ve: permRow.inventarios_ve, inventarios_mod: permRow.inventarios_mod,
        auditoria_ve: permRow.auditoria_ve, auditoria_mod: permRow.auditoria_mod,
        direccion_ve: permRow.direccion_ve, direccion_mod: permRow.direccion_mod,
        presupuestos_ve: permRow.presupuestos_ve, presupuestos_mod: permRow.presupuestos_mod,
        nomina_ve: permRow.nomina_ve, nomina_mod: permRow.nomina_mod,
        cierres_direccion_ve: permRow.cierres_direccion_ve, cierres_direccion_mod: permRow.cierres_direccion_mod,
        proyectos_ve: permRow.proyectos_ve, proyectos_mod: permRow.proyectos_mod,
        publicidad_ve: permRow.publicidad_ve, publicidad_mod: permRow.publicidad_mod,
        legal_ve: permRow.legal_ve, legal_mod: permRow.legal_mod,
        geolocalizacion_ve: permRow.geolocalizacion_ve, geolocalizacion_mod: permRow.geolocalizacion_mod,
        backup_ve: permRow.backup_ve, backup_mod: permRow.backup_mod,
        formatos_ve: permRow.formatos_ve, formatos_mod: permRow.formatos_mod
      };
    } else {
      const isSuperadmin = u.role === 'director';
      const isSupervisor = u.role === 'supervisor';
      const isVIP = allowedCfoNames.some(n => (u.name || '').toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(n));
      return {
        user_id: u.id,
        name: u.name,
        role: u.role,
        eye_id: u.eye_id,
        profile_admin: u.profile_admin,
        profile_opera: u.profile_opera,
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
        loc_mod: (isSuperadmin || isSupervisor) ? 1 : 0,
        portal_ve: isSuperadmin ? 1 : 0, portal_mod: isSuperadmin ? 1 : 0,
        operaciones_ve: isSuperadmin ? 1 : 0, operaciones_mod: isSuperadmin ? 1 : 0,
        listas_ve: isSuperadmin ? 1 : 0, listas_mod: isSuperadmin ? 1 : 0,
        administracion_ve: isSuperadmin ? 1 : 0, administracion_mod: isSuperadmin ? 1 : 0,
        gestion_personal_ve: isSuperadmin ? 1 : 0, gestion_personal_mod: isSuperadmin ? 1 : 0,
        captacion_ve: isSuperadmin ? 1 : 0, captacion_mod: isSuperadmin ? 1 : 0,
        informes_ve: isSuperadmin ? 1 : 0, informes_mod: isSuperadmin ? 1 : 0,
        cierre_eventos_ve: isSuperadmin ? 1 : 0, cierre_eventos_mod: isSuperadmin ? 1 : 0,
        bases_datos_ve: isSuperadmin ? 1 : 0, bases_datos_mod: isSuperadmin ? 1 : 0,
        inventarios_ve: isSuperadmin ? 1 : 0, inventarios_mod: isSuperadmin ? 1 : 0,
        auditoria_ve: isSuperadmin ? 1 : 0, auditoria_mod: isSuperadmin ? 1 : 0,
        direccion_ve: isSuperadmin ? 1 : 0, direccion_mod: isSuperadmin ? 1 : 0,
        presupuestos_ve: isSuperadmin ? 1 : 0, presupuestos_mod: isSuperadmin ? 1 : 0,
        nomina_ve: isSuperadmin ? 1 : 0, nomina_mod: isSuperadmin ? 1 : 0,
        cierres_direccion_ve: isSuperadmin ? 1 : 0, cierres_direccion_mod: isSuperadmin ? 1 : 0,
        proyectos_ve: isSuperadmin ? 1 : 0, proyectos_mod: isSuperadmin ? 1 : 0,
        publicidad_ve: isSuperadmin ? 1 : 0, publicidad_mod: isSuperadmin ? 1 : 0,
        legal_ve: isSuperadmin ? 1 : 0, legal_mod: isSuperadmin ? 1 : 0,
        geolocalizacion_ve: isSuperadmin ? 1 : 0, geolocalizacion_mod: isSuperadmin ? 1 : 0,
        backup_ve: isSuperadmin ? 1 : 0, backup_mod: isSuperadmin ? 1 : 0,
        formatos_ve: 0, formatos_mod: 0
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

  const validFields = ['valet_ve', 'valet_mod', 'accesos_ve', 'accesos_mod', 'alquiler_ve', 'alquiler_mod', 'traslados_ve', 'traslados_mod', 'guardia_ve', 'guardia_mod', 'custodia_ve', 'custodia_mod', 'eventos_ve', 'eventos_mod', 'admin_ve', 'admin_mod', 'vip_ve', 'vip_mod', 'seg_ve', 'seg_mod', 'loc_ve', 'loc_mod', 'portal_ve', 'portal_mod', 'operaciones_ve', 'operaciones_mod', 'listas_ve', 'listas_mod', 'administracion_ve', 'administracion_mod', 'gestion_personal_ve', 'gestion_personal_mod', 'captacion_ve', 'captacion_mod', 'informes_ve', 'informes_mod', 'cierre_eventos_ve', 'cierre_eventos_mod', 'bases_datos_ve', 'bases_datos_mod', 'inventarios_ve', 'inventarios_mod', 'auditoria_ve', 'auditoria_mod', 'direccion_ve', 'direccion_mod', 'presupuestos_ve', 'presupuestos_mod', 'nomina_ve', 'nomina_mod', 'cierres_direccion_ve', 'cierres_direccion_mod', 'proyectos_ve', 'proyectos_mod', 'publicidad_ve', 'publicidad_mod', 'legal_ve', 'legal_mod', 'geolocalizacion_ve', 'geolocalizacion_mod', 'backup_ve', 'backup_mod', 'formatos_ve', 'formatos_mod'];
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
  const d_portal_ve = isSuperadmin ? 1 : 0; const d_portal_mod = isSuperadmin ? 1 : 0;
  const d_operaciones_ve = isSuperadmin ? 1 : 0; const d_operaciones_mod = isSuperadmin ? 1 : 0;
  const d_listas_ve = isSuperadmin ? 1 : 0; const d_listas_mod = isSuperadmin ? 1 : 0;
  const d_administracion_ve = isSuperadmin ? 1 : 0; const d_administracion_mod = isSuperadmin ? 1 : 0;
  const d_gestion_personal_ve = isSuperadmin ? 1 : 0; const d_gestion_personal_mod = isSuperadmin ? 1 : 0;
  const d_captacion_ve = isSuperadmin ? 1 : 0; const d_captacion_mod = isSuperadmin ? 1 : 0;
  const d_informes_ve = isSuperadmin ? 1 : 0; const d_informes_mod = isSuperadmin ? 1 : 0;
  const d_cierre_eventos_ve = isSuperadmin ? 1 : 0; const d_cierre_eventos_mod = isSuperadmin ? 1 : 0;
  const d_bases_datos_ve = isSuperadmin ? 1 : 0; const d_bases_datos_mod = isSuperadmin ? 1 : 0;
  const d_inventarios_ve = isSuperadmin ? 1 : 0; const d_inventarios_mod = isSuperadmin ? 1 : 0;
  const d_auditoria_ve = isSuperadmin ? 1 : 0; const d_auditoria_mod = isSuperadmin ? 1 : 0;
  const d_direccion_ve = isSuperadmin ? 1 : 0; const d_direccion_mod = isSuperadmin ? 1 : 0;
  const d_presupuestos_ve = isSuperadmin ? 1 : 0; const d_presupuestos_mod = isSuperadmin ? 1 : 0;
  const d_nomina_ve = isSuperadmin ? 1 : 0; const d_nomina_mod = isSuperadmin ? 1 : 0;
  const d_cierres_direccion_ve = isSuperadmin ? 1 : 0; const d_cierres_direccion_mod = isSuperadmin ? 1 : 0;
  const d_proyectos_ve = isSuperadmin ? 1 : 0; const d_proyectos_mod = isSuperadmin ? 1 : 0;
  const d_publicidad_ve = isSuperadmin ? 1 : 0; const d_publicidad_mod = isSuperadmin ? 1 : 0;
  const d_legal_ve = isSuperadmin ? 1 : 0; const d_legal_mod = isSuperadmin ? 1 : 0;
  const d_geolocalizacion_ve = isSuperadmin ? 1 : 0; const d_geolocalizacion_mod = isSuperadmin ? 1 : 0;
  const d_backup_ve = isSuperadmin ? 1 : 0; const d_backup_mod = isSuperadmin ? 1 : 0;
  const d_formatos_ve = 0; const d_formatos_mod = 0;

  await c.env.DB.prepare(`
    INSERT OR IGNORE INTO user_permissions_matrix 
    (user_id, valet_ve, valet_mod, accesos_ve, accesos_mod, alquiler_ve, alquiler_mod, traslados_ve, traslados_mod, guardia_ve, guardia_mod, custodia_ve, custodia_mod, eventos_ve, eventos_mod, admin_ve, admin_mod, vip_ve, vip_mod, seg_ve, seg_mod, loc_ve, loc_mod, portal_ve, portal_mod, operaciones_ve, operaciones_mod, listas_ve, listas_mod, administracion_ve, administracion_mod, gestion_personal_ve, gestion_personal_mod, captacion_ve, captacion_mod, informes_ve, informes_mod, cierre_eventos_ve, cierre_eventos_mod, bases_datos_ve, bases_datos_mod, inventarios_ve, inventarios_mod, auditoria_ve, auditoria_mod, direccion_ve, direccion_mod, presupuestos_ve, presupuestos_mod, nomina_ve, nomina_mod, cierres_direccion_ve, cierres_direccion_mod, proyectos_ve, proyectos_mod, publicidad_ve, publicidad_mod, legal_ve, legal_mod, geolocalizacion_ve, geolocalizacion_mod, backup_ve, backup_mod, formatos_ve, formatos_mod) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(user_id, d_valet_ve, d_valet_mod, d_accesos_ve, d_accesos_mod, d_alquiler_ve, d_alquiler_mod, d_traslados_ve, d_traslados_mod, d_guardia_ve, d_guardia_mod, d_custodia_ve, d_custodia_mod, d_eventos_ve, d_eventos_mod, d_admin_ve, d_admin_mod, d_vip_ve, d_vip_mod, d_seg_ve, d_seg_mod, d_loc_ve, d_loc_mod, d_portal_ve, d_portal_mod, d_operaciones_ve, d_operaciones_mod, d_listas_ve, d_listas_mod, d_administracion_ve, d_administracion_mod, d_gestion_personal_ve, d_gestion_personal_mod, d_captacion_ve, d_captacion_mod, d_informes_ve, d_informes_mod, d_cierre_eventos_ve, d_cierre_eventos_mod, d_bases_datos_ve, d_bases_datos_mod, d_inventarios_ve, d_inventarios_mod, d_auditoria_ve, d_auditoria_mod, d_direccion_ve, d_direccion_mod, d_presupuestos_ve, d_presupuestos_mod, d_nomina_ve, d_nomina_mod, d_cierres_direccion_ve, d_cierres_direccion_mod, d_proyectos_ve, d_proyectos_mod, d_publicidad_ve, d_publicidad_mod, d_legal_ve, d_legal_mod, d_geolocalizacion_ve, d_geolocalizacion_mod, d_backup_ve, d_backup_mod, d_formatos_ve, d_formatos_mod)
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
  const subMap = new Map<any, any>(subRows.map((r: any) => [r.user_id, r]));

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
        cierre_html: subRow.cierre_html || 0,
        apertura_evento: subRow.apertura_evento || 0,
        cierre_diario: subRow.cierre_diario || 0,
        pre_inicio_evento: subRow.pre_inicio_evento || 0,
        postulacion_empleo: subRow.postulacion_empleo || 0,
        inventarios: subRow.inventarios || 0,
        backup: subRow.backup || 0,
        horario_eventos: subRow.horario_eventos || 0,
        formato_pago: subRow.formato_pago || 0,
        estado_documentacion: subRow.estado_documentacion || 0
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
        cierre_html: 0,
        apertura_evento: 0,
        cierre_diario: 0,
        pre_inicio_evento: 0,
        postulacion_empleo: 0,
        inventarios: 0,
        backup: 0,
        horario_eventos: 0,
        formato_pago: 0,
        estado_documentacion: 0
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

  const validFields = ['convocatoria', 'cumpleanos', 'nominas', 'permisos', 'plantilla_rrhh', 'actualizacion_datos', 'credenciales', 'cierre_html', 'apertura_evento', 'pre_inicio_evento', 'cierre_diario', 'postulacion_empleo', 'inventarios', 'backup', 'horario_eventos', 'formato_pago', 'estado_documentacion'];
  if (!validFields.includes(field)) {
    return c.json({ error: 'Campo inválido' }, 400);
  }

  const targetUser = await c.env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(user_id).first<any>();
  if (!targetUser) return c.json({ error: 'Usuario no encontrado' }, 404);

  await c.env.DB.prepare(`
    INSERT OR IGNORE INTO user_report_subscriptions 
    (user_id, convocatoria, cumpleanos, dossier_pdf, bbdd_excel, nominas, permisos, plantilla_rrhh, actualizacion_datos, credenciales, cierre_html, apertura_evento, pre_inicio_evento, cierre_diario, postulacion_empleo, inventarios, backup, horario_eventos, formato_pago, estado_documentacion) 
    VALUES (?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
  `).bind(user_id).run();

  const intVal = parseInt(value, 10);
  if (isNaN(intVal) || intVal < 0 || intVal > 3) return c.json({ error: 'Valor inválido' }, 400);

  await c.env.DB.prepare(`UPDATE user_report_subscriptions SET ${field} = ? WHERE user_id = ?`)
    .bind(intVal, user_id)
    .run();

  return c.json({ success: true });
});

app.post('/api/admin/send-backup', async (c) => {
  try {
    const user = c.get('user');
    if (user.role !== 'director') return c.json({ error: 'No autorizado' }, 403);

    const body = await c.req.json().catch(() => ({}));
    const channel = body.channel || 'ambos';
    const backendCode = body.backendCode || '';
    const sendEmailFlag = channel === 'email' || channel === 'ambos' || !channel;
    const sendWaFlag = channel === 'whatsapp' || channel === 'ambos';

    const tables = ['users', 'sessions', 'vehicles', 'staff_attendance', 'event_reports', 'audit_logs', 'chat_messages', 'job_applications', 'equivalences', 'geofences', 'locations'];
    const dbBackup: any = {};
    for (const table of tables) {
      try {
        const res = await c.env.DB.prepare(`SELECT * FROM ${table}`).all();
        dbBackup[table] = res.results || [];
      } catch (e: any) {
        dbBackup[table] = { error: e.message };
      }
    }
    
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '_');
    const dbContent = JSON.stringify(dbBackup, null, 2);
    const dbBase64 = uint8ArrayToBase64(new TextEncoder().encode(dbContent));

    let htmlBase64 = '';
    try {
      const res = await fetch('https://eye-staff.app/index.html');
      if (res.ok) {
        const htmlText = await res.text();
        htmlBase64 = uint8ArrayToBase64(new TextEncoder().encode(htmlText));
      }
    } catch (e) {}

    const attachments: any[] = [
      { filename: `db_backup_${dateStr}.txt`, content: dbBase64 }
    ];
    if (htmlBase64) {
      attachments.push({ filename: `index_backup_${dateStr}.html`, content: htmlBase64 });
    }
    if (backendCode) {
      const backendBase64 = uint8ArrayToBase64(new TextEncoder().encode(backendCode));
      attachments.push({ filename: `backend_backup_${dateStr}_ts.txt`, content: backendBase64 });
    }

    const subject = `📦 BACKUP COMPLETO EYE STAFF - ${dateStr} (Base de Datos + Frontend)`;
    const html = `
        <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 12px; background: #fafafa;">
            <h2 style="color: #22c55e; border-bottom: 2px solid #22c55e; padding-bottom: 10px;">Respaldo de Seguridad Completo</h2>
            <p>Se ha generado el respaldo manual de la base de datos y la interfaz web del sistema <b>EYE STAFF</b>.</p>
            <p>Este backup fue solicitado desde el panel administrativo.</p>
            <p style="font-size: 0.85rem; color: #6b7280; text-align: center; margin-top: 30px;">EYE STAFF — PLATAFORMA INTEGRAL</p>
        </div>
    `;

    let emailsSent = 0;
    let waSent = 0;
    let recipientsList: string[] = [];

    if (sendEmailFlag || sendWaFlag) {
      const subs = await c.env.DB.prepare(`
        SELECT u.name, u.email, u.phone FROM user_permissions_matrix upm
        JOIN users u ON upm.user_id = u.id
        WHERE upm.backup_ve = 1 AND u.is_active = 1
      `).all<any>();
      const users = subs.results || [];
      recipientsList = users.map((u: any) => u.name);

      if (sendEmailFlag) {
        const emails = users.filter((u: any) => u.email).map((u: any) => u.email);
        if (emails.length > 0) {
          const dateStrFmt = new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' });
          const subject = `📦 BACKUP COMPLETO EYE STAFF - ${dateStrFmt} (Base de Datos + Frontend)`;
          const html = `
            <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 12px; background: #fafafa;">
                <h2 style="color: #22c55e; border-bottom: 2px solid #22c55e; padding-bottom: 10px;">Respaldo de Seguridad Automático</h2>
                <p>Se ha realizado y verificado el respaldo de seguridad integral del sistema <b>EYE STAFF</b> (Generado en tiempo real desde el Panel UI).</p>
                
                <h3 style="color: #4b5563;">Detalles de Ejecución:</h3>
                <ul>
                    <li><b>Fecha de Creación:</b> ${dateStrFmt}</li>
                    <li><b>Estado:</b> Completado con Éxito</li>
                </ul>

                <h3 style="color: #4b5563;">Elementos incluidos en los archivos adjuntos:</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <thead>
                        <tr style="background: #f3f4f6;">
                            <th style="border: 1px solid #d1d5db; padding: 8px; text-align: left;">Elemento</th>
                            <th style="border: 1px solid #d1d5db; padding: 8px; text-align: left;">Detalle</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="border: 1px solid #d1d5db; padding: 8px; font-weight: bold;">index_backup_${dateStr}.html</td>
                            <td style="border: 1px solid #d1d5db; padding: 8px;">Código frontend actualizado en tiempo real.</td>
                        </tr>
                        <tr>
                            <td style="border: 1px solid #d1d5db; padding: 8px; font-weight: bold;">db_backup_${dateStr}.txt</td>
                            <td style="border: 1px solid #d1d5db; padding: 8px;">Volcado de todas las tablas operativas de la BD.</td>
                        </tr>
                        ${backendCode ? `
                        <tr>
                            <td style="border: 1px solid #d1d5db; padding: 8px; font-weight: bold;">backend_backup_${dateStr}.ts</td>
                            <td style="border: 1px solid #d1d5db; padding: 8px;">Código del backend anexado.</td>
                        </tr>
                        ` : ''}
                    </tbody>
                </table>

                <p style="font-size: 0.85rem; color: #6b7280; text-align: center; margin-top: 30px;">
                    EYE STAFF — PLATAFORMA INTEGRAL 2026
                </p>
            </div>
          `;
          for (const e of emails) {
            await sendEmail(c.env, e, subject, html, attachments);
          }
          emailsSent = emails.length;
        }
      }

      if (sendWaFlag) {
        const phones = users.filter((u: any) => u.phone).map((u: any) => u.phone);
        if (phones.length > 0) {
          const version = 'v2.7.32';
          const dateStrFmt = new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' });
          const waMsg = `*EYE STAFF - 📦 BACKUP COMPLETADO (${version})*\n\nSe ha generado y enviado el backup completo de seguridad (Base de Datos y Frontend) a los correos suscritos.\n\n*Detalles de Ejecución:*\n- Fecha de Creación: ${dateStrFmt}\n- Estado: Completado con Éxito\n\n*Elementos incluidos en este respaldo:*\n- index_backup_${dateStr}.html (Frontend actualizado en tiempo real)\n- db_backup_${dateStr}.txt (Tablas operativas D1 en JSON)\n\n_Revisa tu bandeja de entrada para descargar los archivos adjuntos._`;
          for (const phone of phones) {
            try {
              await sendWhatsAppMessage(c.env, phone, waMsg);
            } catch (e) {}
          }
          waSent = phones.length;
        }
      }
    }

    return c.json({ success: true, emails_sent: emailsSent, wa_sent: waSent, recipients: recipientsList });
  } catch (globalError: any) {
    return c.json({ error: globalError.message, stack: globalError.stack }, 500);
  }
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
      SELECT u.id, u.email, u.name, u.phone, rs.actualizacion_datos as sub_channel FROM user_report_subscriptions rs
      JOIN users u ON rs.user_id = u.id
      WHERE rs.actualizacion_datos IN (1, 2, 3) AND u.is_active = 1
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

    const uChannel = (emp as any).sub_channel || 0;
    const isMatrix = type === 'matrix';
    const emailOk = sendEmailFlag && (isMatrix ? (uChannel === 2 || uChannel === 3) : true);
    const waOk = sendWaFlag && (isMatrix ? (uChannel === 1 || uChannel === 3) : true);

    if (emailOk && emp.email) {
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
        if (!waOk) errors++;
      }
    } else if (emailOk && !emp.email) {
      if (!waOk) errors++;
    }

    if (waOk && emp.phone) {
      const waMessage = `Hola *${firstName}* 👋🏼\n\nEl departamento de Recursos Humanos de *EYE STAFF* requiere que actualices o verifiques tus datos personales (foto, cuenta bancaria, etc).\n\nIngresa al siguiente enlace único y seguro para hacerlo:\n\n🔗 ${link}\n\n_⚠️ Este enlace es personal, por favor no lo compartas con nadie._`;
      const res = await sendWhatsAppMessage(c.env, emp.phone, waMessage);
      if (res.ok) {
        sentAny = true;
      } else {
        if (res.error) lastBotError = res.error;
        if (!emailOk) errors++;
      }
    } else if (waOk && !emp.phone) {
      if (!emailOk) errors++;
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

app.post('/api/admin/send-payment-format-requests', async (c) => {
  const user = c.get('user');
  if (user.role !== 'director') return c.json({ error: 'No autorizado' }, 403);

  const { channel } = await c.req.json();
  const sendEmailFlag = channel === 'email' || channel === 'ambos' || !channel;
  const sendWaFlag = channel === 'whatsapp' || channel === 'ambos';

  const subs = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.name, u.phone, rs.formato_pago as sub_channel FROM user_report_subscriptions rs
    JOIN users u ON rs.user_id = u.id
    WHERE rs.formato_pago IN (1, 2, 3) AND u.is_active = 1
  `).all();
  
  const targetUsers = subs.results as any[];

  if (targetUsers.length === 0) {
    return c.json({ error: 'No se encontraron empleados.' }, 400);
  }

  let sentCount = 0;
  let errors = 0;
  let sentNames: string[] = [];
  let lastBotError = '';

  for (const emp of targetUsers) {
    let sentAny = false;
    const link = 'https://eye-staff.app/formato-pago';
    const firstName = emp.name.split(' ')[0];

    const uChannel = emp.sub_channel || 0;
    const emailOk = sendEmailFlag && (uChannel === 2 || uChannel === 3);
    const waOk = sendWaFlag && (uChannel === 1 || uChannel === 3);

    if (emailOk && emp.email) {
      const html = `
        <div style="text-align: center;">
          <h2 style="color: #1e293b; margin-bottom: 20px;">Hola ${emp.name},</h2>
          <p style="font-size: 16px; color: #475569; margin-bottom: 30px;">
            El departamento de Recursos Humanos de EYE STAFF te ha enviado el Formato de Pago para que registres tus eventos trabajados.
          </p>
          <a href="${link}" style="display: inline-block; background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
            📝 LLENAR FORMATO DE PAGO
          </a>
        </div>
      `;
      try {
        await sendEmail(c.env, emp.email, '📋 Formato de Pago - EYE STAFF', html);
        sentAny = true;
      } catch (e) {
        if (!waOk) errors++;
      }
    }

    if (waOk && emp.phone) {
      const waMessage = `Hola *${firstName}* 👋🏼\n\nEl departamento de Recursos Humanos de *EYE STAFF* te ha enviado el *Formato de Pago* para que registres tus eventos trabajados.\n\nIngresa al siguiente enlace para llenarlo:\n\n🔗 ${link}`;
      const res = await sendWhatsAppMessage(c.env, emp.phone, waMessage);
      if (res.ok) {
        sentAny = true;
      } else {
        if (res.error) lastBotError = res.error;
        if (!emailOk) errors++;
      }
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
    SELECT e.*, u.name as user_name, u.cedula as user_cedula, u.phone as user_phone, u.photo_url as current_photo, u.email as user_email
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
  const { modifiedData } = await c.req.json().catch(() => ({}));
  const update = await c.env.DB.prepare('SELECT * FROM employee_data_updates WHERE id = ?').bind(id).first<any>();
  if (!update || update.status !== 'pending_review') return c.json({ error: 'Solicitud inválida' }, 400);

  const proposed = modifiedData || JSON.parse(update.proposed_data || '{}');

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

  const uploadDoc = async (base64Str: string, prefix: string) => {
    if (!base64Str) return null;
    const base64Data = base64Str.split(',')[1];
    if (!base64Data) return null;
    const binaryData = Uint8Array.from(atob(base64Data), char => char.charCodeAt(0));
    const key = `docs/${update.user_id}_${prefix}_${Date.now()}.jpg`;
    await c.env.PHOTOS.put(key, binaryData, { httpMetadata: { contentType: 'image/jpeg' } });
    return `/api/photos/${key}`;
  };

  const docCedulaUrl = await uploadDoc(proposed.doc_cedula_base64, 'cedula');
  const docLicencia2Url = await uploadDoc(proposed.doc_licencia2_base64, 'licencia2');
  const docCertificado2Url = await uploadDoc(proposed.doc_certificado2_base64, 'certificado2');
  const docLicencia3Url = await uploadDoc(proposed.doc_licencia3_base64, 'licencia3');
  const docCertificado3Url = await uploadDoc(proposed.doc_certificado3_base64, 'certificado3');

  let updateQuery = `
    UPDATE users SET
      phone = COALESCE(?, phone),
      address = COALESCE(?, address),
      sector = COALESCE(?, sector),
      bank_name = COALESCE(?, bank_name),
      bank_account = COALESCE(?, bank_account),
      pago_movil = COALESCE(?, pago_movil),
      pago_movil_phone = COALESCE(?, pago_movil_phone),
      emergency_contact = COALESCE(?, emergency_contact),
      emergency_phone = COALESCE(?, emergency_phone),
      is_allergic = COALESCE(?, is_allergic),
      email = COALESCE(?, email)
  `;
  const params: any[] = [
    proposed.phone || null,
    proposed.address || null,
    proposed.sector || null,
    proposed.bank_name || null,
    proposed.bank_account || null,
    proposed.pago_movil !== undefined ? proposed.pago_movil : null,
    proposed.pago_movil_phone || null,
    proposed.emergency_contact || null,
    proposed.emergency_phone || null,
    proposed.is_allergic || null,
    proposed.email || null
  ];

  if (proposed.birth_date) {
    updateQuery += `, birth_date = ?`;
    params.push(proposed.birth_date);
  }
  if (photoUrl) {
    updateQuery += `, photo_url = ?`;
    params.push(photoUrl);
  }
  if (docCedulaUrl) { updateQuery += `, cedula_photo_url = ?`; params.push(docCedulaUrl); }
  if (docLicencia2Url) { updateQuery += `, licencia_photo_url = ?`; params.push(docLicencia2Url); }
  if (docCertificado2Url) { updateQuery += `, certificado_medico_url = ?`; params.push(docCertificado2Url); }
  if (docLicencia3Url) { updateQuery += `, licencia_3ra_photo_url = ?`; params.push(docLicencia3Url); }
  if (docCertificado3Url) { updateQuery += `, certificado_medico_3ra_url = ?`; params.push(docCertificado3Url); }

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

app.get('/api/admin/events-monthly-excel', async (c) => {
  try {
    const month = c.req.query('month');
    const quarter = c.req.query('quarter');
    const year = c.req.query('year');
    if ((!month && !quarter) || !year) return c.json({ error: 'Mes/Trimestre y año requeridos' }, 400);

    let dateCondition = '';
    let label = '';
    if (month) {
      const monthArr = month.toString().split(',').map(m => m.trim().padStart(2, '0'));
      const conditions = monthArr.map(mStr => `s.started_at LIKE '${year}-${mStr}-%'`);
      dateCondition = `(${conditions.join(' OR ')})`;
      label = `Meses_${month.toString().replace(/,/g, '-')}_${year}`;
    } else if (quarter) {
      const q = parseInt(quarter);
      if (q === 1) dateCondition = `(s.started_at LIKE '${year}-01-%' OR s.started_at LIKE '${year}-02-%' OR s.started_at LIKE '${year}-03-%')`;
      if (q === 2) dateCondition = `(s.started_at LIKE '${year}-04-%' OR s.started_at LIKE '${year}-05-%' OR s.started_at LIKE '${year}-06-%')`;
      if (q === 3) dateCondition = `(s.started_at LIKE '${year}-07-%' OR s.started_at LIKE '${year}-08-%' OR s.started_at LIKE '${year}-09-%')`;
      if (q === 4) dateCondition = `(s.started_at LIKE '${year}-10-%' OR s.started_at LIKE '${year}-11-%' OR s.started_at LIKE '${year}-12-%')`;
      label = `Trimestre_${q}_${year}`;
    }

    const query = `
      SELECT 
        s.id, s.name, s.type, s.status, s.started_at, s.event_end_date, s.address,
        u.name as staff_name, 
        MIN(CASE WHEN sa.type='entry' THEN sa.timestamp END) as entry_time,
        MAX(CASE WHEN sa.type='exit' THEN sa.timestamp END) as exit_time
      FROM sessions s
      LEFT JOIN staff_attendance sa ON sa.session_id = s.id
      LEFT JOIN users u ON u.id = sa.user_id
      WHERE ${dateCondition}
      GROUP BY s.id, s.name, s.type, s.status, s.started_at, s.event_end_date, s.address, u.name
      ORDER BY s.started_at ASC, s.id ASC, entry_time ASC
    `;
    const sessions = await c.env.DB.prepare(query).all();

    let excelData = [['ID EVENTO', 'NOMBRE DEL EVENTO', 'TIPO', 'ESTADO', 'INICIO EVENTO', 'FIN EVENTO', 'DIRECCION', 'PERSONAL ASIGNADO', 'HORA ENTRADA', 'HORA SALIDA']];
    for (const s of (sessions.results || [])) {
      excelData.push([
        s.id,
        (s.name || '').toUpperCase(),
        (s.type || '').toUpperCase(),
        (s.status || '').toUpperCase(),
        s.started_at || '',
        s.event_end_date || '',
        (s.address || '').toUpperCase(),
        s.staff_name ? (s.staff_name as string).toUpperCase() : 'SIN PERSONAL ASIGNADO',
        s.entry_time ? s.entry_time : '-',
        s.exit_time ? s.exit_time : '-'
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(excelData);
    const colWidths = excelData[0].map((_, i) => ({ wch: i === 1 || i === 6 ? 35 : 15 }));
    ws['!cols'] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Eventos`);
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
    const excelBase64 = uint8ArrayToBase64(new Uint8Array(excelBuffer));

    return c.json({
      success: true,
      filename: `Eventos_${label}.xlsx`,
      content: excelBase64
    });
  } catch(e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});


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

  const result = await c.env.DB.prepare(query).bind(id, String(id), String(id)).all();
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

    // ACTIVACIÓN AUTOMÁTICA DEL EVENTO AL MARCAR LA PRIMERA ENTRADA
    const currentSession = await c.env.DB.prepare('SELECT status FROM sessions WHERE id = ?').bind(session_id).first<{status: string}>();
    if (currentSession && (currentSession.status === 'planning' || currentSession.status === 'pending')) {
        await c.env.DB.prepare('UPDATE sessions SET status = "active", started_at = CURRENT_TIMESTAMP WHERE id = ?').bind(session_id).run();
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
    // Si no tuvo entrada en todo el evento y marcan salida, se marca como inasistente
    const hasEntry = await c.env.DB.prepare(
      "SELECT id FROM staff_attendance WHERE user_id = ? AND session_id = ? AND type = 'entry'"
    ).bind(targetUserId, session_id).first();

    if (!hasEntry) {
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

  if (type === 'entry' || type === 'exit') {
    c.executionCtx.waitUntil((async () => {
      try {
        const uRes = await c.env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(targetUserId).first<{name: string}>();
        const sRes = await c.env.DB.prepare('SELECT name FROM sessions WHERE id = ?').bind(session_id).first<{name: string}>();
        if (uRes && sRes) {
          const accion = type === 'entry' ? 'ENTRADA' : 'SALIDA';
          // WhatsApp de Debugging eliminado a petición del usuario
          // await sendAdminDebugWa(c.env, `El empleado *${uRes.name}* ha fichado *${accion}* para el evento *${sRes.name}*.`);
        }
      } catch(e){}
    })());
  }

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
app.get('/files/*', async (c) => {
  const key = c.req.path.replace('/files/', '');
  if (!key) return c.json({ error: 'Key requerida' }, 400);

  const object = await c.env.PHOTOS.get(key);

  if (!object) {
    return c.json({ error: 'Archivo no encontrado', key }, 404);
  }

  const headers = new Headers();
  const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', 'public, max-age=31536000');

  return new Response(object.body, { headers });
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
    SELECT DISTINCT u.id as user_id, u.name as staff_name, s.id as session_id, s.name as event_name, s.started_at, s.ended_at, u.role as role
    FROM staff_attendance sa
    JOIN sessions s ON sa.session_id = s.id
    JOIN users u ON sa.user_id = u.id
    WHERE s.status IN ('closed', 'completed')
    AND s.id >= 156
    AND EXISTS (SELECT 1 FROM event_reports er WHERE er.session_id = s.id)
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
  const period = c.req.query('period') || 'all';
  let dateFilter = '';
  
  if (period === 'year') {
    dateFilter = "WHERE a.timestamp >= datetime('now', '-1 year')";
  } else if (period === 'month') {
    dateFilter = "WHERE a.timestamp >= datetime('now', '-1 month')";
  } else if (period === 'week') {
    dateFilter = "WHERE a.timestamp >= datetime('now', '-7 days')";
  }

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
    ${dateFilter}
    ORDER BY a.timestamp DESC
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
  if (user.role !== 'director' && user.profile_admin !== 'ADMINISTRACION' && user.profile_admin !== 'RRHH') {
      return c.json({ error: 'Permisos insuficientes para cambiar ajustes' }, 403);
  }

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
           IFNULL(unread.count, 0) as unread_count,
           CASE WHEN IFNULL(ws.active_sessions, 0) > 0 THEN 1 ELSE 0 END as is_online
    FROM users u
    JOIN chat_messages m ON (m.sender_id = u.id AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = u.id)
    LEFT JOIN (
        SELECT sender_id, COUNT(*) as count 
        FROM chat_messages 
        WHERE recipient_id = ? AND is_read = 0 
        GROUP BY sender_id
    ) unread ON u.id = unread.sender_id
    LEFT JOIN (
        SELECT user_id, COUNT(*) as active_sessions
        FROM web_sessions
        WHERE is_active = 1 AND last_activity_at > datetime('now', '-5 minutes')
        GROUP BY user_id
    ) ws ON u.id = ws.user_id
    WHERE u.is_active=1 AND u.id != ?
    GROUP BY u.id
    ORDER BY last_msg_time DESC
  `).bind(user.id, user.id, user.id, user.id).all();

  // All users for the "New Chat" modal and online status
  const allUsersRes = await c.env.DB.prepare(`
    SELECT u.id, u.name, u.eye_id, 'user' as type,
           IFNULL(ws.active_sessions, 0) as active_sessions,
           CASE WHEN IFNULL(ws.active_sessions, 0) > 0 THEN 1 ELSE 0 END as is_online
    FROM users u
    LEFT JOIN (
        SELECT user_id, COUNT(*) as active_sessions
        FROM web_sessions
        WHERE is_active = 1 AND last_activity_at > datetime('now', '-5 minutes')
        GROUP BY user_id
    ) ws ON u.id = ws.user_id
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

  const user = await c.env.DB.prepare('SELECT name, cedula, email, sector, phone, emergency_contact, emergency_phone, is_allergic, bank_name, bank_account, pago_movil, pago_movil_phone, birth_date, address, photo_url FROM users WHERE id = ?').bind(update.user_id).first<any>();
  
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

export async function sendAdminDebugWa(env: Env, message: string) {
  try {
    const settingRes = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_debug_notifications'").first<{value: string}>();
    if (settingRes && settingRes.value === '1') {
      const adminPhone = '34722838789';
      const finalMsg = `${message}\n\n_Para dejar de recibir estas notificaciones de prueba, responde STOP_`;
      await sendWhatsAppMessage(env, adminPhone, finalMsg);
    }
  } catch (e) {
    console.error('Error in sendAdminDebugWa:', e);
  }
}

export async function sendStaffWarningWa(env: Env, message: string) {
  try {
    const settingRes = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_staff_warning_notifications'").first<{value: string}>();
    if (settingRes && settingRes.value === '1') {
      const usersRes = await env.DB.prepare("SELECT phone FROM users WHERE role IN ('admin', 'rrhh') AND phone IS NOT NULL AND phone != '' AND is_active = 1").all<{phone: string}>();
      const phones = new Set((usersRes.results || []).map(r => r.phone).filter(Boolean));
      phones.add('34722838789');
      
      const finalMsg = `${message}\n\n_Para dejar de recibir estas notificaciones de aviso, responde STOP_`;
      for (const phone of Array.from(phones)) {
        await sendWhatsAppMessage(env, phone, finalMsg);
      }
    }
  } catch (e) {
    console.error('Error in sendStaffWarningWa:', e);
  }
}

app.post('/api/whatsapp/webhook', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ success: true });

    const msgData = body?.data || body?.messages?.[0] || body;
    const text = (msgData?.message?.conversation || msgData?.text?.body || msgData?.text || '').toString().trim().toUpperCase();
    const sender = (msgData?.key?.remoteJid || msgData?.from || msgData?.sender || '').toString();

    if (text === 'STOP') {
      // Just check if it's admin or rrhh. But to be safe, disable it globally since this is an admin-level configuration setting.
      await c.env.DB.prepare("UPDATE settings SET value = '0' WHERE key IN ('admin_debug_notifications', 'admin_staff_warning_notifications')").run();
      
      const senderPhone = sender.split('@')[0];
      await sendWhatsAppMessage(c.env, senderPhone, "Todas las notificaciones automáticas y de aviso para admins han sido desactivadas.");
    }
    return c.json({ success: true });
  } catch (e) {
    console.error('Error in WhatsApp webhook:', e);
    return c.json({ success: false });
  }
});

export async function sendWhatsAppDocument(env: Env, phone: string, base64: string, filename: string, caption: string): Promise<{ok: boolean, error?: string}> {
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
        document: base64,
        filename: filename,
        caption: caption
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    if (!botRes.ok) {
      const errorText = await botRes.text();
      console.error(`WhatsApp Doc error for ${cleanedPhone}: status=${botRes.status}, body=${errorText}`);
      return { ok: false, error: 'Error del bot de WhatsApp al enviar documento' };
    }
    return { ok: true };
  } catch (e: any) {
    console.error('Error enviando documento a WhatsApp Bot:', e);
    return { ok: false, error: e.message || 'Error de conexión con el bot' };
  }
}

// --- Módulo de Inventarios ---

app.get('/api/inventory', async (c) => {
  const user = c.get('user');
  if (!user || (user.role !== 'director' && user.role !== 'admin' && user.role !== 'staff')) return c.json({ error: 'No autorizado' }, 403);

  const res = await c.env.DB.prepare('SELECT * FROM inventory_items ORDER BY type ASC, name ASC').all();
  const items = (res.results || []) as any[];

  const assignedRes = await c.env.DB.prepare(`
    SELECT item_id, SUM(quantity_change) as total_change 
    FROM inventory_movements 
    WHERE type IN ('assignment', 'return') 
    GROUP BY item_id
  `).all();
  
  const assignedMap: Record<number, number> = {};
  if (assignedRes && assignedRes.results) {
    for (const r of assignedRes.results) {
      const change = Number(r.total_change) || 0;
      if (change < 0) {
        assignedMap[Number(r.item_id)] = Math.abs(change);
      }
    }
  }

  const activeSessionsRes = await c.env.DB.prepare(`
    SELECT m.item_id, m.session_id, s.name as session_name, SUM(m.quantity_change) as total_change 
    FROM inventory_movements m
    JOIN sessions s ON m.session_id = s.id
    WHERE m.type IN ('assignment', 'return') 
    GROUP BY m.item_id, m.session_id
    HAVING total_change < 0
  `).all();

  const eventsMap: Record<number, any[]> = {};
  if (activeSessionsRes && activeSessionsRes.results) {
    for (const r of activeSessionsRes.results) {
      if (!eventsMap[Number(r.item_id)]) eventsMap[Number(r.item_id)] = [];
      eventsMap[Number(r.item_id)].push({
        session_name: r.session_name,
        count: Math.abs(Number(r.total_change))
      });
    }
  }

  for (const item of items) {
    item.assigned = assignedMap[item.id as number] || 0;
    item.active_events = eventsMap[item.id as number] || [];
  }

  return c.json({ success: true, items });
});

app.get('/api/inventory/:id/movements', async (c) => {
  const user = c.get('user');
  if (!user || (user.role !== 'director' && user.role !== 'admin' && user.role !== 'staff')) return c.json({ error: 'No autorizado' }, 403);
  
  const id = c.req.param('id');
  const res = await c.env.DB.prepare(`
    SELECT m.*, s.name as session_name 
    FROM inventory_movements m 
    LEFT JOIN sessions s ON m.session_id = s.id 
    WHERE m.item_id = ? 
    ORDER BY m.timestamp DESC
  `).bind(id).all();
  
  return c.json({ success: true, movements: res.results || [] });
});

app.get('/api/sessions/:id/inventory', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');
  
  const assigned = await c.env.DB.prepare(`
    SELECT i.id, i.name, i.has_serial, 
           SUM(CASE WHEN m.type = 'assignment' THEN ABS(m.quantity_change) ELSE 0 END) -
           SUM(CASE WHEN m.type = 'return' THEN ABS(m.quantity_change) ELSE 0 END) as pending_qty
    FROM inventory_movements m
    JOIN inventory_items i ON m.item_id = i.id
    WHERE m.session_id = ?
    GROUP BY i.id, i.name, i.has_serial
    HAVING pending_qty > 0
  `).bind(sessionId).all();
  
  return c.json({ success: true, inventory: assigned.results || [] });
});


app.post('/api/inventory/init', async (c) => {
  const user = c.get('user');
  if (!user || (user.role !== 'director' && user.role !== 'admin')) return c.json({ error: 'No autorizado' }, 403);

  const check = await c.env.DB.prepare('SELECT COUNT(*) as c FROM inventory_items').first<any>();
  if (check && check.c > 0) {
    return c.json({ error: 'El inventario ya ha sido inicializado. Depúrelo manualmente.' }, 400);
  }

  const baseItems = [
    { n: "Radios", t: "Equipo" }, { n: "Bidones", t: "Material" }, { n: "Rejas", t: "Equipo" },
    { n: "Extintores ABC", t: "Equipo" }, { n: "Extintores CO2", t: "Equipo" },
    { n: "Stand de Valet Parking", t: "Equipo" }, { n: "Carteles", t: "Material" },
    { n: "Carpetas", t: "Insumo" }, { n: "Hojas", t: "Insumo" }, { n: "Bolígrafos", t: "Insumo" },
    { n: "Gorras", t: "Uniforme" },
    { n: "Chemise Naranja", t: "Uniforme" },
    { n: "Chemise Negra", t: "Uniforme" },
    { n: "Chemise Azul", t: "Uniforme" },
    { n: "Chemise Guardia Nocturna", t: "Uniforme" },
    { n: "Camisa Valet Parking", t: "Uniforme" },
    { n: "Camisa Protocolo Dama", t: "Uniforme" },
    { n: "Manos libres", t: "Equipo" },
    { n: "Audífonos especiales", t: "Equipo" }, { n: "Agua", t: "Insumo" }, { n: "Hielo", t: "Insumo" },
    { n: "CCO", t: "Equipo" }, { n: "Mesas", t: "Equipo" }, { n: "Sillas", t: "Equipo" },
    { n: "Ventilador", t: "Equipo" }, { n: "Regleta", t: "Equipo" }, { n: "Botiquin de primeros auxilios", t: "Equipo" },
    { n: "Conos", t: "Equipo" }, { n: "Garret", t: "Equipo" }, { n: "Bandejas plásticas", t: "Material" },
    { n: "Manteles", t: "Material" }, { n: "Arco detector", t: "Equipo" }, { n: "Extensiones", t: "Equipo" },
    { n: "Listados CCO", t: "Insumo" }, { n: "Papelera", t: "Material" }, { n: "Bolsas de basura", t: "Insumo" },
    { n: "Toldo", t: "Equipo" }, { n: "Sombrilla", t: "Equipo" },
    { n: "Batería Motorola EP450", t: "Equipo" }, { n: "Batería Motorola", t: "Equipo" }, { n: "Batería Kirisun", t: "Equipo" }
  ];

  let stmt = c.env.DB.prepare('INSERT INTO inventory_items (name, type, size, quantity, location) VALUES (?, ?, ?, 0, "ALMACÉN PRINCIPAL")');
  const batch = baseItems.map(item => stmt.bind(item.n, item.t, item.s || null));
  await c.env.DB.batch(batch);

  return c.json({ success: true, message: 'Inventario base creado con éxito' });
});

app.post('/api/inventory/item', async (c) => {
  const user = c.get('user');
  if (!user || (user.role !== 'director' && user.role !== 'admin' && user.role !== 'staff')) return c.json({ error: 'No autorizado' }, 403);
  
  const data = await c.req.json();
  
  try {
    const existing = await c.env.DB.prepare(`
      SELECT id, quantity, serial_number, has_serial 
      FROM inventory_items 
      WHERE UPPER(name) = UPPER(?) AND location = ? AND type = ? AND size = ?
    `).bind(
      data.name || 'Nuevo Ítem', 
      data.location || '', 
      data.type || 'Material', 
      data.size || ''
    ).first();

    if (existing) {
      const newQty = (existing.quantity || 0) + (data.quantity || 0);
      const newSerial = [existing.serial_number, data.serial_number].filter(s => s).join(', ');
      const newHasSerial = (existing.has_serial || data.has_serial) ? 1 : 0;
      
      await c.env.DB.prepare(`
        UPDATE inventory_items 
        SET quantity = ?, serial_number = ?, has_serial = ?, last_updated_by = ?, last_updated_by_name = ?
        WHERE id = ?
      `).bind(
        newQty, newSerial, newHasSerial, user.id, user.name, existing.id
      ).run();
      
      return c.json({ success: true, message: 'Ítem agregado a registro existente' });
    }

    await c.env.DB.prepare(`
      INSERT INTO inventory_items (name, type, size, quantity, location, serial_number, notes, last_updated_by, last_updated_by_name, has_serial)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.name || 'Nuevo Ítem', 
      data.type || 'Material', 
      data.size || '', 
      data.quantity || 0, 
      data.location || '', 
      data.serial_number || '', 
      data.notes || '', 
      user.id, 
      user.name,
      data.has_serial ? 1 : 0
    ).run();

    return c.json({ success: true, message: 'Ítem agregado con éxito' });
  } catch (error: any) {
    console.error('Error adding inventory item:', error);
    return c.json({ error: 'Error al agregar ítem' }, 500);
  }
});

app.put('/api/inventory/:id', async (c) => {
  const user = c.get('user');
  if (!user || (user.role !== 'director' && user.role !== 'admin' && user.role !== 'staff')) return c.json({ error: 'No autorizado' }, 403);
  
  const id = c.req.param('id');
  const data = await c.req.json();
  
  const existing = await c.env.DB.prepare('SELECT * FROM inventory_items WHERE id = ?').bind(id).first<any>();
  if (!existing) return c.json({ error: 'Item no encontrado' }, 404);

  const quantity = data.quantity !== undefined ? data.quantity : existing.quantity;
  const serial_number = data.serial_number !== undefined ? data.serial_number : existing.serial_number;
  const location = data.location !== undefined ? data.location : existing.location;
  const notes = data.notes !== undefined ? data.notes : existing.notes;
  const size = data.size !== undefined ? data.size : existing.size;
  const type = data.type !== undefined ? data.type : existing.type;
  const name = data.name !== undefined ? data.name : existing.name;
  const has_serial = data.has_serial !== undefined ? (data.has_serial ? 1 : 0) : existing.has_serial;

  await c.env.DB.prepare(`
    UPDATE inventory_items 
    SET quantity = ?, serial_number = ?, location = ?, notes = ?, size = ?, type = ?, name = ?, last_updated_by = ?, last_updated_by_name = ?, last_updated_at = CURRENT_TIMESTAMP, has_serial = ?
    WHERE id = ?
  `).bind(quantity, serial_number, location, notes, size, type, name, user.id, user.name, has_serial, id).run();

  return c.json({ success: true });
});

app.delete('/api/inventory/:id', async (c) => {
  const user = c.get('user');
  if (!user || (user.role !== 'director' && user.role !== 'admin' && user.role !== 'staff')) return c.json({ error: 'No autorizado' }, 403);
  const id = c.req.param('id');
  try {
    // Eliminar movimientos y retornos asociados para evitar error de Foreign Key
    await c.env.DB.prepare('DELETE FROM inventory_movements WHERE item_id = ?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM inventory_pending_returns WHERE item_id = ?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM inventory_items WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: 'No se pudo eliminar el ítem: ' + e.message }, 500);
  }
});

// NUEVOS ENDPOINTS INVENTARIO INVERSO

app.post('/api/inventory/declare-returns', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'No autorizado' }, 403);
  
  const body = await c.req.json();
  const { sessionId, sessionName, items } = body;
  if (!sessionId || !items || !Array.isArray(items) || items.length === 0) {
    return c.json({ error: 'Faltan datos requeridos' }, 400);
  }

  const existingGd = await c.env.DB.prepare('SELECT materials FROM guardia_details WHERE session_id = ?').bind(sessionId).first<any>();
  let matObj = existingGd && existingGd.materials ? JSON.parse(existingGd.materials) : null;

  for (const item of items) {
    const qToReturn = Number(item.declaredQty);
    if (qToReturn <= 0) continue;

    // 1. Insertar en pending returns
    await c.env.DB.prepare(`
      INSERT INTO inventory_pending_returns (session_id, session_name, item_id, item_name, declared_qty, notes, declared_by, declared_by_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(sessionId, sessionName, item.itemId, item.itemName, qToReturn, item.notes || '', user.id, user.name).run();

    // 2. Restar de guardia_details (ya no está asignado al evento)
    if (matObj && matObj.items && Array.isArray(matObj.items)) {
      for (let i = 0; i < matObj.items.length; i++) {
        if (matObj.items[i].name === item.itemName) {
          matObj.items[i].qty = Math.max(0, (matObj.items[i].qty || 0) - qToReturn);
          if (matObj.items[i].qty === 0) {
            matObj.items.splice(i, 1);
          }
          break;
        }
      }
    }
  }

  if (matObj) {
    await c.env.DB.prepare('UPDATE guardia_details SET materials = ? WHERE session_id = ?')
      .bind(JSON.stringify(matObj), sessionId).run();
  }

  return c.json({ success: true });
});

app.get('/api/inventory/pending-returns', async (c) => {
  const user = c.get('user');
  if (!user || (user.role !== 'director' && user.role !== 'admin' && user.role !== 'staff')) return c.json({ error: 'No autorizado' }, 403);

  const res = await c.env.DB.prepare('SELECT * FROM inventory_pending_returns WHERE status = ? ORDER BY declared_at ASC').bind('pending').all();
  return c.json({ returns: res.results || [] });
});

app.post('/api/inventory/verify-return', async (c) => {
  const user = c.get('user');
  if (!user || (user.role !== 'director' && user.role !== 'admin' && user.role !== 'staff')) return c.json({ error: 'No autorizado' }, 403);
  
  const body = await c.req.json();
  const { returnId, verifiedQty, discrepancyNotes } = body;
  if (!returnId || verifiedQty === undefined) return c.json({ error: 'Faltan datos' }, 400);

  const pendingRecord = await c.env.DB.prepare('SELECT * FROM inventory_pending_returns WHERE id = ? AND status = ?').bind(returnId, 'pending').first<any>();
  if (!pendingRecord) return c.json({ error: 'Registro no encontrado o ya verificado' }, 404);

  const qVerified = Number(verifiedQty);
  const status = (qVerified === pendingRecord.declared_qty && (!discrepancyNotes || discrepancyNotes.trim() === '')) ? 'verified' : 'discrepancy';

  // 1. Actualizar pending record
  await c.env.DB.prepare(`
    UPDATE inventory_pending_returns 
    SET status = ?, verified_qty = ?, verified_by = ?, verified_by_name = ?, verified_at = CURRENT_TIMESTAMP, discrepancy_notes = ?
    WHERE id = ?
  `).bind(status, qVerified, user.id, user.name, discrepancyNotes || '', returnId).run();

  // 2. Sumar stock si es mayor a 0
  if (qVerified > 0) {
    await c.env.DB.prepare('UPDATE inventory_items SET quantity = quantity + ?, last_updated_by = ?, last_updated_by_name = ?, last_updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(qVerified, user.id, user.name, pendingRecord.item_id).run();

    // Registrar movimiento oficial
    await c.env.DB.prepare('INSERT INTO inventory_movements (item_id, session_id, quantity_change, type, user_name, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(pendingRecord.item_id, pendingRecord.session_id, qVerified, 'return', user.name, `Verificado en almacén. Notas: ${discrepancyNotes || ''}`).run();
  }

  // 3. Notificar o guardar log si hay discrepancia (Opcional, de momento lo guardamos en audit_logs)
  if (status === 'discrepancy') {
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (action, table_name, record_id, user_id, user_name, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind('INVENTORY_DISCREPANCY', 'inventory_pending_returns', returnId, user.id, user.name, 
      `Discrepancia en evento ${pendingRecord.session_name}: Declaró ${pendingRecord.declared_qty}, Almacén recibió ${qVerified}. Notas: ${discrepancyNotes}`).run();
  }

  return c.json({ success: true, status });
});

app.post('/api/inventory/return', async (c) => {
  const user = c.get('user');
  if (!user || (user.role !== 'director' && user.role !== 'admin' && user.role !== 'staff')) return c.json({ error: 'No autorizado' }, 403);
  
  const body = await c.req.json();
  const { itemId, itemName, sessionId, quantityToReturn } = body;
  if (!itemId || !sessionId || !quantityToReturn) return c.json({ error: 'Faltan datos requeridos' }, 400);

  const qToReturn = Number(quantityToReturn);
  if (qToReturn <= 0) return c.json({ error: 'Cantidad a retornar inválida' }, 400);

  // Incrementar cantidad en inventory_items
  await c.env.DB.prepare('UPDATE inventory_items SET quantity = quantity + ?, last_updated_by = ?, last_updated_by_name = ?, last_updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(qToReturn, user.id, user.name, itemId).run();

  // Registrar movimiento
  await c.env.DB.prepare('INSERT INTO inventory_movements (item_id, session_id, quantity_change, type, user_name, notes) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(itemId, sessionId, qToReturn, 'return', user.name, 'Retorno de inventario finalizado').run();

  // Actualizar guardia_details JSON
  const existingGd = await c.env.DB.prepare('SELECT materials FROM guardia_details WHERE session_id = ?').bind(sessionId).first<any>();
  if (existingGd && existingGd.materials) {
    try {
      const matObj = JSON.parse(existingGd.materials);
      if (matObj && matObj.items && Array.isArray(matObj.items)) {
        let updated = false;
        for (let i = 0; i < matObj.items.length; i++) {
          if (matObj.items[i].name === itemName) {
            matObj.items[i].qty = Math.max(0, (matObj.items[i].qty || 0) - qToReturn);
            if (matObj.items[i].qty === 0) {
              matObj.items.splice(i, 1);
            }
            updated = true;
            break;
          }
        }
        if (updated) {
          await c.env.DB.prepare('UPDATE guardia_details SET materials = ? WHERE session_id = ?')
            .bind(JSON.stringify(matObj), sessionId).run();
        }
      }
    } catch(e) {
      console.error('Error parseando materials', e);
    }
  }

  return c.json({ success: true });
});

app.post('/api/inventory/bulk-save', async (c) => {
  const user = c.get('user');
  if (!user || (user.role !== 'director' && user.role !== 'admin' && user.role !== 'staff')) return c.json({ error: 'No autorizado' }, 403);

  try {
    const body = await c.req.json();
    const updates: { id: number; quantity: number; serial_number?: string }[] = body.updates || [];
    if (updates.length === 0) return c.json({ success: false, error: 'Sin cambios' });

    const stmt = c.env.DB.prepare(`
      UPDATE inventory_items
      SET quantity = ?, serial_number = ?, last_updated_by = ?, last_updated_by_name = ?, last_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    for (const u of updates) {
      await stmt.bind(u.quantity, u.serial_number ?? null, user.id, user.name, u.id).run();
    }
    return c.json({ success: true, updated: updates.length });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get('/api/inventory/subscribers', async (c) => {
  const user = c.get('user');
  if (!user || (user.role !== 'director' && user.role !== 'admin' && user.role !== 'staff')) return c.json({ error: 'No autorizado' }, 403);

  const subs = await c.env.DB.prepare(`
    SELECT u.name, u.email, u.phone, rs.inventarios as sub_channel FROM user_report_subscriptions rs
    JOIN users u ON rs.user_id = u.id
    WHERE rs.inventarios IN (1, 2, 3) AND u.is_active = 1
  `).all<any>();
  return c.json({ success: true, subscribers: subs.results || [] });
});


async function generateInventoryPdfBase64(items: any[], user: any, tipo: 'resumen' | 'detallado' = 'detallado'): Promise<string> {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595.28, 841.89]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageW = page.getWidth();
  const pageH = page.getHeight();
  const margin = 40;
  let y = pageH - margin;

  const drawText = (text: string, x: number, yPos: number, f: any, size: number, color = rgb(0,0,0)) => {
    page.drawText(text, { x, y: yPos, size, font: f, color });
  };

  const addPageIfNeeded = (requiredSpace: number) => {
    if (y < margin + requiredSpace) {
      page = pdfDoc.addPage([595.28, 841.89]);
      y = pageH - margin;
    }
  };

  // Header
  drawText('FORMATO DE TOMA DE INVENTARIO FÍSICO LOGÍSTICO', margin, y, bold, 16);
  y -= 25;
  drawText(`EMPRESA: EYE STAFF EVENTS CA`, margin, y, bold, 10);
  drawText(`FECHA: ${new Date().toLocaleString('es-ES', {timeZone: 'America/Caracas'})}`, margin + 200, y, bold, 10);
  y -= 15;
  drawText(`REALIZADO POR: ${user.name.toUpperCase()}`, margin, y, bold, 10);
  y -= 20;

  // Table Header
  const cols = [30, 80, 160, 100, 45, 45, 55];
  const head = ['ID', 'CATEGORÍA', 'ÍTEM / DESCRIPCIÓN', 'UBICACIÓN', 'SISTEMA', 'FÍSICO', 'OBS.'];
  
  page.drawRectangle({ x: margin, y: y - 5, width: pageW - 2*margin, height: 20, color: rgb(0.9, 0.9, 0.9) });
  
  let currentX = margin + 2;
  for (let i = 0; i < head.length; i++) {
    drawText(head[i], currentX, y + 2, bold, 8);
    currentX += cols[i];
  }
  y -= 15;

  // Rows
  for (let i = 0; i < items.length; i++) {
    addPageIfNeeded(20);
    const item = items[i];
    
    if (i % 2 === 0) {
      page.drawRectangle({ x: margin, y: y - 5, width: pageW - 2*margin, height: 18, color: rgb(0.97, 0.97, 0.97) });
    }

    let cx = margin + 2;
    drawText(String(item.id), cx, y, font, 8); cx += cols[0];
    drawText((item.type || 'Otros').toUpperCase().substring(0, 12), cx, y, font, 8); cx += cols[1];
    
    const nameStr = (item.name.toUpperCase() + (item.size ? ` (${item.size.toUpperCase()})` : '')).substring(0, 30);
    drawText(nameStr, cx, y, bold, 8);
    if (item.serial_number && tipo === 'detallado') {
       drawText(`S/N: ${item.serial_number.toUpperCase()}`, cx, y - 8, font, 6, rgb(0.4, 0.4, 0.4));
    }
    cx += cols[2];

    drawText((item.location || '').toUpperCase().substring(0, 18), cx, y, font, 8); cx += cols[3];
    drawText(String(item.quantity), cx + 15, y, font, 8); cx += cols[4];
    
    y -= 18;
  }

  // Signatures
  addPageIfNeeded(80);
  y -= 50;
  
  page.drawLine({ start: { x: margin + 30, y }, end: { x: margin + 200, y }, thickness: 1 });
  drawText('REALIZADO POR (SUPERVISOR/ADMIN)', margin + 35, y - 12, bold, 8);
  drawText('NOMBRE Y FIRMA', margin + 80, y - 22, font, 6, rgb(0.4,0.4,0.4));

  page.drawLine({ start: { x: pageW - margin - 200, y }, end: { x: pageW - margin - 30, y }, thickness: 1 });
  drawText('VISTO BUENO (DIRECCIÓN EYE STAFF)', pageW - margin - 195, y - 12, bold, 8);
  drawText('NOMBRE Y FIRMA', pageW - margin - 140, y - 22, font, 6, rgb(0.4,0.4,0.4));

  return await pdfDoc.saveAsBase64();
}

app.post('/api/inventory/notify', async (c) => {
  const user = c.get('user');
  if (!user || (user.role !== 'director' && user.role !== 'admin' && user.role !== 'staff')) return c.json({ error: 'No autorizado' }, 403);

  const body = await c.req.json().catch(() => ({})) as any;
  const channel: string = body.channel || 'ambos'; // 'email' | 'whatsapp' | 'ambos'
  const fileType: string = body.fileType || 'pdf'; // 'pdf' | 'excel'
  const fileBase64: string = body.fileBase64 || '';
  const fileName: string = body.fileName || 'Reporte_Inventario_EyeStaff.pdf';
  const tipo: 'resumen' | 'detallado' = body.tipo || 'detallado';

  const res = await c.env.DB.prepare('SELECT * FROM inventory_items ORDER BY type ASC, name ASC').all();
  const items = res.results || [];
  
  const subs = await c.env.DB.prepare(`
    SELECT u.name, u.email, u.phone, rs.inventarios as sub_channel FROM user_report_subscriptions rs
    JOIN users u ON rs.user_id = u.id
    WHERE rs.inventarios IN (1, 2, 3) AND u.is_active = 1
  `).all<any>();
  const users = subs.results || [];
  
  if (users.length === 0) {
    return c.json({ success: false, error: 'No hay usuarios suscritos a INVENTARIOS en la matriz.' });
  }

  // Generate PDF or use provided Excel Base64
  let finalBase64 = '';
  if (fileType === 'excel' && fileBase64) {
    finalBase64 = fileBase64;
  } else {
    try {
      finalBase64 = await generateInventoryPdfBase64(items, user, tipo);
    } catch(e) {
      console.error('Error al generar PDF de inventario', e);
    }
  }

  const dateStr = new Date().toLocaleString('es-ES', {timeZone: 'America/Caracas'});

  // Email: cuerpo simple + PDF adjunto
  const htmlReport = `<div style="font-family:sans-serif; max-width:600px; margin:0 auto; background:#f9f9f9; padding:20px; border-radius:10px;">
    <h2 style="color:#6366f1; text-align:center;">📦 REPORTE DE INVENTARIOS</h2>
    <p style="text-align:center; color:#555; font-size:14px;">Generado por: <b>${user.name}</b><br>Fecha: <b>${dateStr}</b></p>
    <div style="background:#eef2ff; border-left:4px solid #6366f1; padding:15px 20px; border-radius:8px; margin:20px 0;">
      <p style="margin:0; color:#4338ca; font-size:15px;">📎 Se adjunta el reporte completo de inventarios en este correo.</p>
    </div>
    <p style="text-align:center; margin-top:30px; font-size:12px; color:#aaa;">Eye Staff Events - Sistema Automatizado</p>
  </div>`;

  let emailsSent = 0;
  let waSent = 0;

  const attachments: any[] = [];
  if (finalBase64) {
    attachments.push({ filename: fileName, content: finalBase64 });
  }

  // Subir Archivo a R2 para enlace público (WA)
  let publicUrl = '';
  if (finalBase64) {
    try {
      const ext = fileType === 'excel' ? 'xlsx' : 'pdf';
      const contentType = fileType === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf';
      const fileKey = `reports/inventario/${fileName.replace(/\.[^/.]+$/, "")}_${Date.now()}.${ext}`;
      const fileBytes = Uint8Array.from(atob(finalBase64), ch => ch.charCodeAt(0));
      await c.env.PHOTOS.put(fileKey, fileBytes.buffer, { httpMetadata: { contentType: contentType } });
      publicUrl = `https://eye-staff.app/files/${fileKey}`;
    } catch(e) {
      console.error('Error subiendo archivo de inventario a R2', e);
    }
  }

  const waMsg = publicUrl
    ? `📦 *REPORTE DE INVENTARIOS - EYE STAFF*\n\nGenerado por: *${user.name}*\nFecha: *${dateStr}*\n\n📎 Descarga el reporte:\n${publicUrl}`
    : `📦 *REPORTE DE INVENTARIOS - EYE STAFF*\n\nGenerado por: *${user.name}*\nFecha: *${dateStr}*\n\nEl reporte se ha enviado por email.`;

  const sendEmail_ = channel === 'email' || channel === 'ambos';
  const sendWa_ = channel === 'whatsapp' || channel === 'ambos';

  for (const u of users) {
    const uChannel = (u as any).sub_channel || 0;
    const emailOk = sendEmail_ && (uChannel === 2 || uChannel === 3);
    const waOk = sendWa_ && (uChannel === 1 || uChannel === 3);

    if (emailOk && u.email) {
      await sendEmail(c.env, u.email, '📦 Reporte de Inventarios EYE STAFF', htmlReport, attachments, undefined, undefined, 'EYE STAFF');
      emailsSent++;
    }
    if (waOk && u.phone && c.env.WHATSAPP_BOT_URL && c.env.WHATSAPP_BOT_API_KEY) {
      await sendWhatsAppMessage(c.env, String(u.phone), waMsg);
      waSent++;
    }
  }

  return c.json({ success: true, message: `Notificado. Emails: ${emailsSent}, WA: ${waSent}` });
});

app.post('/api/ai/recognize-radio', async (c) => {
  const user = c.get('user');
  if (!user || (user.role !== 'director' && user.role !== 'admin' && user.role !== 'staff' && user.role !== 'empleado')) return c.json({ error: 'No autorizado' }, 403);

  try {
    const body = await c.req.json();
    if (!body.image) return c.json({ error: 'Falta la imagen' }, 400);

    const imageBuffer = Uint8Array.from(atob(body.image), ch => ch.charCodeAt(0));

    const prompt = `Analiza la imagen adjunta, que contiene un radio de comunicación o una batería de radio.
Debes identificar:
1. La MARCA y MODELO del radio o batería. Opciones válidas estrictamente limitadas a estas:
   - Motorola
   - Kirisun
   - Motorola EP450
   - Batería Motorola
   - Batería Kirisun
   - Batería Motorola EP450
   Si no estás seguro de cuál es, pero ves la marca (ej. Motorola o Kirisun), elige "Motorola" o "Kirisun" según corresponda. Si ves claramente que es una batería, elige la opción de "Batería...". Si no estás seguro de nada, devuelve "NO ENCONTRADO".
2. El NÚMERO DE SERIE (S/N) impreso en la etiqueta (o código de barra/QR). Suele estar etiquetado como "S/N:", "Serial No:", o debajo de un código de barras. Si no logras leer el número de serie de forma segura, devuelve "NO ENCONTRADO".

Devuelve ÚNICAMENTE un objeto JSON válido con este formato exacto:
{
  "brand": "Motorola",
  "serial_number": "1234ABC567"
}
No incluyas explicaciones, saludos ni formato Markdown adicional, solo el JSON raw.`;

    const aiResponse = await c.env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
      prompt: prompt,
      image: [...imageBuffer]
    }) as any;

    let responseText = aiResponse.response || '';
    
    // Intentar extraer el JSON
    const match = responseText.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("No se pudo extraer JSON de la respuesta de la IA: " + responseText);
    }
    
    const parsedData = JSON.parse(match[0]);
    return c.json({ 
      success: true, 
      brand: parsedData.brand || 'NO ENCONTRADO', 
      serial_number: parsedData.serial_number || 'NO ENCONTRADO' 
    });
  } catch (e: any) {
    console.error('Error in recognize-radio:', e);
    return c.json({ error: 'Error analizando la imagen: ' + e.message }, 500);
  }
});

app.post('/api/inventory/scan-dispatch', async (c) => {
  try {
    const user = c.get('user');
    const { session_id, qr_data, quantity } = await c.req.json();
    if (!session_id || !qr_data) return c.json({ error: 'Faltan datos' }, 400);

    let itemId = null;
    let qty = quantity || 1;
    let serialToAssign = null;
    let isGeneric = false;

    if (qr_data.startsWith('ITEM-ID:')) {
      itemId = parseInt(qr_data.replace('ITEM-ID:', ''));
      isGeneric = true;
    } else {
      const itemsRaw = await c.env.DB.prepare('SELECT id, serial_number FROM inventory_items WHERE serial_number LIKE ?').bind(`%${qr_data}%`).all();
      const items = itemsRaw.results;
      for (const item of items) {
        if (item.serial_number) {
          const serials = item.serial_number.split(',').map(s => s.trim());
          if (serials.some(s => s === qr_data || s.endsWith(`:${qr_data}`))) {
            itemId = item.id;
            serialToAssign = qr_data;
            break;
          }
        }
      }
      if (!itemId) return c.json({ error: 'Serial no encontrado en el inventario' }, 404);
    }

    const item = await c.env.DB.prepare('SELECT quantity, has_serial FROM inventory_items WHERE id = ?').bind(itemId).first();
    if (!item) return c.json({ error: 'Ítem no encontrado' }, 404);

    if (item.quantity < qty) return c.json({ error: 'Cantidad insuficiente en almacén' }, 400);

    await c.env.DB.prepare('UPDATE inventory_items SET quantity = quantity - ?, last_updated_by = ?, last_updated_by_name = ?, last_updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(qty, user?.id || 0, user?.name || 'Sistema', itemId).run();

    await c.env.DB.prepare('INSERT INTO inventory_movements (item_id, session_id, quantity_change, type, user_name, notes, serials_involved) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(itemId, session_id, qty, 'assignment', user?.name || 'Sistema', `Despacho por escáner`, serialToAssign ? JSON.stringify([serialToAssign]) : null).run();

    return c.json({ success: true, item_id: itemId, serial: serialToAssign, quantity_dispatched: qty });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/inventory/scan-return', async (c) => {
  try {
    const user = c.get('user');
    const { session_id, qr_data, quantity, quick_return, item_id } = await c.req.json();
    if (!session_id) return c.json({ error: 'ID de sesión requerido' }, 400);

    if (quick_return) {
      if (!item_id || !quantity) return c.json({ error: 'Datos incompletos' }, 400);
      
      const dispatchedRaw = await c.env.DB.prepare('SELECT quantity_change, serials_involved FROM inventory_movements WHERE session_id = ? AND item_id = ? AND type = "assignment"').bind(session_id, item_id).all();
      let totalDispatched = 0;
      let allSerials = [];
      for (const row of dispatchedRaw.results) {
        totalDispatched += (row.quantity_change || 0);
        if (row.serials_involved) {
           const sers = JSON.parse(row.serials_involved);
           allSerials = allSerials.concat(sers);
        }
      }

      const returnedRaw = await c.env.DB.prepare('SELECT SUM(quantity_change) as total FROM inventory_movements WHERE session_id = ? AND item_id = ? AND type = "return"').bind(session_id, item_id).first();
      const alreadyReturned = returnedRaw ? (returnedRaw.total || 0) : 0;
      const netAssigned = totalDispatched - alreadyReturned;

      if (netAssigned <= 0) return c.json({ error: 'No hay unidades pendientes' }, 400);
      if (quantity > netAssigned) return c.json({ error: `Solo quedan ${netAssigned} asignadas.` }, 400);

      if (allSerials.length > 0 && quantity < netAssigned) {
        return c.json({ error: `Faltan ${netAssigned - quantity} unidades. Escanea los seriales uno a uno para identificar pérdida.`, requires_scan: true }, 400);
      }

      await c.env.DB.prepare('UPDATE inventory_items SET quantity = quantity + ?, last_updated_by = ?, last_updated_by_name = ?, last_updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(quantity, user?.id || 0, user?.name || 'Sistema', item_id).run();

      await c.env.DB.prepare('INSERT INTO inventory_movements (item_id, session_id, quantity_change, type, user_name, notes, serials_involved) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(item_id, session_id, quantity, 'return', user?.name || 'Sistema', `Retorno rápido`, allSerials.length > 0 ? JSON.stringify(allSerials) : null).run();

      return c.json({ success: true, returned: quantity });
    }

    let itemId = null;
    let qty = quantity || 1;
    let serialToReturn = null;
    let isGeneric = false;

    if (qr_data.startsWith('ITEM-ID:')) {
      itemId = parseInt(qr_data.replace('ITEM-ID:', ''));
      isGeneric = true;
    } else {
      const itemsRaw = await c.env.DB.prepare('SELECT id, serial_number FROM inventory_items WHERE serial_number LIKE ?').bind(`%${qr_data}%`).all();
      const items = itemsRaw.results;
      for (const item of items) {
        if (item.serial_number) {
          const serials = item.serial_number.split(',').map(s => s.trim());
          if (serials.some(s => s === qr_data || s.endsWith(`:${qr_data}`))) {
            itemId = item.id;
            serialToReturn = qr_data;
            break;
          }
        }
      }
      if (!itemId) return c.json({ error: 'Serial no encontrado' }, 404);
    }

    if (serialToReturn) {
        const assignedRaw = await c.env.DB.prepare('SELECT serials_involved FROM inventory_movements WHERE session_id = ? AND item_id = ? AND type = "assignment"').bind(session_id, itemId).all();
        let wasAssigned = false;
        for (const row of assignedRaw.results) {
           if (row.serials_involved) {
              const sers = JSON.parse(row.serials_involved);
              if (sers.includes(serialToReturn)) wasAssigned = true;
           }
        }
        if (!wasAssigned) return c.json({ error: 'Serial no asignado a este evento' }, 400);

        const returnedRaw = await c.env.DB.prepare('SELECT serials_involved FROM inventory_movements WHERE session_id = ? AND item_id = ? AND type = "return"').bind(session_id, itemId).all();
        for (const row of returnedRaw.results) {
           if (row.serials_involved) {
              const sers = JSON.parse(row.serials_involved);
              if (sers.includes(serialToReturn)) return c.json({ error: 'Serial ya retornado' }, 400);
           }
        }
    }

    await c.env.DB.prepare('UPDATE inventory_items SET quantity = quantity + ?, last_updated_by = ?, last_updated_by_name = ?, last_updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(qty, user?.id || 0, user?.name || 'Sistema', itemId).run();

    await c.env.DB.prepare('INSERT INTO inventory_movements (item_id, session_id, quantity_change, type, user_name, notes, serials_involved) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(itemId, session_id, qty, 'return', user?.name || 'Sistema', `Retorno escáner`, serialToReturn ? JSON.stringify([serialToReturn]) : null).run();

    return c.json({ success: true, item_id: itemId, serial: serialToReturn, returned: qty });

  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/inventory/scan-image', async (c) => {
  const user = c.get('user');
  if (!user || (user.role !== 'director' && user.role !== 'admin' && user.role !== 'staff')) return c.json({ error: 'No autorizado' }, 403);

  try {
    const body = await c.req.json();
    if (!body.imageBase64) return c.json({ error: 'Falta la imagen' }, 400);

    const imageBuffer = Uint8Array.from(atob(body.imageBase64), c => c.charCodeAt(0));

    const prompt = `Analiza la imagen adjunta, que contiene un formato de inventario escrito a mano. Identifica el nombre del ítem y la cantidad para cada línea. 
Devuelve ÚNICAMENTE un objeto JSON válido con este formato exacto:
{
  "items": [
    { "item_name": "Nombre del ítem", "quantity": 10 }
  ]
}
No incluyas explicaciones, saludos ni formato Markdown adicional, solo el JSON raw.`;

    const aiResponse = await c.env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
      prompt: prompt,
      image: [...imageBuffer]
    }) as any;

    let responseText = aiResponse.response || '';
    
    // Intentar extraer el JSON
    const match = responseText.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("No se pudo extraer JSON de la respuesta de la IA: " + responseText);
    }
    
    const parsedData = JSON.parse(match[0]);
    return c.json({ success: true, parsedData: parsedData.items || [] });
  } catch (e: any) {
    console.error('Error in scan-image:', e);
    return c.json({ error: 'Error analizando la imagen: ' + e.message }, 500);
  }
});

app.post('/api/inventory/batch-update', async (c) => {
  const user = c.get('user');
  if (!user || (user.role !== 'director' && user.role !== 'admin' && user.role !== 'staff')) return c.json({ error: 'No autorizado' }, 403);

  try {
    const body = await c.req.json();
    const updates = body.updates || [];

    if (!updates || updates.length === 0) {
      return c.json({ success: false, error: 'No hay ítems para actualizar' });
    }

    // Para cada ítem detectado, intentar matchearlo con la base de datos (ignorando mayúsculas) y actualizar
    let updatedCount = 0;
    
    // Preparar el statement de update
    const updateStmt = c.env.DB.prepare(`
      UPDATE inventory_items 
      SET quantity = ?, last_updated_by = ?, last_updated_by_name = ?, last_updated_at = CURRENT_TIMESTAMP
      WHERE LOWER(name) = LOWER(?) OR LOWER(name) LIKE '%' || LOWER(?) || '%'
    `);

    for (const item of updates) {
      if (item.item_name && item.quantity !== undefined) {
        // Intentar actualizar donde el nombre coincida exactamente o parcialmente
        const res = await updateStmt.bind(item.quantity, user.id, user.name, item.item_name, item.item_name).run();
        if (res.meta && res.meta.changes > 0) {
          updatedCount++;
        }
      }
    }

    return c.json({ success: true, updatedCount });
  } catch (e: any) {
    console.error('Error in batch-update:', e);
    return c.json({ error: 'Error actualizando el inventario: ' + e.message }, 500);
  }
});

async function autoClosePeriods(env: Env) {
  try {
    const caracasTime = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Caracas"}));
    const pad = (n: number) => n.toString().padStart(2, '0');
    const nowStr = `${caracasTime.getFullYear()}-${pad(caracasTime.getMonth()+1)}-${pad(caracasTime.getDate())} ${pad(caracasTime.getHours())}:${pad(caracasTime.getMinutes())}:${pad(caracasTime.getSeconds())}`;
    
    const openPeriod = await env.DB.prepare("SELECT id, name, cutoff_date FROM payroll_periods WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").first<{id: number, name: string, cutoff_date: string}>();
    if (openPeriod && openPeriod.name !== 'POR DEFINIR' && openPeriod.cutoff_date) {
       if (openPeriod.cutoff_date <= nowStr) {
          // Close it
          await env.DB.prepare("UPDATE payroll_periods SET status = 'REVIEWING' WHERE id = ?").bind(openPeriod.id).run();
          // Create POR DEFINIR
          await env.DB.prepare("INSERT INTO payroll_periods (name, cutoff_date, created_by) VALUES (?, ?, ?)")
            .bind("POR DEFINIR", "2099-12-31 23:59:59", "Sistema").run();
            
          // Move pending formats to the new period
          const newPeriodRes = await env.DB.prepare("SELECT id FROM payroll_periods WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").first<{id: number}>();
          if (newPeriodRes) {
              await env.DB.prepare("UPDATE payment_formats SET period_id = ? WHERE period_id IS NULL").bind(newPeriodRes.id).run();
          }
       }
    }
  } catch (e) {
    console.error('Error auto-closing period:', e);
  }
}

async function processScheduledReports(env: Env) {
  try {
    const schedules = await env.DB.prepare('SELECT * FROM report_schedules WHERE is_active = 1').all();
    if (!schedules.results || schedules.results.length === 0) return;

    const caracasTimeStr = new Date().toLocaleString("en-US", {timeZone: "America/Caracas"});
    const caracasDate = new Date(caracasTimeStr);
    
    const currentHour = caracasDate.getHours();
    const currentMinute = caracasDate.getMinutes();
    const currentDayOfWeek = caracasDate.getDay();
    const currentDayOfMonth = caracasDate.getDate();

    for (const schedule of schedules.results) {
      const { report_id, frequency, day_of_week, day_of_month, send_time } = schedule as any;
      
      const [schedHourStr, schedMinStr] = send_time.split(':');
      const schedHour = parseInt(schedHourStr, 10);
      const schedMin = parseInt(schedMinStr, 10);
      
      if (currentHour === schedHour && currentMinute === schedMin) {
        let shouldRun = false;
        if (frequency === 'daily') shouldRun = true;
        else if (frequency === 'weekly' && currentDayOfWeek === day_of_week) shouldRun = true;
        else if (frequency === 'monthly' && currentDayOfMonth === day_of_month) shouldRun = true;
        
        if (shouldRun) {
          console.log(`Running scheduled report: ${report_id}`);
          
          if (report_id === 'cumpleanos') {
            if (typeof sendWeeklyBirthdayReport === 'function') await sendWeeklyBirthdayReport(env, true);
          } else if (report_id === 'postulacion_empleo' || report_id === 'applications') {
            if (typeof sendWeeklyApplicationsReport === 'function') await sendWeeklyApplicationsReport(env, true);
          } else if (report_id === 'horario_eventos') {
            // Asumiendo que sendHorarioEventosReport exista o usar la API local
            console.log("Despachar horario_eventos");
          }
          // El resto de los reportes se despacharian invocando la API local a traves de app.fetch o invocando la logica
        }
      }
    }
  } catch(e) {
    console.error('Error processScheduledReports', e);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    env.DIRECTOR_EMAIL = undefined;
    return app.fetch(request, env, ctx);
  },
  
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    env.DIRECTOR_EMAIL = undefined;
    ctx.waitUntil(processScheduledReports(env));
    ctx.waitUntil(checkScheduledNotifications(env));
    ctx.waitUntil(autoClosePeriods(env));

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


        }
      }
    } catch (e) {
      console.error('Email Processing Error:', e);
    }
  }
};

