ALTER TABLE products ALTER COLUMN default_cogs TYPE DECIMAL(18,6);
ALTER TABLE products ALTER COLUMN default_list_price TYPE DECIMAL(18,6);
ALTER TABLE deal_products ALTER COLUMN list_price TYPE DECIMAL(18,6);
ALTER TABLE deal_products ALTER COLUMN cogs_amount TYPE DECIMAL(18,6);
