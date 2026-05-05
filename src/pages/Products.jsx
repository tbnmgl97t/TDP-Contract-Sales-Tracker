import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Package } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import SearchBar from '../components/ui/SearchBar'
import Modal from '../components/ui/Modal'
import Input, { Select } from '../components/ui/Input'
import CurrencyInput from '../components/ui/CurrencyInput'
import { Badge } from '../components/ui/Badge'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import EmptyState from '../components/ui/EmptyState'
import { PageSpinner } from '../components/ui/Spinner'
import { COMMISSION_METRICS } from '../lib/constants'

function ProductForm({ initial, vendors, categories, globalRate, onSave, onClose }) {
  const [form, setForm] = useState(() => {
    const f = initial || {
      name: '', sku: '', vendor_id: '', category_id: '', commission_metric: 'NAVC/RAV',
      base_rate: globalRate, rate_overridden: false, is_usage_based: false, unit_label: '',
      billing_frequency: 'monthly', is_support_charge: false, default_support_pct: 15, active: true,
    }
    // Derive _trilogy_margin_pct from unit_price and cogs_per_unit when editing
    const rate = parseFloat(f._unit_price)
    const cogs = parseFloat(f._cogs_per_unit)
    const derivedMarginPct = rate > 0 && cogs > 0 ? parseFloat(((1 - cogs / rate) * 100).toFixed(2)) : ''
    // Normalize legacy margin type values
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
          <div className="grid grid-cols-3 gap-3">
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
              hint={form._cogs_per_unit && form._trilogy_margin_pct !== '' && parseFloat(form._trilogy_margin_pct) >= 0
                ? `Rate: $${(parseFloat(form._cogs_per_unit) / (1 - parseFloat(form._trilogy_margin_pct) / 100)).toFixed(4)}`
                : undefined}
              value={form._trilogy_margin_pct ?? ''}
              onChange={(e) => {
                const pct = e.target.value
                const pctNum = parseFloat(pct)
                const cogs = parseFloat(form._cogs_per_unit) || 0
                const rate = (!isNaN(pctNum) && pctNum >= 0 && pctNum < 100 && cogs > 0)
                  ? parseFloat((cogs / (1 - pctNum / 100)).toFixed(4))
                  : form._unit_price
                setForm({ ...form, _trilogy_margin_pct: pct, _unit_price: rate })
              }}
            />
            <CurrencyInput
              label={`Rate (per ${form.unit_label || 'unit'})`}
              hint="COGS ÷ (1 − margin%)"
              value={form._unit_price != null && form._unit_price !== '' ? parseFloat(Number(form._unit_price).toFixed(4)) : ''}
              onChange={(v) => {
                const rate = parseFloat(v) || 0
                const cogs = parseFloat(form._cogs_per_unit) || 0
                const pct = rate > 0 && cogs > 0 ? parseFloat(((1 - cogs / rate) * 100).toFixed(2)) : ''
                setForm({ ...form, _unit_price: v, _trilogy_margin_pct: pct })
              }}
            />
          </div>
          {(() => {
            const cogs = parseFloat(form._cogs_per_unit) || 0
            const rate = parseFloat(form._unit_price) || 0
            const marginPct = rate > 0 && cogs > 0 ? (rate - cogs) / rate : null
            if (!cogs && !rate) return null
            return (
              <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-3 gap-3 text-xs">
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
        <Input
          label="Default Support %"
          type="number" min="0" max="100" step="0.1" suffix="%"
          hint="Default percentage applied to selected products in a deal"
          value={form.default_support_pct ?? 15}
          onChange={(e) => setForm({ ...form, default_support_pct: parseFloat(e.target.value) || 0 })}
        />
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

export default function Products() {
  const [products, setProducts] = useState([])
  const [vendors, setVendors] = useState([])
  const [categories, setCategories] = useState([])
  const [globalRate, setGlobalRate] = useState(0.07)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [modal, setModal] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    const [{ data: prods }, { data: vens }, { data: cats }, { data: settings }] = await Promise.all([
      supabase.from('products').select('*, vendors(name), categories(name)').order('name'),
      supabase.from('vendors').select('*').order('name'),
      supabase.from('categories').select('*').order('name'),
      supabase.from('commission_settings').select('global_commission_rate').eq('id', 1).single(),
    ])
    setProducts(prods || [])
    setVendors(vens || [])
    setCategories(cats || [])
    if (settings) setGlobalRate(parseFloat(settings.global_commission_rate) || 0.07)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('products').delete().eq('id', deleteItem.id)
    setDeleteItem(null)
    setDeleting(false)
    load()
  }

  const filtered = products.filter((p) => {
    if (vendorFilter && p.vendor_id !== vendorFilter) return false
    if (!search) return true
    return p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.vendors?.name?.toLowerCase().includes(search.toLowerCase())
  })

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Search products..." className="flex-1" />
        <select
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white text-sm text-navy-900 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
        >
          <option value="">All Vendors</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <Button onClick={() => setModal({})} icon={<Plus size={15} />}>Add Product</Button>
      </div>

      <Card padding={false}>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Package size={24} />}
            title="No products yet"
            description="Add your first product to get started."
            action={<Button onClick={() => setModal({})}>Add Product</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Product', 'SKU', 'Vendor', 'Category', 'Metric', 'Rate', 'Status', ''].map((h) => (
                    <th key={h} className={`px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide ${h === '' || h === 'Rate' || h === 'Status' ? 'text-right' : 'text-left'} ${['SKU', 'Category', 'Metric'].includes(h) ? 'hidden md:table-cell' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-navy-900">{p.name}</p>
                      {p.is_usage_based && <p className="text-xs text-gray-400">{p.unit_label}</p>}
                      {p.is_support_charge && <p className="text-xs text-purple-600">Support charge · {p.default_support_pct ?? 15}%</p>}
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell font-mono text-xs text-gray-500">{p.sku || '—'}</td>
                    <td className="px-4 py-3.5 text-gray-600">{p.vendors?.name || '—'}</td>
                    <td className="px-4 py-3.5 hidden md:table-cell text-gray-600">{p.categories?.name || '—'}</td>
                    <td className="px-4 py-3.5 hidden sm:table-cell">
                      <Badge color={p.commission_metric === 'GM' ? 'blue' : 'green'}>{p.commission_metric}</Badge>
                    </td>
                    <td className="px-4 py-3.5 text-right font-medium text-navy-900">
                      {p.rate_overridden
                        ? <span>{(p.base_rate * 100).toFixed(1)}% <span className="text-xs text-primary-500 font-normal">custom</span></span>
                        : <span className="text-gray-500">{(globalRate * 100).toFixed(1)}%</span>
                      }
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Badge color={p.active ? 'green' : 'gray'}>{p.active ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={async () => {
                          if (p.is_usage_based) {
                            const { data: pp } = await supabase.from('product_pricing_params').select('*').eq('product_id', p.id).order('effective_date', { ascending: false }).limit(1).maybeSingle()
                            setModal({ ...p, _unit_price: pp?.unit_price ?? '', _cogs_per_unit: pp?.cogs_per_unit ?? '' })
                          } else {
                            setModal(p)
                          }
                        }} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-navy-900 transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setDeleteItem(p)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit Product' : 'New Product'} size="lg">
        {modal !== null && (
          <ProductForm
            initial={modal?.id ? modal : null}
            vendors={vendors}
            categories={categories}
            globalRate={globalRate}
            onSave={() => { setModal(null); load() }}
            onClose={() => setModal(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Product"
        message={`Delete "${deleteItem?.name}"? This cannot be undone.`}
      />
    </div>
  )
}
