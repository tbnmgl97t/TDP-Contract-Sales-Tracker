/**
 * Commission calculation engine for SalesFlow / Trilogy Digital.
 *
 * Rules:
 * - NAVC/RAV products: commission = annual_value × base_rate
 * - GM products (JWX resell): commission = net_revenue × base_rate
 *   where net_revenue = (qty × unit_price × months) - (qty × cogs_per_unit × months)
 * - SPIFs are subtracted from the total commission pool (annual) and paid one-time
 *   in the quarter FOLLOWING contract execution. Net pool is split quarterly.
 * - TBN properties are excluded from commissions.
 */

/**
 * Calculate commission amount for one deal product.
 */
export function calcProductCommission(dp) {
  if (!dp) return 0
  if (dp.commission_metric === 'GM') {
    return Math.max(0, dp.net_revenue || 0) * (dp.base_rate || 0.07)
  }
  // NAVC/RAV
  return (dp.annual_value || 0) * (dp.base_rate || 0.07)
}

/**
 * Calculate JWX/usage-based product values given the current pricing params.
 *
 * @param {number} monthlyQuantity - units per month (GB, hours, etc.)
 * @param {number} unitPrice       - revenue per unit (from product_pricing_params)
 * @param {number} cogsPerUnit     - COGS per unit (from product_pricing_params)
 * @param {number} contractMonths  - length of contract in months
 * @returns {{ monthlyCost, totalRevenue, totalCogs, netRevenue }}
 */
export function calcJwxValues(monthlyQuantity, unitPrice, cogsPerUnit, contractMonths) {
  const qty = monthlyQuantity || 0
  const months = contractMonths || 12
  const monthlyCost = qty * (unitPrice || 0)
  const totalRevenue = monthlyCost * months
  const totalCogs = qty * (cogsPerUnit || 0) * months
  const netRevenue = Math.max(0, totalRevenue - totalCogs)
  return { monthlyCost, totalRevenue, totalCogs, netRevenue }
}

/**
 * Calculate SPIF for a support person based on deal ACV.
 * Tiers: acv_min (inclusive), acv_max (inclusive, null = unlimited).
 */
export function calcSpif(acv, spifTiers = []) {
  if (!acv || !spifTiers.length) return 0
  const tier = spifTiers.find((t) => {
    const above = acv >= (t.acv_min || 0)
    const below = t.acv_max == null || acv <= t.acv_max
    return above && below
  })
  return tier ? Number(tier.spif_amount) : 0
}

/**
 * Build the full quarterly commission schedule for a deal.
 *
 * SPIF rule: paid one-time in the quarter FOLLOWING contract start.
 * Commission rule: total annual commission minus total SPIFs, paid quarterly.
 *
 * @param {object} deal - { contract_start, contract_months, acv, is_tbn_property }
 * @param {array}  dealProducts - [{ commission_amount, ... }]
 * @param {array}  dealTeam     - [{ person_id, role, commission_percent, spif_amount }]
 * @returns {array} schedule entries [{ quarter, year, person_id, type, amount }]
 */
export function buildCommissionSchedule(deal, dealProducts, dealTeam) {
  if (deal.is_tbn_property) return []

  const totalAnnualCommission = dealProducts.reduce(
    (sum, p) => sum + (p.commission_amount || 0),
    0
  )

  const months = deal.contract_months || 12
  const quarters = Math.ceil(months / 3)
  const startDate = deal.contract_start ? new Date(deal.contract_start) : new Date()

  const salesTeam = dealTeam.filter((m) => m.role === 'sales')
  const supportTeam = dealTeam.filter((m) => m.role === 'support')

  const totalSpif = supportTeam.reduce((sum, m) => sum + (m.spif_amount || 0), 0)
  const netAnnualCommission = Math.max(0, totalAnnualCommission - totalSpif)
  const quarterlyCommission = netAnnualCommission / 4

  const schedule = []

  // SPIFs paid in Q+1 (quarter following contract execution) — one-time
  const spifDate = new Date(startDate)
  spifDate.setMonth(spifDate.getMonth() + 3)
  const spifCalYear = spifDate.getFullYear()
  const spifCalQuarter = Math.floor(spifDate.getMonth() / 3) + 1

  supportTeam.forEach((member) => {
    const amt = member.spif_amount || 0
    if (amt > 0) {
      schedule.push({
        quarter: spifCalQuarter,
        year: spifCalYear,
        person_id: member.person_id,
        person_name: member.person_name,
        role: 'support',
        type: 'spif',
        amount: amt,
      })
    }
  })

  // Quarterly commissions for sales team
  for (let q = 0; q < quarters; q++) {
    const qDate = new Date(startDate)
    qDate.setMonth(qDate.getMonth() + q * 3)
    const calYear = qDate.getFullYear()
    const calQuarter = Math.floor(qDate.getMonth() / 3) + 1

    salesTeam.forEach((member) => {
      const allocation = (member.commission_percent || 0) / 100
      const amount = quarterlyCommission * allocation
      if (allocation > 0) {
        schedule.push({
          quarter: calQuarter,
          year: calYear,
          person_id: member.person_id,
          person_name: member.person_name,
          role: 'sales',
          type: 'commission',
          amount,
        })
      }
    })
  }

  return schedule
}

/** Format as USD currency. */
export function fmt(value, decimals = 0) {
  if (value == null || isNaN(value)) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

/** Format as percentage display (e.g., 0.07 → "7%"). */
export function fmtPct(value) {
  if (value == null) return '0%'
  return `${(Number(value) * 100).toFixed(1)}%`
}
