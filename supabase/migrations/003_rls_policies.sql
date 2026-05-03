-- RLS Policies for SalesFlow
-- Allow all authenticated users full access to all tables.
-- This is an internal tool — access is controlled at the auth layer.

ALTER TABLE vendors                ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories             ENABLE ROW LEVEL SECURITY;
ALTER TABLE products               ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_pricing_params ENABLE ROW LEVEL SECURITY;
ALTER TABLE people                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE spif_tiers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_team              ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE quarterly_commissions  ENABLE ROW LEVEL SECURITY;

-- Authenticated users can do everything on every table
CREATE POLICY "authenticated_all" ON vendors                FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON categories             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON products               FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON product_pricing_params FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON people                 FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON spif_tiers             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON deals                  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON deal_products          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON deal_team              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON contracts              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON quarterly_commissions  FOR ALL TO authenticated USING (true) WITH CHECK (true);
