CREATE TABLE deal_brain_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deal_brain_messages_lookup
  ON deal_brain_messages (deal_id, user_id, created_at DESC);

ALTER TABLE deal_brain_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own messages"
  ON deal_brain_messages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
