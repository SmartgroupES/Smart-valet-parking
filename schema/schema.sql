-- Tabla de usuarios (drivers, supervisors, directors)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('driver','supervisor','director','logistics')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de vehículos
CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plate TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  color TEXT,
  status TEXT NOT NULL CHECK(status IN ('pre-registered','checkin','parked','requested','delivering','delivered','pending_retrieval','retrieved')),
  ticket_code TEXT UNIQUE,
  owner_name TEXT,
  owner_phone TEXT,
  owner_id_ref TEXT,
  parking_spot TEXT,
  damage_notes TEXT,
  fee_amount REAL,
  fee_paid INTEGER DEFAULT 0,
  payment_method TEXT,
  valet_in TEXT,
  valet_out TEXT,
  check_in_at TEXT DEFAULT CURRENT_TIMESTAMP,
  check_out_at TEXT,
  session_id INTEGER,
  daily_seq INTEGER,
  retrieval_token TEXT,
  auth_token_1 TEXT,
  auth_token_2 TEXT,
  vehicle_type TEXT DEFAULT 'car',
  conformity_signed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);

-- Eventos (movimientos del vehículo)
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('checkin','parked','requested','delivering','delivered')),
  key_hook TEXT,
  slot_id INTEGER,
  ts TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(vehicle_id) REFERENCES vehicles(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Fotos del check-in
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
);

-- Slots de estacionamiento
CREATE TABLE IF NOT EXISTS slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone TEXT NOT NULL,
  number INTEGER NOT NULL,
  is_free INTEGER DEFAULT 1
);

-- Mensajes del chat cliente-supervisor
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL,
  from_role TEXT NOT NULL,
  to_role TEXT NOT NULL,
  text TEXT NOT NULL,
  ts TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
);

-- Métricas del evento
CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL,
  avg_time INTEGER,
  alerts_count INTEGER DEFAULT 0,
  FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
);

-- Reservas
CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  confirm_code TEXT NOT NULL UNIQUE,
  owner_name TEXT NOT NULL,
  owner_phone TEXT NOT NULL,
  plate TEXT,
  brand TEXT,
  model TEXT,
  expected_arrival TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'arrived', 'cancelled')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de sesiones (Eventos)
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'planning' CHECK(status IN ('planning', 'active', 'closed')),
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  type TEXT DEFAULT 'valet',
  client TEXT,
  phone TEXT,
  address TEXT
);

-- Tabla de ajustes
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Tabla de turnos (shifts)
CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  start_at TEXT DEFAULT CURRENT_TIMESTAMP,
  end_at TEXT,
  total_minutes INTEGER,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Tabla de suscripciones Push
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id INTEGER PRIMARY KEY,
  endpoint TEXT NOT NULL,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Tabla de Módulos (para permisos dinámicos)
CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('Servicios', 'Operaciones')),
  is_active INTEGER DEFAULT 1
);

-- Tabla de Permisos por Rol
CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL,
  module_id TEXT NOT NULL,
  can_view INTEGER DEFAULT 1,
  PRIMARY KEY(role, module_id),
  FOREIGN KEY(module_id) REFERENCES modules(id)
);

-- Insertar módulos iniciales
INSERT OR IGNORE INTO modules (id, display_name, category) VALUES 
('valet', 'Valet Parking', 'Servicios'),
('renta', 'Renta Equipos', 'Servicios'),
('xpress', 'Xpress Pro', 'Servicios'),
('kids', 'Eye Kids', 'Servicios'),
('eventos', 'Eventos', 'Operaciones'),
('listas', 'Listas', 'Operaciones'),
('formatos', 'Formatos', 'Operaciones'),
('admin', 'Administración', 'Operaciones');

-- Permisos por defecto para 'driver' (Operador Valet)
INSERT OR IGNORE INTO role_permissions (role, module_id, can_view) VALUES 
('driver', 'valet', 1),
('driver', 'formatos', 1),
('logistics', 'valet', 1),
('logistics', 'formatos', 1);

-- Permisos por defecto para 'supervisor'
INSERT OR IGNORE INTO role_permissions (role, module_id, can_view) VALUES 
('supervisor', 'valet', 1),
('supervisor', 'eventos', 1),
('supervisor', 'listas', 1),
('supervisor', 'formatos', 1);

-- Permisos por defecto para 'director' (Administrador)
INSERT OR IGNORE INTO role_permissions (role, module_id, can_view) VALUES 
('director', 'valet', 1),
('director', 'renta', 1),
('director', 'xpress', 1),
('director', 'kids', 1),
('director', 'eventos', 1),
('director', 'listas', 1),
('director', 'formatos', 1),
('director', 'admin', 1);

-- Tabla de Tarifas de Pago (Payroll)
CREATE TABLE IF NOT EXISTS payroll_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL UNIQUE,
  rate REAL NOT NULL,
  description TEXT
);

-- Tabla de Solicitudes de Pago (Formatos)
CREATE TABLE IF NOT EXISTS payroll_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  role_at_event TEXT NOT NULL,
  bank_name TEXT,
  bank_account TEXT,
  amount REAL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  approved_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);

-- Insertar tarifas iniciales
INSERT OR IGNORE INTO payroll_rates (role, rate, description) VALUES 
('driver', 50.0, 'Pago base por turno de conductor'),
('supervisor', 80.0, 'Pago base por turno de supervisor'),
('director', 120.0, 'Pago base por turno de director'),
('logistics', 50.0, 'Pago base por turno de logística');

-- Tabla de Equivalencias para Estandarización
CREATE TABLE IF NOT EXISTS equivalences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL CHECK(category IN ('brand', 'model', 'color')),
  original_value TEXT NOT NULL,
  standard_value TEXT NOT NULL,
  UNIQUE(category, original_value)
);

-- Insertar algunas equivalencias básicas de ejemplo
INSERT OR IGNORE INTO equivalences (category, original_value, standard_value) VALUES 
('brand', 'TOYO', 'TOYOTA'),
('brand', 'TOYOT', 'TOYOTA'),
('brand', 'FORDD', 'FORD'),
('brand', 'CHEVY', 'CHEVROLET'),
('brand', 'BMW ', 'BMW'),
('color', 'BLANKO', 'BLANCO'),
('color', 'NEGROO', 'NEGRO');

-- Tabla de Activos (Equipos, Vehículos Propios, etc.)
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('equipment', 'vehicle', 'other')),
  status TEXT DEFAULT 'available',
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Ubicaciones (Historial y Tiempo Real)
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('staff', 'asset')),
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy REAL,
  ts TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Insertar módulo de Monitoreo
INSERT OR IGNORE INTO modules (id, display_name, category) VALUES 
('monitoreo', 'Monitoreo Real-Time', 'Operaciones');

-- Permisos para director en Monitoreo
INSERT OR IGNORE INTO role_permissions (role, module_id, can_view) VALUES 
('director', 'monitoreo', 1),
('supervisor', 'monitoreo', 1);

-- Tablas de Geofencing
CREATE TABLE IF NOT EXISTS geofences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  radius INTEGER NOT NULL,
  type TEXT CHECK(type IN ('office', 'client', 'danger_zone')) DEFAULT 'office',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS geofence_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  geofence_id INTEGER NOT NULL,
  alert_type TEXT CHECK(alert_type IN ('entry', 'exit')),
  ts TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(geofence_id) REFERENCES geofences(id)
);


-- New tables for Social Intelligence
CREATE TABLE IF NOT EXISTS social_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL, -- 'tiktok', 'instagram'
  followers INTEGER,
  following INTEGER,
  posts_count INTEGER,
  avg_engagement REAL,
  date TEXT DEFAULT (date('now')),
  UNIQUE(platform, date)
);

CREATE TABLE IF NOT EXISTS social_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  post_id TEXT,
  type TEXT, -- 'video', 'image', 'reel'
  content_text TEXT,
  media_url TEXT,
  likes INTEGER,
  comments_count INTEGER,
  sentiment_score REAL, -- -1 to 1
  perceived_message TEXT,
  published_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS social_insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  content TEXT,
  category TEXT, -- 'growth', 'loyalty', 'sales'
  date TEXT DEFAULT (date('now'))
);

-- Register the RRSS module
INSERT OR IGNORE INTO modules (id, display_name, category) VALUES ('rrss', 'Imagen y RRSS', 'Operaciones');
INSERT OR IGNORE INTO role_permissions (role, module_id, can_view) VALUES ('director', 'rrss', 1);
INSERT OR IGNORE INTO role_permissions (role, module_id, can_view) VALUES ('supervisor', 'rrss', 1);
