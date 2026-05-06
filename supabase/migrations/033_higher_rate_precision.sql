-- Increase precision on rate/price columns to minimize rounding at high volumes
ALTER TABLE deal_products
  ALTER COLUMN unit_price_snapshot TYPE NUMERIC(20,10),
  ALTER COLUMN cogs_per_unit_snapshot TYPE NUMERIC(20,10),
  ALTER COLUMN base_rate TYPE NUMERIC(20,10),
  ALTER COLUMN overage_rate TYPE NUMERIC(20,10);

ALTER TABLE products
  ALTER COLUMN default_overage_rate TYPE NUMERIC(20,10);

ALTER TABLE product_pricing_params
  ALTER COLUMN unit_price TYPE NUMERIC(20,10),
  ALTER COLUMN cogs_per_unit TYPE NUMERIC(20,10);
