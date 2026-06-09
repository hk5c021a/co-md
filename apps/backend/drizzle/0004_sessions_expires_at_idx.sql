-- Migration 0004: Add sessions_expires_at index
-- Fixes full-table scan on deleteExpired() (see SessionRepository.ts)
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
