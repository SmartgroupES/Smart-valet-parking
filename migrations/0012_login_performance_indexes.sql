-- Migration number: 0012 	 2026-07-18T10:00:00.000Z

-- Optimizaciones para tabla web_sessions durante el login
CREATE INDEX IF NOT EXISTS idx_web_sessions_user_active ON web_sessions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_users_cedula ON users(cedula);
