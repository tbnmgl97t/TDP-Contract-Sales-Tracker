/**
 * Margin calculation functions for SalesFlow / Trilogy Digital.
 *
 * Approval thresholds, tier classification, and margin math live here.
 * Nothing UI-specific — all pure functions.
 */

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Single source of truth for margin approval thresholds (as decimals). */
export const MARGIN_THRESHOLDS = {
  GREEN: 0.30,   // ≥ 30% → auto-approved
  YELLOW: 0.15,  // 15–29% → manager review
  // < 15% → RED, requires explicit manager approval
}

// ---------------------------------------------------------------------------
// Tier classification
// ---------------------------------------------------------------------------

/**
 * Return the margin tier for a deal.
 * Returns null when there is no COGS data (can't compute a meaningful tier).
 *
 * @param {number} acv       — Trilogy ACV (productAcv, before partner markup)
 * @param {number} totalCogs — sum of all product COGS
 * @returns {'green' | 'yellow' | 'red' | null}
 */
export function getMarginTier(acv, totalCogs) {
  if (!acv || !totalCogs || totalCogs <= 0) return null
  const pct = (acv - totalCogs) / acv
  if (pct >= MARGIN_THRESHOLDS.GREEN) return 'green'
  if (pct >= MARGIN_THRESHOLDS.YELLOW) return 'yellow'
  return 'red'
}

// ---------------------------------------------------------------------------
// Margin calculations
// ---------------------------------------------------------------------------

/**
 * Margin percentage as a decimal (0–1).
 * Returns null when inputs are missing or acv is zero — callers should treat
 * null as "no margin data" and hide or show '—' rather than defaulting to 0.
 *
 * @param {number} acv       — revenue / ACV base
 * @param {number} totalCogs — COGS to subtract
 * @returns {number | null}
 */
export function getMarginPct(acv, totalCogs) {
  if (!acv || acv <= 0) return null
  return (acv - (totalCogs || 0)) / acv
}

/**
 * Gross margin = revenue − COGS.
 * For per-product margin display.
 */
export function calcMargin(revenue, cogs) {
  return (revenue || 0) - (cogs || 0)
}

/**
 * Derive implied COGS from a stored margin_pct (decimal 0–1).
 * Used when COGS is not stored directly (e.g. Deals.jsx approval lookup).
 *
 * @param {number} acv       — revenue base
 * @param {number} marginPct — stored margin_pct decimal (e.g. 0.32 = 32%)
 * @returns {number}
 */
export function calcCogsFromMarginPct(acv, marginPct) {
  return (acv || 0) * (1 - (marginPct || 0))
}
