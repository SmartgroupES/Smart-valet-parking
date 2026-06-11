-- Migration number: 0001 	 2026-06-07T10:36:40.113Z

CREATE TABLE payroll_submissions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 
  user_id INTEGER NOT NULL, 
  session_id INTEGER NOT NULL, 
  date TEXT NOT NULL, 
  role_at_event TEXT NOT NULL, 
  bank_name TEXT, 
  bank_account TEXT, 
  amount REAL, 
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'paid')), 
  approved_at TEXT, 
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, 
  FOREIGN KEY(user_id) REFERENCES users(id), 
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);

INSERT INTO payroll_submissions_new SELECT * FROM payroll_submissions;
DROP TABLE payroll_submissions;
ALTER TABLE payroll_submissions_new RENAME TO payroll_submissions;
