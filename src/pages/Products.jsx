import { useState, useEffect } from 'react'
import { useUser } from '../contexts/UserContext'
import { Plus, Pencil, Trash2, Package } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import SearchBar from '../components/ui/SearchBar'
import Modal from '../components/ui/Modal'
import { Select } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import EmptyState from '../components/ui/EmptyState'
import { PageSpinner } from '../components/ui/Spinner'
import ProductForm from '../components/ProductForm'

export default function Products() {
  const { isManager } = useUser()
  const [products, setProducts] = useState([])
  const [vendors, setVendors] = useState([])
  const [categories, setCategories] = useState([])
  const [globalRate, setGlobalRate] = useState(0.07)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [modal, setModal] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    const [{ data: prods }, { data: vens }, { data: cats }, { data: settings }] = await Promise.all([
      supabase.from('products').select('*, vendors(name), categories(name)').order('name'),
      supabase.from('vendors').select('*').order('name'),
      supabase.from('categories').select('*').order('name'),
      supabase.from('commission_settings').select('global_commission_rate').eq('id', 1).single(),
    ])
    setProducts(prods || [])
    setVendors(vens || [])
    setCategories(cats || [])
    if (settings) setGlobalRate(parseFloat(settings.global_commission_rate) || 0.07)
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

  const filtered = products.filter((p) => {
    if (vendorFilter && p.vendor_id !== vendorFilter) return false
    if (!search) return true
    return p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.vendors?.name?.toLowerCase().includes(search.toLowerCase())
  })

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Search products..." className="flex-1" />
        <select
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white text-sm text-navy-900 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
        >
          <option value="">All Vendors</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        {isManager && <Button onClick={() => setModal({})} icon={<Plus size={15} />}>Add Product</Button>}
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
                  {['Product', 'SKU', 'Vendor', 'Category', 'Metric', ...(isManager ? ['Rate'] : []), 'Status', ''].map((h) => (
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
                      {p.is_support_charge && <p className="text-xs text-purple-600">Support charge · {p.default_support_pct ?? 15}%</p>}
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell font-mono text-xs text-gray-500">{p.sku || '—'}</td>
                    <td className="px-4 py-3.5 text-gray-600">{p.vendors?.name || '—'}</td>
                    <td className="px-4 py-3.5 hidden md:table-cell text-gray-600">{p.categories?.name || '—'}</td>
                    <td className="px-4 py-3.5 hidden sm:table-cell">
                      <Badge color={p.commission_metric === 'GM' ? 'blue' : 'green'}>{p.commission_metric}</Badge>
                    </td>
                    {isManager && (
                      <td className="px-4 py-3.5 text-right font-medium text-navy-900">
                        {p.rate_overridden
                          ? <span>{(p.base_rate * 100).toFixed(1)}% <span className="text-xs text-primary-500 font-normal">custom</span></span>
                          : <span className="text-gray-500">{(globalRate * 100).toFixed(1)}%</span>
                        }
                      </td>
                    )}
                    <td className="px-4 py-3.5 text-right">
                      <Badge color={p.active ? 'green' : 'gray'}>{p.active ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    {isManager && <td className="px-4 py-3.5 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={async () => {
                          if (p.is_usage_based) {
                            const { data: pp } = await supabase.from('product_pricing_params').select('*').eq('product_id', p.id).order('effective_date', { ascending: false }).limit(1).maybeSingle()
                            setModal({ ...p, _unit_price: pp?.unit_price ?? '', _cogs_per_unit: pp?.cogs_per_unit ?? '' })
                          } else {
                            setModal(p)
                          }
                        }} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-navy-900 transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setDeleteItem(p)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit Product' : 'New Product'} size="xl">
        {modal !== null && (
          <ProductForm
            initial={modal?.id ? modal : null}
            vendors={vendors}
            categories={categories}
            globalRate={globalRate}
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
