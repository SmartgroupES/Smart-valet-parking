-- Datos de prueba para Eventos Concluidos
INSERT INTO sessions (id, name, status, started_at, ended_at) VALUES 
(100, 'CUMPLEAÑOS 50 ANIVERSARIO', 'closed', '2026-04-24 20:00:00', '2026-04-25 02:00:00'),
(101, 'DESAYUNO NETWORKING', 'closed', '2026-04-25 08:00:00', '2026-04-25 11:00:00');

-- Crear algunos eventos falsos para vincular staff a sesiones
INSERT INTO vehicles (id, plate, status, session_id, fee_amount, fee_paid) VALUES 
(1000, 'ABC1234', 'delivered', 101, 10.0, 1),
(1001, 'XYZ5678', 'delivered', 100, 15.0, 1);

-- Usamos el user_id 89 que sabemos que existe
INSERT INTO events (vehicle_id, user_id, event_type) VALUES 
(1000, 89, 'checkin'),
(1001, 89, 'checkin');
