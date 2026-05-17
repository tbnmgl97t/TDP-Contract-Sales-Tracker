import { useState, useEffect } from 'react'
import { Plus, Trash2, Store, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
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
    const [{ data }, { data: counts }] = await Promise.all([
      supabase.from('vendors').select('*').order('name'),
      supabase.from('vendor_contracts').select('vendor_id'),
    ])
    setVendors(data || [])
    const map = {}
    for (const row of counts || []) map[row.vendor_id] = (map[row.vendor_id] || 0) + 1
    setContractCounts(map)
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

  return (
    <div className="space-y-4">
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
