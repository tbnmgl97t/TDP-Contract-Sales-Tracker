-- Soft delete support for deals
ALTER TABLE deals ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Contract versioning
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS previous_version_id UUID REFERENCES contracts(id) ON DELETE SET NULL;
