-- Normalize email column to lowercase to prevent case-sensitivity race conditions
UPDATE interests SET email = lower(email) WHERE email != lower(email);

-- Add unique index to enforce case-insensitive email uniqueness per slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_interests_slug_email_nocase 
  ON interests(slug, email COLLATE NOCASE);


