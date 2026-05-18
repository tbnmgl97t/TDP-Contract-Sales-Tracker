-- Link vendor contracts to customer deals
ALTER TABLE vendor_contracts ADD COLUMN deal_id uuid REFERENCES deals(id) ON DELETE SET NULL;
CREATE INDEX vendor_contracts_deal_id_idx ON vendor_contracts(deal_id);

-- Customer-facing notice period on deals
ALTER TABLE deals ADD COLUMN notice_period_days int;
