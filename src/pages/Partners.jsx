import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Handshake, ChevronRight, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useUser } from '../contexts/UserContext'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import SearchBar from '../components/ui/SearchBar'
import Modal from '../components/ui/Modal'
import Input, { Select, Textarea } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import EmptyState from '../components/ui/EmptyState'
import { PageSpinner } from '../components/ui/Spinner'

function PartnerForm({ initial, vendors, onSave, onClose }) {
  const [form, setForm] = useState(initial || {
    name: '', default_commission_pct: 7.5, vendor_id: '', active: true, notes: '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.name) return
    setSaving(true)
    const data = {
      name: form.name,
      default_commission_pct: parseFloat(form.default_commission_pct) || 0,
      vendor_id: form.vendor_id || null,
      active: form.active,
      notes: form.notes || null,
    }
    if (initial?.id) {
      await supabase.from('partners').update(data).eq('id', initial.id)
    } else {
      await supabase.from('partners').insert([data])
    }
    onSave()
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <Input
        label="Partner Name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        required
        placeholder="e.g. CTV Buyer, Whiz Technologies"
      />
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Default Commission %"
          type="number" min="0" max="100" step="0.1" suffix="%"
          hint="Applied on top of Trilogy's ACV"
          value={form.default_commission_pct}
          onChange={(e) => setForm({ ...form, default_commission_pct: e.target.value })}
        />
        <Select
          label="Linked Vendor (optional)"
          value={form.vendor_id || ''}
          onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}
        >
          <option value="">Not a vendor</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>
      </div>
      <Textarea
        label="Notes"
        value={form.notes || ''}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
        placeholder="Agreement terms, referral conditions..."
      />
      <div className="flex items-center gap-3">
        <input
          id="partner-active"
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
          className="w-4 h-4 rounded border-gray-300 text-primary-400 focus:ring-primary-400"
        />
        <label htmlFor="partner-active" className="text-sm text-navy-900">Active</label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={saving}>{initial?.id ? 'Update' : 'Create'} Partner</Button>
      </div>
    </div>
  )
}

export default function Partners() {
  const { isManager } = useUser()
  const navigate = useNavigate()
  const [partners, setPartners] = useState([])
  const [vendors, setVendors] = useState([])
  const [renewalAlerts, setRenewalAlerts] = useState({ needsAction: [], planned: [] })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    const today = new Date(); today.setHours(0, 0, 0, 0)

    const [{ data: pts }, { data: vens }, { data: agreements }] = await Promise.all([
      supabase.from('partners').select('*, vendors(name)').order('name'),
      supabase.from('vendors').select('id, name').order('name'),
      supabase.from('partner_agreements')
        .select('id, title, agreement_type, end_date, notice_period_days, renewal_intent, renewal_noted_by, renewal_noted_at, partner_id, partners(id, name)')
        .not('end_date', 'is', null)
        .not('notice_period_days', 'is', null)
        .gt('end_date', today.toISOString().split('T')[0]),
    ])

    setPartners(pts || [])
    setVendors(vens || [])

    // Compute notification dates and bucket into needsAction / planned
    const needsAction = []
    const planned = []
    for (const a of agreements || []) {
      const endDt = new Date(a.end_date + 'T12:00:00')
      const notifyDt = new Date(endDt)
      notifyDt.setDate(notifyDt.getDate() - a.notice_period_days)
      const daysUntil = Math.round((notifyDt - today) / (1000 * 60 * 60 * 24))
      const enriched = { ...a, notifyDt, daysUntil }
      if (a.renewal_intent) {
        planned.push(enriched)
      } else if (daysUntil <= 60) {
        needsAction.push(enriched)
      }
    }
    needsAction.sort((a, b) => a.daysUntil - b.daysUntil)
    planned.sort((a, b) => a.daysUntil - b.daysUntil)
    setRenewalAlerts({ needsAction, planned })

    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('partners').delete().eq('id', deleteItem.id)
    setDeleteItem(null)
    setDeleting(false)
    load()
  }

  const filtered = partners.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <PageSpinner />

  const { needsAction, planned } = renewalAlerts
  const showRenewalCard = needsAction.length > 0 || planned.length > 0

  return (
    <div className="space-y-4">

      {/* ── Agreement Renewal Overview ── */}
      {showRenewalCard && (
        <Card padding={false}>
          <div className="px-4 pt-3.5 pb-1 flex items-center gap-2 border-b border-gray-50">
            <Clock size={14} className="text-gray-400" />
            <p className="text-sm font-semibold text-navy-900">Agreement Renewals</p>
            {needsAction.length > 0 && (
              <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600">
                <AlertTriangle size={10} /> {needsAction.length} need{needsAction.length === 1 ? 's' : ''} attention
              </span>
            )}
            {planned.length > 0 && (
              <span className={`${needsAction.length === 0 ? 'ml-auto' : ''} inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700`}>
                <CheckCircle2 size={10} /> {planned.length} planned
              </span>
            )}
          </div>

          {needsAction.length > 0 && (
            <div className="divide-y divide-gray-50">
              {needsAction.map((a) => (
                <button
                  key={a.id}
                  onClick={() => navigate(`/partners/${a.partners?.id || a.partner_id}`)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-amber-50/40 group text-left transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.daysUntil <= 0 ? 'bg-red-500' : 'bg-amber-400'}`} />
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-navy-900">{a.partners?.name}</span>
                      <span className="text-xs text-gray-400 mx-1.5">·</span>
                      <span className="text-xs text-gray-600 truncate">{a.title}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span className={`text-xs font-semibold ${a.daysUntil <= 0 ? 'text-red-600' : 'text-amber-600'}`}>
                      {a.daysUntil <= 0 ? 'Overdue' : `${a.daysUntil}d left`}
                    </span>
                    <span className="text-xs text-gray-400">notify by {format(a.notifyDt, 'MMM d')}</span>
                    <ChevronRight size={12} className="text-gray-300 group-hover:text-gray-400 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {planned.length > 0 && (
            <div className={`divide-y divide-gray-50 ${needsAction.length > 0 ? 'border-t border-gray-100' : ''}`}>
              {planned.map((a) => (
                <button
                  key={a.id}
                  onClick={() => navigate(`/partners/${a.partners?.id || a.partner_id}`)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-green-50/40 group text-left transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-green-400" />
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-navy-900">{a.partners?.name}</span>
                      <span className="text-xs text-gray-400 mx-1.5">·</span>
                      <span className="text-xs text-gray-600 truncate">{a.title}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <CheckCircle2 size={11} className="text-green-500" />
                    <span className="text-xs text-green-700 font-medium">
                      {a.renewal_noted_by?.split('@')[0] || 'Manager'}
                      {a.renewal_noted_at && <span className="font-normal text-green-600"> · {format(new Date(a.renewal_noted_at), 'MMM d')}</span>}
                    </span>
                    <ChevronRight size={12} className="text-gray-300 group-hover:text-gray-400 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="flex gap-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Search partners..." className="flex-1" />
        {isManager && <Button onClick={() => setModal({})} icon={<Plus size={15} />}>Add Partner</Button>}
      </div>

      <Card padding={false}>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Handshake size={24} />}
            title="No partners yet"
            description="Add referral or reseller partners that earn commission on top of your ACV."
            action={<Button onClick={() => setModal({})}>Add Partner</Button>}
          />
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 group">
                <button
                  onClick={() => navigate(`/partners/${p.id}`)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-navy-900">{p.name}</p>
                      <Badge color={p.active ? 'green' : 'gray'}>{p.active ? 'Active' : 'Inactive'}</Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {isManager && <span>{p.default_commission_pct}% commission · </span>}
                      {p.vendors?.name
                        ? <span>Linked to {p.vendors.name}</span>
                        : <span>No linked vendor</span>
                      }
                      {p.notes && <span className="ml-2 text-gray-400 truncate max-w-[200px]">{p.notes}</span>}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-400 flex-shrink-0 transition-colors" />
                </button>
                {isManager && (
                  <div className="flex gap-1 ml-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setModal(p) }}
                      className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-navy-900 transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteItem(p) }}
                      className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit Partner' : 'New Partner'}>
        {modal !== null && (
          <PartnerForm
            initial={modal?.id ? modal : null}
            vendors={vendors}
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
        title="Delete Partner"
        message={`Delete "${deleteItem?.name}"? This will also remove them from any deals.`}
      />
    </div>
  )
}
