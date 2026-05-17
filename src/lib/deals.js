/**
 * Deal-level aggregation functions for SalesFlow / Trilogy Digital.
 *
 * These functions operate across a full deal (arrays of deal_products,
 * deal_partners, deal_team, schedule entries). For per-product math see
 * products.js; for margin tiers see margin.js.
 */

import { effectiveCogs, resolveProductValue } from './products'

// ---------------------------------------------------------------------------
// ACV + Partner stacking
// ---------------------------------------------------------------------------

/**
 * Sum Trilogy-side ACV across all products (before partner markup).
 * GM products use yearly_cost (or net+COGS); NAVC/RAV use annual_value.
 */
export function computeProductAcv(dealProducts) {
  return (dealProducts || []).reduce((s, p) => {
    if (p.commission_metric === 'GM') {
      if (p.monthly_cost != null && p.monthly_cost > 0) return s + p.monthly_cost * 12
      return s + (p.yearly_cost || (p.net_revenue || 0) + (p.cogs_amount || 0))
    }
    return s + (p.annual_value || 0)
  }, 0)
}

/**
 * Stack partner commissions on top of productAcv.
 *
 * Formula: each layer uses `prev / (1 − pct)` so the partner earns their
 * percentage of the *final customer price*, not of Trilogy's price.
 * Example: Trilogy ACV $1,000 + 20% partner → customer pays $1,250
 * ($250 = 20% of $1,250, not 20% of $1,000).
 *
 * @param {number} productAcv        — Trilogy ACV before partner markup
 * @param {array}  dealPartners      — rows from deal_partners (with commission_pct as 0–100 string)
 * @returns {{ partnerStack, customerAcv, partnerMultiplier }}
 */
export function computePartnerStack(productAcv, dealPartners) {
  let _cv = productAcv
  const partnerStack = (dealPartners || []).map((dp) => {
    const pct = parseFloat(dp.commission_pct) / 100
    const prev = _cv
    _cv = pct > 0 && pct < 1 ? prev / (1 - pct) : prev
    return { ...dp, commission_amount: _cv - prev }
  })
  const customerAcv = _cv
  const partnerMultiplier = productAcv > 0 ? customerAcv / productAcv : 1
  return { partnerStack, customerAcv, partnerMultiplier }
}

/**
 * Convenience wrapper — returns all deal-level financial totals in one call.
 * @returns {{ productAcv, customerAcv, partnerMultiplier, partnerStack, totalCogs, totalCommission }}
 */
export function computeDealTotals(dealProducts, dealPartners) {
  const productAcv = computeProductAcv(dealProducts)
  const { partnerStack, customerAcv, partnerMultiplier } = computePartnerStack(productAcv, dealPartners)
  const totalCogs = calcTotalCogs(dealProducts)
  const totalCommission = calcTotalCommission(dealProducts)
  return { productAcv, customerAcv, partnerMultiplier, partnerStack, totalCogs, totalCommission }
}

// ---------------------------------------------------------------------------
// Deal-level aggregation totals
// ---------------------------------------------------------------------------

/** Sum resolved revenue values across all deal products. */
export function calcTotalRevenue(dealProducts) {
  return (dealProducts || []).reduce((s, p) => s + resolveProductValue(p), 0)
}

/** Sum effective COGS across all deal products. */
export function calcTotalCogs(dealProducts) {
  return (dealProducts || []).reduce((s, p) => s + effectiveCogs(p), 0)
}

/** Sum saved commission_amount across all deal products. */
export function calcTotalCommission(dealProducts) {
  return (dealProducts || []).reduce((s, p) => s + (p.commission_amount || 0), 0)
}

/** Sum SPIF amounts across support team members. */
export function calcTotalSpif(dealTeam) {
  return (dealTeam || []).reduce((s, m) => s + (m.spif_amount || 0), 0)
}

/** Total payout = commission + SPIFs. */
export function calcTotalPayout(totalCommission, totalSpif) {
  return (totalCommission || 0) + (totalSpif || 0)
}

/** Trilogy Margin = Trilogy ACV − total COGS. */
export function calcTrilogyMargin(productAcv, totalCogs) {
  return (productAcv || 0) - (totalCogs || 0)
}

/** Trilogy Net = Trilogy ACV − COGS − internal payouts. */
export function calcTrilogyNet(productAcv, totalCogs, totalPayout) {
  return (productAcv || 0) - (totalCogs || 0) - (totalPayout || 0)
}

/** Total contract value = customerAcv × (contractMonths / 12). */
export function calcTotalContractValue(customerAcv, contractMonths) {
  return (customerAcv || 0) * ((parseInt(contractMonths) || 12) / 12)
}

/** Individual sales commission = totalCommission × (commissionPct / 100). */
export function calcIndividualCommission(totalCommission, commissionPct) {
  return (totalCommission || 0) * ((commissionPct || 0) / 100)
}

/** Estimated commission for early-stage deals without product data. */
export function calcEstimatedCommission(acv, rate) {
  return (acv || 0) * ((rate || 0) / 100)
}

/**
 * Prorated revenue + COGS contribution from cancelled products.
 *
 * Cancelled products are excluded from active ACV but still generated
 * revenue for the months they were active. This function accumulates
 * those prorated amounts so they can be added back to deal totals.
 *
 * @param {array}  dealProducts   — full product list (all statuses)
 * @param {number} contractMonths — deal contract length in months (default 12)
 * @returns {{ revenue: number, cogs: number }}
 */
export function calcCancelledContributions(dealProducts, contractMonths = 12) {
  return (dealProducts || [])
    .filter((dp) => dp.status === 'cancelled')
    .reduce((acc, dp) => {
      const activeMonths = dp.billing_months ?? contractMonths
      const ratio = activeMonths / contractMonths
      return {
        revenue: acc.revenue + resolveProductValue(dp) * ratio,
        cogs:    acc.cogs    + effectiveCogs(dp) * ratio,
      }
    }, { revenue: 0, cogs: 0 })
}

// ---------------------------------------------------------------------------
// Date / schedule helpers
// ---------------------------------------------------------------------------

/**
 * Number of whole months between two Date objects (or date strings).
 * Uses calendar month arithmetic: (y2 − y1) × 12 + (m2 − m1).
 */
export function calcMonthsBetweenDates(start, end) {
  const s = start instanceof Date ? start : new Date(start + 'T00:00:00')
  const e = end instanceof Date ? end : new Date(end + 'T00:00:00')
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
}

/**
 * Group a flat commission schedule array into an object keyed by
 * "YYYY QN" for display in quarterly tables.
 *
 * @param {array} schedule — entries from buildCommissionSchedule()
 * @returns {object} — { "2025 Q1": { key, quarter, year, entries[] }, ... }
 */
export function groupScheduleByQuarter(schedule) {
  return (schedule || []).reduce((acc, entry) => {
    const key = `${entry.year} Q${entry.quarter}`
    if (!acc[key]) acc[key] = { key, quarter: entry.quarter, year: entry.year, entries: [] }
    acc[key].entries.push(entry)
    return acc
  }, {})
}
