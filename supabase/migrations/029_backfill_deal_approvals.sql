-- Backfill deal_approvals for existing deals that have COGS data in deal_products.
-- ACV per product: GM metric uses yearly_cost (or net_revenue+cogs), others use annual_value.
-- Only inserts rows for deals where total COGS > 0 (i.e., we have margin data to track).

INSERT INTO deal_approvals (deal_id, status, margin_pct, created_at, updated_at)
SELECT
  d.id AS deal_id,
  CASE
    WHEN (dp.sum_acv - dp.sum_cogs) / NULLIF(dp.sum_acv, 0) >= 0.30 THEN 'auto_approved'
    ELSE 'pending'
  END AS status,
  (dp.sum_acv - dp.sum_cogs) / NULLIF(dp.sum_acv, 0) AS margin_pct,
  now(),
  now()
FROM deals d
JOIN (
  SELECT
    deal_id,
    SUM(
      CASE
        WHEN commission_metric = 'GM'
          THEN COALESCE(yearly_cost, net_revenue + cogs_amount, 0)
        ELSE COALESCE(annual_value, 0)
      END
    ) AS sum_acv,
    SUM(COALESCE(cogs_amount, 0)) AS sum_cogs
  FROM deal_products
  GROUP BY deal_id
) dp ON dp.deal_id = d.id
WHERE d.deleted_at IS NULL
  AND dp.sum_cogs > 0
  AND dp.sum_acv > 0
ON CONFLICT (deal_id) DO UPDATE SET
  status   = EXCLUDED.status,
  margin_pct = EXCLUDED.margin_pct,
  updated_at = now();
