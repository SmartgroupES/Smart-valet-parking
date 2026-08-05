-- Migration: Add kv_store table for key-value persistence (e.g. Gemini quota tracking)
CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER -- Unix timestamp, NULL = no expiry
);
