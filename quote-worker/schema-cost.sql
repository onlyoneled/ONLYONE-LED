CREATE TABLE IF NOT EXISTS cost_observations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  category        TEXT    NOT NULL,
  sku_key         TEXT    NOT NULL,
  attributes      TEXT    NOT NULL,
  price           REAL    NOT NULL,
  currency        TEXT    NOT NULL DEFAULT 'CNY',
  observed_date   TEXT    NOT NULL,
  source_file     TEXT,
  upload_id       INTEGER,
  status          TEXT    NOT NULL DEFAULT 'pending',
  status_reason   TEXT,
  created_at      TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cost_obs_sku    ON cost_observations(category, sku_key);
CREATE INDEX IF NOT EXISTS idx_cost_obs_status ON cost_observations(status);

CREATE TABLE IF NOT EXISTS uploaded_quotes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  filename          TEXT    NOT NULL,
  r2_key            TEXT    NOT NULL UNIQUE,
  line_items_count  INTEGER NOT NULL DEFAULT 0,
  pending_count     INTEGER NOT NULL DEFAULT 0,
  uploaded_at       TEXT    DEFAULT (datetime('now'))
);
