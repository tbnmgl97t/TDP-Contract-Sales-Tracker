/**
 * Per-product calculation functions for SalesFlow / Trilogy Digital.
 *
 * All functions operate on a single deal_product row or primitive inputs.
 * Nothing here aggregates across a full deal — see deals.js for that.
 */

/**
 * Resolve the canonical annual revenue value for a deal product row.
 * Priority: total_revenue → annual_value → yearly_cost → 0
 */
export function resolveProductValue(dp) {
  return dp.total_revenue || dp.annual_value || dp.yearly_cost || 0
}

/**
 * Returns the effective COGS for a deal product row.
 * Falls back to legacy support_cogs_pct derivation for rows saved before
 * explicit COGS tracking was added.
 */
export function effectiveCogs(dp) {
  if (dp.cogs_amount) return dp.cogs_amount
  if (dp.products?.is_support_charge && dp.support_cogs_pct != null) {
    return (dp.annual_value || 0) * dp.support_cogs_pct / 100
  }
  return 0
}

/**
 * Customer-facing line total for a product: resolved value scaled by the
 * partner multiplier (customerAcv / productAcv).
 */
export function productLineTotal(dp, partnerMultiplier = 1) {
  return resolveProductValue(dp) * partnerMultiplier
}

/**
 * Value shown in the "Monthly" column of a pricing table.
 * - GM usage-based products: return formatted quantity string (not a number)
 * - Fixed-price recurring (monthly/yearly): lineTotal / 12
 * - One-time / milestone: null (caller should show '—')
 *
 * Returns a number (or null). Formatting is left to the caller.
 */
export function resolveMonthlyValue(dp, partnerMultiplier = 1) {
  const isGM = dp.commission_metric === 'GM'
  const isSupport = !!dp.products?.is_support_charge
  const isOneTime = dp.products?.billing_frequency === 'one_time'
  const isMilestone = dp.products?.billing_frequency === 'milestone'

  if (isGM && !isSupport) return null // caller shows qty instead
  if (isOneTime || isMilestone) return null
  const total = productLineTotal(dp, partnerMultiplier)
  return total > 0 ? total / 12 : null
}

/**
 * Apply a discount percentage to a base value.
 *
 * @param {number} baseValue   — pre-discount amount
 * @param {number} discountPct — 0–100 (e.g. 10 = 10% off)
 * @returns {number}
 */
export function applyDiscount(baseValue, discountPct) {
  const disc = parseFloat(discountPct) || 0
  return baseValue * (1 - disc / 100)
}

/**
 * Apply a markup percentage to a base (COGS) value.
 *
 * @param {number} baseValue  — COGS or base cost
 * @param {number} markupPct  — 0–100 (e.g. 20 = 20% above cost)
 * @returns {number}
 */
export function applyMarkup(baseValue, markupPct) {
  const markup = parseFloat(markupPct) || 0
  return baseValue * (1 + markup / 100)
}

/**
 * Derive customer unit price from COGS and a desired margin %.
 * Formula: cogsPerUnit / (1 − marginPct/100)
 *
 * @param {number} cogsPerUnit — cost per unit
 * @param {number} marginPct   — 0–99.9 (e.g. 30 = 30% margin); returns 0 if ≥ 100 or < 0
 * @returns {number}
 */
export function calcUnitPriceFromMargin(cogsPerUnit, marginPct) {
  const m = parseFloat(marginPct)
  if (isNaN(m) || m >= 100 || m < 0) return 0
  return cogsPerUnit / (1 - m / 100)
}

/**
 * Derive margin % from a known COGS-per-unit and customer rate.
 *
 * @param {number} cogsPerUnit — cost per unit
 * @param {number} rate        — customer-facing unit price
 * @returns {number} 0–100 (percentage points, NOT a decimal — e.g. 30, not 0.30)
 */
export function calcMarginPctFromRate(cogsPerUnit, rate) {
  if (!rate || rate <= 0) return 0
  return (1 - cogsPerUnit / rate) * 100
}

/**
 * Annual value from a monthly figure.
 * months defaults to 12.
 */
export function calcAnnualValue(monthlyValue, months = 12) {
  return (parseFloat(monthlyValue) || 0) * (parseInt(months) || 12)
}

/**
 * Sum the amounts of all milestone payment rows.
 */
export function calcMilestoneTotal(milestones) {
  return (milestones || []).reduce((s, m) => s + (parseFloat(m.amount) || 0), 0)
}

/**
 * Yearly cost from net revenue + COGS components.
 * Used when yearly_cost is not directly stored.
 */
export function calcYearlyCostFromComponents(netRevenue, cogsAmount) {
  return (netRevenue || 0) + (cogsAmount || 0)
}

/**
 * Full support charge calculation — pure function extracted from NewDeal useEffect.
 *
 * @param {number} supportPct       — support charge % (e.g. 15 = 15% of linked products)
 * @param {number} discountPct      — discount % applied to revenue (0–100)
 * @param {number} baseRevenue      — sum of linked products' revenues
 * @param {number} baseCogs         — sum of linked products' COGS
 * @param {number} commissionRate   — decimal rate (e.g. 0.07); commission is on margin (revenue − cogs), floored at 0
 * @returns {{ listRevenue, revenue, cogs, commission }}
 */
export function calcSupportCharge(supportPct, discountPct, baseRevenue, baseCogs, commissionRate) {
  const pct = parseFloat(supportPct) || 0
  const listRevenue = baseRevenue * (pct / 100)
  const revenue = applyDiscount(listRevenue, discountPct)
  const cogs = baseCogs * (pct / 100)
  const commission = Math.max(0, revenue - cogs) * (commissionRate || 0)
  return { listRevenue, revenue, cogs, commission }
}

/**
 * Calculate JWX / usage-based product values.
 * (Moved here from commission.js — this is product math, not schedule math.)
 *
 * @param {number} monthlyQuantity  — units per month
 * @param {number} unitPrice        — revenue per unit
 * @param {number} cogsPerUnit      — COGS per unit
 * @param {number} contractMonths   — length of contract
 * @param {string} billingMode      — 'monthly' | 'fixed'
 * @returns {{ monthlyCost, totalRevenue, totalCogs, netRevenue }}
 */
export function calcJwxValues(monthlyQuantity, unitPrice, cogsPerUnit, contractMonths, billingMode) {
  const qty = monthlyQuantity || 0
  const months = contractMonths || 12
  if (billingMode === 'fixed') {
    const totalRevenue = qty * (unitPrice || 0)
    const totalCogs = qty * (cogsPerUnit || 0)
    const monthlyCost = months > 0 ? totalRevenue / months : 0
    const netRevenue = Math.max(0, totalRevenue - totalCogs)
    return { monthlyCost, totalRevenue, totalCogs, netRevenue }
  }
  const monthlyCost = qty * (unitPrice || 0)
  const totalRevenue = monthlyCost * months
  const totalCogs = qty * (cogsPerUnit || 0) * months
  const netRevenue = Math.max(0, totalRevenue - totalCogs)
  return { monthlyCost, totalRevenue, totalCogs, netRevenue }
}
