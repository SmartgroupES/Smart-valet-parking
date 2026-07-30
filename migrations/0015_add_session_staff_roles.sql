CREATE TABLE IF NOT EXISTS session_staff_roles (
  session_id INTEGER,
  user_id INTEGER,
  event_function TEXT,
  PRIMARY KEY (session_id, user_id)
);
