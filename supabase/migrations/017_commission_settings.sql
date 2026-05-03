CREATE TABLE IF NOT EXISTS commission_settings (
  id INT PRIMARY KEY DEFAULT 1,
  global_commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.07,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO commission_settings (id, global_commission_rate)
VALUES (1, 0.07)
ON CONFLICT DO NOTHING;

ALTER TABLE commission_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON commission_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE products ADD COLUMN IF NOT EXISTS rate_overridden BOOLEAN DEFAULT FALSE;
