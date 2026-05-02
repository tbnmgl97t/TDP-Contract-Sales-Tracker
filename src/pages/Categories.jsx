import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Tag } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import SearchBar from '../components/ui/SearchBar'
import Modal from '../components/ui/Modal'
import Input, { Textarea } from '../components/ui/Input'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import EmptyState from '../components/ui/EmptyState'
import { PageSpinner } from '../components/ui/Spinner'

function CategoryForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || { name: '', description: '' })
  const [saving, setSaving] = useState(false)
  async function handleSave() {
    if (!form.name) return
    setSaving(true)
    if (initial?.id) {
      await supabase.from('categories').update(form).eq('id', initial.id)
    } else {
      await supabase.from('categories').insert([form])
    }
    onSave()
    setSaving(false)
  }
  return (
    <div className="space-y-4">
      <Input label="Category Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <Textarea label="Description" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={saving}>{initial?.id ? 'Update' : 'Create'} Category</Button>
      </div>
    </div>
  )
}

export default function Categories() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    const { data } = await supabase.from('categories').select('*').order('name')
    setItems(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('categories').delete().eq('id', deleteItem.id)
    setDeleteItem(null)
    setDeleting(false)
    load()
  }

  const filtered = items.filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()))

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Search categories..." className="flex-1" />
        <Button onClick={() => setModal({})} icon={<Plus size={15} />}>Add Category</Button>
      </div>
      <Card padding={false}>
        {filtered.length === 0 ? (
          <EmptyState icon={<Tag size={24} />} title="No categories yet" action={<Button onClick={() => setModal({})}>Add Category</Button>} />
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3.5 hover:bg-gray-50">
                <div>
                  <p className="text-sm font-medium text-navy-900">{c.name}</p>
                  {c.description && <p className="text-xs text-gray-500 mt-0.5">{c.description}</p>}
                </div>
                <div className="flex gap-1 ml-3 flex-shrink-0">
                  <button onClick={() => setModal(c)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-navy-900 transition-colors"><Pencil size={14} /></button>
                  <button onClick={() => setDeleteItem(c)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit Category' : 'New Category'}>
        {modal !== null && <CategoryForm initial={modal?.id ? modal : null} onSave={() => { setModal(null); load() }} onClose={() => setModal(null)} />}
      </Modal>
      <ConfirmDialog open={!!deleteItem} onClose={() => setDeleteItem(null)} onConfirm={handleDelete} loading={deleting} title="Delete Category" message={`Delete "${deleteItem?.name}"?`} />
    </div>
  )
}
