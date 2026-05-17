import { format, isToday, isYesterday } from 'date-fns'

const STAGE_LABELS = {
  lead: 'Lead',
  qualified: 'Qualified',
  discovery: 'Discovery',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  contracted: 'Contracted',
  closed_lost: 'Closed Lost',
}

const DEAL_TYPE_LABELS = {
  new: 'New Business',
  renewal: 'Renewal',
  expansion: 'Expansion',
  upsell: 'Upsell',
}

function fmtMoney(val) {
  const n = parseFloat(val)
  if (!n && n !== 0) return null
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPct(val) {
  const n = parseFloat(val)
  if (n == null || isNaN(n)) return null
  // commission_pct is stored as decimal (0.02 = 2%)
  const pct = n <= 1 ? n * 100 : n
  return pct.toFixed(1) + '%'
}

function fmtDate(val) {
  if (!val) return null
  try { return format(new Date(val + 'T12:00:00'), 'MMM d, yyyy') } catch { return val }
}


// Keys to never show in diffs (internal/noise)
const IGNORE_KEYS = new Set([
  'updated_at', 'created_at', 'id', 'deal_id', 'product_id',
  'amendment_id', 'cancellation_amendment_id',
  'base_rate', 'support_product_ids', 'deleted_at',
  'net_revenue', // derived field, shown via total_revenue
])

function changedKeys(ov, nv) {
  if (!ov || !nv) return []
  return Object.keys(nv).filter(
    (k) => !IGNORE_KEYS.has(k) && JSON.stringify(ov[k]) !== JSON.stringify(nv[k])
  )
}

// Human-readable field labels
const DEAL_FIELD_LABELS = {
  stage: 'Stage',
  name: 'Name',
  company_name: 'Customer',
  deal_type: 'Type',
  contract_start: 'Start',
  contract_end: 'End',
  contract_months: 'Term',
  acv: 'ACV',
  total_contract_value: 'Contract Value',
  notes: 'Notes',
  is_tbn_property: 'TBN Property',
}

const DP_FIELD_LABELS = {
  total_revenue: 'Revenue',
  annual_value: 'Annual Value',
  monthly_value: 'Monthly',
  list_price: 'List Price',
  cogs_amount: 'COGS',
  commission_amount: 'Commission',
  commission_metric: 'Basis',
  billing_months: 'Term',
  billing_start_date: 'Billing Start',
  billing_mode: 'Billing Mode',
  discount_pct: 'Discount',
  markup_pct: 'Markup',
  quantity: 'Quantity',
  monthly_quantity: 'Monthly Qty',
  unit_price_snapshot: 'Unit Price',
  cogs_per_unit_snapshot: 'COGS/Unit',
  monthly_cost: 'Monthly Cost',
  status: 'Status',
  support_pct: 'Support %',
}

const TEAM_FIELD_LABELS = {
  commission_pct: 'Rate',
  role: 'Role',
}

/**
 * Format a field value for display given its key context.
 */
function fmtFieldValue(k, v) {
  if (v == null) return '—'
  if (k === 'stage') return STAGE_LABELS[v] || v
  if (k === 'deal_type') return DEAL_TYPE_LABELS[v] || v
  if (k === 'contract_start' || k === 'contract_end' || k === 'billing_start_date') return fmtDate(v)
  if (k === 'contract_months' || k === 'billing_months') return `${v} mo`
  if (k === 'is_tbn_property') return v ? 'Yes' : 'No'
  if (k === 'commission_pct') return fmtPct(v)
  if (k === 'discount_pct' || k === 'markup_pct' || k === 'support_pct') {
    return parseFloat(v) > 0 ? `${parseFloat(v).toFixed(1)}%` : '—'
  }
  if (k === 'monthly_value') return fmtMoney(v) ? `${fmtMoney(v)}/mo` : null
  if (k === 'commission_metric') return v  // display as-is: "NAVC/RAV", "GM", etc.
  if (['total_revenue','annual_value','list_price','cogs_amount','commission_amount',
       'unit_price_snapshot','cogs_per_unit_snapshot','monthly_cost'].includes(k)) {
    return fmtMoney(v)
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

/**
 * Build detail chips from a diff between old_values and new_values.
 * Returns { k, old, new } so renderers can style them distinctly.
 */
function buildDiffDetail(ov, nv, labelMap) {
  const diff = changedKeys(ov, nv).filter((k) => labelMap[k])
  return diff.map((k) => ({
    k: labelMap[k],
    old: fmtFieldValue(k, ov[k]),
    new: fmtFieldValue(k, nv[k]),
  }))
}

/**
 * Build insert detail chips from new_values.
 */
function buildInsertDetail(nv, labelMap, skip = []) {
  return Object.entries(labelMap)
    .filter(([k]) => !skip.includes(k) && nv?.[k] != null && nv[k] !== '' && nv[k] !== false && (nv[k] !== 0 || k === 'commission_amount'))
    .map(([k, label]) => ({ k: label, v: fmtFieldValue(k, nv[k]) }))
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a raw audit_log row into a display-friendly object.
 *
 * Returns:
 *   label   — primary one-line description
 *   detail  — array of { k, v } pairs rendered as chips
 *   type    — visual category
 *   skip    — true if entry is pure noise (nothing meaningful changed)
 */
export function formatAuditEntry(entry, { products = [], dealProducts = [], people = [] } = {}) {
  const { table_name, action, old_values: ov, new_values: nv, description } = entry

  function productName(id) {
    const fromProducts = products.find((p) => p.id === id)?.name
    const fromDp = dealProducts.find((dp) => dp.product_id === id)?.products?.name
    return fromProducts || fromDp || 'Product'
  }

  function personName(id) {
    return people.find((p) => p.id === id)?.name || null
  }

  // ── event ──────────────────────────────────────────────────────────────────
  if (table_name === 'event') {
    return { label: description || 'Event logged', detail: [], type: 'event' }
  }

  // ── deals ──────────────────────────────────────────────────────────────────
  if (table_name === 'deals') {
    if (action === 'insert') {
      const detail = buildInsertDetail(nv, DEAL_FIELD_LABELS, ['name', 'total_contract_value', 'acv'])
      return { label: 'Deal Created', subject: nv?.name || null, detail, type: 'created' }
    }
    if (action === 'delete') {
      return { label: 'Deal Deleted', subject: ov?.name || null, detail: [], type: 'deleted' }
    }
    if (action === 'update') {
      const diff = changedKeys(ov, nv).filter((k) => DEAL_FIELD_LABELS[k])
      if (diff.length === 0) return { skip: true }

      let label = 'Deal Updated'
      if (diff.includes('stage')) {
        const from = STAGE_LABELS[ov?.stage] || ov?.stage
        const to   = STAGE_LABELS[nv?.stage] || nv?.stage
        label = `Stage: ${from} → ${to}`
      } else if (diff.includes('name') && nv?.name) {
        label = 'Deal Renamed'
      } else if (diff.includes('company_name') && nv?.company_name) {
        label = 'Customer Updated'
      } else if (diff.includes('contract_start') || diff.includes('contract_end')) {
        label = 'Contract Dates Updated'
      }

      const detail = buildDiffDetail(ov, nv, DEAL_FIELD_LABELS)
      return { label, subject: null, detail, type: 'updated' }
    }
  }

  // ── deal_products ──────────────────────────────────────────────────────────
  if (table_name === 'deal_products') {
    const name = productName(nv?.product_id || ov?.product_id)

    if (action === 'insert') {
      const detail = buildInsertDetail(nv, DP_FIELD_LABELS, ['status'])
      return { label: 'Product Added', subject: name, detail, type: 'created' }
    }

    if (action === 'delete') {
      const detail = buildInsertDetail(ov, DP_FIELD_LABELS, ['status'])
      return { label: 'Product Removed', subject: name, detail, type: 'deleted' }
    }

    if (action === 'update') {
      const diff = changedKeys(ov, nv)
      if (diff.length === 0) return { skip: true }

      if (nv?.status === 'cancelled' && ov?.status !== 'cancelled') {
        const detail = buildDiffDetail(ov, nv, DP_FIELD_LABELS)
        return { label: 'Product Cancelled', subject: name, detail, type: 'cancelled' }
      }
      if (nv?.status === 'active' && ov?.status === 'cancelled') {
        const detail = buildDiffDetail(ov, nv, DP_FIELD_LABELS)
        return { label: 'Product Reinstated', subject: name, detail, type: 'updated' }
      }

      const detail = buildDiffDetail(ov, nv, DP_FIELD_LABELS)
      if (detail.length === 0) return { skip: true }
      return { label: 'Product Updated', subject: name, detail, type: 'updated' }
    }
  }

  // ── deal_team ──────────────────────────────────────────────────────────────
  if (table_name === 'deal_team') {
    const vals = nv || ov
    const name = personName(vals?.person_id)
    if (action === 'insert') {
      const detail = buildInsertDetail(vals, TEAM_FIELD_LABELS)
      return { label: 'Team Member Added', subject: name, detail, type: 'team' }
    }
    if (action === 'delete') {
      const detail = buildInsertDetail(vals, TEAM_FIELD_LABELS)
      return { label: 'Team Member Removed', subject: name, detail, type: 'team' }
    }
    const detail = buildDiffDetail(ov, nv, TEAM_FIELD_LABELS)
    if (detail.length === 0) return { skip: true }
    return { label: 'Team Role Updated', subject: name, detail, type: 'team' }
  }

  // ── contracts ──────────────────────────────────────────────────────────────
  if (table_name === 'contracts') {
    const fname = nv?.file_name || ov?.file_name
    const detail = fname ? [{ k: 'File', v: fname }] : []
    if (action === 'insert') return { label: 'Contract Uploaded', subject: fname || null, detail, type: 'contract' }
    if (action === 'delete') return { label: 'Contract Removed', subject: fname || null, detail, type: 'deleted' }
    return { label: 'Contract Updated', subject: fname || null, detail, type: 'contract' }
  }

  // ── commission_settings ────────────────────────────────────────────────────
  if (table_name === 'commission_settings') {
    if (description) return { label: description, subject: null, detail: [], type: 'updated' }
    const oldRate = ov?.rate != null ? `${(parseFloat(ov.rate) * 100).toFixed(2)}%` : null
    const newRate = nv?.rate != null ? `${(parseFloat(nv.rate) * 100).toFixed(2)}%` : null
    const effectiveDate = nv?.effective_date ? fmtDate(nv.effective_date) : null
    const detail = []
    if (oldRate && newRate && oldRate !== newRate) detail.push({ k: 'Rate', old: oldRate, new: newRate })
    else if (newRate) detail.push({ k: 'Rate', v: newRate })
    if (effectiveDate) detail.push({ k: 'Effective', v: effectiveDate })
    if (detail.length === 0) return { skip: true }
    return { label: 'Commission Rate Updated', subject: null, detail, type: 'updated' }
  }

  return { label: `${table_name} ${action}`, subject: null, detail: [], type: 'updated' }
}

/**
 * Merge deal_products DELETE + INSERT pairs that occur within windowMs of each
 * other for the same product on the same deal into a single synthetic UPDATE.
 *
 * This handles the edit-form save pattern where all products are deleted then
 * re-inserted, making a quantity change appear as two separate entries.
 */
export function mergeDeleteInsertPairs(entries, windowMs = 15000) {
  const used = new Set()
  const result = []

  for (let i = 0; i < entries.length; i++) {
    if (used.has(i)) continue
    const e = entries[i]

    if (e.table_name !== 'deal_products' || (e.action !== 'delete' && e.action !== 'insert')) {
      result.push(e)
      continue
    }

    const eTime = new Date(e.created_at).getTime()
    const eProductId = (e.new_values || e.old_values)?.product_id
    const complement = e.action === 'delete' ? 'insert' : 'delete'

    let matchIdx = -1
    for (let j = 0; j < entries.length; j++) {
      if (j === i || used.has(j)) continue
      const e2 = entries[j]
      if (e2.table_name !== 'deal_products' || e2.action !== complement) continue
      if (e2.deal_id !== e.deal_id) continue
      const e2ProductId = (e2.new_values || e2.old_values)?.product_id
      if (e2ProductId !== eProductId) continue
      if (Math.abs(new Date(e2.created_at).getTime() - eTime) <= windowMs) {
        matchIdx = j
        break
      }
    }

    if (matchIdx === -1) {
      result.push(e)
      continue
    }

    used.add(i)
    used.add(matchIdx)

    const del = e.action === 'delete' ? e : entries[matchIdx]
    const ins = e.action === 'insert' ? e : entries[matchIdx]

    result.push({
      ...ins,
      action: 'update',
      old_values: del.old_values,
      new_values: ins.new_values,
      _merged: true,
    })
  }

  return result
}

/**
 * Group audit entries by human-readable date bucket.
 * Entries marked skip:true are filtered out automatically.
 */
export function groupEntriesByDate(entries, opts = {}) {
  const groups = []
  let currentLabel = null
  for (const entry of entries) {
    const formatted = formatAuditEntry(entry, opts)
    if (formatted.skip) continue
    const d = new Date(entry.created_at)
    const label = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'MMM d, yyyy')
    if (label !== currentLabel) {
      currentLabel = label
      groups.push({ label, entries: [] })
    }
    groups[groups.length - 1].entries.push({ entry, formatted })
  }
  return groups
}

/**
 * Visual style per entry type.
 */
export function auditTypeStyle(type) {
  switch (type) {
    case 'created':   return { dot: 'bg-green-400',  chip: 'bg-green-50 text-green-700' }
    case 'deleted':   return { dot: 'bg-red-400',    chip: 'bg-red-50 text-red-700' }
    case 'cancelled': return { dot: 'bg-amber-400',  chip: 'bg-amber-50 text-amber-700' }
    case 'contract':  return { dot: 'bg-blue-400',   chip: 'bg-blue-50 text-blue-700' }
    case 'team':      return { dot: 'bg-purple-400', chip: 'bg-purple-50 text-purple-700' }
    case 'event':     return { dot: 'bg-teal-400',   chip: 'bg-teal-50 text-teal-700' }
    default:          return { dot: 'bg-gray-300',   chip: 'bg-gray-50 text-gray-500' }
  }
}
