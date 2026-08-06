CREATE TABLE IF NOT EXISTS report_schedules (
    report_id TEXT PRIMARY KEY,
    frequency TEXT NOT NULL,
    day_of_week INTEGER,
    day_of_month INTEGER,
    send_time TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
