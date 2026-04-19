-- Tabla de usuarios (drivers, supervisors, directors)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('driver','supervisor','director')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de vehículos
CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plate TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  color TEXT,
  status TEXT NOT NULL CHECK(status IN ('checkin','parked','requested','delivering','delivered')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
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

