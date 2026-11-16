-- Keep the earliest registration and its management link for each buy and email.
DELETE FROM interests
WHERE rowid IN (
  SELECT registration_id
  FROM (
    SELECT rowid AS registration_id,
      ROW_NUMBER() OVER (
        PARTITION BY slug, lower(email)
        ORDER BY created_at, rowid
      ) AS registration_rank
    FROM interests
  )
  WHERE registration_rank > 1
);

UPDATE interests SET email = lower(email) WHERE email != lower(email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_interests_slug_email_nocase
  ON interests(slug, email COLLATE NOCASE);
