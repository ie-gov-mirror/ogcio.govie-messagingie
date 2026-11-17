ALTER TABLE messages
ADD COLUMN IF NOT EXISTS erased_at timestamptz NULL;
