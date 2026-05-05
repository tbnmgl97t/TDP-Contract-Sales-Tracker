ALTER TABLE products ADD COLUMN IF NOT EXISTS default_billing_mode TEXT NOT NULL DEFAULT 'monthly';
