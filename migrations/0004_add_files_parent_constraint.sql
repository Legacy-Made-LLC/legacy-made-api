-- Add CHECK constraint to enforce that exactly one of entry_id or wish_id must be set
-- This prevents orphaned files (both null) and ambiguous ownership (both set)
ALTER TABLE "files" ADD CONSTRAINT "files_parent_xor_check"
  CHECK (
    (entry_id IS NOT NULL AND wish_id IS NULL) OR
    (entry_id IS NULL AND wish_id IS NOT NULL)
  );
