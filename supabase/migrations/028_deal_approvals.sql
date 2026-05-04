-- Deal approval system: tracks margin tier + manager approval status per deal
CREATE TABLE IF NOT EXISTS deal_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('auto_approved', 'pending', 'approved', 'rejected')),
  margin_pct NUMERIC,
  reviewed_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS deal_approvals_deal_id_idx ON deal_approvals(deal_id);

ALTER TABLE deal_approvals ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read approvals
CREATE POLICY "Authenticated users can read deal_approvals"
  ON deal_approvals FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can insert (on deal save)
CREATE POLICY "Authenticated users can insert deal_approvals"
  ON deal_approvals FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can update (manager approves/rejects; upsert on re-save)
CREATE POLICY "Authenticated users can update deal_approvals"
  ON deal_approvals FOR UPDATE
  TO authenticated
  USING (true);
