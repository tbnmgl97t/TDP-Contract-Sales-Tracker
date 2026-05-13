import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Handshake } from 'lucide-react'
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
  const [partners, setPartners] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    const [{ data: pts }, { data: vens }] = await Promise.all([
      supabase.from('partners').select('*, vendors(name)').order('name'),
      supabase.from('vendors').select('id, name').order('name'),
    ])
    setPartners(pts || [])
    setVendors(vens || [])
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

  return (
    <div className="space-y-4">
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Partner</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide hidden sm:table-cell">Linked Vendor</th>
                  {isManager && <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Default %</th>}
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Status</th>
                  {isManager && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-navy-900">{p.name}</p>
                      {p.notes && <p className="text-xs text-gray-400 truncate max-w-[200px]">{p.notes}</p>}
                    </td>
                    <td className="px-4 py-3.5 hidden sm:table-cell text-gray-600">
                      {p.vendors?.name || <span className="text-gray-400">—</span>}
                    </td>
                    {isManager && (
                      <td className="px-4 py-3.5 text-right font-semibold text-navy-900">
                        {p.default_commission_pct}%
                      </td>
                    )}
                    <td className="px-4 py-3.5 text-right">
                      <Badge color={p.active ? 'green' : 'gray'}>{p.active ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    {isManager && (
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setModal(p)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-navy-900 transition-colors">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => setDeleteItem(p)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
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
