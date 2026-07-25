CREATE TABLE IF NOT EXISTS payment_formats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
    fecha TEXT,
    nombre TEXT,
    cedula TEXT,
    telefono_celular TEXT,
    telefono_fijo TEXT,
    observacion TEXT
);

CREATE TABLE IF NOT EXISTS payment_format_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    format_id INTEGER,
    numero INTEGER,
    evento TEXT,
    fecha TEXT,
    lugar TEXT,
    actividad TEXT,
    monto REAL,
    FOREIGN KEY(format_id) REFERENCES payment_formats(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payment_formats_cedula ON payment_formats(cedula);
CREATE INDEX IF NOT EXISTS idx_payment_format_events_format_id ON payment_format_events(format_id);
