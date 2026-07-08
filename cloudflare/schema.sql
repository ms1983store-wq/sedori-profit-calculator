CREATE TABLE IF NOT EXISTS inventory_state (
  user_id TEXT PRIMARY KEY,
  items_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
