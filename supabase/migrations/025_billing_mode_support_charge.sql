-- Billing mode on deal products (for GM/usage-based): monthly×duration vs fixed contract total
ALTER TABLE deal_products ADD COLUMN IF NOT EXISTS billing_mode TEXT NOT NULL DEFAULT 'monthly';

-- Support charge product type
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_support_charge BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS default_support_pct NUMERIC(5,2) DEFAULT 15;

-- Per-deal support charge configuration
ALTER TABLE deal_products ADD COLUMN IF NOT EXISTS support_pct NUMERIC(5,2);
ALTER TABLE deal_products ADD COLUMN IF NOT EXISTS support_product_ids UUID[];
