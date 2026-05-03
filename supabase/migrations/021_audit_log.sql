CREATE TABLE audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete', 'event')),
  changed_by TEXT,
  old_values JSONB,
  new_values JSONB,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_deal ON audit_log (deal_id, created_at DESC);
CREATE INDEX idx_audit_log_table ON audit_log (table_name, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read audit log"
  ON audit_log FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert audit log"
  ON audit_log FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Generic trigger function
CREATE OR REPLACE FUNCTION log_audit()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
  deal_id_val UUID;
BEGIN
  BEGIN
    user_email := current_setting('request.jwt.claims', true)::json->>'email';
  EXCEPTION WHEN OTHERS THEN
    user_email := 'system';
  END;

  IF TG_TABLE_NAME = 'deals' THEN
    deal_id_val := COALESCE(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME IN ('deal_products', 'contracts', 'deal_team') THEN
    deal_id_val := COALESCE(NEW.deal_id, OLD.deal_id);
  ELSE
    deal_id_val := NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (deal_id, table_name, record_id, action, changed_by, new_values)
    VALUES (deal_id_val, TG_TABLE_NAME, NEW.id::TEXT, 'insert', user_email, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (deal_id, table_name, record_id, action, changed_by, old_values, new_values)
    VALUES (deal_id_val, TG_TABLE_NAME, NEW.id::TEXT, 'update', user_email, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (deal_id, table_name, record_id, action, changed_by, old_values)
    VALUES (deal_id_val, TG_TABLE_NAME, OLD.id::TEXT, 'delete', user_email, to_jsonb(OLD));
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply to key tables
CREATE TRIGGER audit_deals
  AFTER INSERT OR UPDATE OR DELETE ON deals
  FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_deal_products
  AFTER INSERT OR UPDATE OR DELETE ON deal_products
  FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_contracts
  AFTER INSERT OR UPDATE OR DELETE ON contracts
  FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_commission_settings
  AFTER INSERT OR UPDATE OR DELETE ON commission_settings
  FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_deal_team
  AFTER INSERT OR UPDATE OR DELETE ON deal_team
  FOR EACH ROW EXECUTE FUNCTION log_audit();
