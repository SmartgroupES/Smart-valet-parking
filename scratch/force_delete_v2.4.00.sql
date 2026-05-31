
-- Script Final para limpieza de personal solicitado por superadministrador (v2.4.00)
-- IDs a eliminar: 438, 441, 442, 443, 463

-- 1. Limpieza de logs vinculados a sesiones de estos usuarios
DELETE FROM access_logs WHERE session_id IN (SELECT session_id FROM staff_attendance WHERE user_id IN (438, 441, 442, 443, 463));
DELETE FROM guest_list WHERE session_id IN (SELECT session_id FROM staff_attendance WHERE user_id IN (438, 441, 442, 443, 463));

-- 2. Limpieza de tablas directas verificadas con PRAGMA
DELETE FROM payroll_submissions WHERE user_id IN (438, 441, 442, 443, 463);
DELETE FROM web_sessions WHERE user_id IN (438, 441, 442, 443, 463);
DELETE FROM audit_logs WHERE user_id IN (438, 441, 442, 443, 463);
DELETE FROM staff_attendance WHERE user_id IN (438, 441, 442, 443, 463);
DELETE FROM shifts WHERE user_id IN (438, 441, 442, 443, 463);
DELETE FROM geofence_alerts WHERE user_id IN (438, 441, 442, 443, 463);

-- Desvinculación de sesiones de eventos (Donde eran supervisores)
UPDATE sessions SET supervisor_id = NULL WHERE supervisor_id IN (438, 441, 442, 443, 463);

-- 3. Borrado físico definitivo del usuario
DELETE FROM users WHERE id IN (438, 441, 442, 443, 463);
