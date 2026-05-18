CREATE TABLE receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_number text NOT NULL UNIQUE,
  as_of_date date NOT NULL,
  business_unit text,
  natural_account text,
  natural_account_name text,
  customer_name text NOT NULL,
  customer_account_number text,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  invoice_amount decimal(12,2),
  bucket_current decimal(12,2) DEFAULT 0,
  bucket_1_30 decimal(12,2) DEFAULT 0,
  bucket_31_60 decimal(12,2) DEFAULT 0,
  bucket_61_90 decimal(12,2) DEFAULT 0,
  bucket_91_120 decimal(12,2) DEFAULT 0,
  bucket_121_150 decimal(12,2) DEFAULT 0,
  bucket_151_plus decimal(12,2) DEFAULT 0,
  invoice_due_date date,
  creation_date date,
  imported_at timestamptz DEFAULT now()
);

CREATE INDEX receivables_company_id_idx ON receivables(company_id);
CREATE INDEX receivables_as_of_date_idx ON receivables(as_of_date);
CREATE INDEX receivables_customer_account_idx ON receivables(customer_account_number);

ALTER TABLE companies ADD COLUMN IF NOT EXISTS customer_account_number text;
CREATE INDEX IF NOT EXISTS companies_customer_account_idx ON companies(customer_account_number);
