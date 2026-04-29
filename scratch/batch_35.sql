INSERT INTO users (name, pin_hash, role, cedula, phone, sector, created_at) VALUES ('ANTHONY ORTEGA', 'L599', 'valet', '21183599', '0412-6104665', '', datetime('now'));
INSERT INTO users (name, pin_hash, role, cedula, phone, sector, created_at) VALUES ('YORBY MORANTE', 'L179', 'valet', '24759179', '', '', datetime('now'));
INSERT INTO users (name, pin_hash, role, cedula, phone, sector, created_at) VALUES ('KRISTIAN RODRIGO', 'L669', 'valet', '18460669', '', '', datetime('now'));
DELETE FROM users WHERE id=4;
DELETE FROM users WHERE id=5;