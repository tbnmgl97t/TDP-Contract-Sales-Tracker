ALTER TABLE products ADD COLUMN IF NOT EXISTS default_support_cogs_pct NUMERIC(5,2);
ALTER TABLE deal_products ADD COLUMN IF NOT EXISTS support_cogs_pct NUMERIC(5,2);
