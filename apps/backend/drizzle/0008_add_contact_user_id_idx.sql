-- Add index on contacts.contact_user_id for reverse contact lookups
-- Required for ContactService methods that query by contactUserId
CREATE INDEX IF NOT EXISTS contacts_contact_user_id_idx
  ON contacts(contact_user_id);
