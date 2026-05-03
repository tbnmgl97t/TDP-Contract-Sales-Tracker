-- Per-product billing date overrides
ALTER TABLE deal_products ADD COLUMN IF NOT EXISTS billing_start_date DATE;
ALTER TABLE deal_products ADD COLUMN IF NOT EXISTS billing_months INT;

-- Milestone payment schedule
CREATE TABLE IF NOT EXISTS deal_product_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_product_id UUID NOT NULL REFERENCES deal_products(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL,
  amount DECIMAL(18,6) NOT NULL DEFAULT 0,
  label TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE deal_product_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON deal_product_milestones FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Update billing_frequency to allow 'milestone'
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_billing_frequency_check;
ALTER TABLE products ADD CONSTRAINT products_billing_frequency_check
  CHECK (billing_frequency IN ('monthly', 'yearly', 'one_time', 'milestone'));
