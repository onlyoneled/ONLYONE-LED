CREATE TABLE IF NOT EXISTS quotes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor          TEXT    NOT NULL,
  title           TEXT,
  date            TEXT,
  items           TEXT    DEFAULT '[]',
  content         TEXT,
  total_price     INTEGER,
  drive_file_id   TEXT    UNIQUE NOT NULL,
  drive_file_name TEXT,
  created_at      TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quotes_vendor    ON quotes(vendor);
CREATE INDEX IF NOT EXISTS idx_quotes_date      ON quotes(date DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_file_id   ON quotes(drive_file_id);
