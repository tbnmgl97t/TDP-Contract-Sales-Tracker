-- Detect cash payment events by comparing consecutive weekly AR snapshots.
-- A payment occurs when an invoice's total balance drops between two snapshots,
-- or when an invoice disappears entirely (paid and removed from the AR report).

CREATE OR REPLACE VIEW receivables_payment_events AS
WITH

-- All distinct snapshot dates, ordered chronologically
snapshot_dates AS (
  SELECT DISTINCT as_of_date
  FROM receivables
  ORDER BY as_of_date
),

-- For each snapshot date, find the immediately following snapshot date
date_pairs AS (
  SELECT
    d.as_of_date AS period_start,
    next_d.as_of_date AS period_end
  FROM snapshot_dates d
  CROSS JOIN LATERAL (
    SELECT as_of_date
    FROM snapshot_dates
    WHERE as_of_date > d.as_of_date
    ORDER BY as_of_date
    LIMIT 1
  ) next_d
),

-- Compute total balance for every invoice row
invoice_balances AS (
  SELECT
    transaction_number,
    customer_name,
    company_id,
    as_of_date,
    COALESCE(bucket_current, 0)
      + COALESCE(bucket_1_30, 0)
      + COALESCE(bucket_31_60, 0)
      + COALESCE(bucket_61_90, 0)
      + COALESCE(bucket_91_120, 0)
      + COALESCE(bucket_121_150, 0)
      + COALESCE(bucket_151_plus, 0) AS total_balance
  FROM receivables
),

-- Scenario A: invoice exists in both snapshots but balance dropped
partial_and_full_payments AS (
  SELECT
    prev.transaction_number,
    prev.customer_name,
    prev.company_id,
    dp.period_start,
    dp.period_end,
    prev.total_balance AS prev_balance,
    curr.total_balance AS curr_balance,
    prev.total_balance - curr.total_balance AS amount_paid
  FROM date_pairs dp
  JOIN invoice_balances prev
    ON prev.as_of_date = dp.period_start
  JOIN invoice_balances curr
    ON curr.as_of_date = dp.period_end
    AND curr.transaction_number = prev.transaction_number
  WHERE prev.total_balance - curr.total_balance > 0
),

-- Scenario B: invoice exists in snapshot N but not in snapshot N+1 (paid and removed)
disappeared_invoices AS (
  SELECT
    prev.transaction_number,
    prev.customer_name,
    prev.company_id,
    dp.period_start,
    dp.period_end,
    prev.total_balance AS prev_balance,
    0::numeric AS curr_balance,
    prev.total_balance AS amount_paid
  FROM date_pairs dp
  JOIN invoice_balances prev
    ON prev.as_of_date = dp.period_start
  WHERE prev.total_balance > 0
    AND NOT EXISTS (
      SELECT 1
      FROM invoice_balances curr
      WHERE curr.as_of_date = dp.period_end
        AND curr.transaction_number = prev.transaction_number
    )
),

-- Union both scenarios
all_events AS (
  SELECT * FROM partial_and_full_payments
  UNION ALL
  SELECT * FROM disappeared_invoices
)

SELECT
  transaction_number::text,
  customer_name::text,
  company_id,
  period_start::date,
  period_end::date,
  amount_paid::numeric,
  CASE
    WHEN curr_balance = 0 THEN 'paid_in_full'
    ELSE 'partial_payment'
  END AS payment_type,
  prev_balance::numeric,
  curr_balance::numeric
FROM all_events
WHERE amount_paid > 0
ORDER BY period_end DESC, customer_name, transaction_number;
