import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2, Info, ChevronUp, ChevronDown, Network } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useUser } from '../contexts/UserContext'
import Button from '../components/ui/Button'
import Input, { Select, Textarea } from '../components/ui/Input'
import CurrencyInput from '../components/ui/CurrencyInput'
import Card, { CardHeader } from '../components/ui/Card'
import { DEAL_STAGES, DEAL_TYPES } from '../lib/constants'
import { calcJwxValues, calcProductCommission, calcSpif, fmt, getMarginTier } from '../lib/commission'
import { PageSpinner } from '../components/ui/Spinner'

function ProductRow({ item, allItems, products, vendors, pricingMap, contractMonths, contractEnd, globalRate, onChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast, isManager, isTbn }) {
  const product = products.find((p) => p.id === item.product_id)
  const isUsageBased = product?.is_usage_based
  const isGM = product?.commission_metric === 'GM'
  const isSupportCharge = product?.is_support_charge
  const billingMode = item.billing_mode || 'monthly'
  const filteredProducts = item._vendor_id ? products.filter((p) => p.vendor_id === item._vendor_id) : products

  // GM non-usage helpers
  const gmType = isGM && !isUsageBased ? (item._margin_type === 'percent' ? 'percent' : 'fixed') : null
  const isQuantityBased = isGM && !isUsageBased && !!product?.quantity_label

  function handleGMChange(updates) {
    const next = { ...item, ...updates }
    const qty = parseInt(next.quantity) || 0
    let totalCogs = parseFloat(next.cogs_amount) || 0
    let listPr = parseFloat(next.list_price) || 0

    if (isQuantityBased) {
      totalCogs = (parseFloat(next._cogs_per_item) || 0) * qty * contractMonths
      listPr = gmType === 'percent'
        ? totalCogs * (1 + (parseFloat(next.markup_pct) || 0) / 100)
        : (parseFloat(next._list_price_per_item) || 0) * qty * contractMonths
    } else if (gmType === 'percent') {
      listPr = totalCogs * (1 + (parseFloat(next.markup_pct) || 0) / 100)
    }

    const disc = parseFloat(next.discount_pct) || 0
    onChange({ ...next, cogs_amount: totalCogs, list_price: listPr, yearly_cost: listPr * (1 - disc / 100) })
  }

  useEffect(() => {
    if (!product || isSupportCharge) return
    const effectiveRate = product.rate_overridden ? product.base_rate : globalRate
    if (isUsageBased) {
      const unitPrice = parseFloat(item.unit_price) || 0
      const cogsPerUnit = parseFloat(item.cogs_per_unit) || 0
      const { monthlyCost, totalRevenue, totalCogs, netRevenue } = calcJwxValues(
        item.monthly_quantity,
        unitPrice,
        cogsPerUnit,
        contractMonths,
        billingMode
      )
      const commission = calcProductCommission({
        commission_metric: 'GM',
        base_rate: effectiveRate,
        net_revenue: netRevenue,
      })
      onChange({
        ...item,
        monthly_cost: monthlyCost,
        total_revenue: totalRevenue,
        cogs_amount: totalCogs,
        net_revenue: netRevenue,
        commission_amount: commission,
        unit_price_snapshot: unitPrice,
        cogs_per_unit_snapshot: cogsPerUnit,
        commission_metric: product.commission_metric,
        base_rate: effectiveRate,
      })
    } else if (isGM) {
      let cogsAmt = parseFloat(item.cogs_amount) || 0
      let yearlyCost = parseFloat(item.yearly_cost) || 0
      const displayUpdates = {}
      if (isQuantityBased) {
        const qty = parseInt(item.quantity) || 0
        cogsAmt = (parseFloat(item._cogs_per_item) || 0) * qty * contractMonths
        const listPr = item._margin_type === 'percent'
          ? cogsAmt * (1 + (parseFloat(item.markup_pct) || 0) / 100)
          : (parseFloat(item._list_price_per_item) || 0) * qty * contractMonths
        const disc = parseFloat(item.discount_pct) || 0
        yearlyCost = listPr * (1 - disc / 100)
        if (cogsAmt !== (parseFloat(item.cogs_amount) || 0) || listPr !== (parseFloat(item.list_price) || 0) || yearlyCost !== (parseFloat(item.yearly_cost) || 0)) {
          displayUpdates.cogs_amount = cogsAmt
          displayUpdates.list_price = listPr
          displayUpdates.yearly_cost = yearlyCost
        }
      }
      const netRev = yearlyCost - cogsAmt
      const commission = calcProductCommission({
        commission_metric: 'GM',
        base_rate: effectiveRate,
        net_revenue: netRev,
      })
      onChange({ ...item, ...displayUpdates, net_revenue: netRev, commission_amount: commission, commission_metric: product.commission_metric, base_rate: effectiveRate })
    } else {
      const freq = product.billing_frequency || 'monthly'
      if (freq === 'milestone') {
        const totalValue = parseFloat(item._milestone_total) || 0
        const commission = calcProductCommission({ commission_metric: 'NAVC/RAV', base_rate: effectiveRate, annual_value: totalValue })
        if (totalValue !== (parseFloat(item.annual_value) || 0) || commission !== (parseFloat(item.commission_amount) || 0)) {
          onChange({ ...item, annual_value: totalValue, commission_amount: commission, commission_metric: product.commission_metric, base_rate: effectiveRate })
        }
      } else {
        const enteredValue = parseFloat(item.monthly_value) || 0
        const effectiveMonths = parseInt(item.billing_months) || (freq === 'monthly' ? contractMonths : 1)
        const annual = freq === 'monthly' ? enteredValue * effectiveMonths : enteredValue
        const commission = calcProductCommission({ commission_metric: 'NAVC/RAV', base_rate: effectiveRate, annual_value: annual })
        onChange({ ...item, annual_value: annual, commission_amount: commission, commission_metric: product.commission_metric, base_rate: effectiveRate })
      }
    }
  }, [item.product_id, item.monthly_quantity, item.unit_price, item.cogs_per_unit, item.monthly_value, item.yearly_cost, item.cogs_amount, item.discount_pct, item.quantity, item._milestone_total, item.billing_months, item.billing_mode, contractMonths, globalRate])

  // Support charge: auto-calculate revenue from selected line items
  useEffect(() => {
    if (!product?.is_support_charge) return
    const effectiveRate = product.rate_overridden ? product.base_rate : globalRate
    const pct = parseFloat(item.support_pct) ?? parseFloat(product.default_support_pct) ?? 15
    const selectedPids = item.support_product_ids || []
    const itemKey = item._id || item.id
    const baseRevenue = allItems
      .filter((dp) => {
        const key = dp._id || dp.id
        return key !== itemKey && dp.product_id && selectedPids.includes(dp.product_id)
      })
      .reduce((sum, dp) => {
        const dpProd = products.find((p) => p.id === dp.product_id)
        if (!dpProd) return sum
        if (dpProd.is_usage_based) return sum + (dp.total_revenue || 0)
        if (dpProd.commission_metric === 'GM') return sum + (dp.yearly_cost || 0)
        return sum + (dp.annual_value || 0)
      }, 0)
    const revenue = baseRevenue * (pct / 100)
    const commission = calcProductCommission({ commission_metric: 'NAVC/RAV', base_rate: effectiveRate, annual_value: revenue })
    if (Math.abs(revenue - (item.annual_value || 0)) > 0.001 || Math.abs(commission - (item.commission_amount || 0)) > 0.001) {
      onChange({ ...item, annual_value: revenue, commission_amount: commission, commission_metric: 'NAVC/RAV', base_rate: effectiveRate })
    }
  }, [item.product_id, item.support_pct, JSON.stringify(item.support_product_ids), allItems, globalRate])

  return (
    <div className="border border-gray-100 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-2">
        {vendors.length > 0 && (
          <Select
            className="w-36"
            label="Vendor"
            value={item._vendor_id || ''}
            onChange={(e) => {
              const vid = e.target.value
              const currentProduct = products.find((p) => p.id === item.product_id)
              const needsReset = vid && currentProduct?.vendor_id !== vid
              onChange({ ...item, _vendor_id: vid, ...(needsReset ? { product_id: '', unit_price: '', cogs_per_unit: '', cogs_amount: '' } : {}) })
            }}
          >
            <option value="">All</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
        )}
        <Select
          className="flex-1"
          value={item.product_id}
          onChange={(e) => {
            const newProductId = e.target.value
            const defaults = pricingMap[newProductId]
            const selectedProduct = products.find((p) => p.id === newProductId)
            onChange({
              ...item,
              product_id: newProductId,
              _vendor_id: selectedProduct?.vendor_id || item._vendor_id || '',
              _margin_type: selectedProduct?.default_margin_type === 'percent' ? 'percent' : 'fixed',
              _cogs_per_item: selectedProduct?.default_cogs || '',
              _list_price_per_item: selectedProduct?.default_list_price || '',
              markup_pct: selectedProduct?.default_margin_type === 'percent' ? (selectedProduct?.default_margin_pct || '') : '',
              unit_price: defaults?.unit_price ?? '',
              cogs_per_unit: defaults?.cogs_per_unit ?? '',
              overage_rate: selectedProduct?.default_overage_rate ?? '',
              cogs_amount: selectedProduct?.quantity_label ? '' : (selectedProduct?.default_cogs || ''),
              list_price: selectedProduct?.quantity_label ? '' : (selectedProduct?.default_list_price || ''),
              quantity: '',
              discount_pct: '',
              yearly_cost: (!selectedProduct?.quantity_label && selectedProduct?.default_list_price)
                ? parseFloat(selectedProduct.default_list_price)
                : '',
              milestones: [],
              _milestone_total: 0,
              billing_start_date: '',
              billing_months: '',
              billing_mode: selectedProduct?.default_billing_mode || 'monthly',
              support_pct: selectedProduct?.is_support_charge ? (selectedProduct?.default_support_pct ?? 15) : '',
              support_product_ids: selectedProduct?.is_support_charge ? (item.support_product_ids || []) : [],
              _trilogy_margin_pct: '',
            })
          }}
          label="Product"
        >
          <option value="">Select product...</option>
          {filteredProducts.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.commission_metric})</option>
          ))}
        </Select>
        <div className="mt-6 flex flex-col gap-0.5">
          <button onClick={onMoveUp} disabled={isFirst} className="p-1.5 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
            <ChevronUp size={14} />
          </button>
          <button onClick={onMoveDown} disabled={isLast} className="p-1.5 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
            <ChevronDown size={14} />
          </button>
        </div>
        <button onClick={onRemove} className="mt-6 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
          <Trash2 size={16} />
        </button>
      </div>

      {product && isUsageBased && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Billing Mode</span>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              {[{ value: 'monthly', label: 'Monthly × Duration' }, { value: 'fixed', label: 'Fixed Contract Total' }].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onChange({ ...item, billing_mode: value })}
                  className={`px-3 py-1.5 transition-colors ${billingMode === value ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Input
              label={`Qty (${product.unit_label || 'Units'})`}
              commas
              min="0"
              value={item.monthly_quantity || ''}
              onChange={(e) => onChange({ ...item, monthly_quantity: parseFloat(e.target.value) || 0 })}
            />
            <CurrencyInput
              label={`COGS / ${product.unit_label || 'unit'}`}
              value={item.cogs_per_unit ?? ''}
              disabled={!isManager}
              onChange={(v) => {
                const cogs = parseFloat(v) || 0
                const marginPct = parseFloat(item._trilogy_margin_pct)
                let unitPrice = item.unit_price
                if (!isNaN(marginPct) && marginPct >= 0 && marginPct < 100 && cogs > 0) {
                  unitPrice = cogs / (1 - marginPct / 100)
                }
                onChange({ ...item, cogs_per_unit: v, unit_price: unitPrice })
              }}
            />
            <Input
              label="Margin %"
              type="number"
              min="0"
              max="99.9"
              step="0.1"
              suffix="%"
              disabled={!isManager}
              hint={item.cogs_per_unit && item._trilogy_margin_pct !== '' && parseFloat(item._trilogy_margin_pct) >= 0
                ? `Rate: $${(parseFloat(item.cogs_per_unit) / (1 - parseFloat(item._trilogy_margin_pct) / 100)).toFixed(4)}`
                : undefined}
              value={item._trilogy_margin_pct ?? ''}
              onChange={(e) => {
                const pct = e.target.value
                const pctNum = parseFloat(pct)
                const cogs = parseFloat(item.cogs_per_unit) || 0
                const rate = (!isNaN(pctNum) && pctNum >= 0 && pctNum < 100 && cogs > 0)
                  ? cogs / (1 - pctNum / 100)
                  : item.unit_price
                onChange({ ...item, _trilogy_margin_pct: pct, unit_price: rate })
              }}
            />
            <CurrencyInput
              label={`Rate / ${product.unit_label || 'unit'}`}
              hint="COGS ÷ (1 − margin%)"
              disabled={!isManager}
              value={item.unit_price != null && item.unit_price !== '' ? parseFloat(Number(item.unit_price).toFixed(4)) : ''}
              onChange={(v) => {
                const rate = parseFloat(v) || 0
                const cogs = parseFloat(item.cogs_per_unit) || 0
                const pct = rate > 0 && cogs > 0 ? parseFloat(((1 - cogs / rate) * 100).toFixed(2)) : ''
                onChange({ ...item, unit_price: v, _trilogy_margin_pct: pct })
              }}
            />
            <CurrencyInput
              label={`Overage / ${product.unit_label || 'unit'}`}
              hint="Rate beyond contracted allocation"
              value={item.overage_rate != null && item.overage_rate !== '' ? parseFloat(Number(item.overage_rate).toFixed(4)) : ''}
              onChange={(v) => onChange({ ...item, overage_rate: v === '' ? null : v })}
            />
          </div>
          {(() => {
            const marginPct = item.total_revenue > 0 ? item.net_revenue / item.total_revenue : null
            const hasOverage = item.overage_rate != null && item.overage_rate !== '' && parseFloat(item.overage_rate) > 0
            const cols = hasOverage
              ? (isManager && !isTbn ? 'grid-cols-6' : 'grid-cols-5')
              : (isManager && !isTbn ? 'grid-cols-5' : 'grid-cols-4')
            return (
              <div className={`bg-gray-50 rounded-lg p-3 grid gap-3 text-xs ${cols}`}>
                <div>
                  <p className="text-gray-500">{billingMode === 'fixed' ? 'Contract Total' : 'Revenue'}</p>
                  <p className="font-medium text-navy-900 mt-0.5">{fmt(item.total_revenue, 2)}</p>
                  {billingMode === 'fixed' && <p className="text-gray-400 mt-0.5">{fmt(item.monthly_cost, 2)}/mo</p>}
                </div>
                <div>
                  <p className="text-gray-500">COGS</p>
                  <p className="font-medium text-navy-900 mt-0.5">{fmt(item.cogs_amount, 2)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Net Revenue</p>
                  <p className="font-bold text-navy-900 mt-0.5">{fmt(item.net_revenue, 2)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Margin</p>
                  <p className={`font-bold mt-0.5 ${marginPct == null ? 'text-gray-400' : marginPct >= 0.30 ? 'text-green-600' : marginPct >= 0.15 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {marginPct != null ? `${(marginPct * 100).toFixed(1)}%` : '—'}
                  </p>
                </div>
                {isManager && !isTbn && (
                  <div>
                    <p className="text-gray-500">Commission</p>
                    <p className="font-bold text-primary-600 mt-0.5">{fmt(item.commission_amount, 2)}</p>
                  </div>
                )}
                {hasOverage && (
                  <div>
                    <p className="text-gray-500">Overage Rate</p>
                    <p className="font-medium text-navy-900 mt-0.5">${parseFloat(item.overage_rate).toFixed(4)}/{product.unit_label || 'unit'}</p>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {product && isSupportCharge && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Support %"
              type="number" min="0" max="100" step="0.1" suffix="%"
              value={item.support_pct ?? (product.default_support_pct ?? 15)}
              onChange={(e) => onChange({ ...item, support_pct: parseFloat(e.target.value) || 0 })}
            />
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500">Calculated Revenue</p>
              <div className="bg-primary-50 rounded-lg p-3 text-xs">
                <p className="font-bold text-primary-600">{fmt(item.annual_value || 0, 2)}</p>
                {isManager && !isTbn && <p className="text-gray-500 mt-0.5">Commission: {fmt(item.commission_amount || 0, 2)}</p>}
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">Apply to line items</p>
            <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
              {allItems
                .filter((dp) => {
                  const key = dp._id || dp.id
                  const selfKey = item._id || item.id
                  const dpProd = products.find((p) => p.id === dp.product_id)
                  return key !== selfKey && dp.product_id && !dpProd?.is_support_charge
                })
                .map((dp) => {
                  const dpProd = products.find((p) => p.id === dp.product_id)
                  if (!dpProd) return null
                  const isSelected = (item.support_product_ids || []).includes(dp.product_id)
                  const dpRevenue = dpProd.is_usage_based
                    ? (dp.total_revenue || 0)
                    : dpProd.commission_metric === 'GM' ? (dp.yearly_cost || 0) : (dp.annual_value || 0)
                  return (
                    <label key={dp._id || dp.id} className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          const pid = dp.product_id
                          const current = item.support_product_ids || []
                          const next = e.target.checked ? [...current, pid] : current.filter((id) => id !== pid)
                          onChange({ ...item, support_product_ids: next })
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-primary-400 focus:ring-primary-400"
                      />
                      <span className="text-sm text-navy-900 flex-1">{dpProd.name}</span>
                      <span className="text-xs text-gray-400">{fmt(dpRevenue, 0)}</span>
                    </label>
                  )
                })}
              {allItems.filter((dp) => {
                const key = dp._id || dp.id
                const selfKey = item._id || item.id
                return key !== selfKey && dp.product_id && !products.find((p) => p.id === dp.product_id)?.is_support_charge
              }).length === 0 && (
                <p className="text-xs text-gray-400 text-center py-3">Add other products first.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {product && isGM && !isUsageBased && !product.default_cogs && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          No default pricing set for this product. Go to Products page to set Default COGS and List Price.
        </p>
      )}
      {product && isGM && !isUsageBased && (
        <div className="space-y-3">
          {isQuantityBased && (
            <div className="grid grid-cols-4 gap-3">
              <Input
                label={`Qty (${product.quantity_label})`}
                type="number" min="1"
                value={item.quantity || ''}
                onChange={(e) => handleGMChange({ ...item, quantity: parseInt(e.target.value) || 0 })}
              />
              <CurrencyInput
                label="COGS / Item"
                value={item._cogs_per_item || ''}
                onChange={(v) => handleGMChange({ ...item, _cogs_per_item: v })}
              />
              {gmType === 'fixed' ? (
                <CurrencyInput
                  label="List Price / Item"
                  value={item._list_price_per_item || ''}
                  onChange={(v) => handleGMChange({ ...item, _list_price_per_item: v })}
                />
              ) : (
                <Input
                  label="Markup %"
                  type="number" min="0" step="0.1" suffix="%"
                  value={item.markup_pct || ''}
                  onChange={(e) => handleGMChange({ ...item, markup_pct: parseFloat(e.target.value) || 0 })}
                />
              )}
              <Input
                label="Discount %"
                type="number" min="0" max="100" step="0.1" suffix="%"
                value={item.discount_pct || ''}
                onChange={(e) => handleGMChange({ ...item, discount_pct: parseFloat(e.target.value) || 0 })}
              />
            </div>
          )}

          {!isQuantityBased && (
            <div className={`grid gap-3 ${isManager ? 'grid-cols-4' : 'grid-cols-3'}`}>
              <CurrencyInput
                label="COGS"
                value={item.cogs_amount || ''}
                onChange={(v) => handleGMChange({ ...item, cogs_amount: parseFloat(v) || 0 })}
              />
              {gmType === 'fixed' ? (
                <CurrencyInput
                  label="List Price"
                  hint="Fixed cost pricing"
                  value={item.list_price || ''}
                  onChange={(v) => handleGMChange({ ...item, list_price: parseFloat(v) || 0 })}
                />
              ) : (
                <Input
                  label="Markup %"
                  type="number" min="0" step="0.1" suffix="%"
                  hint={item.cogs_amount
                    ? `List Price: ${fmt((parseFloat(item.cogs_amount) || 0) * (1 + (parseFloat(item.markup_pct) || 0) / 100), 2)}`
                    : 'List Price = COGS × (1 + markup%)'}
                  value={item.markup_pct || ''}
                  onChange={(e) => handleGMChange({ ...item, markup_pct: parseFloat(e.target.value) || 0 })}
                />
              )}
              <Input
                label="Discount %"
                type="number" min="0" max="100" step="0.1" suffix="%"
                value={item.discount_pct || ''}
                onChange={(e) => handleGMChange({ ...item, discount_pct: parseFloat(e.target.value) || 0 })}
              />
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500">{isManager && !isTbn ? 'Commission' : 'Margin'}</p>
                <div className="bg-primary-50 rounded-lg p-3 text-xs">
                  {(() => {
                    const rev = parseFloat(item.list_price) || 0
                    const cogs = parseFloat(item.cogs_amount) || 0
                    const marginPct = rev > 0 ? (rev - cogs) / rev : null
                    return marginPct != null ? (
                      <p className={`font-bold ${marginPct >= 0.30 ? 'text-green-600' : marginPct >= 0.15 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {(marginPct * 100).toFixed(1)}%
                      </p>
                    ) : null
                  })()}
                  {isManager && !isTbn && (
                    <>
                      <p className="text-gray-500 mt-1">Net Revenue</p>
                      <p className="font-semibold text-navy-900">{fmt(item.net_revenue, 2)}</p>
                      <p className="text-primary-600 font-bold mt-1">{fmt(item.commission_amount, 2)}</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {(isQuantityBased || gmType === 'percent') && (() => {
            const marginPct = item.yearly_cost > 0 ? (item.yearly_cost - (parseFloat(item.cogs_amount) || 0)) / item.yearly_cost : null
            const cols = isManager && !isTbn ? 'grid-cols-5' : 'grid-cols-4'
            return (
              <div className={`bg-gray-50 rounded-lg p-3 grid gap-3 text-xs ${cols}`}>
                <div>
                  <p className="text-gray-500">COGS</p>
                  <p className="font-medium text-navy-900 mt-0.5">{fmt(item.cogs_amount, 2)}</p>
                </div>
                <div>
                  <p className="text-gray-500">
                    {gmType === 'percent'
                      ? `List Price (×${(1 + (parseFloat(item.markup_pct) || 0) / 100).toFixed(2)})`
                      : 'List Price'}
                  </p>
                  <p className="font-medium text-navy-900 mt-0.5">{fmt(item.list_price, 2)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Revenue (after disc.)</p>
                  <p className="font-bold text-navy-900 mt-0.5">{fmt(item.yearly_cost, 2)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Margin</p>
                  <p className={`font-bold mt-0.5 ${marginPct == null ? 'text-gray-400' : marginPct >= 0.30 ? 'text-green-600' : marginPct >= 0.15 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {marginPct != null ? `${(marginPct * 100).toFixed(1)}%` : '—'}
                  </p>
                </div>
                {isManager && !isTbn && (
                  <div>
                    <p className="text-gray-500">Commission</p>
                    <p className="font-bold text-primary-600 mt-0.5">{fmt(item.commission_amount, 2)}</p>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {product && !isGM && product.billing_frequency === 'milestone' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500">Payment Milestones</p>
            <button
              type="button"
              onClick={() => {
                const milestones = [...(item.milestones || []), { payment_date: '', amount: '', label: '' }]
                const total = milestones.reduce((s, m) => s + (parseFloat(m.amount) || 0), 0)
                onChange({ ...item, milestones, _milestone_total: total })
              }}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium"
            >
              + Add Payment
            </button>
          </div>
          {(item.milestones || []).length === 0 && (
            <p className="text-xs text-gray-400 text-center py-3 border border-dashed border-gray-100 rounded-lg">No payments yet. Click "+ Add Payment" to define the payment schedule.</p>
          )}
          {(item.milestones || []).map((m, mi) => (
            <div key={mi} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
              <Input
                label={mi === 0 ? 'Payment Date' : undefined}
                type="date"
                value={m.payment_date || ''}
                onChange={(e) => {
                  const milestones = (item.milestones || []).map((x, j) => j === mi ? { ...x, payment_date: e.target.value } : x)
                  onChange({ ...item, milestones })
                }}
              />
              <CurrencyInput
                label={mi === 0 ? 'Amount' : undefined}
                value={m.amount ?? ''}
                onChange={(v) => {
                  const milestones = (item.milestones || []).map((x, j) => j === mi ? { ...x, amount: v } : x)
                  const total = milestones.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0)
                  onChange({ ...item, milestones, _milestone_total: total })
                }}
              />
              <Input
                label={mi === 0 ? 'Label (optional)' : undefined}
                placeholder="e.g. Discovery Phase"
                value={m.label || ''}
                onChange={(e) => {
                  const milestones = (item.milestones || []).map((x, j) => j === mi ? { ...x, label: e.target.value } : x)
                  onChange({ ...item, milestones })
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const milestones = (item.milestones || []).filter((_, j) => j !== mi)
                  const total = milestones.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0)
                  onChange({ ...item, milestones, _milestone_total: total })
                }}
                className={`p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ${mi === 0 ? 'self-end' : ''}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {(item.milestones || []).length > 0 && (() => {
            const rev = item._milestone_total || 0
            const cogs = parseFloat(item.cogs_amount) || 0
            const marginPct = rev > 0 ? (rev - cogs) / rev : null
            const cols = isManager && !isTbn ? 'grid-cols-4' : 'grid-cols-3'
            return (
              <div className={`bg-gray-50 rounded-lg p-3 grid gap-3 text-xs ${cols}`}>
                <div>
                  <p className="text-gray-500">COGS</p>
                  <p className="font-medium text-navy-900 mt-0.5">{cogs > 0 ? fmt(cogs, 2) : '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Total Value</p>
                  <p className="font-bold text-navy-900 mt-0.5">{fmt(rev, 2)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Margin</p>
                  <p className={`font-bold mt-0.5 ${marginPct == null ? 'text-gray-400' : marginPct >= 0.30 ? 'text-green-600' : marginPct >= 0.15 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {marginPct != null ? `${(marginPct * 100).toFixed(1)}%` : '—'}
                  </p>
                </div>
                {isManager && !isTbn && (
                  <div>
                    <p className="text-gray-500">Commission</p>
                    <p className="font-bold text-primary-600 mt-0.5">{fmt(item.commission_amount || 0, 2)}</p>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {product && !isGM && product.billing_frequency !== 'milestone' && (() => {
        const rev = item.annual_value || 0
        const cogs = parseFloat(item.cogs_amount) || 0
        const marginPct = rev > 0 ? (rev - cogs) / rev : null
        const cols = isManager && !isTbn ? 'grid-cols-4' : 'grid-cols-3'
        const valueLabel = product.billing_frequency === 'yearly' ? 'Annual Value' : product.billing_frequency === 'one_time' ? 'One-time Value' : 'Monthly Value'
        const totalLabel = product.billing_frequency === 'monthly' ? `Total (×${parseInt(item.billing_months) || contractMonths} mo)` : 'Total Value'
        return (
          <div className="space-y-3">
            <CurrencyInput
              label={valueLabel}
              value={item.monthly_value || ''}
              onChange={(v) => onChange({ ...item, monthly_value: parseFloat(v) || 0 })}
            />
            <div className={`bg-gray-50 rounded-lg p-3 grid gap-3 text-xs ${cols}`}>
              <div>
                <p className="text-gray-500">COGS</p>
                <p className="font-medium text-navy-900 mt-0.5">{cogs > 0 ? fmt(cogs, 2) : '—'}</p>
              </div>
              <div>
                <p className="text-gray-500">{totalLabel}</p>
                <p className="font-bold text-navy-900 mt-0.5">{fmt(rev, 2)}</p>
              </div>
              <div>
                <p className="text-gray-500">Margin</p>
                <p className={`font-bold mt-0.5 ${marginPct == null ? 'text-gray-400' : marginPct >= 0.30 ? 'text-green-600' : marginPct >= 0.15 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {marginPct != null ? `${(marginPct * 100).toFixed(1)}%` : '—'}
                </p>
              </div>
              {isManager && !isTbn && (
                <div>
                  <p className="text-gray-500">Commission</p>
                  <p className="font-bold text-primary-600 mt-0.5">{fmt(item.commission_amount, 2)}</p>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {product && !isUsageBased && product.billing_frequency !== 'milestone' && (
        <details className="group">
          <summary className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer select-none list-none flex items-center gap-1">
            <span className="group-open:hidden">▸</span>
            <span className="hidden group-open:inline">▾</span>
            Override billing start for this product
          </summary>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Input
              label="Billing Start (override)"
              type="date"
              hint="Leave blank to use deal start"
              value={item.billing_start_date || ''}
              onChange={(e) => {
                const newStart = e.target.value || ''
                let derivedMonths = ''
                if (newStart && contractEnd) {
                  const s = new Date(newStart + 'T00:00:00')
                  const en = new Date(contractEnd + 'T00:00:00')
                  const m = (en.getFullYear() - s.getFullYear()) * 12 + (en.getMonth() - s.getMonth())
                  if (m > 0) derivedMonths = m
                }
                onChange({ ...item, billing_start_date: newStart, billing_months: derivedMonths })
              }}
            />
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500">Billing Duration</p>
              <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-navy-900">
                {item.billing_months ? `${item.billing_months} months` : `${contractMonths} months (deal default)`}
              </div>
              <p className="text-xs text-gray-400">Derived from start → deal end</p>
            </div>
          </div>
        </details>
      )}
    </div>
  )
}

export default function NewDeal() {
  const navigate = useNavigate()
  const { id: editId } = useParams()
  const isEdit = !!editId
  const { isManager } = useUser()

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [products, setProducts] = useState([])
  const [people, setPeople] = useState([])
  const [companies, setCompanies] = useState([])
  const [pricingMap, setPricingMap] = useState({})
  const [spifTiers, setSpifTiers] = useState([])
  const [globalRate, setGlobalRate] = useState(0.07)
  const [partners, setPartners] = useState([])

  const [form, setForm] = useState({
    name: '',
    company_id: '',
    company_name: '',
    stage: 'lead',
    deal_type: 'new',
    is_tbn_property: false,
    contract_start: '',
    contract_end: '',
    contract_months: 12,
    acv: '',
    notes: '',
  })
  const [dealProducts, setDealProducts] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [dealPartners, setDealPartners] = useState([])

  useEffect(() => {
    async function loadRefs() {
      const [{ data: prods }, { data: peeps }, { data: pricing }, { data: tiers }, { data: comps }, { data: settings }, { data: pts }] = await Promise.all([
        supabase.from('products').select('*, vendors(name)').eq('active', true).order('name'),
        supabase.from('people').select('*').eq('active', true).order('name'),
        supabase.from('product_pricing_params').select('*').order('effective_date', { ascending: false }),
        supabase.from('spif_tiers').select('*'),
        supabase.from('companies').select('id, name').order('name'),
        supabase.from('commission_settings').select('global_commission_rate').eq('id', 1).single(),
        supabase.from('partners').select('*').eq('active', true).order('name'),
      ])
      setProducts(prods || [])
      setPeople(peeps || [])
      setCompanies(comps || [])
      setSpifTiers(tiers || [])
      setPartners(pts || [])
      if (settings) setGlobalRate(parseFloat(settings.global_commission_rate) || 0.07)

      // Latest pricing per product
      const pm = {}
      ;(pricing || []).forEach((p) => {
        if (!pm[p.product_id]) pm[p.product_id] = p
      })
      setPricingMap(pm)

      if (isEdit) {
        const { data: deal } = await supabase.from('deals').select('*').eq('id', editId).single()
        if (deal) {
          setForm({
            name: deal.name || '',
            company_id: deal.company_id || (comps || []).find((c) => c.name.toLowerCase() === deal.company_name?.toLowerCase())?.id || (deal.company_name ? 'other' : ''),
            company_name: deal.company_name || '',
            stage: deal.stage || 'lead',
            deal_type: deal.deal_type || 'new',
            is_tbn_property: deal.is_tbn_property || false,
            contract_start: deal.contract_start || '',
            contract_end: deal.contract_end || '',
            contract_months: deal.contract_months || 12,
            acv: deal.acv || '',
            notes: deal.notes || '',
          })
        }
        const { data: dps } = await supabase
          .from('deal_products')
          .select('*, products(*)')
          .eq('deal_id', editId)
        let milestonesData = []
        if (dps && dps.length > 0) {
          const { data: ms } = await supabase
            .from('deal_product_milestones')
            .select('*')
            .in('deal_product_id', dps.map((dp) => dp.id))
            .order('sort_order')
          milestonesData = ms || []
        }
        setDealProducts((dps || []).map((dp) => {
          const prod = (prods || []).find((p) => p.id === dp.product_id)
          const qty = parseInt(dp.quantity) || 0
          const months = deal?.contract_months || 12
          const isQtyBased = !!prod?.quantity_label
          return {
            ...dp,
            unit_price: dp.unit_price_snapshot ?? '',
            cogs_per_unit: dp.cogs_per_unit_snapshot ?? '',
            _vendor_id: prod?.vendor_id || '',
            _margin_type: prod?.default_margin_type === 'percent' ? 'percent' : 'fixed',
            _cogs_per_item: isQtyBased && qty > 0 ? (dp.cogs_amount || 0) / qty / months : (prod?.default_cogs || ''),
            _list_price_per_item: isQtyBased && qty > 0 ? (dp.list_price || 0) / qty / months : (prod?.default_list_price || ''),
            milestones: milestonesData.filter((m) => m.deal_product_id === dp.id),
            _milestone_total: milestonesData.filter((m) => m.deal_product_id === dp.id).reduce((s, m) => s + (parseFloat(m.amount) || 0), 0),
            billing_start_date: dp.billing_start_date || '',
            billing_months: dp.billing_months || '',
            billing_mode: dp.billing_mode || 'monthly',
            support_product_ids: dp.support_product_ids || [],
            _trilogy_margin_pct: (() => {
              const u = parseFloat(dp.unit_price_snapshot) || 0
              const c = parseFloat(dp.cogs_per_unit_snapshot) || 0
              if (u > 0 && c > 0 && u >= c) return parseFloat(((1 - c / u) * 100).toFixed(2))
              return ''
            })(),
          }
        }))

        const { data: team } = await supabase
          .from('deal_team')
          .select('*, people(*)')
          .eq('deal_id', editId)
        setTeamMembers((team || []).map((t) => ({ ...t })))

        const { data: dPartners } = await supabase
          .from('deal_partners')
          .select('*, partners(name)')
          .eq('deal_id', editId)
          .order('sort_order')
        setDealPartners((dPartners || []).map((dp) => ({ ...dp, commission_pct: dp.commission_pct ?? '' })))

        setLoading(false)
      } else {
        setLoading(false)
      }
    }
    loadRefs()
  }, [editId])

  const vendors = [...new Map(
    products.filter((p) => p.vendor_id && p.vendors?.name)
      .map((p) => [p.vendor_id, { id: p.vendor_id, name: p.vendors.name }])
  ).values()].sort((a, b) => a.name.localeCompare(b.name))

  const acv = parseFloat(form.acv) || 0
  const totalCommission = dealProducts.reduce((s, dp) => s + (dp.commission_amount || 0), 0)
  const totalAllocated = teamMembers.filter((m) => m.role === 'sales').reduce((s, m) => s + (m.commission_percent || 0), 0)

  // Base ACV = sum of product revenues (Trilogy's price before partner markup)
  const productBaseAcv = useMemo(() => {
    const fromProducts = dealProducts.reduce((s, dp) => {
      const prod = products.find((p) => p.id === dp.product_id)
      if (!prod) return s
      if (prod.is_usage_based) return s + (dp.total_revenue || 0)
      if (prod.commission_metric === 'GM') return s + (dp.yearly_cost || 0)
      return s + (dp.annual_value || 0)
    }, 0)
    return fromProducts > 0 ? fromProducts : acv
  }, [dealProducts, products, acv])

  // Total vendor cost (COGS) across all products
  const totalVendorCost = useMemo(() => {
    return dealProducts.reduce((s, dp) => {
      const prod = products.find((p) => p.id === dp.product_id)
      if (!prod) return s
      return s + (parseFloat(dp.cogs_amount) || 0)
    }, 0)
  }, [dealProducts, products])

  // Stack partners: each layer = prev / (1 - pct)
  const { customerAcv, stackedPartners } = useMemo(() => {
    let cv = productBaseAcv
    const stacked = dealPartners
      .filter((p) => p.partner_id && parseFloat(p.commission_pct) > 0)
      .map((p) => {
        const pct = parseFloat(p.commission_pct) / 100
        const prev = cv
        cv = pct < 1 ? prev / (1 - pct) : prev
        return { ...p, commission_amount: cv - prev }
      })
    return { customerAcv: cv, stackedPartners: stacked }
  }, [dealPartners, productBaseAcv])

  function addProduct() {
    setDealProducts((prev) => [...prev, { _id: Date.now(), product_id: '', commission_amount: 0, milestones: [], _milestone_total: 0, billing_start_date: '', billing_months: '', billing_mode: 'monthly', support_product_ids: [], _trilogy_margin_pct: '' }])
  }

  useEffect(() => {
    if (form.contract_start && form.contract_end) {
      const start = new Date(form.contract_start)
      const end = new Date(form.contract_end)
      const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
      if (months > 0) setForm((f) => ({ ...f, contract_months: months }))
    }
  }, [form.contract_start, form.contract_end])

  function removeProduct(index) {
    setDealProducts((prev) => prev.filter((_, i) => i !== index))
  }

  function moveProduct(index, dir) {
    setDealProducts((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function addTeamMember() {
    setTeamMembers((prev) => [...prev, { _id: Date.now(), person_id: '', role: 'sales', commission_percent: 0, spif_amount: 0 }])
  }

  function removeTeamMember(index) {
    setTeamMembers((prev) => prev.filter((_, i) => i !== index))
  }

  function addPartner() {
    setDealPartners((prev) => [...prev, { _id: Date.now(), partner_id: '', commission_pct: '' }])
  }

  function removePartner(index) {
    setDealPartners((prev) => prev.filter((_, i) => i !== index))
  }

  function movePartner(index, dir) {
    setDealPartners((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function updatePartner(index, updates) {
    setDealPartners((prev) => {
      const next = [...prev]
      const row = { ...next[index], ...updates }
      if (updates.partner_id) {
        const pt = partners.find((p) => p.id === updates.partner_id)
        if (pt && !next[index].commission_pct) row.commission_pct = pt.default_commission_pct
      }
      next[index] = row
      return next
    })
  }

  async function saveNewCompany() {
    if (!form.company_name.trim()) return
    const { data } = await supabase
      .from('companies')
      .insert([{ name: form.company_name.trim() }])
      .select()
      .single()
    if (data) {
      setCompanies((prev) => [...prev, { id: data.id, name: data.name }].sort((a, b) => a.name.localeCompare(b.name)))
      setForm((f) => ({ ...f, company_id: data.id, company_name: data.name }))
    }
  }

  function updateTeamMember(index, updates) {
    setTeamMembers((prev) => {
      const next = [...prev]
      const member = { ...next[index], ...updates }
      // Auto-calculate SPIF for support
      if (member.role === 'support') {
        const personTiers = spifTiers.filter((t) => t.person_id === member.person_id)
        member.spif_amount = calcSpif(acv, personTiers)
      } else {
        member.spif_amount = 0
      }
      next[index] = member
      return next
    })
  }

  async function handleSave() {
    if (!form.name || !form.company_name || !form.company_id) return
    setSaving(true)

    const months = parseInt(form.contract_months) || 12
    const dealData = {
      name: form.name,
      company_id: (form.company_id && form.company_id !== 'other') ? form.company_id : null,
      company_name: form.company_name,
      stage: form.stage,
      deal_type: form.deal_type,
      is_tbn_property: form.is_tbn_property,
      contract_start: form.contract_start || null,
      contract_end: form.contract_end || null,
      contract_months: months,
      acv: acv || null,
      total_contract_value: acv ? acv * months / 12 : null,
      notes: form.notes || null,
      updated_at: new Date().toISOString(),
    }

    let dealId = editId
    if (isEdit) {
      await supabase.from('deals').update(dealData).eq('id', editId)
      await supabase.from('deal_products').delete().eq('deal_id', editId)
      await supabase.from('deal_team').delete().eq('deal_id', editId)
      await supabase.from('deal_partners').delete().eq('deal_id', editId)
    } else {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.email) dealData.created_by = session.user.email
      const { data, error } = await supabase.from('deals').insert([dealData]).select().single()
      if (error || !data) {
        console.error('Deal insert failed:', error)
        setSaving(false)
        return
      }
      dealId = data.id
    }

    // Insert products — strip local-only fields and existing id before re-inserting
    const dpToInsert = dealProducts.filter((dp) => dp.product_id)
    const dpRows = dpToInsert.map(({ _id, _vendor_id, _margin_type, _margin_pct, _cogs_per_item, _list_price_per_item, _trilogy_margin_pct, id: _dbId, products: _, unit_price, cogs_per_unit, milestones: _milestones, _milestone_total, ...dp }) => {
      const row = { ...dp, deal_id: dealId }
      return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === '' ? null : v]))
    })
    if (dpRows.length) {
      const { data: insertedDPs, error: dpErr } = await supabase.from('deal_products').insert(dpRows).select()
      if (dpErr) console.error('deal_products insert failed:', JSON.stringify(dpErr))
      if (insertedDPs) {
        const milestoneRows = []
        insertedDPs.forEach((insertedDP, i) => {
          ;(dpToInsert[i].milestones || []).forEach((m, j) => {
            if (m.payment_date && (parseFloat(m.amount) || 0) > 0) {
              milestoneRows.push({ deal_product_id: insertedDP.id, payment_date: m.payment_date, amount: parseFloat(m.amount), label: m.label || null, sort_order: j })
            }
          })
        })
        if (milestoneRows.length) await supabase.from('deal_product_milestones').insert(milestoneRows)
      }
    }

    // Insert team — strip local-only fields and existing id
    const teamRows = teamMembers
      .filter((m) => m.person_id)
      .map(({ _id, id: _dbId, people: _, ...m }) => ({ ...m, deal_id: dealId }))
    if (teamRows.length) await supabase.from('deal_team').insert(teamRows)

    // Insert partners with stacked commission amounts
    const partnerRows = stackedPartners.map(({ _id, id: _dbId, partners: _, ...dp }, idx) => ({
      deal_id: dealId,
      partner_id: dp.partner_id,
      commission_pct: parseFloat(dp.commission_pct) || 0,
      commission_amount: dp.commission_amount || 0,
      sort_order: idx,
    }))
    if (partnerRows.length) await supabase.from('deal_partners').insert(partnerRows)

    // Upsert deal_approvals row if deal has COGS data
    const savedTotalCogs = dealProducts.reduce((s, dp) => s + (parseFloat(dp.cogs_amount) || 0), 0)
    const savedAcv = productBaseAcv > 0 ? productBaseAcv : (parseFloat(form.acv) || 0)
    if (savedTotalCogs > 0 && savedAcv > 0) {
      const marginPct = (savedAcv - savedTotalCogs) / savedAcv
      const tier = getMarginTier(savedAcv, savedTotalCogs)
      const approvalStatus = tier === 'green' ? 'auto_approved' : 'pending'
      await supabase.from('deal_approvals').upsert({
        deal_id: dealId,
        status: approvalStatus,
        margin_pct: marginPct,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'deal_id' })
    }

    navigate(`/deals/${dealId}`)
  }

  if (loading) return <PageSpinner />

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-navy-900">{isEdit ? 'Edit Deal' : 'New Deal'}</h2>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>Save Deal</Button>
        </div>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader title="Deal Information" />
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Deal Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g., Acme Corp — Backstage Platform" />
            <div className="space-y-2">
              <Select
                label="Company"
                value={form.company_id}
                onChange={(e) => {
                  const val = e.target.value
                  if (val === 'other') {
                    setForm({ ...form, company_id: 'other', company_name: '' })
                  } else if (val === '') {
                    setForm({ ...form, company_id: '', company_name: '' })
                  } else {
                    const co = companies.find((c) => c.id === val)
                    setForm({ ...form, company_id: val, company_name: co?.name || '' })
                  }
                }}
                required
              >
                <option value="">Select a company...</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                <option value="other">+ Not listed (type manually)</option>
              </Select>
              {form.company_id === 'other' && (
                <div className="flex gap-2 items-center">
                  <Input
                    className="flex-1"
                    placeholder="Enter company name"
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    required
                  />
                  {form.company_name.trim() && (
                    <button
                      type="button"
                      onClick={saveNewCompany}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-primary-50 text-primary-700 text-xs font-medium hover:bg-primary-100 border border-primary-200 transition-colors whitespace-nowrap"
                    >
                      <Plus size={12} />
                      Save to Companies
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select label="Stage" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
              {DEAL_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
            <Select label="Deal Type" value={form.deal_type} onChange={(e) => setForm({ ...form, deal_type: e.target.value })}>
              {DEAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
            <CurrencyInput label="Estimated ACV" hint="Manual estimate — overridden by product totals" value={form.acv} onChange={(v) => setForm({ ...form, acv: v })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Contract Start" type="date" value={form.contract_start} onChange={(e) => setForm({ ...form, contract_start: e.target.value })} />
            <Input label="Contract End" type="date" value={form.contract_end} onChange={(e) => setForm({ ...form, contract_end: e.target.value })} />
            <Input
              label="Contract Length (Months)"
              type="number"
              min="1"
              value={form.contract_months}
              onChange={(e) => setForm({ ...form, contract_months: e.target.value })}
              readOnly={!!(form.contract_start && form.contract_end)}
              hint={form.contract_start && form.contract_end ? 'Calculated from dates' : undefined}
              className={form.contract_start && form.contract_end ? 'opacity-75' : ''}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="tbn"
              type="checkbox"
              checked={form.is_tbn_property}
              onChange={(e) => setForm({ ...form, is_tbn_property: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-primary-400 focus:ring-primary-400"
            />
            <label htmlFor="tbn" className="text-sm text-navy-900">TBN Property (excluded from commission)</label>
          </div>
          <Textarea label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Deal notes, context, special terms..." />
        </div>
      </Card>

      {/* Products */}
      <Card>
        <CardHeader
          title="Products & Services"
          subtitle={isManager ? `Total Commission: ${fmt(totalCommission, 2)}` : undefined}
        />
        <div className="space-y-3">
          {dealProducts.length === 0 && (
            <div className="text-sm text-gray-400 text-center py-6 border-2 border-dashed border-gray-100 rounded-xl">
              No products added. Click "Add Product" to get started.
            </div>
          )}
          {dealProducts.map((item, i) => (
            <ProductRow
              key={item.id || item._id}
              item={item}
              allItems={dealProducts}
              products={products}
              vendors={vendors}
              pricingMap={pricingMap}
              contractMonths={parseInt(form.contract_months) || 12}
              globalRate={globalRate}
              contractEnd={form.contract_end || (() => {
                if (form.contract_start && form.contract_months) {
                  const d = new Date(form.contract_start + 'T00:00:00')
                  d.setMonth(d.getMonth() + (parseInt(form.contract_months) || 12))
                  d.setDate(d.getDate() - 1)
                  return d.toISOString().split('T')[0]
                }
                return null
              })()}
              onChange={(updated) => setDealProducts((prev) => { const n = [...prev]; n[i] = updated; return n })}
              onRemove={() => removeProduct(i)}
              onMoveUp={() => moveProduct(i, -1)}
              onMoveDown={() => moveProduct(i, 1)}
              isFirst={i === 0}
              isLast={i === dealProducts.length - 1}
              isManager={isManager}
              isTbn={form.is_tbn_property}
            />
          ))}
          <Button size="sm" variant="secondary" onClick={addProduct} icon={<Plus size={14} />}>Add Product</Button>
        </div>
      </Card>

      {/* Pricing Breakdown */}
      {productBaseAcv > 0 && (() => {
        const marginTier = getMarginTier(productBaseAcv, totalVendorCost)
        const marginPct = totalVendorCost > 0 ? (productBaseAcv - totalVendorCost) / productBaseAcv : null
        const bannerStyles = {
          green: 'bg-green-50 border-green-200 text-green-800',
          yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
          red: 'bg-red-50 border-red-200 text-red-800',
        }
        const tierLabel = { green: 'Healthy Margin', yellow: 'Low Margin — Review Required', red: 'Below Minimum Margin' }
        const dotColor = { green: 'bg-green-400', yellow: 'bg-yellow-400', red: 'bg-red-400' }
        return (
          <Card>
            <CardHeader title="Pricing Breakdown" />
            <div className="space-y-1.5 text-sm">
              {totalVendorCost > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Vendor Cost (COGS)</span>
                    <span className="font-medium text-navy-900">{fmt(totalVendorCost, 2)}</span>
                  </div>
                  <div className="flex justify-between text-teal-700">
                    <span>+ Trilogy Margin</span>
                    <span className="font-medium">+{fmt(productBaseAcv - totalVendorCost, 2)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-gray-200">
                    <span className="text-gray-600 font-medium">Trilogy ACV</span>
                    <span className="font-medium text-navy-900">{fmt(productBaseAcv, 2)}</span>
                  </div>
                </>
              )}
              {totalVendorCost === 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Trilogy ACV (base)</span>
                  <span className="font-medium text-navy-900">{fmt(productBaseAcv, 2)}</span>
                </div>
              )}
              {stackedPartners.map((p) => {
                const pt = partners.find((x) => x.id === p.partner_id)
                return (
                  <div key={p.partner_id} className="flex justify-between text-purple-700">
                    <span>+ {pt?.name} ({p.commission_pct}%)</span>
                    <span className="font-medium">+{fmt(p.commission_amount, 2)}</span>
                  </div>
                )
              })}
              <div className="flex justify-between pt-1.5 border-t border-gray-200 font-semibold">
                <span className="text-navy-900">Customer ACV</span>
                <span className="text-navy-900">{fmt(customerAcv, 2)}</span>
              </div>
            </div>
            {marginTier && (
              <div className={`mt-3 border rounded-xl px-4 py-3 flex items-center gap-2.5 ${bannerStyles[marginTier]}`}>
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor[marginTier]}`} />
                <span className="text-sm font-semibold">{tierLabel[marginTier]}</span>
                {marginPct != null && (
                  <span className="text-xs opacity-75">({(marginPct * 100).toFixed(1)}%)</span>
                )}
              </div>
            )}
          </Card>
        )
      })()}

      {/* Team */}
      <Card>
        <CardHeader
          title="Sales Team"
          subtitle={totalAllocated !== 100 && teamMembers.some((m) => m.role === 'sales') ? `⚠ Sales allocation: ${totalAllocated}% (must equal 100%)` : ''}
          action={<Button size="sm" variant="secondary" onClick={addTeamMember} icon={<Plus size={14} />}>Add Member</Button>}
        />
        <div className="space-y-3">
          {teamMembers.length === 0 && (
            <div className="text-sm text-gray-400 text-center py-6 border-2 border-dashed border-gray-100 rounded-xl">
              Add sales or support team members.
            </div>
          )}
          {teamMembers.map((member, i) => {
            const person = people.find((p) => p.id === member.person_id)
            return (
              <div key={member.id || member._id} className="border border-gray-100 rounded-xl p-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Select
                    label="Team Member"
                    value={member.person_id}
                    onChange={(e) => updateTeamMember(i, { person_id: e.target.value })}
                  >
                    <option value="">Select person...</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
                    ))}
                  </Select>
                  <Select
                    label="Role on Deal"
                    value={member.role}
                    onChange={(e) => updateTeamMember(i, { role: e.target.value })}
                  >
                    <option value="sales">Sales</option>
                    <option value="support">Support</option>
                  </Select>
                  {member.role === 'sales' && isManager ? (
                    <Input
                      label="Commission %"
                      type="number"
                      min="0"
                      max="100"
                      suffix="%"
                      value={member.commission_percent || ''}
                      onChange={(e) => updateTeamMember(i, { commission_percent: parseFloat(e.target.value) || 0 })}
                    />
                  ) : member.role === 'sales' ? (
                    <div />
                  ) : (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-navy-900">SPIF Amount</p>
                      <div className="bg-accent-50 border border-accent-200 rounded-lg px-3 py-2.5 text-sm font-bold text-navy-900">
                        {fmt(member.spif_amount || 0, 2)}
                      </div>
                    </div>
                  )}
                  <div className="flex items-end">
                    <button
                      onClick={() => removeTeamMember(i)}
                      className="p-2.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors w-full justify-center flex"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Partners */}
      <Card>
        <CardHeader
          title="Partner Commissions"
          subtitle={dealPartners.some((p) => p.partner_id) ? `Customer ACV: ${fmt(customerAcv, 2)}` : 'Optional — referral/reseller partners added on top of your ACV'}
          action={<Button size="sm" variant="secondary" onClick={addPartner} icon={<Plus size={14} />}>Add Partner</Button>}
        />
        <div className="space-y-3">
          {dealPartners.length === 0 && (
            <div className="text-sm text-gray-400 text-center py-6 border-2 border-dashed border-gray-100 rounded-xl">
              No partners on this deal.
            </div>
          )}
          {dealPartners.map((row, i) => {
            const pt = partners.find((p) => p.id === row.partner_id)
            const stacked = stackedPartners[i]
            return (
              <div key={row.id || row._id} className="border border-gray-100 rounded-xl p-4">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
                  <Select
                    label="Partner"
                    value={row.partner_id}
                    onChange={(e) => updatePartner(i, { partner_id: e.target.value })}
                  >
                    <option value="">Select partner...</option>
                    {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                  <Input
                    label="Commission %"
                    type="number" min="0" max="99" step="0.1" suffix="%"
                    value={row.commission_pct}
                    onChange={(e) => updatePartner(i, { commission_pct: e.target.value })}
                    className="w-32"
                  />
                  <div className="flex flex-col gap-0.5 pb-0.5">
                    <button onClick={() => movePartner(i, -1)} disabled={i === 0} className="p-1.5 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded disabled:opacity-20 transition-colors"><ChevronUp size={14} /></button>
                    <button onClick={() => movePartner(i, 1)} disabled={i === dealPartners.length - 1} className="p-1.5 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded disabled:opacity-20 transition-colors"><ChevronDown size={14} /></button>
                  </div>
                  <button onClick={() => removePartner(i)} className="pb-0.5 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
                {row.partner_id && stacked && (
                  <div className="mt-3 bg-purple-50 border border-purple-100 rounded-lg p-3 text-xs flex items-center justify-between">
                    <span className="text-gray-500">{pt?.name} earns {row.commission_pct}% on their layer</span>
                    <span className="font-bold text-purple-700">{fmt(stacked.commission_amount, 2)}</span>
                  </div>
                )}
              </div>
            )
          })}

        </div>
      </Card>

      <div className="flex justify-end gap-2 pb-6">
        <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
        <Button onClick={handleSave} loading={saving} size="lg">Save Deal</Button>
      </div>
    </div>
  )
}
