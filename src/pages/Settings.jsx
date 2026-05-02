import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Info } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Card, { CardHeader } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { PageSpinner } from '../components/ui/Spinner'
import { fmt } from '../lib/commission'
import { format } from 'date-fns'

function PricingParamModal({ product, params, onSave, onClose }) {
  const latest = params[0]
  const [form, setForm] = useState({
    unit_price: latest?.unit_price || '',
    cogs_per_unit: latest?.cogs_per_unit || '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await supabase.from('product_pricing_params').insert([{
      product_id: product.id,
      unit_price: parseFloat(form.unit_price) || null,
      cogs_per_unit: parseFloat(form.cogs_per_unit) || null,
      notes: form.notes || `Updated ${format(new Date(), 'MMM d, yyyy')}`,
      effective_date: new Date().toISOString().split('T')[0],
    }])
    onSave()
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <div className="bg-primary-50 border border-primary-200 rounded-xl p-3 flex gap-2 text-sm text-primary-700">
        <Info size={16} className="flex-shrink-0 mt-0.5" />
        <span>Changes only affect <strong>future deals</strong>. Existing deals retain their snapshot values.</span>
      </div>
      <div>
        <p className="text-sm font-semibold text-navy-900 mb-1">{product.name}</p>
        <p className="text-xs text-gray-500">Unit: {product.unit_label}</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Unit Price (revenue per unit)"
          type="number"
          step="0.0001"
          prefix="$"
          value={form.unit_price}
          onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
          hint={`Per ${product.unit_label}`}
        />
        <Input
          label="COGS per Unit"
          type="number"
          step="0.0001"
          prefix="$"
          value={form.cogs_per_unit}
          onChange={(e) => setForm({ ...form, cogs_per_unit: e.target.value })}
          hint={`Per ${product.unit_label}`}
        />
      </div>
      <Input
        label="Change Notes"
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
        placeholder="Reason for update..."
      />
      {params.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">History</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {params.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50">
                <span className="text-gray-500">{format(new Date(p.created_at), 'MMM d, yyyy')}</span>
                <span className="text-navy-900">${p.unit_price}/unit · ${p.cogs_per_unit}/unit COGS</span>
                {p.notes && <span className="text-gray-400 ml-2">{p.notes}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={saving}>Save New Rate</Button>
      </div>
    </div>
  )
}

export default function Settings() {
  const [usageProducts, setUsageProducts] = useState([])
  const [pricingHistory, setPricingHistory] = useState({})
  const [loading, setLoading] = useState(true)
  const [editProduct, setEditProduct] = useState(null)

  async function load() {
    const { data: prods } = await supabase
      .from('products')
      .select('*')
      .eq('is_usage_based', true)
      .eq('active', true)
      .order('name')
    const productIds = (prods || []).map((p) => p.id)
    let history = {}
    if (productIds.length) {
      const { data: params } = await supabase
        .from('product_pricing_params')
        .select('*')
        .in('product_id', productIds)
        .order('effective_date', { ascending: false })
      ;(params || []).forEach((p) => {
        if (!history[p.product_id]) history[p.product_id] = []
        history[p.product_id].push(p)
      })
    }
    setUsageProducts(prods || [])
    setPricingHistory(history)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading) return <PageSpinner />

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-navy-900">Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">Configure pricing parameters for usage-based products.</p>
      </div>

      {/* Usage-based pricing */}
      <Card>
        <CardHeader
          title="Usage-Based Product Pricing"
          subtitle="Unit prices and COGS for JWX and other usage-based products. Changes only affect future deals."
        />
        <div className="space-y-3">
          {usageProducts.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">No usage-based products found. Add them in Products.</p>
          )}
          {usageProducts.map((product) => {
            const params = pricingHistory[product.id] || []
            const latest = params[0]
            return (
              <div key={product.id} className="border border-gray-100 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-navy-900">{product.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Unit: {product.unit_label} · Commission: {(product.base_rate * 100).toFixed(0)}% on GM</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setEditProduct(product)} icon={<Pencil size={14} />}>
                    Update Rate
                  </Button>
                </div>
                {latest ? (
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">Unit Price</p>
                      <p className="text-sm font-bold text-navy-900">${latest.unit_price}/{product.unit_label}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">COGS/Unit</p>
                      <p className="text-sm font-bold text-navy-900">${latest.cogs_per_unit}/{product.unit_label}</p>
                    </div>
                    <div className="bg-primary-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">Margin</p>
                      <p className="text-sm font-bold text-primary-700">
                        {latest.unit_price > 0
                          ? `${(((latest.unit_price - latest.cogs_per_unit) / latest.unit_price) * 100).toFixed(1)}%`
                          : '—'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-sm text-orange-700 flex items-center gap-2">
                    <Info size={14} />
                    No pricing set. Add rates before creating deals with this product.
                  </div>
                )}
                {latest && (
                  <p className="text-xs text-gray-400 mt-2">Last updated: {format(new Date(latest.created_at), 'MMM d, yyyy')}</p>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {/* Commission rules summary */}
      <Card>
        <CardHeader title="Commission Rules" subtitle="Per the Trilogy Digital Commission Plan (Jan 2026)" />
        <div className="space-y-3 text-sm">
          {[
            'Core SaaS & Professional Services are calculated on NAVC/RAV at 7%.',
            'Resold Technology commissions are based on Gross Margin (GM) at 7%.',
            'Commission is paid only on collected revenue per quarter.',
            'SPIF payments are paid in the quarter following contract execution.',
            'SPIFs are subtracted from the total commission pool before distribution.',
            'TBN properties are excluded from all commission calculations.',
            'Customers commission % allocations are set per deal by Marcus Lopez.',
            'Any commission payable to Marcus Lopez requires approval by Emanuel Eddyson.',
            'The commission plan can be revised per quarter.',
            'All commissions are subject to finance and executive approval.',
          ].map((rule, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-primary-400 flex-shrink-0 mt-1.5" />
              <p className="text-gray-700 leading-relaxed">{rule}</p>
            </div>
          ))}
        </div>
      </Card>

      {editProduct && (
        <Modal
          open={!!editProduct}
          onClose={() => setEditProduct(null)}
          title={`Update Pricing — ${editProduct.name}`}
          size="lg"
        >
          <PricingParamModal
            product={editProduct}
            params={pricingHistory[editProduct.id] || []}
            onSave={() => { setEditProduct(null); load() }}
            onClose={() => setEditProduct(null)}
          />
        </Modal>
      )}
    </div>
  )
}
