ALTER TABLE products ADD COLUMN IF NOT EXISTS billing_frequency TEXT DEFAULT 'monthly' CHECK (billing_frequency IN ('monthly', 'yearly', 'one_time'));
