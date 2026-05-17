import { useState, useEffect } from 'react'
import { Plus, Trash2, Store, ChevronRight, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import SearchBar from '../components/ui/SearchBar'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import EmptyState from '../components/ui/EmptyState'
import { PageSpinner } from '../components/ui/Spinner'

export default function Vendors() {
  const [vendors, setVendors] = useState([])
  const [contractCounts, setContractCounts] = useState({})
  const [renewalAlerts, setRenewalAlerts] = useState({ needsAction: [], planned: [] })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newWebsite, setNewWebsite] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleteItem, setDeleteItem] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()

  async function load() {
    const today = new Date(); today.setHours(0, 0, 0, 0)

    const [{ data }, { data: counts }, { data: contracts }] = await Promise.all([
      supabase.from('vendors').select('*').order('name'),
      supabase.from('vendor_contracts').select('vendor_id'),
      supabase.from('vendor_contracts')
        .select('id, title, end_date, notice_period_days, renewal_intent, renewal_noted_by, renewal_noted_at, vendor_id, vendors(id, name)')
        .not('end_date', 'is', null)
        .not('notice_period_days', 'is', null)
        .gt('end_date', today.toISOString().split('T')[0]),
    ])

    setVendors(data || [])
    const map = {}
    for (const row of counts || []) map[row.vendor_id] = (map[row.vendor_id] || 0) + 1
    setContractCounts(map)

    // Compute notification dates and bucket into needsAction / planned
    const needsAction = []
    const planned = []
    for (const c of contracts || []) {
      const endDt = new Date(c.end_date + 'T12:00:00')
      const notifyDt = new Date(endDt)
      notifyDt.setDate(notifyDt.getDate() - c.notice_period_days)
      const daysUntil = Math.round((notifyDt - today) / (1000 * 60 * 60 * 24))
      const enriched = { ...c, notifyDt, daysUntil }
      if (c.renewal_intent) {
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

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    const { data } = await supabase
      .from('vendors')
      .insert({ name: newName.trim(), website: newWebsite.trim() || null })
      .select()
      .single()
    setCreating(false)
    if (data) navigate(`/vendors/${data.id}`)
  }

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('vendors').delete().eq('id', deleteItem.id)
    setDeleteItem(null)
    setDeleting(false)
    load()
  }

  const filtered = vendors.filter((v) => !search || v.name.toLowerCase().includes(search.toLowerCase()))

  if (loading) return <PageSpinner />

  const { needsAction, planned } = renewalAlerts
  const showRenewalCard = needsAction.length > 0 || planned.length > 0

  return (
    <div className="space-y-4">

      {/* ── Contract Renewal Overview ── */}
      {showRenewalCard && (
        <Card padding={false}>
          <div className="px-4 pt-3.5 pb-1 flex items-center gap-2 border-b border-gray-50">
            <Clock size={14} className="text-gray-400" />
            <p className="text-sm font-semibold text-navy-900">Contract Renewals</p>
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
              {needsAction.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/vendors/${c.vendors?.id || c.vendor_id}`)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-amber-50/40 group text-left transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.daysUntil <= 0 ? 'bg-red-500' : 'bg-amber-400'}`} />
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-navy-900">{c.vendors?.name}</span>
                      <span className="text-xs text-gray-400 mx-1.5">·</span>
                      <span className="text-xs text-gray-600 truncate">{c.title}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span className={`text-xs font-semibold ${c.daysUntil <= 0 ? 'text-red-600' : 'text-amber-600'}`}>
                      {c.daysUntil <= 0 ? 'Overdue' : `${c.daysUntil}d left`}
                    </span>
                    <span className="text-xs text-gray-400">notify by {format(c.notifyDt, 'MMM d')}</span>
                    <ChevronRight size={12} className="text-gray-300 group-hover:text-gray-400 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {planned.length > 0 && (
            <div className={`divide-y divide-gray-50 ${needsAction.length > 0 ? 'border-t border-gray-100' : ''}`}>
              {planned.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/vendors/${c.vendors?.id || c.vendor_id}`)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-green-50/40 group text-left transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-green-400" />
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-navy-900">{c.vendors?.name}</span>
                      <span className="text-xs text-gray-400 mx-1.5">·</span>
                      <span className="text-xs text-gray-600 truncate">{c.title}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <CheckCircle2 size={11} className="text-green-500" />
                    <span className="text-xs text-green-700 font-medium">
                      {c.renewal_noted_by?.split('@')[0] || 'Manager'}
                      {c.renewal_noted_at && <span className="font-normal text-green-600"> · {format(new Date(c.renewal_noted_at), 'MMM d')}</span>}
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
        <SearchBar value={search} onChange={setSearch} placeholder="Search vendors..." className="flex-1" />
        <Button onClick={() => { setNewName(''); setNewWebsite(''); setShowNew(true) }} icon={<Plus size={15} />}>Add Vendor</Button>
      </div>

      <Card padding={false}>
        {filtered.length === 0 ? (
          <EmptyState icon={<Store size={24} />} title="No vendors yet" action={<Button onClick={() => setShowNew(true)}>Add Vendor</Button>} />
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((v) => {
              const count = contractCounts[v.id] || 0
              return (
                <div key={v.id} className="flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 group">
                  <button onClick={() => navigate(`/vendors/${v.id}`)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-navy-900">{v.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {count > 0 ? `${count} contract${count !== 1 ? 's' : ''}` : 'No contracts yet'}
                        {v.website && <span className="ml-2 text-primary-400">{v.website.replace(/^https?:\/\//, '')}</span>}
                      </p>
                    </div>
                    <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-400 flex-shrink-0 transition-colors" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteItem(v) }}
                    className="p-1.5 ml-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors flex-shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Slim "new vendor" modal — just enough to create, then lands on detail page */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="New Vendor" size="sm">
        <div className="space-y-4">
          <Input
            label="Vendor Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g., Okta"
            required
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <Input
            label="Website"
            type="url"
            value={newWebsite}
            onChange={(e) => setNewWebsite(e.target.value)}
            placeholder="https://"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={creating} disabled={!newName.trim()}>
              Create & Open
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Vendor"
        message={`Delete "${deleteItem?.name}"? All contracts and documents will also be removed.`}
      />
    </div>
  )
}
