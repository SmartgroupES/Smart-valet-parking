PRAGMA foreign_keys = OFF;
DELETE FROM guest_list WHERE session_id < 48 AND session_id NOT IN (48, 49);
DELETE FROM access_logs WHERE session_id < 48 AND session_id NOT IN (48, 49);
DELETE FROM events WHERE vehicle_id IN (SELECT id FROM vehicles WHERE session_id < 48 AND session_id NOT IN (48, 49));
DELETE FROM vehicles WHERE session_id < 48 AND session_id NOT IN (48, 49);
DELETE FROM staff_attendance WHERE session_id < 48 AND session_id NOT IN (48, 49);
DELETE FROM payroll_submissions WHERE session_id < 48 AND session_id NOT IN (48, 49);
DELETE FROM sessions WHERE id < 48 AND name NOT LIKE '%BILLY%';
PRAGMA foreign_keys = ON;
