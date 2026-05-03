-- Partner entities (referral/reseller partners who earn commission on top of Trilogy's ACV)
CREATE TABLE IF NOT EXISTS partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  default_commission_pct NUMERIC(5,2) NOT NULL DEFAULT 7.5,
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Per-deal partner attribution (stacked in sort_order: lower number = inner layer)
CREATE TABLE IF NOT EXISTS deal_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  partner_id UUID REFERENCES partners(id) NOT NULL,
  commission_pct NUMERIC(5,2) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  commission_amount NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deal_partners_deal_id_idx ON deal_partners(deal_id);

-- RLS
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read partners"
  ON partners FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert partners"
  ON partners FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update partners"
  ON partners FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete partners"
  ON partners FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read deal_partners"
  ON deal_partners FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert deal_partners"
  ON deal_partners FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update deal_partners"
  ON deal_partners FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete deal_partners"
  ON deal_partners FOR DELETE TO authenticated USING (true);
