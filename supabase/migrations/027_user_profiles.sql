CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'sales' CHECK (role IN ('manager', 'sales', 'support')),
  full_name TEXT,
  email TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read user_profiles"
  ON user_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert user_profiles"
  ON user_profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update user_profiles"
  ON user_profiles FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete user_profiles"
  ON user_profiles FOR DELETE TO authenticated USING (true);
