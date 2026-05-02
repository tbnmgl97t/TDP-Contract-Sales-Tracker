import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2, Info } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Button from '../components/ui/Button'
import Input, { Select, Textarea } from '../components/ui/Input'
import Card, { CardHeader } from '../components/ui/Card'
import { DEAL_STAGES, DEAL_TYPES } from '../lib/constants'
import { calcJwxValues, calcProductCommission, calcSpif, fmt } from '../lib/commission'
import { PageSpinner } from '../components/ui/Spinner'

function ProductRow({ item, products, pricingMap, contractMonths, onChange, onRemove }) {
  const product = products.find((p) => p.id === item.product_id)
  const isUsageBased = product?.is_usage_based
  const isGM = product?.commission_metric === 'GM'

  useEffect(() => {
    if (!product) return
    if (isUsageBased) {
      const params = pricingMap[product.id]
      if (!params) return
      const { monthlyCost, totalRevenue, totalCogs, netRevenue } = calcJwxValues(
        item.monthly_quantity,
        params.unit_price,
        params.cogs_per_unit,
        contractMonths
      )
      const commission = calcProductCommission({
        commission_metric: 'GM',
        base_rate: product.base_rate,
        net_revenue: netRevenue,
      })
      onChange({
        ...item,
        monthly_cost: monthlyCost,
        total_revenue: totalRevenue,
        cogs_amount: totalCogs,
        net_revenue: netRevenue,
        commission_amount: commission,
        unit_price_snapshot: params.unit_price,
        cogs_per_unit_snapshot: params.cogs_per_unit,
        commission_metric: product.commission_metric,
        base_rate: product.base_rate,
      })
    } else if (isGM) {
      const revenue = (item.yearly_cost || 0) - (item.cogs_amount || 0)
      const commission = calcProductCommission({
        commission_metric: 'GM',
        base_rate: product.base_rate,
        net_revenue: revenue,
      })
      onChange({ ...item, net_revenue: revenue, commission_amount: commission, commission_metric: product.commission_metric, base_rate: product.base_rate })
    } else {
      const annual = (item.monthly_value || 0) * 12
      const commission = calcProductCommission({
        commission_metric: 'NAVC/RAV',
        base_rate: product.base_rate,
        annual_value: annual,
      })
      onChange({ ...item, annual_value: annual, commission_amount: commission, commission_metric: product.commission_metric, base_rate: product.base_rate })
    }
  }, [item.product_id, item.monthly_quantity, item.monthly_value, item.yearly_cost, item.cogs_amount, contractMonths])

  return (
    <div className="border border-gray-100 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Select
          className="flex-1"
          value={item.product_id}
          onChange={(e) => onChange({ ...item, product_id: e.target.value })}
          label="Product"
        >
          <option value="">Select product...</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.commission_metric})</option>
          ))}
        </Select>
        <button onClick={onRemove} className="mt-6 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
          <Trash2 size={16} />
        </button>
      </div>

      {product && isUsageBased && (
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={`Monthly Quantity (${product.unit_label || 'Units'})`}
            type="number"
            min="0"
            value={item.monthly_quantity || ''}
            onChange={(e) => onChange({ ...item, monthly_quantity: parseFloat(e.target.value) || 0 })}
          />
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500">Calculated</p>
            <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Revenue</span>
                <span className="font-medium text-navy-900">{fmt(item.total_revenue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">COGS</span>
                <span className="font-medium text-red-600">-{fmt(item.cogs_amount)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
                <span className="text-gray-600 font-medium">Net Revenue</span>
                <span className="font-bold text-navy-900">{fmt(item.net_revenue)}</span>
              </div>
              <div className="flex justify-between text-primary-600">
                <span>Commission (7%)</span>
                <span className="font-bold">{fmt(item.commission_amount)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {product && isGM && !isUsageBased && (
        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Yearly Revenue"
            type="number"
            min="0"
            prefix="$"
            value={item.yearly_cost || ''}
            onChange={(e) => onChange({ ...item, yearly_cost: parseFloat(e.target.value) || 0 })}
          />
          <Input
            label="COGS (total contract)"
            type="number"
            min="0"
            prefix="$"
            value={item.cogs_amount || ''}
            onChange={(e) => onChange({ ...item, cogs_amount: parseFloat(e.target.value) || 0 })}
          />
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500">Commission</p>
            <div className="bg-primary-50 rounded-lg p-3 text-xs">
              <p className="text-gray-500">Net Revenue</p>
              <p className="font-semibold text-navy-900">{fmt(item.net_revenue)}</p>
              <p className="text-primary-600 font-bold mt-1">{fmt(item.commission_amount)}</p>
            </div>
          </div>
        </div>
      )}

      {product && !isGM && (
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Monthly Value"
            type="number"
            min="0"
            prefix="$"
            value={item.monthly_value || ''}
            onChange={(e) => onChange({ ...item, monthly_value: parseFloat(e.target.value) || 0 })}
          />
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500">Commission (NAVC/RAV)</p>
            <div className="bg-primary-50 rounded-lg p-3 text-xs">
              <p className="text-gray-500">Annual Value</p>
              <p className="font-semibold text-navy-900">{fmt(item.annual_value)}</p>
              <p className="text-primary-600 font-bold mt-1">{fmt(item.commission_amount)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function NewDeal() {
  const navigate = useNavigate()
  const { id: editId } = useParams()
  const isEdit = !!editId

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [products, setProducts] = useState([])
  const [people, setPeople] = useState([])
  const [pricingMap, setPricingMap] = useState({})
  const [spifTiers, setSpifTiers] = useState([])

  const [form, setForm] = useState({
    name: '',
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

  useEffect(() => {
    async function loadRefs() {
      const [{ data: prods }, { data: peeps }, { data: pricing }, { data: tiers }] = await Promise.all([
        supabase.from('products').select('*').eq('active', true).order('name'),
        supabase.from('people').select('*').eq('active', true).order('name'),
        supabase.from('product_pricing_params').select('*').order('effective_date', { ascending: false }),
        supabase.from('spif_tiers').select('*'),
      ])
      setProducts(prods || [])
      setPeople(peeps || [])
      setSpifTiers(tiers || [])

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
        setDealProducts((dps || []).map((dp) => ({ ...dp, product_id: dp.product_id })))

        const { data: team } = await supabase
          .from('deal_team')
          .select('*, people(*)')
          .eq('deal_id', editId)
        setTeamMembers((team || []).map((t) => ({ ...t })))

        setLoading(false)
      } else {
        setLoading(false)
      }
    }
    loadRefs()
  }, [editId])

  const acv = parseFloat(form.acv) || 0
  const totalCommission = dealProducts.reduce((s, dp) => s + (dp.commission_amount || 0), 0)
  const totalAllocated = teamMembers.filter((m) => m.role === 'sales').reduce((s, m) => s + (m.commission_percent || 0), 0)

  function addProduct() {
    setDealProducts((prev) => [...prev, { _id: Date.now(), product_id: '', commission_amount: 0 }])
  }

  function removeProduct(index) {
    setDealProducts((prev) => prev.filter((_, i) => i !== index))
  }

  function addTeamMember() {
    setTeamMembers((prev) => [...prev, { _id: Date.now(), person_id: '', role: 'sales', commission_percent: 0, spif_amount: 0 }])
  }

  function removeTeamMember(index) {
    setTeamMembers((prev) => prev.filter((_, i) => i !== index))
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
    if (!form.name || !form.company_name) return
    setSaving(true)

    const dealData = {
      ...form,
      acv: acv || null,
      contract_months: parseInt(form.contract_months) || 12,
      total_contract_value: acv * (parseInt(form.contract_months) || 12) / 12,
      updated_at: new Date().toISOString(),
    }

    let dealId = editId
    if (isEdit) {
      await supabase.from('deals').update(dealData).eq('id', editId)
      await supabase.from('deal_products').delete().eq('deal_id', editId)
      await supabase.from('deal_team').delete().eq('deal_id', editId)
    } else {
      const { data } = await supabase.from('deals').insert([dealData]).select().single()
      dealId = data.id
    }

    // Insert products
    const dpRows = dealProducts
      .filter((dp) => dp.product_id)
      .map(({ _id, products: _, ...dp }) => ({ ...dp, deal_id: dealId }))
    if (dpRows.length) await supabase.from('deal_products').insert(dpRows)

    // Insert team
    const teamRows = teamMembers
      .filter((m) => m.person_id)
      .map(({ _id, people: _, ...m }) => ({ ...m, deal_id: dealId }))
    if (teamRows.length) await supabase.from('deal_team').insert(teamRows)

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
            <Input label="Company Name" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select label="Stage" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
              {DEAL_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
            <Select label="Deal Type" value={form.deal_type} onChange={(e) => setForm({ ...form, deal_type: e.target.value })}>
              {DEAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
            <Input label="ACV (Annual Contract Value)" type="number" prefix="$" value={form.acv} onChange={(e) => setForm({ ...form, acv: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Contract Start" type="date" value={form.contract_start} onChange={(e) => setForm({ ...form, contract_start: e.target.value })} />
            <Input label="Contract End" type="date" value={form.contract_end} onChange={(e) => setForm({ ...form, contract_end: e.target.value })} />
            <Input label="Contract Length (Months)" type="number" min="1" value={form.contract_months} onChange={(e) => setForm({ ...form, contract_months: e.target.value })} />
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
          subtitle={`Total Commission: ${fmt(totalCommission)}`}
          action={<Button size="sm" variant="secondary" onClick={addProduct} icon={<Plus size={14} />}>Add Product</Button>}
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
              products={products}
              pricingMap={pricingMap}
              contractMonths={parseInt(form.contract_months) || 12}
              onChange={(updated) => setDealProducts((prev) => { const n = [...prev]; n[i] = updated; return n })}
              onRemove={() => removeProduct(i)}
            />
          ))}
        </div>
      </Card>

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
                  {member.role === 'sales' ? (
                    <Input
                      label="Commission %"
                      type="number"
                      min="0"
                      max="100"
                      suffix="%"
                      value={member.commission_percent || ''}
                      onChange={(e) => updateTeamMember(i, { commission_percent: parseFloat(e.target.value) || 0 })}
                    />
                  ) : (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-navy-900">SPIF Amount</p>
                      <div className="bg-accent-50 border border-accent-200 rounded-lg px-3 py-2.5 text-sm font-bold text-navy-900">
                        {fmt(member.spif_amount || 0)}
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

      <div className="flex justify-end gap-2 pb-6">
        <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
        <Button onClick={handleSave} loading={saving} size="lg">Save Deal</Button>
      </div>
    </div>
  )
}
