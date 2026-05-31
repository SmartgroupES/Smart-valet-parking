CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  empresa TEXT,
  evento TEXT,
  fecha TEXT,
  monto TEXT,
  estatus TEXT DEFAULT 'GENERADO',
  action TEXT,
  form_data TEXT, -- JSON
  items_data TEXT, -- JSON
  timestamp INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS budget_seq (
  year INTEGER PRIMARY KEY,
  seq INTEGER DEFAULT 0
);
