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
 * @param {string} billingMode     - 'monthly' (qty×price×months) or 'fixed' (qty×price = total)
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

function parseContractDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function buildCalQuarters(startDate, endDate) {
  const quarters = []
  let cursor = new Date(startDate.getFullYear(), Math.floor(startDate.getMonth() / 3) * 3, 1)
  while (cursor <= endDate) {
    const qYear = cursor.getFullYear()
    const qIdx = Math.floor(cursor.getMonth() / 3)
    const qStart = new Date(qYear, qIdx * 3, 1)
    const qEnd = new Date(qYear, qIdx * 3 + 3, 0)
    const overlapStart = startDate > qStart ? startDate : qStart
    const overlapEnd = endDate < qEnd ? endDate : qEnd
    const days = Math.round((overlapEnd - overlapStart) / 86400000) + 1
    quarters.push({ year: qYear, quarter: qIdx + 1, days })
    cursor = new Date(qYear, qIdx * 3 + 3, 1)
  }
  return quarters
}

/**
 * Build the full quarterly commission schedule for a deal.
 *
 * Commission is calculated per product. Each product can use:
 *  - Milestone billing: commission distributed proportionally to milestone payment dates
 *  - Per-product date overrides: billing_start_date / billing_months override deal dates
 *  - Default: prorated by calendar quarter using deal dates
 *
 * SPIF rule: paid in the same quarter as contract execution.
 *
 * @param {object} deal        - { contract_start, contract_months, is_tbn_property }
 * @param {array}  dealProducts - [{ commission_amount, milestones?, billing_start_date?, billing_months?, ... }]
 * @param {array}  dealTeam    - [{ person_id, role, commission_percent, spif_amount, person_name }]
 * @returns {array} schedule entries [{ quarter, year, person_id, type, amount }]
 */
export function buildCommissionSchedule(deal, dealProducts, dealTeam) {
  if (deal.is_tbn_property) return []

  const salesTeam = dealTeam.filter((m) => m.role === 'sales')
  const totalSpif = dealTeam.reduce((sum, m) => sum + (m.spif_amount || 0), 0)

  const dealStartDate = deal.contract_start ? parseContractDate(deal.contract_start) : new Date()
  const spifCalYear = dealStartDate.getFullYear()
  const spifCalQuarter = Math.floor(dealStartDate.getMonth() / 3) + 1

  // Accumulate commission per calendar quarter across all products
  const quarterMap = {}
  function addToQuarter(year, quarter, amount) {
    const key = `${year}-${quarter}`
    if (!quarterMap[key]) quarterMap[key] = { year, quarter, amount: 0 }
    quarterMap[key].amount += amount
  }

  dealProducts.forEach((dp) => {
    const productCommission = dp.commission_amount || 0
    if (productCommission <= 0) return

    const milestones = dp.milestones || []

    if (milestones.length > 0) {
      const totalMilestoneAmt = milestones.reduce((s, m) => s + (parseFloat(m.amount) || 0), 0)
      if (totalMilestoneAmt <= 0) return
      milestones.forEach((m) => {
        if (!m.payment_date) return
        const date = parseContractDate(m.payment_date)
        const quarter = Math.floor(date.getMonth() / 3) + 1
        const year = date.getFullYear()
        const fraction = (parseFloat(m.amount) || 0) / totalMilestoneAmt
        addToQuarter(year, quarter, productCommission * fraction)
      })
    } else {
      const startDate = dp.billing_start_date ? parseContractDate(dp.billing_start_date) : dealStartDate
      const months = dp.billing_months || deal.contract_months || 12
      const endDate = new Date(startDate)
      endDate.setMonth(endDate.getMonth() + months)
      endDate.setDate(endDate.getDate() - 1)

      // Cap at the deal's contract end so products with a late billing_start_date
      // don't schedule commissions beyond the contract period.
      const dealEndDate = new Date(dealStartDate)
      dealEndDate.setMonth(dealEndDate.getMonth() + (deal.contract_months || 12))
      dealEndDate.setDate(dealEndDate.getDate() - 1)
      if (endDate > dealEndDate) endDate.setTime(dealEndDate.getTime())
      if (startDate > dealEndDate) return // product starts after contract ends — skip

      const calQuarters = buildCalQuarters(startDate, endDate)
      const totalDays = calQuarters.reduce((s, q) => s + q.days, 0)
      calQuarters.forEach(({ year, quarter, days }) => {
        addToQuarter(year, quarter, productCommission * (days / totalDays))
      })
    }
  })

  const schedule = []

  // SPIFs paid in execution quarter
  dealTeam.forEach((member) => {
    const amt = member.spif_amount || 0
    if (amt > 0) {
      schedule.push({
        quarter: spifCalQuarter,
        year: spifCalYear,
        person_id: member.person_id,
        person_name: member.person_name,
        role: member.role,
        type: 'spif',
        amount: amt,
      })
    }
  })

  // Commission entries per quarter
  Object.values(quarterMap).forEach(({ year, quarter, amount }) => {
    const isSpifQuarter = year === spifCalYear && quarter === spifCalQuarter
    const distributable = isSpifQuarter ? Math.max(0, amount - totalSpif) : amount

    salesTeam.forEach((member) => {
      const allocation = (member.commission_percent || 0) / 100
      const memberAmount = Math.max(0, distributable * allocation)
      if (allocation > 0) {
        schedule.push({
          quarter,
          year,
          person_id: member.person_id,
          person_name: member.person_name,
          role: 'sales',
          type: 'commission',
          amount: memberAmount,
        })
      }
    })
  })

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

/**
 * Return margin tier: 'green' (≥30%), 'yellow' (15-29%), 'red' (<15%).
 * Pass acv (Trilogy ACV) and totalCogs. Returns null if no COGS data.
 */
export function getMarginTier(acv, totalCogs) {
  if (!acv || !totalCogs || totalCogs <= 0) return null
  const pct = (acv - totalCogs) / acv
  if (pct >= 0.30) return 'green'
  if (pct >= 0.15) return 'yellow'
  return 'red'
}
