-- Migración: renombrar rol 'driver' a 'employee'
-- SQLite no permite ALTER COLUMN con CHECK, hay que recrear la tabla.

PRAGMA defer_foreign_keys = ON;

-- 1. Crear tabla temporal con el nuevo constraint
CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('employee','supervisor','director')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  cedula TEXT, sector TEXT, phone TEXT, emergency_contact TEXT,
  emergency_phone TEXT, is_allergic TEXT, current_session_id INTEGER,
  bank_name TEXT, bank_account TEXT, status TEXT, cargo TEXT,
  birth_date TEXT, email TEXT, address TEXT, photo_url TEXT,
  admin_level INTEGER DEFAULT 3, op_level INTEGER DEFAULT 4,
  username TEXT, password TEXT, is_active INTEGER DEFAULT 1,
  carnet_url TEXT, profile_admin TEXT, profile_opera TEXT, eye_id TEXT,
  last_login DATETIME, current_device TEXT, whatsapp_apikey TEXT,
  telegram_chat_id TEXT, is_chofer INTEGER DEFAULT 0,
  telegram_link_token TEXT, pago_movil INTEGER DEFAULT 0,
  cedula_photo_url TEXT, licencia_photo_url TEXT,
  certificado_medico_url TEXT, licencia_grados TEXT,
  pago_movil_phone TEXT, licencia_3ra_photo_url TEXT,
  certificado_medico_3ra_url TEXT
);

-- 2. Copiar datos reemplazando 'driver' -> 'employee'
INSERT INTO users_new SELECT
  id, name, pin_hash,
  CASE WHEN role = 'driver' THEN 'employee' ELSE role END,
  created_at, cedula, sector, phone, emergency_contact,
  emergency_phone, is_allergic, current_session_id,
  bank_name, bank_account, status, cargo,
  birth_date, email, address, photo_url,
  admin_level, op_level,
  username, password, is_active,
  carnet_url, profile_admin, profile_opera, eye_id,
  last_login, current_device, whatsapp_apikey,
  telegram_chat_id, is_chofer,
  telegram_link_token, pago_movil,
  cedula_photo_url, licencia_photo_url,
  certificado_medico_url, licencia_grados,
  pago_movil_phone, licencia_3ra_photo_url,
  certificado_medico_3ra_url
FROM users;

-- 3. Reemplazar tabla
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
