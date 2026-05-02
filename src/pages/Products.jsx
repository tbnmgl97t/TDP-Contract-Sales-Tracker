import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Package } from 'lucide-react'
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
import { COMMISSION_METRICS } from '../lib/constants'

function ProductForm({ initial, vendors, categories, onSave, onClose }) {
  const [form, setForm] = useState(initial || {
    name: '', sku: '', vendor_id: '', category_id: '', commission_metric: 'NAVC/RAV',
    base_rate: 0.07, is_usage_based: false, unit_label: '', active: true,
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.name) return
    setSaving(true)
    const data = { ...form, base_rate: parseFloat(form.base_rate) || 0.07 }
    if (initial?.id) {
      await supabase.from('products').update(data).eq('id', initial.id)
    } else {
      await supabase.from('products').insert([data])
    }
    onSave()
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input label="Product Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <Input label="SKU" value={form.sku || ''} onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })} placeholder="e.g. TDP-BACKSTAGE" hint="Unique product identifier" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Select label="Vendor" value={form.vendor_id || ''} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}>
          <option value="">No vendor</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>
        <Select label="Category" value={form.category_id || ''} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
          <option value="">No category</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Select label="Commission Metric" value={form.commission_metric} onChange={(e) => setForm({ ...form, commission_metric: e.target.value })}>
          {COMMISSION_METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </Select>
        <Input label="Base Rate" type="number" step="0.01" min="0" max="1" suffix="%" value={(parseFloat(form.base_rate) * 100).toFixed(1)} onChange={(e) => setForm({ ...form, base_rate: parseFloat(e.target.value) / 100 || 0 })} />
      </div>
      <div className="flex items-center gap-3">
        <input
          id="usage"
          type="checkbox"
          checked={form.is_usage_based}
          onChange={(e) => setForm({ ...form, is_usage_based: e.target.checked })}
          className="w-4 h-4 rounded border-gray-300 text-primary-400 focus:ring-primary-400"
        />
        <label htmlFor="usage" className="text-sm text-navy-900">Usage-based product (e.g., JWX GB/Hours)</label>
      </div>
      {form.is_usage_based && (
        <Input label="Unit Label" value={form.unit_label || ''} onChange={(e) => setForm({ ...form, unit_label: e.target.value })} placeholder="GB, Hours, Users..." />
      )}
      <div className="flex items-center gap-3">
        <input
          id="active"
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
          className="w-4 h-4 rounded border-gray-300 text-primary-400 focus:ring-primary-400"
        />
        <label htmlFor="active" className="text-sm text-navy-900">Active</label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={saving}>{initial?.id ? 'Update' : 'Create'} Product</Button>
      </div>
    </div>
  )
}

export default function Products() {
  const [products, setProducts] = useState([])
  const [vendors, setVendors] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    const [{ data: prods }, { data: vens }, { data: cats }] = await Promise.all([
      supabase.from('products').select('*, vendors(name), categories(name)').order('name'),
      supabase.from('vendors').select('*').order('name'),
      supabase.from('categories').select('*').order('name'),
    ])
    setProducts(prods || [])
    setVendors(vens || [])
    setCategories(cats || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('products').delete().eq('id', deleteItem.id)
    setDeleteItem(null)
    setDeleting(false)
    load()
  }

  const filtered = products.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.vendors?.name?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Search products..." className="flex-1" />
        <Button onClick={() => setModal({})} icon={<Plus size={15} />}>Add Product</Button>
      </div>

      <Card padding={false}>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Package size={24} />}
            title="No products yet"
            description="Add your first product to get started."
            action={<Button onClick={() => setModal({})}>Add Product</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Product', 'SKU', 'Vendor', 'Category', 'Metric', 'Rate', 'Status', ''].map((h) => (
                    <th key={h} className={`px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide ${h === '' || h === 'Rate' || h === 'Status' ? 'text-right' : 'text-left'} ${['SKU', 'Category', 'Metric'].includes(h) ? 'hidden md:table-cell' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-navy-900">{p.name}</p>
                      {p.is_usage_based && <p className="text-xs text-gray-400">{p.unit_label}</p>}
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell font-mono text-xs text-gray-500">{p.sku || '—'}</td>
                    <td className="px-4 py-3.5 text-gray-600">{p.vendors?.name || '—'}</td>
                    <td className="px-4 py-3.5 hidden md:table-cell text-gray-600">{p.categories?.name || '—'}</td>
                    <td className="px-4 py-3.5 hidden sm:table-cell">
                      <Badge color={p.commission_metric === 'GM' ? 'blue' : 'green'}>{p.commission_metric}</Badge>
                    </td>
                    <td className="px-4 py-3.5 text-right font-medium text-navy-900">{(p.base_rate * 100).toFixed(0)}%</td>
                    <td className="px-4 py-3.5 text-right">
                      <Badge color={p.active ? 'green' : 'gray'}>{p.active ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setModal(p)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-navy-900 transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setDeleteItem(p)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit Product' : 'New Product'}>
        {modal !== null && (
          <ProductForm
            initial={modal?.id ? modal : null}
            vendors={vendors}
            categories={categories}
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
        title="Delete Product"
        message={`Delete "${deleteItem?.name}"? This cannot be undone.`}
      />
    </div>
  )
}
