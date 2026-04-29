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
