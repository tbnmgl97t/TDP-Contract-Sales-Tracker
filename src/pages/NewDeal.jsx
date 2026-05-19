import { useState, useEffect, useMemo, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2, ChevronUp, ChevronDown, Eye } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useUser } from '../contexts/UserContext'
import Button from '../components/ui/Button'
import Input, { Select } from '../components/ui/Input'
import CurrencyInput from '../components/ui/CurrencyInput'
import Card, { CardHeader } from '../components/ui/Card'
import { DEAL_STAGES, DEAL_TYPES } from '../lib/constants'
import { calcSpif, fmt } from '../lib/commission'
import { calcTotalCommission, calcMonthsBetweenDates } from '../lib/deals'
import { PageSpinner } from '../components/ui/Spinner'
import { useNewDeal } from '../hooks/useNewDeal'
import ProductRow from '../components/deal/ProductRow'
import CancelledProductRow from '../components/deal/CancelledProductRow'
import PricingBreakdownCard from '../components/deal/PricingBreakdownCard'
import RichTextEditor from '../components/ui/RichTextEditor'
import QuestionnaireResponsesDrawer from '../components/QuestionnaireResponsesDrawer'
import { Badge } from '../components/ui/Badge'

export default function NewDeal() {
  const navigate = useNavigate()
  const { id: editId } = useParams()
  const isEdit = !!editId
  const { isManager } = useUser()

  const {
    products, people, companies, setCompanies,
    pricingMap, spifTiers, globalRate, partners,
    loading, saving, editDefaults, handleSave,
  } = useNewDeal(editId)

  // Tracks whether contract_end was manually edited by the user (vs auto-filled)
  const [endDateManual, setEndDateManual] = useState(false)

  // AR earliest invoice date hint for contract start
  const [arEarliestDate, setArEarliestDate] = useState(null)

  // Form state
  const [form, setForm] = useState({
    name: '', company_id: '', company_name: '', stage: 'lead', deal_type: 'new',
    is_tbn_property: false, contract_start: '', contract_end: '',
    contract_months: 12, acv: '', notes: '', executive_summary: '',
    notice_period_days: '',
    auto_renewal: null,
  })
  const [dealProducts, setDealProducts] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [dealPartners, setDealPartners] = useState([])

  // Seed form from edit defaults when they arrive
  useEffect(() => {
    if (!editDefaults) return
    setForm(editDefaults.form)
    setDealProducts(editDefaults.dealProducts)
    setTeamMembers(editDefaults.teamMembers)
    setDealPartners(editDefaults.dealPartners)
    // Treat existing end date as manually set so start-date changes don't overwrite it
    if (editDefaults.form.contract_end) setEndDateManual(true)
  }, [editDefaults])

  // Fetch submitted questionnaire for reference (edit mode only)
  const [submittedQ, setSubmittedQ] = useState(null)  // raw questionnaire row for the drawer
  const [viewingQ, setViewingQ] = useState(false)
  useEffect(() => {
    if (!editId) return
    async function fetchQ() {
      const { data: qs } = await supabase
        .from('questionnaires')
        .select('id, title, status, submitted_at, questionnaire_items(count)')
        .eq('deal_id', editId)
        .eq('status', 'submitted')
        .order('created_at', { ascending: false })
        .limit(1)
      if (qs?.[0]) setSubmittedQ(qs[0])
    }
    fetchQ()
  }, [editId])

  // Fetch earliest AR invoice date when company changes
  useEffect(() => {
    if (!form.company_id || form.company_id === 'other') {
      setArEarliestDate(null)
      return
    }
    supabase
      .from('receivables')
      .select('creation_date')
      .eq('company_id', form.company_id)
      .not('creation_date', 'is', null)
      .order('creation_date', { ascending: true })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.creation_date) setArEarliestDate(data.creation_date)
        else setArEarliestDate(null)
      })
  }, [form.company_id])

  // Auto-calculate contract_months from date range
  useEffect(() => {
    if (form.contract_start && form.contract_end) {
      const months = calcMonthsBetweenDates(new Date(form.contract_start), new Date(form.contract_end))
      if (months > 0) setForm((f) => ({ ...f, contract_months: months }))
    }
  }, [form.contract_start, form.contract_end])

  // Derived
  const vendors = useMemo(() => [...new Map(
    products.filter((p) => p.vendor_id && p.vendors?.name)
      .map((p) => [p.vendor_id, { id: p.vendor_id, name: p.vendors.name }])
  ).values()].sort((a, b) => a.name.localeCompare(b.name)), [products])

  const acv = parseFloat(form.acv) || 0
  const totalCommission = calcTotalCommission(dealProducts)
  const totalAllocated = teamMembers.filter((m) => m.role === 'sales').reduce((s, m) => s + (m.commission_percent || 0), 0)

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

  const totalVendorCost = useMemo(() =>
    dealProducts.reduce((s, dp) => s + (parseFloat(dp.cogs_amount) || 0), 0),
    [dealProducts]
  )

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

  const contractEnd = form.contract_end || (() => {
    if (form.contract_start && form.contract_months) {
      const d = new Date(form.contract_start + 'T00:00:00')
      d.setMonth(d.getMonth() + (parseInt(form.contract_months) || 12))
      d.setDate(d.getDate() - 1)
      return d.toISOString().split('T')[0]
    }
    return null
  })()

  // Product handlers
  function addProduct() {
    setDealProducts((prev) => [...prev, { _id: Date.now(), product_id: '', commission_amount: 0, milestones: [], _milestone_total: 0, billing_start_date: '', billing_months: '', billing_mode: 'monthly', support_product_ids: [], _trilogy_margin_pct: '' }])
  }
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

  // Team handlers
  const newMemberRef = useRef(null)
  const [newestMemberId, setNewestMemberId] = useState(null)
  function addTeamMember() {
    const newId = Date.now()
    setTeamMembers((prev) => [...prev, { _id: newId, person_id: '', role: 'sales', commission_percent: 0, spif_amount: 0 }])
    setNewestMemberId(newId)
    setTimeout(() => setNewestMemberId(null), 2600)
  }
  useEffect(() => {
    if (teamMembers.length > 0) {
      setTimeout(() => newMemberRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
    }
  }, [teamMembers.length])
  function removeTeamMember(index) {
    setTeamMembers((prev) => prev.filter((_, i) => i !== index))
  }
  function updateTeamMember(index, updates) {
    setTeamMembers((prev) => {
      const next = [...prev]
      const member = { ...next[index], ...updates }
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

  // Partner handlers
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

  function onSave() {
    if (!form.name || !form.company_name || !form.company_id) return
    handleSave({ form, dealProducts, teamMembers, dealPartners, stackedPartners, productBaseAcv })
  }

  if (loading) return <PageSpinner />

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-navy-900">{isEdit ? 'Edit Deal' : 'New Deal'}</h2>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          <Button onClick={onSave} loading={saving}>Save Deal</Button>
        </div>
      </div>

      {/* Two-column layout: 65% left / 35% right */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">

        {/* ── LEFT COLUMN ── */}
        <div className="space-y-5 min-w-0">

          {/* Deal Information */}
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
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                <div>
                  <Input
                    label="Contract Start"
                    type="date"
                    value={form.contract_start}
                    onChange={(e) => {
                      const start = e.target.value
                      const updates = { contract_start: start }
                      if (start && !endDateManual) {
                        const d = new Date(start + 'T00:00:00')
                        d.setFullYear(d.getFullYear() + 1)
                        d.setDate(d.getDate() - 1)
                        updates.contract_end = d.toISOString().split('T')[0]
                      }
                      setForm({ ...form, ...updates })
                    }}
                  />
                  {arEarliestDate && !form.contract_start && (
                    <p className="text-xs text-primary-500 mt-1 cursor-pointer hover:underline"
                       onClick={() => setForm({ ...form, contract_start: arEarliestDate })}>
                      AR history starts {format(parseISO(arEarliestDate), 'MMM d, yyyy')} — use as start date?
                    </p>
                  )}
                </div>
                <Input
                  label="Contract End"
                  type="date"
                  value={form.contract_end}
                  onChange={(e) => {
                    setEndDateManual(true)
                    setForm({ ...form, contract_end: e.target.value })
                  }}
                />
                <Input
                  label="Contract Length (Months)"
                  type="number" min="1"
                  value={form.contract_months}
                  onChange={(e) => setForm({ ...form, contract_months: e.target.value })}
                  readOnly={!!(form.contract_start && form.contract_end)}
                  hint={form.contract_start && form.contract_end ? 'Calculated from dates' : undefined}
                  className={form.contract_start && form.contract_end ? 'opacity-75' : ''}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="Customer Notice Period (days)"
                  type="number" min="0"
                  value={form.notice_period_days}
                  onChange={(e) => setForm({ ...form, notice_period_days: e.target.value })}
                  placeholder="e.g., 30"
                  hint="Days of notice required from customer to exit"
                />
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Auto-Renewal</label>
                  <div className="flex gap-2">
                    {[{ label: 'Yes', value: true }, { label: 'No', value: false }].map(({ label, value }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setForm({ ...form, auto_renewal: form.auto_renewal === value ? null : value })}
                        className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
                          form.auto_renewal === value
                            ? 'border-primary-400 bg-primary-50 text-primary-700 font-medium'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Does this contract auto-renew?</p>
                </div>
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
              {dealProducts.map((item, i) => {
                if (item.status === 'cancelled') {
                  return (
                    <CancelledProductRow
                      key={item.id}
                      item={item}
                      products={products}
                      contractMonths={parseInt(form.contract_months) || 12}
                      isManager={isManager}
                    />
                  )
                }
                return (
                  <ProductRow
                    key={item.id || item._id}
                    item={item}
                    allItems={dealProducts}
                    products={products}
                    vendors={vendors}
                    pricingMap={pricingMap}
                    contractMonths={parseInt(form.contract_months) || 12}
                    globalRate={globalRate}
                    contractStart={form.contract_start || ''}
                    contractEnd={contractEnd}
                    onChange={(updated) => setDealProducts((prev) => { const n = [...prev]; n[i] = updated; return n })}
                    onRemove={() => removeProduct(i)}
                    onMoveUp={() => moveProduct(i, -1)}
                    onMoveDown={() => moveProduct(i, 1)}
                    isFirst={i === 0}
                    isLast={i === dealProducts.length - 1}
                    isManager={isManager}
                    isTbn={form.is_tbn_property}
                    partnerMultiplier={customerAcv > 0 && productBaseAcv > 0 ? customerAcv / productBaseAcv : 1}
                  />
                )
              })}
              <Button size="sm" variant="secondary" onClick={addProduct} icon={<Plus size={14} />}>Add Product</Button>
            </div>
          </Card>

        </div>{/* end left column */}

        {/* ── RIGHT COLUMN (sticky sidebar) ── */}
        <div className="space-y-5 lg:sticky lg:top-6">

          {/* Pricing Breakdown */}
          <PricingBreakdownCard
            productBaseAcv={productBaseAcv}
            totalVendorCost={totalVendorCost}
            customerAcv={customerAcv}
            stackedPartners={stackedPartners}
            partners={partners}
          />

          {/* Submitted Questionnaire — 2nd, edit mode only */}
          {isEdit && submittedQ && (
            <>
              <Card>
                <CardHeader title="Questionnaire" />
                <div className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-navy-900 truncate">{submittedQ.title}</p>
                      <Badge color="blue">Submitted</Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {submittedQ.questionnaire_items?.[0]?.count ?? 0} questions
                      {submittedQ.submitted_at && ` · ${new Date(submittedQ.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                    </p>
                  </div>
                  <button
                    onClick={() => setViewingQ(true)}
                    className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors flex-shrink-0 ml-2"
                    title="View responses"
                  >
                    <Eye size={14} />
                  </button>
                </div>
              </Card>
              {viewingQ && (
                <QuestionnaireResponsesDrawer
                  questionnaire={submittedQ}
                  onClose={() => setViewingQ(false)}
                />
              )}
            </>
          )}

          {/* Deal Team */}
          <Card>
            <CardHeader
              title="Deal Team"
              subtitle={!form.is_tbn_property && totalAllocated !== 100 && teamMembers.some((m) => m.role === 'sales') ? `⚠ Sales allocation: ${totalAllocated}% (must equal 100%)` : ''}
              action={<Button size="sm" variant="secondary" onClick={addTeamMember} icon={<Plus size={14} />}>Add Member</Button>}
            />
            <div className="space-y-3">
              {teamMembers.length === 0 && (
                <div className="text-sm text-gray-400 text-center py-6 border-2 border-dashed border-gray-100 rounded-xl">
                  Add team members — Sales, Support, or Partner.
                </div>
              )}
              {teamMembers.map((member, i) => {
                const showCommission = member.role === 'sales' && isManager && !form.is_tbn_property
                const showSpif = member.role === 'support'
                return (
                  <div key={member.id || member._id} ref={i === teamMembers.length - 1 ? newMemberRef : null} className={`border rounded-xl p-3.5 space-y-3 ${(member._id || member.id) === newestMemberId ? 'animate-highlight-row border-emerald-200' : 'border-gray-100 animate-fade-in'}`}>
                    {/* Row 1: person + role + trash */}
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                      <Select
                        label="Member"
                        value={member.person_id}
                        onChange={(e) => {
                          const person = people.find((p) => p.id === e.target.value)
                          const roleMap = { sales: 'sales', support: 'support', partner: 'partner', management: 'sales' }
                          updateTeamMember(i, {
                            person_id: e.target.value,
                            ...(person ? { role: roleMap[person.role] || 'sales' } : {}),
                          })
                        }}
                      >
                        <option value="">Select…</option>
                        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </Select>
                      <Select
                        label="Role"
                        value={member.role}
                        onChange={(e) => updateTeamMember(i, { role: e.target.value })}
                      >
                        <option value="sales">Sales</option>
                        <option value="support">Support</option>
                        <option value="partner">Partner</option>
                      </Select>
                      <button
                        onClick={() => removeTeamMember(i)}
                        className="p-2.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors mb-0.5"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {/* Row 2: commission or SPIF (only when relevant) */}
                    {showCommission && (
                      <Input
                        label="Commission %"
                        type="number" min="0" max="100" suffix="%"
                        value={member.commission_percent || ''}
                        onChange={(e) => updateTeamMember(i, { commission_percent: parseFloat(e.target.value) || 0 })}
                      />
                    )}
                    {showSpif && (
                      <div className="flex items-center justify-between bg-accent-50 border border-accent-200 rounded-lg px-3 py-2">
                        <span className="text-xs text-gray-500 font-medium">SPIF</span>
                        <span className="text-sm font-bold text-navy-900">{fmt(member.spif_amount || 0, 2)}</span>
                      </div>
                    )}
                    {/* Justification — sales (commission) and support (SPIF) */}
                    {(showCommission || showSpif) && (
                      <div className="col-span-full">
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          {showSpif ? 'SPIF Justification' : 'Commission Justification'}
                        </label>
                        <RichTextEditor
                          value={member.commission_justification || ''}
                          onChange={(v) => updateTeamMember(i, { commission_justification: v })}
                          placeholder={showSpif
                            ? 'Why this person is receiving a SPIF and what their support contribution justifies…'
                            : 'Why this person is on the deal and what their role justifies their commission %…'
                          }
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Partner Commissions */}
          <Card>
            <CardHeader
              title="Partner Commissions"
              subtitle={dealPartners.some((p) => p.partner_id) ? `Customer ACV: ${fmt(customerAcv, 2)}` : 'Optional — referral/reseller partners'}
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
                        className="w-28"
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

          {/* Save button echoed at the bottom of sidebar */}
          <div className="flex justify-end gap-2 pb-6">
            <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
            <Button onClick={onSave} loading={saving}>Save Deal</Button>
          </div>

        </div>{/* end right column */}

      </div>{/* end grid */}
    </div>
  )
}
