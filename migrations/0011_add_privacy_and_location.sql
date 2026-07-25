ALTER TABLE users ADD COLUMN privacy_accepted INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS staff_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_id INTEGER,
  latitude REAL,
  longitude REAL,
  ts TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);
