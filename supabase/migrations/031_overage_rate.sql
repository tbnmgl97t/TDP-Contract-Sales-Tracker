ALTER TABLE products ADD COLUMN IF NOT EXISTS default_overage_rate NUMERIC(12,6);
ALTER TABLE deal_products ADD COLUMN IF NOT EXISTS overage_rate NUMERIC(12,6);
