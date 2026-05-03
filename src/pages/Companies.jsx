import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Building2, Globe, Phone, Mail, Star } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import SearchBar from '../components/ui/SearchBar'
import Modal from '../components/ui/Modal'
import Input, { Textarea } from '../components/ui/Input'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import EmptyState from '../components/ui/EmptyState'
import { PageSpinner } from '../components/ui/Spinner'

function ContactRow({ contact, onChange, onRemove }) {
  return (
    <div className="border border-gray-100 rounded-xl p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Input
          label="Name"
          value={contact.name || ''}
          onChange={(e) => onChange({ ...contact, name: e.target.value })}
          required
        />
        <Input
          label="Title / Role"
          value={contact.title || ''}
          onChange={(e) => onChange({ ...contact, title: e.target.value })}
        />
        <Input
          label="Email"
          type="email"
          value={contact.email || ''}
          onChange={(e) => onChange({ ...contact, email: e.target.value })}
        />
        <Input
          label="Phone"
          value={contact.phone || ''}
          onChange={(e) => onChange({ ...contact, phone: e.target.value })}
        />
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={contact.is_primary || false}
            onChange={(e) => onChange({ ...contact, is_primary: e.target.checked })}
            className="w-4 h-4 rounded border-gray-300 text-primary-400 focus:ring-primary-400"
          />
          <span className="text-xs text-gray-600">Primary contact</span>
        </label>
        <button
          onClick={onRemove}
          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

function CompanyForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(
    initial
      ? { name: initial.name, website: initial.website || '', industry: initial.industry || '', notes: initial.notes || '' }
      : { name: '', website: '', industry: '', notes: '' }
  )
  const [contacts, setContacts] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function loadContacts() {
      if (initial?.id) {
        const { data } = await supabase.from('contacts').select('*').eq('company_id', initial.id).order('is_primary', { ascending: false })
        setContacts(data || [])
      }
    }
    loadContacts()
  }, [initial?.id])

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)

    const companyData = {
      name: form.name.trim(),
      website: form.website.trim() || null,
      industry: form.industry.trim() || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }

    let companyId = initial?.id
    if (initial?.id) {
      await supabase.from('companies').update(companyData).eq('id', initial.id)
    } else {
      const { data } = await supabase.from('companies').insert([companyData]).select().single()
      companyId = data.id
    }

    // Sync contacts
    const existingIds = contacts.filter((c) => c.id && !c._new).map((c) => c.id)
    const toDelete = initial?.id
      ? (await supabase.from('contacts').select('id').eq('company_id', companyId)).data?.filter((c) => !existingIds.includes(c.id)).map((c) => c.id)
      : []

    if (toDelete?.length) {
      await supabase.from('contacts').delete().in('id', toDelete)
    }

    for (const contact of contacts) {
      const row = {
        company_id: companyId,
        name: contact.name,
        title: contact.title || null,
        email: contact.email || null,
        phone: contact.phone || null,
        is_primary: contact.is_primary || false,
        notes: contact.notes || null,
      }
      if (contact.id && !contact._new) {
        await supabase.from('contacts').update(row).eq('id', contact.id)
      } else {
        await supabase.from('contacts').insert([row])
      }
    }

    onSave()
    setSaving(false)
  }

  function addContact() {
    setContacts((prev) => [...prev, { _new: true, name: '', title: '', email: '', phone: '', is_primary: false }])
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Company Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
          className="col-span-2"
        />
        <Input
          label="Website"
          value={form.website}
          onChange={(e) => setForm({ ...form, website: e.target.value })}
          placeholder="https://example.com"
        />
        <Input
          label="Industry"
          value={form.industry}
          onChange={(e) => setForm({ ...form, industry: e.target.value })}
          placeholder="e.g. Media, SaaS, Broadcasting"
        />
      </div>
      <Textarea
        label="Notes"
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
        placeholder="Context, deal history, important details..."
        rows={2}
      />

      {/* Contacts */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-navy-900">Contacts</p>
          <Button size="xs" variant="secondary" onClick={addContact} icon={<Plus size={12} />}>
            Add Contact
          </Button>
        </div>
        {contacts.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-3 border border-dashed border-gray-200 rounded-lg">
            No contacts yet.
          </p>
        )}
        <div className="space-y-2">
          {contacts.map((contact, i) => (
            <ContactRow
              key={contact.id || i}
              contact={contact}
              onChange={(updated) => setContacts((prev) => { const n = [...prev]; n[i] = updated; return n })}
              onRemove={() => setContacts((prev) => prev.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={saving}>
          {initial?.id ? 'Update' : 'Create'} Company
        </Button>
      </div>
    </div>
  )
}

function ContactChip({ contact }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-600">
      {contact.is_primary && <Star size={10} className="text-accent-600 fill-accent-400 flex-shrink-0" />}
      <span className="font-medium text-navy-900">{contact.name}</span>
      {contact.title && <span className="text-gray-400">· {contact.title}</span>}
    </div>
  )
}

export default function Companies() {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [expanded, setExpanded] = useState(null)

  async function load() {
    const { data } = await supabase
      .from('companies')
      .select('*, contacts(*)')
      .order('name')
    setCompanies(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('companies').delete().eq('id', deleteItem.id)
    setDeleteItem(null)
    setDeleting(false)
    load()
  }

  const filtered = companies.filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      c.industry?.toLowerCase().includes(q) ||
      c.contacts?.some((ct) => ct.name.toLowerCase().includes(q) || ct.email?.toLowerCase().includes(q))
    )
  })

  const totalContacts = companies.reduce((s, c) => s + (c.contacts?.length || 0), 0)

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Companies', value: companies.length, color: 'bg-primary-400' },
          { label: 'Contacts', value: totalContacts, color: 'bg-accent-400' },
          { label: 'Industries', value: new Set(companies.map((c) => c.industry).filter(Boolean)).size, color: 'bg-navy-900' },
        ].map((s) => (
          <Card key={s.label} className="!py-3">
            <div className={`w-2 h-2 rounded-full ${s.color} mb-2`} />
            <p className="text-xl font-bold text-navy-900">{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="flex gap-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Search companies or contacts..." className="flex-1" />
        <Button onClick={() => setModal({})} icon={<Plus size={15} />}>Add Company</Button>
      </div>

      <Card padding={false}>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Building2 size={24} />}
            title="No companies found"
            action={<Button onClick={() => setModal({})}>Add Company</Button>}
          />
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((company) => {
              const isOpen = expanded === company.id
              const primary = company.contacts?.find((c) => c.is_primary) || company.contacts?.[0]
              return (
                <div key={company.id}>
                  <div
                    className="flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpanded(isOpen ? null : company.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                        <Building2 size={16} className="text-primary-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-navy-900 truncate">{company.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {company.industry && (
                            <span className="text-xs text-gray-400">{company.industry}</span>
                          )}
                          {company.website && (
                            <>
                              {company.industry && <span className="text-gray-300">·</span>}
                              <a
                                href={company.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs text-primary-500 hover:text-primary-600 flex items-center gap-1"
                              >
                                <Globe size={10} />
                                {company.website.replace(/^https?:\/\//, '')}
                              </a>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                      <div className="hidden sm:block text-right">
                        {primary && <ContactChip contact={primary} />}
                        {company.contacts?.length > 1 && (
                          <p className="text-xs text-gray-400 mt-0.5">+{company.contacts.length - 1} more</p>
                        )}
                        {!company.contacts?.length && (
                          <p className="text-xs text-gray-400">No contacts</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setModal(company) }}
                          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-navy-900 transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteItem(company) }}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {isOpen && company.contacts?.length > 0 && (
                    <div className="px-4 pb-3 bg-gray-50 border-t border-gray-100">
                      <p className="text-xs font-medium text-gray-500 py-2">
                        {company.contacts.length} contact{company.contacts.length !== 1 ? 's' : ''}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[...company.contacts].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0)).map((ct) => (
                          <div key={ct.id} className="bg-white rounded-xl border border-gray-100 px-3 py-2.5 space-y-1">
                            <div className="flex items-center gap-1.5">
                              {ct.is_primary && <Star size={11} className="text-accent-600 fill-accent-400 flex-shrink-0" />}
                              <p className="text-sm font-medium text-navy-900">{ct.name}</p>
                            </div>
                            {ct.title && <p className="text-xs text-gray-500">{ct.title}</p>}
                            {ct.email && (
                              <a href={`mailto:${ct.email}`} className="flex items-center gap-1.5 text-xs text-primary-500 hover:text-primary-600">
                                <Mail size={11} />
                                {ct.email}
                              </a>
                            )}
                            {ct.phone && (
                              <a href={`tel:${ct.phone}`} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
                                <Phone size={11} />
                                {ct.phone}
                              </a>
                        )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.id ? 'Edit Company' : 'New Company'}
        size="lg"
      >
        {modal !== null && (
          <CompanyForm
            initial={modal?.id ? modal : null}
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
        title="Delete Company"
        message={`Delete "${deleteItem?.name}" and all its contacts?`}
      />
    </div>
  )
}
