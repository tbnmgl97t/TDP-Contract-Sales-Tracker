-- Stores confirmed/reviewed customer→company mappings
CREATE TABLE IF NOT EXISTS receivables_customer_matches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name  text NOT NULL UNIQUE,  -- exact customer_name value from receivables
  company_id     uuid REFERENCES companies(id) ON DELETE SET NULL,  -- null = confirmed "no match"
  confidence     float NOT NULL DEFAULT 0,   -- 0-1, from fuzzy matching algorithm
  status         text NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE receivables_customer_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rcm_all" ON receivables_customer_matches FOR ALL TO authenticated USING (true) WITH CHECK (true);
