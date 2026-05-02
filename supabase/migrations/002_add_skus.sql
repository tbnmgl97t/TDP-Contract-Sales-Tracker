-- Add SKU to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT UNIQUE;

-- Update existing seed products with SKUs
UPDATE products SET sku = 'TDP-BACKSTAGE'     WHERE name = 'Backstage';
UPDATE products SET sku = 'TDP-DATASMITH'     WHERE name = 'DataSmith';
UPDATE products SET sku = 'TDP-MONETIZE'      WHERE name = 'Monetize';
UPDATE products SET sku = 'TDP-WEBHOST'       WHERE name = 'Web Hosting';
UPDATE products SET sku = 'TDP-WEBAPP'        WHERE name = 'Web App';
UPDATE products SET sku = 'TDP-EVENTHUBLIVE'  WHERE name = 'EventHubLive';
UPDATE products SET sku = 'JWX-MEDIA-GB'      WHERE name = 'Media Delivery';
UPDATE products SET sku = 'JWX-LIVE-HRS'      WHERE name = 'Live Hours Ingested';
UPDATE products SET sku = 'JWX-HOSTED-HRS'    WHERE name = 'Hours Hosted Total';
UPDATE products SET sku = 'APP-CTV'           WHERE name = 'CTV Apps';
UPDATE products SET sku = 'APP-MOBILE'        WHERE name = 'Mobile Apps';
UPDATE products SET sku = 'OKT-USERMGMT'      WHERE name = 'User Management (10K Users)';
UPDATE products SET sku = 'ONT-ONETRUST'      WHERE name = 'OneTrust';
UPDATE products SET sku = 'SVC-PROSERV'       WHERE name = 'Professional Services';
