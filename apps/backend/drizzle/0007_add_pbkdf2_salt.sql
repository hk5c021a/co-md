-- Add per-user PBKDF2 salt column (randomized, 16-byte hex)
ALTER TABLE users ADD COLUMN IF NOT EXISTS pbkdf2_salt text NOT NULL DEFAULT '';
