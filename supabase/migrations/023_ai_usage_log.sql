CREATE TABLE ai_usage_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  user_id UUID,
  operation TEXT NOT NULL CHECK (operation IN ('extract', 'chat')),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_log_created_at ON ai_usage_log (created_at DESC);
CREATE INDEX idx_ai_usage_log_deal_id ON ai_usage_log (deal_id);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read usage" ON ai_usage_log
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can insert usage" ON ai_usage_log
  FOR INSERT WITH CHECK (true);
