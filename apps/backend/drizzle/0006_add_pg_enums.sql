-- Create ENUM types for constrained-string columns (replaces text with DB-level enforcement)
CREATE TYPE permission_level AS ENUM ('read-only', 'read-write', 'revoked');
-- NOTE: 'declined' is intentionally non-standard — 'declined' would be correct English.
-- This is the canonical source of truth; all application code uses 'declined' consistently.
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'declined', 'expired');
CREATE TYPE notification_type AS ENUM (
  'permission-granted', 'permission-revoked', 'permission-changed',
  'contact-invitation', 'contact-added', 'contact-removed'
);

-- Convert columns from text to enum (existing data is compatible)
ALTER TABLE permissions
  ALTER COLUMN level TYPE permission_level USING level::permission_level;

-- Temporarily drop partial index that depends on status column type
DROP INDEX IF EXISTS contact_invitations_inviter_invitee_pending_idx;
ALTER TABLE contact_invitations ALTER COLUMN status DROP DEFAULT;
ALTER TABLE contact_invitations
  ALTER COLUMN status TYPE invitation_status USING status::invitation_status;
ALTER TABLE contact_invitations ALTER COLUMN status SET DEFAULT 'pending'::invitation_status;
-- Recreate partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS contact_invitations_inviter_invitee_pending_idx
  ON contact_invitations(inviter_id, invitee_id) WHERE status = 'pending';

ALTER TABLE notifications
  ALTER COLUMN type TYPE notification_type USING type::notification_type;
