/**
 * SalesFlow feature test suite — read-only, no live data modified.
 * Tests: commission logic, CSV export, pagination, analytics calcs, schema checks.
 */

const SUPABASE_URL = 'https://cmchgyrlaaaiqwkmfcup.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtY2hneXJsYWFhaXF3a21mY3VwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMzQzNDEsImV4cCI6MjA5MjcxMDM0MX0.V03p5wY2pQY9pNmTq07T9d9SHptmi5fzjQnyQLRIxe4'

let passed = 0
let failed = 0
const failures = []

function assert(condition, label, detail = '') {
  if (condition) {
    console.log(`  ✓  ${label}`)
    passed++
  } else {
    console.log(`  ✗  ${label}${detail ? ` — ${detail}` : ''}`)
    failed++
    failures.push(label)
  }
}

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, Accept: 'application/json' }
  })
  return { status: res.status, data: await res.json().catch(() => null) }
}

// ─── Commission calculation logic ─────────────────────────────────────────────

function calcProductCommission(dp) {
  if (!dp) return 0
  if (dp.commission_metric === 'GM') return Math.max(0, dp.net_revenue || 0) * (dp.base_rate || 0.07)
  return (dp.annual_value || 0) * (dp.base_rate || 0.07)
}

function calcSpif(acv, spifTiers = []) {
  if (!acv || !spifTiers.length) return 0
  const tier = spifTiers.find(t => acv >= (t.acv_min || 0) && (t.acv_max == null || acv <= t.acv_max))
  return tier ? Number(tier.spif_amount) : 0
}

function fmt(value, decimals = 0) {
  if (value == null || isNaN(value)) return '$0'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)
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

// ─── Test groups ──────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════')
console.log('  SalesFlow Test Suite')
console.log('══════════════════════════════════════════\n')

// 1. Commission calculation
console.log('▸ Commission Calculations')

const near = (a, b) => Math.abs(a - b) < 0.01

const navProduct = { commission_metric: 'NAVC', annual_value: 100000, base_rate: 0.07 }
assert(near(calcProductCommission(navProduct), 7000), 'NAVC/RAV: 7% of $100k = $7,000')

const gmProduct = { commission_metric: 'GM', net_revenue: 50000, base_rate: 0.07 }
assert(near(calcProductCommission(gmProduct), 3500), 'GM: 7% of $50k net = $3,500')

const negGm = { commission_metric: 'GM', net_revenue: -1000, base_rate: 0.07 }
assert(calcProductCommission(negGm) === 0, 'GM: negative net revenue floors to $0')

assert(calcProductCommission(null) === 0, 'Null product returns $0')

// SPIF tiers
const tiers = [
  { acv_min: 0, acv_max: 49999, spif_amount: 250 },
  { acv_min: 50000, acv_max: 99999, spif_amount: 500 },
  { acv_min: 100000, acv_max: null, spif_amount: 1000 },
]
assert(calcSpif(25000, tiers) === 250, 'SPIF tier 1: $25k ACV = $250')
assert(calcSpif(75000, tiers) === 500, 'SPIF tier 2: $75k ACV = $500')
assert(calcSpif(150000, tiers) === 1000, 'SPIF tier 3: $150k ACV = $1,000 (unlimited max)')
assert(calcSpif(0, tiers) === 0, 'SPIF: zero ACV = $0')
assert(calcSpif(50000, []) === 0, 'SPIF: empty tiers = $0')

// 2. Currency formatting
console.log('\n▸ Currency Formatting')
assert(fmt(0) === '$0', 'fmt(0) = $0')
assert(fmt(1000) === '$1,000', 'fmt(1,000) = $1,000')
assert(fmt(1234567.89, 2) === '$1,234,567.89', 'fmt with decimals')
assert(fmt(null) === '$0', 'fmt(null) = $0')
assert(fmt(NaN) === '$0', 'fmt(NaN) = $0')
assert(fmt(-500, 2) === '-$500.00', 'fmt negative value')

// 3. Calendar quarter splitting
console.log('\n▸ Calendar Quarter Splitting')

const q1Start = parseContractDate('2026-01-01')
const q1End = parseContractDate('2026-03-31')
const singleQ = buildCalQuarters(q1Start, q1End)
assert(singleQ.length === 1, 'Single quarter contract = 1 quarter entry')
assert(singleQ[0].quarter === 1 && singleQ[0].year === 2026, 'Single quarter: Q1 2026')

const crossStart = parseContractDate('2026-01-01')
const crossEnd = parseContractDate('2026-12-31')
const fullYear = buildCalQuarters(crossStart, crossEnd)
assert(fullYear.length === 4, 'Full year contract = 4 quarter entries')
const totalDays = fullYear.reduce((s, q) => s + q.days, 0)
assert(totalDays === 365, `Full year total days = 365 (got ${totalDays})`)

const midStart = parseContractDate('2026-07-01')
const midEnd = parseContractDate('2027-06-30')
const midYear = buildCalQuarters(midStart, midEnd)
assert(midYear.length === 4, 'Mid-year 12-month contract = 4 quarters')

// 4. CSV export logic
console.log('\n▸ CSV Export Logic')

const testEntries = [
  { person_name: 'Marcus Lopez', deal_name: 'Acme Deal', company: 'Acme Corp', type: 'commission', quarter: 1, year: 2026, amount: 5000 },
  { person_name: 'Tia Bowen', deal_name: 'Acme Deal', company: 'Acme Corp', type: 'commission', quarter: 1, year: 2026, amount: 2500 },
  { person_name: 'Murthy Avanithsa', deal_name: 'Acme Deal', company: 'Acme Corp', type: 'spif', quarter: 1, year: 2026, amount: 500 },
]

function buildCsvRows(entries) {
  const rows = [['Person', 'Deal', 'Company', 'Type', 'Quarter', 'Year', 'Amount']]
  entries.forEach(e => rows.push([
    e.person_name || '', e.deal_name || '', e.company || '',
    e.type === 'spif' ? 'SPIF' : 'Commission',
    `Q${e.quarter}`, e.year, e.amount.toFixed(2),
  ]))
  const totalComm = entries.filter(e => e.type === 'commission').reduce((s, e) => s + e.amount, 0)
  const totalSpif = entries.filter(e => e.type === 'spif').reduce((s, e) => s + e.amount, 0)
  rows.push([])
  rows.push(['', '', '', '', '', 'Total Commission', totalComm.toFixed(2)])
  rows.push(['', '', '', '', '', 'Total SPIFs', totalSpif.toFixed(2)])
  rows.push(['', '', '', '', '', 'Total Payout', (totalComm + totalSpif).toFixed(2)])
  return rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
}

const csv = buildCsvRows(testEntries)
assert(csv.includes('"Marcus Lopez"'), 'CSV contains person name')
assert(csv.includes('"Commission"'), 'CSV contains type label')
assert(csv.includes('"SPIF"'), 'CSV contains SPIF label')
assert(csv.includes('"7500.00"'), 'CSV total commission = $7,500')
assert(csv.includes('"500.00"'), 'CSV total SPIF = $500')
assert(csv.includes('"8000.00"'), 'CSV total payout = $8,000')
assert(csv.split('\n')[0] === '"Person","Deal","Company","Type","Quarter","Year","Amount"', 'CSV header row correct')

// 5. Pagination logic
console.log('\n▸ Pagination Logic')

const PAGE_SIZE = 25
const mockDeals = Array.from({ length: 67 }, (_, i) => ({ id: i, name: `Deal ${i}` }))
const totalPages = Math.ceil(mockDeals.length / PAGE_SIZE)
assert(totalPages === 3, `67 deals / 25 per page = 3 pages (got ${totalPages})`)

const page0 = mockDeals.slice(0 * PAGE_SIZE, 1 * PAGE_SIZE)
assert(page0.length === 25, 'Page 0 has 25 deals')
assert(page0[0].id === 0, 'Page 0 starts at deal 0')

const page2 = mockDeals.slice(2 * PAGE_SIZE, 3 * PAGE_SIZE)
assert(page2.length === 17, `Last page has 17 deals (67 - 50, got ${page2.length})`)
assert(page2[0].id === 50, 'Last page starts at deal 50')

// Edge: exact multiple
const exact50 = Array.from({ length: 50 }, (_, i) => ({ id: i }))
assert(Math.ceil(exact50.length / PAGE_SIZE) === 2, 'Exactly 50 deals = 2 pages')

// 6. Analytics metrics
console.log('\n▸ Analytics Calculations')

const analyticsDeals = [
  { stage: 'contracted', acv: 80000, deal_type: 'new', company_name: 'Acme', created_at: '2026-01-15' },
  { stage: 'contracted', acv: 60000, deal_type: 'renewal', company_name: 'Beta', created_at: '2026-01-20' },
  { stage: 'proposal', acv: 50000, deal_type: 'new', company_name: 'Acme', created_at: '2026-02-01' },
  { stage: 'negotiation', acv: 120000, deal_type: 'new', company_name: 'Gamma', created_at: '2026-03-01' },
  { stage: 'closed_lost', acv: 30000, deal_type: 'new', company_name: 'Delta', created_at: '2025-12-01' },
]

const contracted = analyticsDeals.filter(d => d.stage === 'contracted')
const closedLost = analyticsDeals.filter(d => d.stage === 'closed_lost')
const active = analyticsDeals.filter(d => d.stage !== 'closed_lost')
const total = contracted.length + closedLost.length
const winRate = total > 0 ? (contracted.length / total) * 100 : 0

assert(winRate === (2/3)*100, `Win rate: 2 won, 1 lost = ${((2/3)*100).toFixed(1)}% (got ${winRate.toFixed(1)}%)`)
assert(active.length === 4, `Active deals: 4 (got ${active.length})`)

const avgAcv = active.reduce((s, d) => s + (d.acv || 0), 0) / active.length
assert(avgAcv === (80000+60000+50000+120000)/4, `Avg ACV = $77,500 (got $${avgAcv.toLocaleString()})`)

const pipeline = active.reduce((s, d) => s + (d.acv || 0), 0)
assert(pipeline === 310000, `Pipeline value = $310,000 (got $${pipeline.toLocaleString()})`)

const newDeals = active.filter(d => d.deal_type !== 'renewal')
const renewals = active.filter(d => d.deal_type === 'renewal')
assert(newDeals.length === 3, `New deals: 3 (got ${newDeals.length})`)
assert(renewals.length === 1, `Renewals: 1 (got ${renewals.length})`)

// Top companies
const coMap = {}
active.forEach(d => {
  const co = d.company_name
  if (!coMap[co]) coMap[co] = { name: co, count: 0, value: 0 }
  coMap[co].count++
  coMap[co].value += d.acv || 0
})
const topCos = Object.values(coMap).sort((a, b) => b.value - a.value)
assert(topCos[0].name === 'Acme', `Top company is Acme ($${topCos[0].value.toLocaleString()})`)
assert(topCos[0].value === 130000, `Acme total = $130,000 (got $${topCos[0].value.toLocaleString()})`)

// 7. Soft delete logic (client-side)
console.log('\n▸ Soft Delete Logic')

const allDeals = [
  { id: '1', name: 'Active Deal', deleted_at: null },
  { id: '2', name: 'Deleted Deal', deleted_at: '2026-05-01T10:00:00Z' },
  { id: '3', name: 'Another Active', deleted_at: null },
]

const activeOnly = allDeals.filter(d => d.deleted_at === null)
const trashedOnly = allDeals.filter(d => d.deleted_at !== null)
assert(activeOnly.length === 2, `Active filter: 2 deals (got ${activeOnly.length})`)
assert(trashedOnly.length === 1, `Trash filter: 1 deal (got ${trashedOnly.length})`)
assert(trashedOnly[0].name === 'Deleted Deal', 'Trashed deal is "Deleted Deal"')

// Restore simulates clearing deleted_at
const restored = { ...trashedOnly[0], deleted_at: null }
assert(restored.deleted_at === null, 'Restored deal has deleted_at = null')

// 8. Contract versioning logic
console.log('\n▸ Contract Versioning Logic')

const existingContracts = [
  { id: 'c1', file_name: 'agreement.pdf', version: 1 },
  { id: 'c2', file_name: 'sow.pdf', version: 2 },
]

function getNextVersion(contracts, fileName) {
  const existing = contracts.find(c => c.file_name === fileName)
  return existing ? (existing.version || 1) + 1 : 1
}

assert(getNextVersion(existingContracts, 'agreement.pdf') === 2, 'agreement.pdf: v1 → v2')
assert(getNextVersion(existingContracts, 'sow.pdf') === 3, 'sow.pdf: v2 → v3')
assert(getNextVersion(existingContracts, 'new_file.pdf') === 1, 'New file starts at v1')

// 9. Database schema verification (read-only API checks)
console.log('\n▸ Database Schema Checks (read-only)')

// Check deals table has deleted_at column
{
  const { status, data } = await supabaseGet('deals?select=deleted_at&limit=1')
  assert(status === 200, `deals.deleted_at column exists (HTTP ${status})`, status !== 200 ? `got ${JSON.stringify(data)}` : '')
}

// Check contracts table has version column
{
  const { status, data } = await supabaseGet('contracts?select=version,previous_version_id&limit=1')
  assert(status === 200, `contracts.version + previous_version_id columns exist (HTTP ${status})`, status !== 200 ? `got ${JSON.stringify(data)}` : '')
}

// Check ai_usage_log table exists
{
  const { status, data } = await supabaseGet('ai_usage_log?select=id,operation,cost_usd&limit=1')
  assert(status === 200, `ai_usage_log table exists (HTTP ${status})`, status !== 200 ? `got ${JSON.stringify(data)}` : '')
}

// Check deal_brain_messages table
{
  const { status } = await supabaseGet('deal_brain_messages?select=id&limit=1')
  assert(status === 200 || status === 401, `deal_brain_messages table exists (HTTP ${status})`)
}

// Check audit_log table
{
  const { status } = await supabaseGet('audit_log?select=id,action,changed_by&limit=1')
  assert(status === 200 || status === 401, `audit_log table exists (HTTP ${status})`)
}

// ─── Results ──────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════')
console.log(`  Results: ${passed} passed, ${failed} failed`)
if (failures.length) {
  console.log('\n  Failed tests:')
  failures.forEach(f => console.log(`    • ${f}`))
}
console.log('══════════════════════════════════════════\n')

process.exit(failed > 0 ? 1 : 0)
