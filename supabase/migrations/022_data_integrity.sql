-- Prevent commission_percent from exceeding 100% for a deal's sales team
CREATE OR REPLACE FUNCTION check_commission_percent()
RETURNS TRIGGER AS $$
DECLARE
  total DECIMAL;
BEGIN
  SELECT COALESCE(SUM(commission_percent), 0)
  INTO total
  FROM deal_team
  WHERE deal_id = COALESCE(NEW.deal_id, OLD.deal_id)
    AND role = 'sales';

  IF total > 100 THEN
    RAISE EXCEPTION 'Commission allocation exceeds 100%% for this deal (total: %)', total;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_commission_percent
  AFTER INSERT OR UPDATE ON deal_team
  FOR EACH ROW
  WHEN (NEW.role = 'sales')
  EXECUTE FUNCTION check_commission_percent();

-- Prevent duplicate SPIF tier starting points per person
ALTER TABLE spif_tiers
  ADD CONSTRAINT unique_spif_tier_acv_min
  UNIQUE (person_id, acv_min);
