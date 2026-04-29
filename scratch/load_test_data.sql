-- Datos de prueba para Eventos Concluidos
INSERT INTO sessions (name, status, started_at, ended_at) VALUES 
('BODA FAMILIA PEREZ', 'closed', '2026-04-10 18:00:00', '2026-04-11 02:30:00'),
('CONCIERTO ARENA MADRID', 'closed', '2026-04-12 19:30:00', '2026-04-12 23:45:00'),
('CENA GALA EMPRESARIAL', 'closed', '2026-04-15 20:00:00', '2026-04-16 01:15:00'),
('TORNEO GOLF ELITE', 'closed', '2026-04-18 08:00:00', '2026-04-18 18:00:00'),
('LANZAMIENTO PRODUCTO TECH', 'closed', '2026-04-20 10:00:00', '2026-04-20 14:00:00'),
('FIESTA PRIVADA LA FINCA', 'closed', '2026-04-21 21:00:00', '2026-04-22 04:00:00'),
('GRADUACION COLEGIO MAYOR', 'closed', '2026-04-22 18:00:00', '2026-04-23 00:30:00'),
('EXPOSICION ARTE MODERNO', 'closed', '2026-04-23 11:00:00', '2026-04-23 20:00:00'),
('CUMPLEAÑOS 50 ANIVERSARIO', 'closed', '2026-04-24 20:00:00', '2026-04-25 02:00:00'),
('DESAYUNO NETWORKING', 'closed', '2026-04-25 08:00:00', '2026-04-25 11:00:00');

-- Crear algunos eventos falsos para vincular staff a sesiones
-- Sesión 10 (Desayuno Networking)
INSERT INTO vehicles (plate, status, session_id, fee_amount, fee_paid) VALUES ('ABC1234', 'delivered', 10, 10.0, 1);
INSERT INTO events (vehicle_id, user_id, event_type) SELECT id, 1, 'checkin' FROM vehicles WHERE plate = 'ABC1234';

-- Sesión 9 (Cumpleaños)
INSERT INTO vehicles (plate, status, session_id, fee_amount, fee_paid) VALUES ('XYZ5678', 'delivered', 9, 10.0, 1);
INSERT INTO events (vehicle_id, user_id, event_type) SELECT id, 1, 'checkin' FROM vehicles WHERE plate = 'XYZ5678';
