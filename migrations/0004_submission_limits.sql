CREATE TABLE submission_checks (
  token_hash TEXT PRIMARY KEY,
  client_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX submission_checks_client_expiry ON submission_checks(client_hash, expires_at);
CREATE INDEX submission_checks_expiry ON submission_checks(expires_at);

CREATE TRIGGER prune_submission_checks AFTER INSERT ON submission_checks
BEGIN
  DELETE FROM submission_checks
    WHERE token_hash IN (
      SELECT token_hash FROM submission_checks
      WHERE expires_at <= unixepoch()
      ORDER BY expires_at LIMIT 64
    );
END;
