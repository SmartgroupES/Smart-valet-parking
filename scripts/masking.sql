-- ==========================================================
-- SCRIPT DE ENMASCARAMIENTO DE DATOS (DATA MASKING)
-- Uso: Sanitizar base de datos de producción para entorno Staging
-- ==========================================================

-- 1. Anonimización de Contactos (Teléfonos y Correos)
UPDATE vehicles SET owner_phone = '555-000-0000', owner_name = 'Test User ' || id WHERE owner_phone IS NOT NULL;
UPDATE reservations SET owner_phone = '555-000-0000', owner_name = 'Test User ' || id;
UPDATE sessions SET phone = '555-000-0000' WHERE phone IS NOT NULL;
UPDATE access_control_guests SET phone = '555-000-0000', email = 'test' || id || '@eyestaff.app' WHERE email IS NOT NULL OR phone IS NOT NULL;
UPDATE job_applications SET email = 'candidato' || id || '@test.com', phone = '555-000-0000', cedula = 'V-0000000';

-- 2. Limpieza de Credenciales y Tokens
-- Asigna a todos un PIN genérico (ej. '1234' hasheado, aunque aquí pondremos algo genérico. Ojo que el frontend valida el hash, si necesitas un hash real de 1234, reemplaza esto)
UPDATE users SET pin_hash = '81dc9bdb52d04dc20036dbd8313ed055', telegram_link_token = NULL, telegram_chat_id = NULL; 
-- 81dc9bdb52d04dc20036dbd8313ed055 es MD5 de 1234. Si usan SHA-256 de 1234 es 03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4.
-- O simplemente poner un valor dummy:
-- UPDATE users SET pin_hash = 'HASH_GENERICO_DE_PRUEBA', telegram_link_token = NULL, telegram_chat_id = NULL;

UPDATE vehicles SET retrieval_token = 'token_test_' || id, auth_token_1 = NULL, auth_token_2 = NULL;
UPDATE subscriptions SET endpoint = 'mock_endpoint', keys_p256dh = 'mock', keys_auth = 'mock';

-- 3. Limpiar configuraciones sensibles
UPDATE settings SET value = 'TEST_KEY_REMOVED' WHERE key LIKE '%secret%' OR key LIKE '%token%' OR key LIKE '%api_key%';
