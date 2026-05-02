import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import SearchBar from '../components/ui/SearchBar'
import Modal from '../components/ui/Modal'
import Input, { Select } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import EmptyState from '../components/ui/EmptyState'
import { PageSpinner } from '../components/ui/Spinner'
import { PERSON_ROLES } from '../lib/constants'
import { fmt } from '../lib/commission'

function SpifTierRow({ tier, onChange, onRemove }) {
  return (
    <div className="flex items-center gap-2">
      <Input type="number" prefix="$" placeholder="Min ACV" value={tier.acv_min || ''} onChange={(e) => onChange({ ...tier, acv_min: parseFloat(e.target.value) || 0 })} className="flex-1" />
      <span className="text-gray-400 flex-shrink-0">—</span>
      <Input type="number" prefix="$" placeholder="Max ACV (blank=unlimited)" value={tier.acv_max || ''} onChange={(e) => onChange({ ...tier, acv_max: e.target.value ? parseFloat(e.target.value) : null })} className="flex-1" />
      <Input type="number" prefix="$" placeholder="SPIF amount" value={tier.spif_amount || ''} onChange={(e) => onChange({ ...tier, spif_amount: parseFloat(e.target.value) || 0 })} className="flex-1" />
      <button onClick={onRemove} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg flex-shrink-0">
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function PersonForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || { name: '', email: '', role: 'sales', active: true })
  const [tiers, setTiers] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function loadTiers() {
      if (initial?.id) {
        const { data } = await supabase.from('spif_tiers').select('*').eq('person_id', initial.id)
        setTiers(data || [])
      }
    }
    loadTiers()
  }, [initial?.id])

  async function handleSave() {
    if (!form.name) return
    setSaving(true)
    let personId = initial?.id
    if (initial?.id) {
      await supabase.from('people').update(form).eq('id', initial.id)
    } else {
      const { data } = await supabase.from('people').insert([form]).select().single()
      personId = data.id
    }
    // Sync SPIF tiers
    await supabase.from('spif_tiers').delete().eq('person_id', personId)
    const tierRows = tiers
      .filter((t) => t.spif_amount > 0)
      .map(({ id: _id, ...t }) => ({ ...t, person_id: personId }))
    if (tierRows.length) await supabase.from('spif_tiers').insert(tierRows)
    onSave()
    setSaving(false)
  }

  const isSupport = form.role === 'support'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input label="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <Input label="Email" type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {PERSON_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </Select>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-primary-400 focus:ring-primary-400"
            />
            <span className="text-sm text-navy-900">Active</span>
          </label>
        </div>
      </div>

      {isSupport && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-navy-900">SPIF Tiers</p>
            <Button size="xs" variant="secondary" onClick={() => setTiers([...tiers, { acv_min: 0, acv_max: null, spif_amount: 0 }])} icon={<Plus size={12} />}>Add Tier</Button>
          </div>
          {tiers.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-3 border border-dashed border-gray-200 rounded-lg">No SPIF tiers set.</p>
          )}
          <div className="space-y-2">
            {tiers.map((tier, i) => (
              <SpifTierRow
                key={i}
                tier={tier}
                onChange={(updated) => setTiers((prev) => { const n = [...prev]; n[i] = updated; return n })}
                onRemove={() => setTiers((prev) => prev.filter((_, j) => j !== i))}
              />
            ))}
          </div>
          {tiers.length > 0 && (
            <p className="text-xs text-gray-400 mt-2">SPIF is paid in the quarter following contract execution.</p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={saving}>{initial?.id ? 'Update' : 'Create'} Person</Button>
      </div>
    </div>
  )
}

export default function People() {
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [modal, setModal] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    const { data } = await supabase.from('people').select('*, spif_tiers(*)').order('name')
    setPeople(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('people').delete().eq('id', deleteItem.id)
    setDeleteItem(null)
    setDeleting(false)
    load()
  }

  const filtered = people.filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.email?.toLowerCase().includes(search.toLowerCase())
    const matchRole = roleFilter === 'all' || p.role === roleFilter
    return matchSearch && matchRole
  })

  const salesCount = people.filter((p) => p.role === 'sales').length
  const supportCount = people.filter((p) => p.role === 'support').length

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Sales (Commission)', value: salesCount, color: 'bg-primary-400' },
          { label: 'Support (SPIF)', value: supportCount, color: 'bg-accent-400' },
          { label: 'Total', value: people.length, color: 'bg-navy-900' },
        ].map((s) => (
          <Card key={s.label} className="!py-3">
            <div className={`w-2 h-2 rounded-full ${s.color} mb-2`} />
            <p className="text-xl font-bold text-navy-900">{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Search people..." className="flex-1" />
        <div className="flex gap-2">
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-400 text-navy-900">
            <option value="all">All Roles</option>
            <option value="sales">Sales</option>
            <option value="support">Support</option>
            <option value="management">Management</option>
          </select>
          <Button onClick={() => setModal({})} icon={<Plus size={15} />}>Add Person</Button>
        </div>
      </div>

      <Card padding={false}>
        {filtered.length === 0 ? (
          <EmptyState icon={<Users size={24} />} title="No people found" action={<Button onClick={() => setModal({})}>Add Person</Button>} />
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((person) => (
              <div key={person.id} className="flex items-center justify-between px-4 py-3.5 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0 ${person.role === 'sales' ? 'bg-primary-100 text-primary-700' : person.role === 'support' ? 'bg-accent-100 text-accent-700' : 'bg-navy-100 text-navy-700'}`}>
                    {person.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-navy-900">{person.name}</p>
                    <p className="text-xs text-gray-400">{person.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex flex-col items-end gap-1">
                    <Badge color={person.role === 'sales' ? 'green' : person.role === 'support' ? 'yellow' : 'navy'}>
                      {person.role}
                    </Badge>
                    {person.role === 'support' && person.spif_tiers?.length > 0 && (
                      <p className="text-xs text-gray-400">{person.spif_tiers.length} SPIF tier{person.spif_tiers.length !== 1 ? 's' : ''}</p>
                    )}
                  </div>
                  {!person.active && <Badge color="gray">Inactive</Badge>}
                  <div className="flex gap-1">
                    <button onClick={() => setModal(person)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-navy-900 transition-colors"><Pencil size={14} /></button>
                    <button onClick={() => setDeleteItem(person)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit Person' : 'New Person'} size="lg">
        {modal !== null && <PersonForm initial={modal?.id ? modal : null} onSave={() => { setModal(null); load() }} onClose={() => setModal(null)} />}
      </Modal>
      <ConfirmDialog open={!!deleteItem} onClose={() => setDeleteItem(null)} onConfirm={handleDelete} loading={deleting} title="Delete Person" message={`Delete "${deleteItem?.name}"?`} />
    </div>
  )
}
