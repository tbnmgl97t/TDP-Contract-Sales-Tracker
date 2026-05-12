import { useState, useEffect } from 'react'
import { format, addDays } from 'date-fns'
import { X, AlertTriangle, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Modal from './ui/Modal'
import Button from './ui/Button'
import Input, { Select, Textarea } from './ui/Input'
import CurrencyInput from './ui/CurrencyInput'
import { fmt, calcProductCommission, buildCommissionSchedule } from '../lib/commission'
import { calcJwxValues, applyDiscount, applyMarkup, calcMilestoneTotal, productLineTotal, effectiveCogs } from '../lib/products'
import { calcMonthsBetweenDates, computePartnerStack } from '../lib/deals'
import { getMarginPct, getMarginTier } from '../lib/margin'

// ─── helpers ────────────────────────────────────────────────────────────────

function addDaysStr(dateStr, days) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const result = addDays(new Date(y, m - 1, d), days)
  return format(result, 'yyyy-MM-dd')
}

function monthsBetweenStr(startStr, endStr) {
  if (!startStr || !endStr) return 0
  return Math.max(0, calcMonthsBetweenDates(
    new Date(startStr + 'T00:00:00'),
    new Date(endStr + 'T00:00:00')
  ))
}

// ─── main component ──────────────────────────────────────────────────────────

export default function AmendDealModal({ deal, dealProducts, dealTeam, dealPartners, globalRate, products, onAmended, onClose }) {
  const [tab, setTab] = useState('cancel')   // 'cancel' | 'add'
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // ── Cancel tab state ──────────────────────────────────────────────────────
  const [selectedProductId, setSelectedProductId] = useState('')
  const [noticeDate, setNoticeDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [effectiveDate, setEffectiveDate] = useState(addDaysStr(format(new Date(), 'yyyy-MM-dd'), 30))
  const [cancelNote, setCancelNote] = useState('')

  // ── Add tab state ─────────────────────────────────────────────────────────
  const [addStartDate, setAddStartDate] = useState('')
  const [addNote, setAddNote] = useState('')
  const [addItem, setAddItem] = useState({
    _id: Date.now(),
    product_id: '',
    commission_amount: 0,
    annual_value: 0,
    monthly_value: '',
    cogs_amount: 0,
    list_price: 0,
    discount_pct: '',
    billing_months: '',
    billing_mode: 'monthly',
    commission_metric: '',
    base_rate: globalRate || 0.07,
    _trilogy_margin_pct: '',
    cogs_per_unit: '',
    unit_price: '',
    monthly_quantity: '',
  })

  // Recalculate billing_months for the added product when start date changes
  useEffect(() => {
    if (!addStartDate || !deal.contract_end) return
    const months = monthsBetweenStr(addStartDate, deal.contract_end)
    setAddItem((prev) => ({ ...prev, billing_months: months || '' }))
  }, [addStartDate, deal.contract_end])

  // Recalculate product commission when addItem fields change
  useEffect(() => {
    const prod = products.find((p) => p.id === addItem.product_id)
    if (!prod) return
    const effectiveRate = prod.rate_overridden ? prod.base_rate : (globalRate || 0.07)
    const months = parseInt(addItem.billing_months) || calcMonthsBetweenDates(
      new Date((addStartDate || deal.contract_start || '') + 'T00:00:00'),
      new Date((deal.contract_end || '') + 'T00:00:00')
    )

    if (prod.is_usage_based) {
      const { totalRevenue, totalCogs, netRevenue, monthlyCost } = calcJwxValues(
        addItem.monthly_quantity, addItem.unit_price, addItem.cogs_per_unit, months, addItem.billing_mode
      )
      const commission = calcProductCommission({ commission_metric: 'GM', base_rate: effectiveRate, net_revenue: netRevenue })
      setAddItem((prev) => ({ ...prev, total_revenue: totalRevenue, cogs_amount: totalCogs, net_revenue: netRevenue, monthly_cost: monthlyCost, commission_amount: commission, commission_metric: prod.commission_metric, base_rate: effectiveRate }))
    } else if (prod.commission_metric === 'GM') {
      const netRev = (parseFloat(addItem.yearly_cost) || 0) - (parseFloat(addItem.cogs_amount) || 0)
      const commission = calcProductCommission({ commission_metric: 'GM', base_rate: effectiveRate, net_revenue: netRev })
      setAddItem((prev) => ({ ...prev, net_revenue: netRev, commission_amount: commission, commission_metric: prod.commission_metric, base_rate: effectiveRate }))
    } else {
      const freq = prod.billing_frequency || 'monthly'
      const enteredValue = parseFloat(addItem.monthly_value) || 0
      const disc = parseFloat(addItem.discount_pct) || 0
      const effectiveMonths = parseInt(addItem.billing_months) || (freq === 'monthly' ? months : 1)
      const baseAnnual = freq === 'monthly' ? enteredValue * effectiveMonths : enteredValue
      const annual = applyDiscount(baseAnnual, disc)
      const commission = calcProductCommission({ commission_metric: 'NAVC/RAV', base_rate: effectiveRate, annual_value: annual })
      setAddItem((prev) => ({ ...prev, annual_value: annual, list_price: baseAnnual, commission_amount: commission, commission_metric: prod.commission_metric || 'NAVC/RAV', base_rate: effectiveRate }))
    }
  }, [addItem.product_id, addItem.monthly_value, addItem.monthly_quantity, addItem.unit_price, addItem.cogs_per_unit, addItem.yearly_cost, addItem.cogs_amount, addItem.discount_pct, addItem.billing_months, addItem.billing_mode, globalRate])

  // ── Auto-update effective date when notice date changes ───────────────────
  function handleNoticeDateChange(val) {
    setNoticeDate(val)
    setEffectiveDate(addDaysStr(val, 30))
  }

  // ── Derived: how many billing_months remain for cancelled product ─────────
  const cancelledProduct = dealProducts.find((dp) => dp.id === selectedProductId)
  const cancelledBillingMonths = cancelledProduct && effectiveDate && deal.contract_start
    ? monthsBetweenStr(cancelledProduct.billing_start_date || deal.contract_start, effectiveDate)
    : null

  // ── Commission schedule previews ──────────────────────────────────────────
  const cancelPreviewSchedule = cancelledProduct && cancelledBillingMonths != null
    ? buildCommissionSchedule(
        deal,
        [{ ...cancelledProduct, billing_months: cancelledBillingMonths }],
        dealTeam.map((m) => ({ ...m, person_name: m.people?.name }))
      )
    : []

  const addPreviewSchedule = addStartDate && addItem.commission_amount > 0
    ? buildCommissionSchedule(
        deal,
        [{ ...addItem, billing_start_date: addStartDate, status: 'active', commission_metric: addItem.commission_metric || 'NAVC/RAV' }],
        dealTeam.map((m) => ({ ...m, person_name: m.people?.name }))
      )
    : []

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    setError(null)
    setSaving(true)
    try {
      if (tab === 'cancel') {
        if (!selectedProductId) throw new Error('Select a product to cancel.')
        if (!effectiveDate) throw new Error('Enter an effective cancellation date.')
        if (cancelledBillingMonths == null || cancelledBillingMonths <= 0) throw new Error('Effective date must be after the product billing start.')

        // 1. Create amendment record
        const { data: amendment, error: aErr } = await supabase
          .from('deal_amendments')
          .insert({ deal_id: deal.id, effective_date: effectiveDate, note: cancelNote || null, created_by: 'system' })
          .select()
          .single()
        if (aErr) throw aErr

        // 2. Update the deal_product
        const { error: dpErr } = await supabase
          .from('deal_products')
          .update({
            status: 'cancelled',
            billing_months: cancelledBillingMonths,
            cancellation_amendment_id: amendment.id,
          })
          .eq('id', selectedProductId)
        if (dpErr) throw dpErr

      } else {
        // Add tab
        const prod = products.find((p) => p.id === addItem.product_id)
        if (!prod) throw new Error('Select a product to add.')
        if (!addStartDate) throw new Error('Enter a start date for the new product.')

        const months = parseInt(addItem.billing_months) || 0
        if (months <= 0) throw new Error('Billing months must be greater than 0.')

        // 1. Create amendment record
        const { data: amendment, error: aErr } = await supabase
          .from('deal_amendments')
          .insert({ deal_id: deal.id, effective_date: addStartDate, note: addNote || null, created_by: 'system' })
          .select()
          .single()
        if (aErr) throw aErr

        // 2. Insert new deal_product
        const { _id, _trilogy_margin_pct, ...dbFields } = addItem
        const { error: dpErr } = await supabase
          .from('deal_products')
          .insert({
            ...dbFields,
            deal_id: deal.id,
            product_id: prod.id,
            billing_start_date: addStartDate,
            billing_months: months,
            status: 'active',
            amendment_id: amendment.id,
          })
        if (dpErr) throw dpErr
      }

      onAmended()
      onClose()
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  // ── Active products available to cancel ───────────────────────────────────
  const activeProducts = dealProducts.filter((dp) => dp.status !== 'cancelled' && dp.products)

  // ── Available products to add (exclude already-active product IDs) ────────
  const activeProductIds = new Set(dealProducts.filter((dp) => dp.status === 'active').map((dp) => dp.product_id))

  return (
    <Modal
      open
      onClose={onClose}
      title="Amend Deal"
      size="lg"
      footer={
        <>
          {error && <p className="text-xs text-red-600 mr-auto">{error}</p>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>Save Amendment</Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Tab switcher */}
        <div className="flex bg-gray-100 rounded-xl p-1 w-fit">
          {[
            { key: 'cancel', label: 'Cancel a Product' },
            { key: 'add',    label: 'Add a Product' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-white text-navy-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Cancel tab ── */}
        {tab === 'cancel' && (
          <div className="space-y-4">
            <Select
              label="Product to cancel"
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
            >
              <option value="">Select a product…</option>
              {activeProducts.map((dp) => (
                <option key={dp.id} value={dp.id}>
                  {dp.products?.name} — {fmt(dp.annual_value || dp.yearly_cost || dp.total_revenue || 0, 2)}/yr
                </option>
              ))}
            </Select>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Notice date"
                type="date"
                value={noticeDate}
                onChange={(e) => handleNoticeDateChange(e.target.value)}
              />
              <Input
                label="Effective cancellation date"
                type="date"
                hint="Auto-set to notice + 30 days"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>

            {cancelledProduct && cancelledBillingMonths != null && (() => {
              // Partner multiplier
              const allProductAcv = dealProducts.reduce((sum, dp) => {
                if (dp.commission_metric === 'GM') return sum + Math.max(0, dp.net_revenue || 0)
                return sum + (dp.annual_value || 0)
              }, 0)
              const { partnerMultiplier } = computePartnerStack(allProductAcv, dealPartners)

              // Full annual values
              const trilogyRevenueFull = cancelledProduct.commission_metric === 'GM'
                ? Math.max(0, cancelledProduct.net_revenue || 0)
                : (cancelledProduct.annual_value || 0)
              const cogsFull = effectiveCogs(cancelledProduct)
              const grossMarginFull = trilogyRevenueFull - cogsFull
              const customerRevenueFull = productLineTotal(cancelledProduct, partnerMultiplier)
              const partnerRevenueFull = dealPartners.length > 0 ? customerRevenueFull - trilogyRevenueFull : 0

              // Forfeited portion
              const originalMonths = cancelledProduct.billing_months || deal.contract_months || 12
              const lostMonths = Math.max(0, originalMonths - cancelledBillingMonths)
              const lostFraction = originalMonths > 0 ? lostMonths / originalMonths : 0
              const retainedPct = Math.round((cancelledBillingMonths / originalMonths) * 100)
              const lostPct = 100 - retainedPct

              const trilogyRevenueLost  = trilogyRevenueFull * lostFraction
              const grossMarginLost     = grossMarginFull * lostFraction
              const marginPct           = trilogyRevenueLost > 0 ? grossMarginLost / trilogyRevenueLost : null
              const customerRevenueLost = customerRevenueFull * lostFraction
              const partnerRevenueLost  = partnerRevenueFull * lostFraction

              // Commission lost = original schedule minus retained schedule
              const originalSchedule = buildCommissionSchedule(
                deal,
                [cancelledProduct],
                dealTeam.map((m) => ({ ...m, person_name: m.people?.name }))
              )
              const origByQ = {}
              originalSchedule.forEach((e) => {
                const key = `${e.year}-${e.quarter}`
                if (!origByQ[key]) origByQ[key] = { label: `${e.year} Q${e.quarter}`, total: 0 }
                origByQ[key].total += e.amount
              })
              const retainedByQ = {}
              cancelPreviewSchedule.forEach((e) => {
                const key = `${e.year}-${e.quarter}`
                if (!retainedByQ[key]) retainedByQ[key] = { total: 0 }
                retainedByQ[key].total += e.amount
              })
              const lostQuarters = Object.entries(origByQ)
                .map(([key, { label, total }]) => ({ label, total: total - (retainedByQ[key]?.total || 0) }))
                .filter((q) => q.total > 0.005)
              const totalCommissionLost = lostQuarters.reduce((s, q) => s + q.total, 0)

              // Date labels for timeline
              const billingStart = cancelledProduct.billing_start_date || deal.contract_start
              const fmtDate = (str) => str ? format(new Date(str + 'T12:00:00'), 'MMM d') : null
              const startLabel  = fmtDate(billingStart)
              const splitLabel  = fmtDate(effectiveDate)
              const endLabel    = deal.contract_end ? fmtDate(deal.contract_end) : null

              const metrics = [
                dealPartners.length > 0 && { label: 'Customer ACV', value: fmt(customerRevenueLost, 2) },
                { label: 'Trilogy revenue', value: fmt(trilogyRevenueLost, 2) },
                cogsFull > 0 && {
                  label: 'Gross margin',
                  value: `${fmt(grossMarginLost, 2)}${marginPct != null ? ` (${(marginPct * 100).toFixed(0)}%)` : ''}`,
                },
                dealPartners.length > 0 && partnerRevenueLost > 0 && { label: 'Partner revenue', value: fmt(partnerRevenueLost, 2) },
                totalCommissionLost > 0 && { label: 'Sales commission', value: fmt(totalCommissionLost, 2) },
              ].filter(Boolean)

              if (lostMonths === 0) return (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
                  Effective date is at or after contract end — no revenue or commission is forfeited.
                </div>
              )

              return (
                <div className="border border-amber-200 rounded-xl overflow-hidden text-sm">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border-b border-amber-200">
                    <div className="flex items-center gap-2 font-semibold text-amber-900">
                      <AlertTriangle size={14} className="flex-shrink-0" />
                      Cancellation impact — {cancelledProduct.products?.name}
                    </div>
                    <span className="text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2.5 py-1">
                      {lostMonths} of {originalMonths} months forfeited
                    </span>
                  </div>

                  <div className="p-4 space-y-5 bg-white">
                    {/* Timeline bar */}
                    <div>
                      <div className="h-6 rounded-lg overflow-hidden flex border border-gray-200">
                        <div
                          className="bg-green-100 border-r border-green-300 flex items-center justify-center"
                          style={{ width: `${retainedPct}%` }}
                        >
                          <span className="text-[10px] font-semibold text-green-700 px-1 truncate">
                            {cancelledBillingMonths} mo active
                          </span>
                        </div>
                        <div
                          className="bg-amber-100 flex items-center justify-center flex-1"
                        >
                          <span className="text-[10px] font-semibold text-amber-700 px-1 truncate">
                            {lostMonths} mo cancelled
                          </span>
                        </div>
                      </div>
                      {(startLabel || splitLabel || endLabel) && (
                        <div className="flex justify-between mt-1.5 text-[11px] text-gray-400 px-0.5">
                          <span>{startLabel || ''}</span>
                          {splitLabel && (
                            <span className="font-medium text-amber-600">↑ {splitLabel}</span>
                          )}
                          <span>{endLabel || ''}</span>
                        </div>
                      )}
                      <div className="flex gap-4 mt-2 text-xs">
                        <span className="flex items-center gap-1.5 text-green-700">
                          <span className="w-2.5 h-2.5 rounded-sm bg-green-200 border border-green-300 inline-block flex-shrink-0" />
                          Billing continues through {splitLabel}
                        </span>
                        <span className="flex items-center gap-1.5 text-amber-700">
                          <span className="w-2.5 h-2.5 rounded-sm bg-amber-200 border border-amber-300 inline-block flex-shrink-0" />
                          Forfeited after {splitLabel}
                        </span>
                      </div>
                    </div>

                    {/* Metrics */}
                    {metrics.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Forfeited value</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {metrics.map(({ label, value }) => (
                            <div key={label} className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
                              <p className="text-xs text-amber-500 mb-0.5">{label}</p>
                              <p className="font-bold text-amber-900">{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Commission quarters lost */}
                    {lostQuarters.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Commission forfeited by quarter</p>
                        <div className="flex flex-wrap gap-2">
                          {lostQuarters.map(({ label, total }) => (
                            <div key={label} className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                              <p className="text-xs text-amber-500">{label}</p>
                              <p className="font-bold text-amber-900">{fmt(total, 2)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            <Textarea
              label="Note (optional)"
              placeholder="e.g. Out clause exercised per contract §4.2"
              value={cancelNote}
              onChange={(e) => setCancelNote(e.target.value)}
              rows={2}
            />
          </div>
        )}

        {/* ── Add tab ── */}
        {tab === 'add' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Product to add"
                value={addItem.product_id}
                onChange={(e) => {
                  const prod = products.find((p) => p.id === e.target.value)
                  setAddItem((prev) => ({
                    ...prev,
                    product_id: e.target.value,
                    commission_metric: prod?.commission_metric || '',
                    base_rate: prod?.rate_overridden ? prod.base_rate : (globalRate || 0.07),
                    monthly_value: '',
                    annual_value: 0,
                    cogs_amount: 0,
                    commission_amount: 0,
                  }))
                }}
              >
                <option value="">Select a product…</option>
                {products
                  .filter((p) => !activeProductIds.has(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
              </Select>

              <Input
                label="Billing start date"
                type="date"
                hint={deal.contract_end ? `Contract ends ${deal.contract_end}` : undefined}
                value={addStartDate}
                onChange={(e) => setAddStartDate(e.target.value)}
              />
            </div>

            {addItem.product_id && (() => {
              const prod = products.find((p) => p.id === addItem.product_id)
              if (!prod) return null
              const isGM = prod.commission_metric === 'GM'
              const isUsage = prod.is_usage_based

              return (
                <div className="border border-gray-100 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{prod.name} — Pricing</p>

                  {isUsage ? (
                    <div className="grid grid-cols-3 gap-3">
                      <Input
                        label="Monthly qty"
                        type="number" min="0"
                        value={addItem.monthly_quantity}
                        onChange={(e) => setAddItem((p) => ({ ...p, monthly_quantity: e.target.value }))}
                      />
                      <CurrencyInput
                        label="Rate / unit"
                        value={addItem.unit_price}
                        onChange={(v) => setAddItem((p) => ({ ...p, unit_price: v }))}
                      />
                      <CurrencyInput
                        label="COGS / unit"
                        value={addItem.cogs_per_unit}
                        onChange={(v) => setAddItem((p) => ({ ...p, cogs_per_unit: v }))}
                      />
                    </div>
                  ) : isGM ? (
                    <div className="grid grid-cols-3 gap-3">
                      <CurrencyInput
                        label="COGS (annual)"
                        value={addItem.cogs_amount || ''}
                        onChange={(v) => setAddItem((p) => ({ ...p, cogs_amount: parseFloat(v) || 0 }))}
                      />
                      <CurrencyInput
                        label="Revenue (annual)"
                        value={addItem.yearly_cost || ''}
                        onChange={(v) => setAddItem((p) => ({ ...p, yearly_cost: parseFloat(v) || 0 }))}
                      />
                      <Input
                        label="Discount %"
                        type="number" min="0" max="100" suffix="%"
                        value={addItem.discount_pct}
                        onChange={(e) => setAddItem((p) => ({ ...p, discount_pct: e.target.value }))}
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      <CurrencyInput
                        label={prod.billing_frequency === 'monthly' ? 'Monthly value' : 'Annual value'}
                        value={addItem.monthly_value}
                        onChange={(v) => setAddItem((p) => ({ ...p, monthly_value: v }))}
                      />
                      <Input
                        label="Discount %"
                        type="number" min="0" max="100" suffix="%"
                        value={addItem.discount_pct}
                        onChange={(e) => setAddItem((p) => ({ ...p, discount_pct: e.target.value }))}
                      />
                      <Input
                        label="Billing months"
                        type="number" min="1"
                        hint={addStartDate && deal.contract_end ? `${monthsBetweenStr(addStartDate, deal.contract_end)} remaining` : undefined}
                        value={addItem.billing_months}
                        onChange={(e) => setAddItem((p) => ({ ...p, billing_months: e.target.value }))}
                      />
                    </div>
                  )}

                  {addItem.commission_amount > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3 text-sm">
                      {/* Header */}
                      <div className="flex items-center gap-2 font-semibold text-green-800">
                        <Plus size={13} className="flex-shrink-0" />
                        Addition impact — {products.find((p) => p.id === addItem.product_id)?.name}
                      </div>

                      {/* Revenue + commission summary */}
                      <div className="flex items-center gap-4 text-green-700">
                        <div>
                          <p className="text-xs text-green-500">Revenue</p>
                          <p className="font-semibold text-green-800">{fmt(addItem.annual_value || addItem.yearly_cost || addItem.total_revenue || 0, 2)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-green-500">Commission</p>
                          <p className="font-semibold text-green-800">{fmt(addItem.commission_amount, 2)}</p>
                        </div>
                      </div>

                      {/* Quarter chips */}
                      {addPreviewSchedule.length > 0 && (() => {
                        const quarterMap = {}
                        addPreviewSchedule.forEach((e) => {
                          const key = `${e.year}-${e.quarter}`
                          if (!quarterMap[key]) quarterMap[key] = { label: `${e.year} Q${e.quarter}`, total: 0 }
                          quarterMap[key].total += e.amount
                        })
                        return (
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Commission by quarter</p>
                            <div className="flex flex-wrap gap-2">
                              {Object.values(quarterMap).map(({ label, total }) => (
                                <div key={label} className="bg-white border border-green-200 rounded-lg px-3 py-1.5 flex flex-col">
                                  <span className="text-xs text-green-500">{label}</span>
                                  <span className="font-semibold text-green-800">{fmt(total, 2)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )
            })()}

            <Textarea
              label="Note (optional)"
              placeholder="e.g. Expanded scope — Q3 kickoff"
              value={addNote}
              onChange={(e) => setAddNote(e.target.value)}
              rows={2}
            />
          </div>
        )}
      </div>
    </Modal>
  )
}
