import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Store } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import SearchBar from '../components/ui/SearchBar'
import Modal from '../components/ui/Modal'
import Input, { Textarea } from '../components/ui/Input'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import EmptyState from '../components/ui/EmptyState'
import { PageSpinner } from '../components/ui/Spinner'

function VendorForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || { name: '', website: '', notes: '' })
  const [saving, setSaving] = useState(false)
  async function handleSave() {
    if (!form.name) return
    setSaving(true)
    if (initial?.id) {
      await supabase.from('vendors').update(form).eq('id', initial.id)
    } else {
      await supabase.from('vendors').insert([form])
    }
    onSave()
    setSaving(false)
  }
  return (
    <div className="space-y-4">
      <Input label="Vendor Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <Input label="Website" type="url" value={form.website || ''} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" />
      <Textarea label="Notes" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={saving}>{initial?.id ? 'Update' : 'Create'} Vendor</Button>
      </div>
    </div>
  )
}

export default function Vendors() {
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    const { data } = await supabase.from('vendors').select('*').order('name')
    setVendors(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('vendors').delete().eq('id', deleteItem.id)
    setDeleteItem(null)
    setDeleting(false)
    load()
  }

  const filtered = vendors.filter((v) => !search || v.name.toLowerCase().includes(search.toLowerCase()))

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Search vendors..." className="flex-1" />
        <Button onClick={() => setModal({})} icon={<Plus size={15} />}>Add Vendor</Button>
      </div>
      <Card padding={false}>
        {filtered.length === 0 ? (
          <EmptyState icon={<Store size={24} />} title="No vendors yet" action={<Button onClick={() => setModal({})}>Add Vendor</Button>} />
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((v) => (
              <div key={v.id} className="flex items-center justify-between px-4 py-3.5 hover:bg-gray-50">
                <div>
                  <p className="text-sm font-medium text-navy-900">{v.name}</p>
                  {v.website && <a href={v.website} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-500 hover:underline">{v.website}</a>}
                  {v.notes && <p className="text-xs text-gray-400 mt-0.5">{v.notes}</p>}
                </div>
                <div className="flex gap-1 ml-3 flex-shrink-0">
                  <button onClick={() => setModal(v)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-navy-900 transition-colors"><Pencil size={14} /></button>
                  <button onClick={() => setDeleteItem(v)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit Vendor' : 'New Vendor'}>
        {modal !== null && <VendorForm initial={modal?.id ? modal : null} onSave={() => { setModal(null); load() }} onClose={() => setModal(null)} />}
      </Modal>
      <ConfirmDialog open={!!deleteItem} onClose={() => setDeleteItem(null)} onConfirm={handleDelete} loading={deleting} title="Delete Vendor" message={`Delete "${deleteItem?.name}"?`} />
    </div>
  )
}
