import { useEffect } from 'react'
import { Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import Input, { Select } from '../ui/Input'
import CurrencyInput from '../ui/CurrencyInput'
import { calcProductCommission, fmt } from '../../lib/commission'
import { calcJwxValues, applyDiscount, applyMarkup, calcUnitPriceFromMargin, calcMarginPctFromRate, calcSupportCharge, calcMilestoneTotal } from '../../lib/products'
import { getMarginPct } from '../../lib/margin'

export default function ProductRow({ item, allItems, products, vendors, pricingMap, contractMonths, contractEnd, globalRate, onChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast, isManager, isTbn, partnerMultiplier = 1 }) {
  const product = products.find((p) => p.id === item.product_id)
  const isUsageBased = product?.is_usage_based
  const isGM = product?.commission_metric === 'GM'
  const isSupportCharge = product?.is_support_charge
  const billingMode = item.billing_mode || 'monthly'
  const filteredProducts = item._vendor_id ? products.filter((p) => p.vendor_id === item._vendor_id) : products

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
        ? applyMarkup(totalCogs, parseFloat(next.markup_pct) || 0)
        : (parseFloat(next._list_price_per_item) || 0) * qty * contractMonths
    } else if (gmType === 'percent') {
      listPr = applyMarkup(totalCogs, parseFloat(next.markup_pct) || 0)
    }

    const disc = parseFloat(next.discount_pct) || 0
    onChange({ ...next, cogs_amount: totalCogs, list_price: listPr, yearly_cost: applyDiscount(listPr, disc) })
  }

  useEffect(() => {
    if (!product || isSupportCharge) return
    const effectiveRate = product.rate_overridden ? product.base_rate : globalRate
    if (isUsageBased) {
      const cogsPerUnit = parseFloat(item.cogs_per_unit) || 0
      const margin = parseFloat(item._trilogy_margin_pct)
      const unitPrice = (cogsPerUnit > 0 && !isNaN(margin) && margin < 100)
        ? cogsPerUnit / (1 - margin / 100)
        : (parseFloat(item.unit_price) || 0)
      const { monthlyCost, totalRevenue, totalCogs, netRevenue } = calcJwxValues(
        item.monthly_quantity, unitPrice, cogsPerUnit, contractMonths, billingMode
      )
      const commission = calcProductCommission({ commission_metric: 'GM', base_rate: effectiveRate, net_revenue: netRevenue })
      onChange({
        ...item,
        monthly_cost: monthlyCost, total_revenue: totalRevenue, cogs_amount: totalCogs,
        net_revenue: netRevenue, commission_amount: commission,
        unit_price_snapshot: unitPrice, cogs_per_unit_snapshot: cogsPerUnit,
        commission_metric: product.commission_metric, base_rate: effectiveRate,
      })
    } else if (isGM) {
      let cogsAmt = parseFloat(item.cogs_amount) || 0
      let yearlyCost = parseFloat(item.yearly_cost) || 0
      const displayUpdates = {}
      if (isQuantityBased) {
        const qty = parseInt(item.quantity) || 0
        cogsAmt = (parseFloat(item._cogs_per_item) || 0) * qty * contractMonths
        const listPr = item._margin_type === 'percent'
          ? applyMarkup(cogsAmt, parseFloat(item.markup_pct) || 0)
          : (parseFloat(item._list_price_per_item) || 0) * qty * contractMonths
        const disc = parseFloat(item.discount_pct) || 0
        yearlyCost = applyDiscount(listPr, disc)
        if (cogsAmt !== (parseFloat(item.cogs_amount) || 0) || listPr !== (parseFloat(item.list_price) || 0) || yearlyCost !== (parseFloat(item.yearly_cost) || 0)) {
          displayUpdates.cogs_amount = cogsAmt
          displayUpdates.list_price = listPr
          displayUpdates.yearly_cost = yearlyCost
        }
      }
      const netRev = yearlyCost - cogsAmt
      const commission = calcProductCommission({ commission_metric: 'GM', base_rate: effectiveRate, net_revenue: netRev })
      onChange({ ...item, ...displayUpdates, net_revenue: netRev, commission_amount: commission, commission_metric: product.commission_metric, base_rate: effectiveRate })
    } else {
      const freq = product.billing_frequency || 'monthly'
      if (freq === 'milestone') {
        const listValue = parseFloat(item._milestone_total) || 0
        const disc = parseFloat(item.discount_pct) || 0
        const totalValue = applyDiscount(listValue, disc)
        const commission = calcProductCommission({ commission_metric: 'NAVC/RAV', base_rate: effectiveRate, annual_value: totalValue })
        if (Math.abs(totalValue - (parseFloat(item.annual_value) || 0)) > 0.001 || Math.abs(commission - (parseFloat(item.commission_amount) || 0)) > 0.001) {
          onChange({ ...item, annual_value: totalValue, list_price: listValue, commission_amount: commission, commission_metric: product.commission_metric, base_rate: effectiveRate })
        }
      } else {
        const enteredValue = parseFloat(item.monthly_value) || 0
        const disc = parseFloat(item.discount_pct) || 0
        const effectiveMonths = parseInt(item.billing_months) || (freq === 'monthly' ? contractMonths : 1)
        const baseAnnual = freq === 'monthly' ? enteredValue * effectiveMonths : enteredValue
        const annual = applyDiscount(baseAnnual, disc)
        const commission = calcProductCommission({ commission_metric: 'NAVC/RAV', base_rate: effectiveRate, annual_value: annual })
        onChange({ ...item, annual_value: annual, list_price: baseAnnual, commission_amount: commission, commission_metric: product.commission_metric, base_rate: effectiveRate })
      }
    }
  }, [item.product_id, item.monthly_quantity, item.unit_price, item.cogs_per_unit, item._trilogy_margin_pct, item.monthly_value, item.yearly_cost, item.cogs_amount, item.discount_pct, item.quantity, item._milestone_total, item.billing_months, item.billing_mode, contractMonths, globalRate])

  // Support charge: Revenue = support% × sum(linked revenues) × (1 - discount%)
  useEffect(() => {
    if (!product?.is_support_charge) return
    const effectiveRate = product.rate_overridden ? product.base_rate : globalRate
    const pct = parseFloat(item.support_pct) ?? parseFloat(product.default_support_pct) ?? 15
    const disc = parseFloat(item.discount_pct) || 0
    const selectedPids = item.support_product_ids || []
    const itemKey = item._id || item.id
    const linked = allItems.filter((dp) => {
      const key = dp._id || dp.id
      return key !== itemKey && dp.product_id && selectedPids.includes(dp.product_id)
    })
    const baseRevenue = linked.reduce((sum, dp) => {
      const dpProd = products.find((p) => p.id === dp.product_id)
      if (!dpProd) return sum
      if (dpProd.is_usage_based) return sum + (dp.total_revenue || 0)
      if (dpProd.commission_metric === 'GM') return sum + (dp.yearly_cost || 0)
      return sum + (dp.annual_value || 0)
    }, 0)
    const baseCogs = linked.reduce((sum, dp) => sum + (dp.cogs_amount || 0), 0)
    const { listRevenue, revenue, cogs, commission } = calcSupportCharge(pct, disc, baseRevenue, baseCogs, effectiveRate)
    if (Math.abs(revenue - (item.annual_value || 0)) > 0.001 || Math.abs(commission - (item.commission_amount || 0)) > 0.001 || Math.abs(cogs - (item.cogs_amount || 0)) > 0.001) {
      onChange({ ...item, annual_value: revenue, list_price: listRevenue, cogs_amount: cogs, commission_amount: commission, commission_metric: 'NAVC/RAV', base_rate: effectiveRate })
    }
  }, [item.product_id, item.support_pct, item.discount_pct, JSON.stringify(item.support_product_ids), allItems, globalRate])

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
              monthly_value: (!selectedProduct?.is_usage_based && selectedProduct?.commission_metric !== 'GM' && !selectedProduct?.is_support_charge && selectedProduct?.default_list_price)
                ? parseFloat(selectedProduct.default_list_price)
                : '',
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
              _trilogy_margin_pct: (() => {
                if (selectedProduct?.is_support_charge) return ''
                const u = parseFloat(defaults?.unit_price) || 0
                const c = parseFloat(defaults?.cogs_per_unit) || 0
                return u > 0 && c > 0 && u >= c ? parseFloat(((1 - c / u) * 100).toFixed(2)) : ''
              })(),
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

      {/* Usage-based product */}
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
              commas min="0"
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
                  unitPrice = calcUnitPriceFromMargin(cogs, marginPct)
                }
                onChange({ ...item, cogs_per_unit: v, unit_price: unitPrice })
              }}
            />
            <Input
              label="Margin %"
              type="number" min="0" max="99.9" step="0.1" suffix="%"
              disabled={!isManager}
              hint={item.cogs_per_unit && item._trilogy_margin_pct !== '' && parseFloat(item._trilogy_margin_pct) >= 0
                ? `Rate: $${calcUnitPriceFromMargin(parseFloat(item.cogs_per_unit), parseFloat(item._trilogy_margin_pct)).toFixed(4)}`
                : undefined}
              value={item._trilogy_margin_pct ?? ''}
              onChange={(e) => {
                const pct = e.target.value
                const pctNum = parseFloat(pct)
                const cogs = parseFloat(item.cogs_per_unit) || 0
                const rate = (!isNaN(pctNum) && pctNum >= 0 && pctNum < 100 && cogs > 0)
                  ? calcUnitPriceFromMargin(cogs, pctNum)
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
                const pct = rate > 0 && cogs > 0 ? parseFloat(calcMarginPctFromRate(cogs, rate).toFixed(2)) : ''
                onChange({ ...item, unit_price: v, _trilogy_margin_pct: pct })
              }}
            />
            {(() => {
              const overageVal = item.overage_rate != null && item.overage_rate !== '' ? parseFloat(item.overage_rate) : null
              const effectiveToCustomer = item.unit_price != null ? (parseFloat(item.unit_price) || 0) * partnerMultiplier : 0
              const overageBelowEffective = overageVal != null && effectiveToCustomer > 0 && overageVal < effectiveToCustomer
              return (
                <>
                  <CurrencyInput
                    label={`Overage / ${product.unit_label || 'unit'}`}
                    hint="Rate beyond contracted allocation"
                    value={overageVal != null ? parseFloat(Number(overageVal).toFixed(4)) : ''}
                    onChange={(v) => onChange({ ...item, overage_rate: v === '' ? null : v })}
                  />
                  {overageBelowEffective && (
                    <p className="text-xs text-red-500 col-span-full -mt-2">
                      Overage rate (${overageVal.toFixed(4)}) is below the customer effective rate (${effectiveToCustomer.toFixed(4)}). Please increase it.
                    </p>
                  )}
                </>
              )
            })()}
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

      {/* Support charge product */}
      {product && isSupportCharge && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Support %"
              type="number" min="0" max="100" step="0.1" suffix="%"
              hint="% of linked product totals"
              value={item.support_pct ?? (product.default_support_pct ?? 15)}
              onChange={(e) => onChange({ ...item, support_pct: parseFloat(e.target.value) || 0 })}
            />
            <Input
              label="Discount %"
              type="number" min="0" max="100" step="0.1" suffix="%"
              value={item.discount_pct || ''}
              onChange={(e) => onChange({ ...item, discount_pct: parseFloat(e.target.value) || 0 })}
            />
            {(() => {
              const cogs = item.cogs_amount || 0
              const rev = item.annual_value || 0
              const listRev = parseFloat(item.list_price) || 0
              const disc = parseFloat(item.discount_pct) || 0
              const hasDiscount = disc > 0 && listRev > 0
              const marginPct = cogs > 0 && rev > 0 ? (rev - cogs) / rev : null
              return (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500">Summary</p>
                  <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-gray-500">COGS</span>
                      <span className="font-medium text-navy-900">{cogs > 0 ? fmt(cogs, 2) : '—'}</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-gray-500">Revenue</span>
                      <span className="text-right">
                        {hasDiscount && <p className="text-gray-400 line-through text-[11px]">{fmt(listRev, 2)}</p>}
                        <span className="font-medium text-navy-900">{rev > 0 ? fmt(rev, 2) : '—'}</span>
                      </span>
                    </div>
                    {marginPct != null && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Margin</span>
                        <span className={`font-bold ${marginPct >= 0.30 ? 'text-green-600' : marginPct >= 0.15 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {(marginPct * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                    {isManager && !isTbn && (
                      <div className="flex justify-between border-t border-gray-200 pt-1.5 mt-1.5">
                        <span className="text-gray-500">Commission</span>
                        <span className="font-bold text-primary-600">{fmt(item.commission_amount || 0, 2)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
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
                  const dpCogs = dp.cogs_amount || 0
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
                      <span className="text-xs text-gray-400">{dpCogs > 0 ? fmt(dpCogs, 0) : '—'}</span>
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

      {/* GM non-usage product */}
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
                    ? `List Price: ${fmt(applyMarkup(parseFloat(item.cogs_amount) || 0, parseFloat(item.markup_pct) || 0), 2)}`
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
                    const marginPct = getMarginPct(rev, cogs)
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
            const marginPct = getMarginPct(item.yearly_cost, parseFloat(item.cogs_amount) || 0)
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
                      ? `List Price (×${(applyMarkup(1, parseFloat(item.markup_pct) || 0)).toFixed(2)})`
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

      {/* Milestone billing */}
      {product && !isGM && product.billing_frequency === 'milestone' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500">Payment Milestones</p>
            <button
              type="button"
              onClick={() => {
                const milestones = [...(item.milestones || []), { payment_date: '', amount: '', label: '' }]
                onChange({ ...item, milestones, _milestone_total: calcMilestoneTotal(milestones) })
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
                  onChange({ ...item, milestones, _milestone_total: calcMilestoneTotal(milestones) })
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
                  onChange({ ...item, milestones, _milestone_total: calcMilestoneTotal(milestones) })
                }}
                className={`p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ${mi === 0 ? 'self-end' : ''}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {(item.milestones || []).length > 0 && (() => {
            const listRev = item._milestone_total || 0
            const disc = parseFloat(item.discount_pct) || 0
            const rev = item.annual_value || listRev
            const hasDiscount = disc > 0 && listRev > 0
            const cogs = parseFloat(item.cogs_amount) || 0
            const marginPct = getMarginPct(rev, cogs)
            const cols = isManager && !isTbn ? 'grid-cols-4' : 'grid-cols-3'
            return (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Input
                    label="Discount %"
                    type="number" min="0" max="100" step="0.1" suffix="%"
                    value={item.discount_pct || ''}
                    onChange={(e) => onChange({ ...item, discount_pct: parseFloat(e.target.value) || 0 })}
                    className="w-36"
                  />
                </div>
                <div className={`bg-gray-50 rounded-lg p-3 grid gap-3 text-xs ${cols}`}>
                  <div>
                    <p className="text-gray-500">COGS</p>
                    <p className="font-medium text-navy-900 mt-0.5">{cogs > 0 ? fmt(cogs, 2) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Total Value</p>
                    {hasDiscount && <p className="text-gray-400 line-through mt-0.5 text-[11px]">{fmt(listRev, 2)}</p>}
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
              </div>
            )
          })()}
        </div>
      )}

      {/* Standard billing */}
      {product && !isGM && product.billing_frequency !== 'milestone' && (() => {
        const rev = item.annual_value || 0
        const cogs = parseFloat(item.cogs_amount) || 0
        const marginPct = rev > 0 ? (rev - cogs) / rev : null
        const disc = parseFloat(item.discount_pct) || 0
        const listPrice = parseFloat(item.list_price) || 0
        const hasDiscount = disc > 0 && listPrice > 0
        const cols = isManager && !isTbn ? 'grid-cols-4' : 'grid-cols-3'
        const valueLabel = product.billing_frequency === 'yearly' ? 'Annual Value' : product.billing_frequency === 'one_time' ? 'One-time Value' : 'Monthly Value'
        const totalLabel = product.billing_frequency === 'monthly' ? `Total (×${parseInt(item.billing_months) || contractMonths} mo)` : 'Total Value'
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <CurrencyInput
                label={valueLabel}
                value={item.monthly_value || ''}
                onChange={(v) => onChange({ ...item, monthly_value: parseFloat(v) || 0 })}
              />
              <Input
                label="Discount %"
                type="number" min="0" max="100" step="0.1" suffix="%"
                value={item.discount_pct || ''}
                onChange={(e) => onChange({ ...item, discount_pct: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className={`bg-gray-50 rounded-lg p-3 grid gap-3 text-xs ${cols}`}>
              <div>
                <p className="text-gray-500">COGS</p>
                <p className="font-medium text-navy-900 mt-0.5">{cogs > 0 ? fmt(cogs, 2) : '—'}</p>
              </div>
              <div>
                <p className="text-gray-500">{totalLabel}</p>
                {hasDiscount && <p className="text-gray-400 line-through mt-0.5 text-[11px]">{fmt(listPrice, 2)}</p>}
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

      {/* Billing start override */}
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
