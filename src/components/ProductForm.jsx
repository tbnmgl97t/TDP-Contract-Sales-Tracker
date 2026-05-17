import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Input, { Select } from './ui/Input'
import CurrencyInput from './ui/CurrencyInput'
import Button from './ui/Button'
import { COMMISSION_METRICS } from '../lib/constants'

export default function ProductForm({ initial, vendors, categories, globalRate, onSave, onClose }) {
  const [form, setForm] = useState(() => {
    const f = initial || {
      name: '', sku: '', vendor_id: '', category_id: '', commission_metric: 'NAVC/RAV',
      base_rate: globalRate, rate_overridden: false, is_usage_based: false, unit_label: '',
      billing_frequency: 'monthly', is_support_charge: false, default_support_pct: 15, active: true,
    }
    const rate = parseFloat(f._unit_price)
    const cogs = parseFloat(f._cogs_per_unit)
    const derivedMarginPct = rate > 0 && cogs > 0 ? parseFloat(((1 - cogs / rate) * 100).toFixed(2)) : ''
    if (!f.default_margin_type || ['amount', 'per_item'].includes(f.default_margin_type)) {
      return { ...f, default_margin_type: 'fixed', billing_frequency: f.billing_frequency || 'monthly', rate_overridden: f.rate_overridden || false, is_support_charge: f.is_support_charge || false, default_support_pct: f.default_support_pct ?? 15, _trilogy_margin_pct: derivedMarginPct }
    }
    return { ...f, billing_frequency: f.billing_frequency || 'monthly', rate_overridden: f.rate_overridden || false, is_support_charge: f.is_support_charge || false, default_support_pct: f.default_support_pct ?? 15, _trilogy_margin_pct: derivedMarginPct }
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.name) return
    setSaving(true)
    const { vendors: _v, categories: _c, _unit_price, _cogs_per_unit, _trilogy_margin_pct: _tmp, ...rest } = form
    const data = {
      ...rest,
      base_rate: parseFloat(rest.base_rate) || 0.07,
      vendor_id: rest.vendor_id || null,
      category_id: rest.category_id || null,
    }
    let productId = initial?.id
    if (initial?.id) {
      await supabase.from('products').update(data).eq('id', initial.id)
    } else {
      const { data: inserted } = await supabase.from('products').insert([data]).select('id').single()
      productId = inserted?.id
    }
    if (form.is_usage_based && productId && (_unit_price !== '' || _cogs_per_unit !== '')) {
      await supabase.from('product_pricing_params').insert({
        product_id: productId,
        unit_price: parseFloat(_unit_price) || null,
        cogs_per_unit: parseFloat(_cogs_per_unit) || null,
      })
    }
    onSave()
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input label="Product Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <Input label="SKU" value={form.sku || ''} onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })} placeholder="e.g. TDP-BACKSTAGE" hint="Unique product identifier" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Select label="Vendor" value={form.vendor_id || ''} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}>
          <option value="">No vendor</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>
        <Select label="Category" value={form.category_id || ''} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
          <option value="">No category</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Select label="Commission Metric" value={form.commission_metric} onChange={(e) => setForm({ ...form, commission_metric: e.target.value })}>
          {COMMISSION_METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </Select>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500">Commission Rate</p>
          <label className="flex items-center gap-2 cursor-pointer mb-1.5">
            <input
              type="checkbox"
              checked={form.rate_overridden}
              onChange={(e) => setForm({ ...form, rate_overridden: e.target.checked, base_rate: e.target.checked ? form.base_rate : globalRate })}
              className="w-4 h-4 rounded border-gray-300 text-primary-400 focus:ring-primary-400"
            />
            <span className="text-sm text-navy-900">Override global rate</span>
          </label>
          {form.rate_overridden ? (
            <Input type="number" step="0.01" min="0" max="100" suffix="%" value={(parseFloat(form.base_rate) * 100).toFixed(1)} onChange={(e) => setForm({ ...form, base_rate: parseFloat(e.target.value) / 100 || 0 })} />
          ) : (
            <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-navy-900 font-medium">
              {(globalRate * 100).toFixed(1)}% <span className="text-gray-400 font-normal text-xs">(global default)</span>
            </div>
          )}
        </div>
      </div>
      {form.commission_metric !== 'GM' && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500">Billing Frequency</p>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs w-fit">
            {[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }, { value: 'one_time', label: 'One-time' }, { value: 'milestone', label: 'Milestone' }].map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm({ ...form, billing_frequency: value })}
                className={`px-4 py-1.5 transition-colors ${form.billing_frequency === value ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <input
            id="usage"
            type="checkbox"
            checked={form.is_usage_based}
            onChange={(e) => setForm({ ...form, is_usage_based: e.target.checked })}
            className="w-4 h-4 rounded border-gray-300 text-primary-400 focus:ring-primary-400"
          />
          <label htmlFor="usage" className="text-sm text-navy-900 whitespace-nowrap">Usage-based (JWX GB/Hours)</label>
        </div>
        {form.is_usage_based && (
          <Input
            label=""
            placeholder="Unit label — GB, Hours, Users..."
            value={form.unit_label || ''}
            onChange={(e) => setForm({ ...form, unit_label: e.target.value })}
            className="flex-1"
          />
        )}
      </div>
      {form.is_usage_based && form.commission_metric === 'GM' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <p className="text-xs font-medium text-navy-900 shrink-0">Default Billing Mode</p>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs w-fit">
              {[{ value: 'monthly', label: 'Monthly × Duration' }, { value: 'fixed', label: 'Fixed Contract Total' }].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm({ ...form, default_billing_mode: value })}
                  className={`px-3 py-1.5 transition-colors ${(form.default_billing_mode || 'monthly') === value ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <CurrencyInput
              label={`COGS/Unit (per ${form.unit_label || 'unit'})`}
              value={form._cogs_per_unit || ''}
              onChange={(v) => {
                const cogs = parseFloat(v) || 0
                const pct = parseFloat(form._trilogy_margin_pct)
                let rate = form._unit_price
                if (!isNaN(pct) && pct >= 0 && pct < 100 && cogs > 0) {
                  rate = parseFloat((cogs / (1 - pct / 100)).toFixed(4))
                }
                setForm({ ...form, _cogs_per_unit: v, _unit_price: rate })
              }}
            />
            <Input
              label="Trilogy Margin %"
              type="number"
              min="0"
              max="99.9"
              step="0.1"
              suffix="%"
              hint={form._cogs_per_unit && form._trilogy_margin_pct !== '' && parseFloat(form._trilogy_margin_pct) >= 0 && parseFloat(form._trilogy_margin_pct) < 100
                ? `Rate: $${(parseFloat(form._cogs_per_unit) / (1 - parseFloat(form._trilogy_margin_pct) / 100)).toFixed(4)}`
                : undefined}
              value={form._trilogy_margin_pct ?? ''}
              onChange={(e) => {
                const pct = e.target.value
                const pctNum = parseFloat(pct)
                const cogs = parseFloat(form._cogs_per_unit) || 0
                const rate = (!isNaN(pctNum) && pctNum >= 0 && pctNum < 100 && cogs > 0)
                  ? parseFloat((cogs / (1 - pctNum / 100)).toFixed(4))
                  : (isFinite(parseFloat(form._unit_price)) ? form._unit_price : '')
                setForm({ ...form, _trilogy_margin_pct: pct, _unit_price: rate })
              }}
            />
            <CurrencyInput
              label={`Rate (per ${form.unit_label || 'unit'})`}
              hint="COGS ÷ (1 − margin%)"
              value={(() => { const n = parseFloat(Number(form._unit_price).toFixed(6)); return (isFinite(n) && !isNaN(n)) ? parseFloat(n.toFixed(4)) : '' })()}
              onChange={(v) => {
                const rate = parseFloat(v) || 0
                const cogs = parseFloat(form._cogs_per_unit) || 0
                const pct = rate > 0 && cogs > 0 ? parseFloat(((1 - cogs / rate) * 100).toFixed(2)) : ''
                setForm({ ...form, _unit_price: v, _trilogy_margin_pct: pct })
              }}
            />
            <CurrencyInput
              label={`Overage (per ${form.unit_label || 'unit'})`}
              hint="Per-unit price beyond contracted allocation"
              value={form.default_overage_rate || ''}
              onChange={(v) => setForm({ ...form, default_overage_rate: v === '' ? null : v })}
            />
          </div>
          {(() => {
            const cogs = parseFloat(form._cogs_per_unit) || 0
            const rate = parseFloat(form._unit_price) || 0
            const overage = parseFloat(form.default_overage_rate) || 0
            const marginPct = rate > 0 && cogs > 0 ? (rate - cogs) / rate : null
            if (!cogs && !rate) return null
            return (
              <div className={`bg-gray-50 rounded-lg p-3 grid gap-3 text-xs ${overage > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                <div>
                  <p className="text-gray-500">COGS/Unit</p>
                  <p className="font-medium text-navy-900 mt-0.5">{cogs > 0 ? `$${cogs.toFixed(4)}` : '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Rate/Unit</p>
                  <p className="font-bold text-navy-900 mt-0.5">{rate > 0 ? `$${rate.toFixed(4)}` : '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Margin</p>
                  <p className={`font-bold mt-0.5 ${marginPct == null ? 'text-gray-400' : marginPct >= 0.30 ? 'text-green-600' : marginPct >= 0.15 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {marginPct != null ? `${(marginPct * 100).toFixed(1)}%` : '—'}
                  </p>
                </div>
                {overage > 0 && (
                  <div>
                    <p className="text-gray-500">Overage Rate</p>
                    <p className="font-medium text-navy-900 mt-0.5">${overage.toFixed(4)}</p>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}
      {form.commission_metric !== 'GM' && !form.is_support_charge && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <CurrencyInput
              label="Default COGS (optional)"
              hint="Vendor cost — pre-fills on each deal"
              value={form.default_cogs || ''}
              onChange={(v) => setForm({ ...form, default_cogs: v === '' ? null : v })}
            />
            <CurrencyInput
              label="Default List Price (optional)"
              hint="Selling price — pre-fills on each deal"
              value={form.default_list_price || ''}
              onChange={(v) => setForm({ ...form, default_list_price: v === '' ? null : v })}
            />
          </div>
          {(() => {
            const cogs = parseFloat(form.default_cogs) || 0
            const list = parseFloat(form.default_list_price) || 0
            const marginPct = list > 0 && cogs > 0 ? (list - cogs) / list : null
            if (marginPct == null) return null
            return (
              <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-gray-500">COGS</p>
                  <p className="font-medium text-navy-900 mt-0.5">${cogs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-gray-500">List Price</p>
                  <p className="font-bold text-navy-900 mt-0.5">${list.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-gray-500">Margin</p>
                  <p className={`font-bold mt-0.5 ${marginPct >= 0.30 ? 'text-green-600' : marginPct >= 0.15 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {(marginPct * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            )
          })()}
        </div>
      )}
      <div className="flex items-center gap-3">
        <input
          id="support_charge"
          type="checkbox"
          checked={form.is_support_charge}
          onChange={(e) => setForm({ ...form, is_support_charge: e.target.checked })}
          className="w-4 h-4 rounded border-gray-300 text-primary-400 focus:ring-primary-400"
        />
        <label htmlFor="support_charge" className="text-sm text-navy-900">Support Charge product (% of selected line items)</label>
      </div>
      {form.is_support_charge && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Default Support %"
              type="number" min="0" max="100" step="0.1" suffix="%"
              hint="Percentage applied to selected products in a deal"
              value={form.default_support_pct ?? 15}
              onChange={(e) => setForm({ ...form, default_support_pct: parseFloat(e.target.value) || 0 })}
            />
            <Input
              label="Default COGS %"
              type="number" min="0" max="100" step="0.1" suffix="%"
              hint="Cost as % of support revenue"
              value={form.default_support_cogs_pct ?? ''}
              onChange={(e) => setForm({ ...form, default_support_cogs_pct: e.target.value === '' ? null : parseFloat(e.target.value) })}
            />
          </div>
          {(() => {
            const supportPct = parseFloat(form.default_support_pct) || 0
            const cogsPct = parseFloat(form.default_support_cogs_pct)
            if (!supportPct || isNaN(cogsPct)) return null
            const marginPct = (100 - cogsPct) / 100
            return (
              <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-gray-500">Support Rate</p>
                  <p className="font-medium text-navy-900 mt-0.5">{supportPct}% of products</p>
                </div>
                <div>
                  <p className="text-gray-500">COGS</p>
                  <p className="font-medium text-navy-900 mt-0.5">{cogsPct}% of revenue</p>
                </div>
                <div>
                  <p className="text-gray-500">Margin</p>
                  <p className={`font-bold mt-0.5 ${marginPct >= 0.30 ? 'text-green-600' : marginPct >= 0.15 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {((marginPct) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            )
          })()}
        </div>
      )}
      {form.commission_metric === 'GM' && !form.is_usage_based && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-navy-900">Pricing Type</span>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              {[{ value: 'fixed', label: 'Fixed Cost' }, { value: 'percent', label: 'Margin %' }].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm({ ...form, default_margin_type: value })}
                  className={`px-3 py-1.5 transition-colors ${form.default_margin_type === value ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {form.default_margin_type === 'fixed' && (
            <div className="grid grid-cols-2 gap-4">
              <CurrencyInput
                label="Default COGS"
                hint="Cost of goods / service"
                value={form.default_cogs || ''}
                onChange={(v) => setForm({ ...form, default_cogs: v === '' ? null : v })}
              />
              <CurrencyInput
                label="Default List Price"
                hint="Selling price before discount"
                value={form.default_list_price || ''}
                onChange={(v) => setForm({ ...form, default_list_price: v === '' ? null : v })}
              />
            </div>
          )}

          {form.default_margin_type === 'percent' && (
            <div className="grid grid-cols-2 gap-4">
              <CurrencyInput
                label="Default COGS"
                hint="Cost of goods / service"
                value={form.default_cogs || ''}
                onChange={(v) => setForm({ ...form, default_cogs: v === '' ? null : v })}
              />
              <Input
                label="Default Markup %"
                type="number" min="0" step="0.1" suffix="%"
                hint={form.default_cogs && form.default_margin_pct
                  ? `List Price = $${(parseFloat(form.default_cogs) * (1 + parseFloat(form.default_margin_pct) / 100)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : 'List Price = COGS × (1 + markup%)'}
                value={form.default_margin_pct || ''}
                onChange={(e) => setForm({ ...form, default_margin_pct: parseFloat(e.target.value) || null })}
              />
            </div>
          )}

          <Input
            label="Quantity Label (optional)"
            value={form.quantity_label || ''}
            onChange={(e) => setForm({ ...form, quantity_label: e.target.value })}
            placeholder="e.g. # of Apps, # of Screens"
            hint="If set, COGS and List Price above are per-item — quantity entered on each deal"
          />
        </div>
      )}
      <div className="flex items-center gap-3">
        <input
          id="active"
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
          className="w-4 h-4 rounded border-gray-300 text-primary-400 focus:ring-primary-400"
        />
        <label htmlFor="active" className="text-sm text-navy-900">Active</label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={saving}>{initial?.id ? 'Update' : 'Create'} Product</Button>
      </div>
    </div>
  )
}
