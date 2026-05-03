ALTER TABLE products ADD COLUMN IF NOT EXISTS default_margin_type TEXT DEFAULT 'amount';
ALTER TABLE products ADD COLUMN IF NOT EXISTS default_margin_pct DECIMAL(5,2);
