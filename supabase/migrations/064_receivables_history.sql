-- Change receivables unique key from transaction_number alone to
-- (transaction_number, as_of_date) so every weekly snapshot is preserved.
-- This enables cash-received analytics and invoice payment tracking.

-- Drop the old single-column unique constraint
ALTER TABLE receivables DROP CONSTRAINT IF EXISTS receivables_transaction_number_key;

-- Add composite unique constraint: one row per (invoice, report date)
ALTER TABLE receivables ADD CONSTRAINT receivables_transaction_date_key
  UNIQUE (transaction_number, as_of_date);

-- Index on transaction_number alone for cross-date lookups (e.g. payment detection)
CREATE INDEX IF NOT EXISTS receivables_transaction_number_idx ON receivables(transaction_number);
