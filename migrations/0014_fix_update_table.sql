DROP TABLE IF EXISTS profile_update_requests;

CREATE TABLE IF NOT EXISTS employee_data_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending_review' CHECK(status IN ('pending_review', 'approved', 'rejected')),
    proposed_data TEXT NOT NULL,
    photo_base64 TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
);
