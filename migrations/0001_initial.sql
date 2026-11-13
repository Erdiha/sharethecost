CREATE TABLE IF NOT EXISTS buys (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  region TEXT NOT NULL,
  supplier TEXT NOT NULL,
  description TEXT NOT NULL,
  target INTEGER NOT NULL CHECK(target BETWEEN 2 AND 100000),
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','open','closed','rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_proposal ON buys(supplier, lower(region))
  WHERE status IN ('pending','open');
CREATE TABLE IF NOT EXISTS interests (
  slug TEXT NOT NULL REFERENCES buys(slug),
  email TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 10000),
  management_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(slug,email)
);
