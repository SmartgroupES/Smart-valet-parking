-- Migration number: 0002 	 2026-06-10T12:43:32.560Z

-- Optimizaciones para vehicles
CREATE INDEX IF NOT EXISTS idx_vehicles_session_id ON vehicles(session_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles(plate);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);

-- Optimizaciones para events
CREATE INDEX IF NOT EXISTS idx_events_vehicle_id ON events(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);

-- Optimizaciones para control de accesos y localizaciones
CREATE INDEX IF NOT EXISTS idx_guests_session_id ON access_control_guests(session_id);
CREATE INDEX IF NOT EXISTS idx_locations_entity ON locations(entity_id, entity_type);

-- Optimizaciones para mensajes de chat
CREATE INDEX IF NOT EXISTS idx_messages_vehicle_id ON messages(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
