-- Performance indexes for production workloads
-- Applied via migrate.ts runner (not db:push)

-- Upload quota queries scan document_files by userId + size
CREATE INDEX IF NOT EXISTS document_files_user_id_idx
  ON document_files(user_id);

-- Notification listings sorted by recency
CREATE INDEX IF NOT EXISTS notifications_created_at_idx
  ON notifications(created_at DESC);

-- Missing index needed by batch permission lookups
CREATE INDEX IF NOT EXISTS permissions_document_id_level_idx
  ON permissions(document_id, level);

-- Sorted document lists
CREATE INDEX IF NOT EXISTS documents_updated_at_idx
  ON documents(updated_at DESC);
