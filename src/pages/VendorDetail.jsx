import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Pencil, Trash2, Upload, Eye, Download, FileText, ExternalLink } from 'lucide-react'
import VendorBrainPanel from '../components/vendor/VendorBrainPanel'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useUser } from '../contexts/UserContext'
import Card, { CardHeader } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Select, Textarea } from '../components/ui/Input'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { PageSpinner } from '../components/ui/Spinner'
import { Badge } from '../components/ui/Badge'

const CONTRACT_TYPES = [
  { value: 'msa',       label: 'MSA',       desc: 'Master Service Agreement',  color: 'blue'   },
  { value: 'sow',       label: 'SOW',        desc: 'Statement of Work',         color: 'purple' },
  { value: 'nda',       label: 'NDA',        desc: 'Non-Disclosure Agreement',  color: 'gray'   },
  { value: 'license',   label: 'License',    desc: 'License Agreement',         color: 'green'  },
  { value: 'referral',  label: 'Referral',   desc: 'Referral Agreement',        color: 'teal'   },
  { value: 'reseller',  label: 'Reseller',   desc: 'Reseller Agreement',        color: 'indigo' },
  { value: 'amendment', label: 'Amendment',  desc: 'Contract Amendment',        color: 'yellow' },
  { value: 'addendum',  label: 'Addendum',   desc: 'Contract Addendum',         color: 'yellow' },
  { value: 'other',     label: 'Other',      desc: 'Other Contract Type',       color: 'gray'   },
]

function typeMeta(type) {
  return CONTRACT_TYPES.find((t) => t.value === type) || CONTRACT_TYPES.at(-1)
}

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── Contract form modal ──────────────────────────────────────────────────────
function ContractFormModal({ vendorId, initial, onSave, onClose }) {
  const { profile } = useUser()
  const [form, setForm] = useState({
    title:               initial?.title               || '',
    contract_type:       initial?.contract_type       || 'msa',
    start_date:          initial?.start_date          || '',
    end_date:            initial?.end_date            || '',
    notes:               initial?.notes               || '',
    notice_period_days:  initial?.notice_period_days != null ? String(initial.notice_period_days) : '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.title.trim() || !form.start_date) return
    setSaving(true)
    const payload = {
      title:               form.title.trim(),
      contract_type:       form.contract_type,
      start_date:          form.start_date,
      end_date:            form.end_date || null,
      notes:               form.notes || null,
      notice_period_days:  form.notice_period_days !== '' ? parseInt(form.notice_period_days, 10) : null,
    }
    if (initial?.id) {
      await supabase.from('vendor_contracts').update(payload).eq('id', initial.id)
    } else {
      await supabase.from('vendor_contracts').insert({
        ...payload,
        vendor_id:  vendorId,
        created_by: profile?.email || null,
      })
    }
    setSaving(false)
    onSave()
  }

  return (
    <div className="space-y-4">
      <Input
        label="Contract Title"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        placeholder="e.g., Master Service Agreement 2024"
        required
      />
      <Select
        label="Contract Type"
        value={form.contract_type}
        onChange={(e) => setForm({ ...form, contract_type: e.target.value })}
      >
        {CONTRACT_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>
        ))}
      </Select>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Start Date"
          type="date"
          value={form.start_date}
          onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          required
        />
        <Input
          label="Termination Date"
          type="date"
          value={form.end_date}
          onChange={(e) => setForm({ ...form, end_date: e.target.value })}
          hint="Leave blank if still active"
        />
      </div>
      <Input
        label="Notice Period (days)"
        type="number"
        min="0"
        value={form.notice_period_days}
        onChange={(e) => setForm({ ...form, notice_period_days: e.target.value })}
        placeholder="e.g., 30"
        hint="Days of notice required before termination"
      />
      <Textarea
        label="Notes"
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
        placeholder="Key terms, termination reason, conditions…"
        rows={3}
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={saving} disabled={!form.title.trim() || !form.start_date}>
          {initial?.id ? 'Update' : 'Add'} Contract
        </Button>
      </div>
    </div>
  )
}

// ─── Vendor edit form modal ───────────────────────────────────────────────────
function VendorFormModal({ vendor, onSave, onClose }) {
  const [form, setForm] = useState({ name: vendor.name, website: vendor.website || '', notes: vendor.notes || '' })
  const [saving, setSaving] = useState(false)
  async function handleSave() {
    if (!form.name) return
    setSaving(true)
    await supabase.from('vendors').update(form).eq('id', vendor.id)
    setSaving(false)
    onSave()
  }
  return (
    <div className="space-y-4">
      <Input label="Vendor Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <Input label="Website" type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" />
      <Textarea label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={saving}>Update Vendor</Button>
      </div>
    </div>
  )
}

// ─── Reusable doc row ─────────────────────────────────────────────────────────
function DocRow({ doc, onView, onDownload, onDelete }) {
  return (
    <div className="flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100">
      <div className="flex items-center gap-2 min-w-0">
        <FileText size={13} className="text-gray-400 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-medium text-navy-900 truncate">{doc.file_name}</p>
          <p className="text-xs text-gray-400">
            {formatBytes(doc.file_size)}
            {doc.uploaded_at && ` · ${format(new Date(doc.uploaded_at), 'MMM d, yyyy')}`}
          </p>
        </div>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <button onClick={() => onView(doc)} className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors" title="Open"><Eye size={13} /></button>
        <button onClick={() => onDownload(doc)} className="p-1.5 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors" title="Download"><Download size={13} /></button>
        <button onClick={() => onDelete(doc)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete"><Trash2 size={13} /></button>
      </div>
    </div>
  )
}

// ─── Contract card (with documents) ──────────────────────────────────────────
function ContractCard({ contract: initialContract, vendorId, onEdit, onDelete, onDocsChanged }) {
  const { profile } = useUser()
  const [contract, setContract] = useState(initialContract)
  const [docs, setDocs] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadingTermination, setUploadingTermination] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [deleteDoc, setDeleteDoc] = useState(null)
  const fileInputRef = useRef(null)
  const terminationFileInputRef = useRef(null)

  useEffect(() => { setContract(initialContract) }, [initialContract])
  useEffect(() => { loadDocs() }, [contract.id])

  async function loadDocs() {
    const { data } = await supabase
      .from('vendor_contract_documents')
      .select('*')
      .eq('contract_id', contract.id)
      .order('uploaded_at', { ascending: false })
    setDocs(data || [])
  }

  async function extractNoticePeriod(path) {
    setExtracting(true)
    try {
      const { data } = await supabase.functions.invoke('analyze-contract', {
        body: { file_path: path }
      })
      const result = JSON.parse(data.result)
      if (result.termination_notice_days && result.termination_notice_days > 0) {
        await supabase.from('vendor_contracts')
          .update({ notice_period_days: result.termination_notice_days })
          .eq('id', contract.id)
        setContract((c) => ({ ...c, notice_period_days: result.termination_notice_days }))
        onDocsChanged?.()
      }
    } catch (e) {
      console.warn('Notice period extraction failed:', e)
    } finally {
      setExtracting(false)
    }
  }

  async function uploadFile(file, isTerminationDoc) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const subfolder = isTerminationDoc ? 'termination' : 'general'
    const path = `vendors/${vendorId}/contracts/${contract.id}/${subfolder}/${Date.now()}_${safeName}`
    const { error } = await supabase.storage.from('contracts').upload(path, file)
    if (error) { console.error('Upload failed:', error); return false }
    await supabase.from('vendor_contract_documents').insert({
      contract_id:        contract.id,
      vendor_id:          vendorId,
      file_name:          file.name,
      file_path:          path,
      file_size:          file.size,
      mime_type:          file.type,
      is_termination_doc: isTerminationDoc,
      uploaded_by:        profile?.email || null,
    })
    // Auto-extract notice period from non-termination PDFs
    if (!isTerminationDoc && file.type === 'application/pdf') {
      extractNoticePeriod(path)
    }
    return true
  }

  async function handleUpload(e, isTerminationDoc = false) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    isTerminationDoc ? setUploadingTermination(true) : setUploading(true)
    await uploadFile(file, isTerminationDoc)
    await loadDocs()
    onDocsChanged?.()
    isTerminationDoc ? setUploadingTermination(false) : setUploading(false)
  }

  async function handleView(doc) {
    const { data } = await supabase.storage.from('contracts').createSignedUrl(doc.file_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function handleDownload(doc) {
    const { data } = await supabase.storage.from('contracts').download(doc.file_path)
    if (data) {
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url; a.download = doc.file_name; a.click()
      URL.revokeObjectURL(url)
    }
  }

  async function handleDeleteDoc() {
    await supabase.storage.from('contracts').remove([deleteDoc.file_path])
    await supabase.from('vendor_contract_documents').delete().eq('id', deleteDoc.id)
    setDeleteDoc(null)
    loadDocs()
  }

  const meta = typeMeta(contract.contract_type)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const isTerminated = !!contract.end_date && new Date(contract.end_date) < today
  const generalDocs = docs.filter((d) => !d.is_termination_doc)
  const terminationDocs = docs.filter((d) => d.is_termination_doc)

  // Notice period / notification date logic
  let notificationDate = null
  let daysUntilNotification = null
  if (contract.end_date && contract.notice_period_days) {
    const endDt = new Date(contract.end_date + 'T12:00:00')
    notificationDate = new Date(endDt)
    notificationDate.setDate(notificationDate.getDate() - contract.notice_period_days)
    daysUntilNotification = Math.round((notificationDate - today) / (1000 * 60 * 60 * 24))
  }
  const noticeActive = notificationDate !== null && daysUntilNotification <= 0 && !isTerminated
  const noticeWarning = notificationDate !== null && daysUntilNotification > 0 && daysUntilNotification <= 60 && !isTerminated
  const isExpiring = noticeActive || noticeWarning

  return (
    <div className={`border rounded-2xl overflow-hidden ${isTerminated ? 'border-gray-200' : isExpiring ? 'border-amber-200' : 'border-gray-100'}`}>
      {/* Contract header */}
      <div className={`flex items-start justify-between gap-3 px-4 py-3.5 ${isTerminated ? 'bg-gray-50' : isExpiring ? 'bg-amber-50/40' : 'bg-white'}`}>
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${isTerminated ? 'bg-gray-100' : isExpiring ? 'bg-amber-50' : 'bg-primary-50'}`}>
            <FileText size={16} className={isTerminated ? 'text-gray-400' : isExpiring ? 'text-amber-500' : 'text-primary-500'} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-sm font-semibold ${isTerminated ? 'text-gray-500' : 'text-navy-900'}`}>{contract.title}</p>
              <Badge color={meta.color}>{meta.label}</Badge>
              {isTerminated && <Badge color="red">Terminated</Badge>}
              {noticeActive && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600">⚠ Notice period active</span>}
              {noticeWarning && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Notice due in {daysUntilNotification} day{daysUntilNotification !== 1 ? 's' : ''}</span>}
              {extracting && <span className="text-xs text-gray-400 italic">Extracting notice period…</span>}
            </div>
            <p className="text-xs text-gray-400 mt-1 flex flex-wrap gap-x-2">
              {contract.start_date && <span>Started {format(new Date(contract.start_date + 'T12:00:00'), 'MMM d, yyyy')}</span>}
              {isTerminated && <span className="text-red-400 font-medium">Terminated {format(new Date(contract.end_date + 'T12:00:00'), 'MMM d, yyyy')}</span>}
              {!isTerminated && contract.end_date && <span className="text-gray-500">Ends {format(new Date(contract.end_date + 'T12:00:00'), 'MMM d, yyyy')}</span>}
            </p>
            {contract.notice_period_days != null && (
              <p className="text-xs text-gray-400 mt-0.5">
                {contract.notice_period_days}-day termination notice
                {notificationDate && !isTerminated && (
                  <span className={`ml-1 ${noticeActive ? 'text-red-400 font-medium' : noticeWarning ? 'text-amber-600 font-medium' : ''}`}>
                    · Notify by {format(notificationDate, 'MMM d, yyyy')}
                  </span>
                )}
              </p>
            )}
            {contract.notes && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{contract.notes}</p>}
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={onEdit} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-navy-900 transition-colors"><Pencil size={13} /></button>
          <button onClick={onDelete} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
        </div>
      </div>

      {/* Documents */}
      <div className="border-t border-gray-50 bg-gray-50/60 px-4 py-3 space-y-4">

        {/* General documents */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Documents {generalDocs.length > 0 && `· ${generalDocs.length}`}
            </p>
            <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => handleUpload(e, false)} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex items-center gap-1.5 text-xs font-medium text-primary-500 hover:text-primary-600 transition-colors disabled:opacity-50">
              <Upload size={12} />{uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
          {generalDocs.length === 0 && !uploading && <p className="text-xs text-gray-400 py-0.5">No documents yet.</p>}
          {generalDocs.map((doc) => (
            <DocRow key={doc.id} doc={doc} onView={handleView} onDownload={handleDownload} onDelete={setDeleteDoc} />
          ))}
        </div>

        {/* Termination documentation — only shown when contract has end_date */}
        {isTerminated && (
          <div className="space-y-2 pt-2 border-t border-red-100">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">
                Termination Documentation {terminationDocs.length > 0 && `· ${terminationDocs.length}`}
              </p>
              <input ref={terminationFileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => handleUpload(e, true)} />
              <button onClick={() => terminationFileInputRef.current?.click()} disabled={uploadingTermination} className="flex items-center gap-1.5 text-xs font-medium text-red-400 hover:text-red-600 transition-colors disabled:opacity-50">
                <Upload size={12} />{uploadingTermination ? 'Uploading…' : 'Upload'}
              </button>
            </div>
            {terminationDocs.length === 0 && !uploadingTermination && (
              <p className="text-xs text-gray-400 py-0.5">No termination documents uploaded.</p>
            )}
            {terminationDocs.map((doc) => (
              <DocRow key={doc.id} doc={doc} onView={handleView} onDownload={handleDownload} onDelete={setDeleteDoc} />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteDoc}
        onClose={() => setDeleteDoc(null)}
        onConfirm={handleDeleteDoc}
        title="Delete Document"
        message={`Remove "${deleteDoc?.file_name}"? This cannot be undone.`}
      />
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function VendorDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [vendor, setVendor] = useState(null)
  const [contracts, setContracts] = useState([])
  const [allDocs, setAllDocs] = useState([])   // all docs across all contracts (for AI panel)
  const [loading, setLoading] = useState(true)

  const [editVendor, setEditVendor] = useState(false)
  const [contractModal, setContractModal] = useState(null)  // null | {} (new) | contract (edit)
  const [deleteContract, setDeleteContract] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    const [{ data: v }, { data: c }] = await Promise.all([
      supabase.from('vendors').select('*').eq('id', id).single(),
      supabase.from('vendor_contracts').select('*').eq('vendor_id', id).order('created_at', { ascending: false }),
    ])
    setVendor(v)
    setContracts(c || [])

    // Load all docs across all contracts for the AI panel
    if (c?.length) {
      const { data: docs } = await supabase
        .from('vendor_contract_documents')
        .select('*')
        .eq('vendor_id', id)
        .order('uploaded_at', { ascending: false })
      setAllDocs(docs || [])
    } else {
      setAllDocs([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function handleDeleteContract() {
    setDeleting(true)
    await supabase.from('vendor_contracts').delete().eq('id', deleteContract.id)
    setDeleteContract(null)
    setDeleting(false)
    load()
  }

  async function toggleShowInProducts() {
    const next = !vendor.show_in_products
    await supabase.from('vendors').update({ show_in_products: next }).eq('id', id)
    setVendor((v) => ({ ...v, show_in_products: next }))
  }

  if (loading) return <PageSpinner />
  if (!vendor) return <div className="text-sm text-gray-400 py-10 text-center">Vendor not found.</div>

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/vendors')} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-navy-900 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-navy-900">{vendor.name}</h2>
            {vendor.website && (
              <a href={vendor.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary-500 hover:underline mt-0.5">
                {vendor.website} <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Pencil size={14} />} onClick={() => setEditVendor(true)}>Edit Vendor</Button>
          <Button icon={<Plus size={14} />} onClick={() => setContractModal({})}>Add Contract</Button>
        </div>
      </div>

      {/* Vendor meta card */}
      <Card>
        <div className="flex items-center justify-between gap-4">
          {vendor.notes
            ? <p className="text-sm text-gray-600">{vendor.notes}</p>
            : <p className="text-sm text-gray-400 italic">No notes.</p>
          }
          {/* Show in Products toggle */}
          <button
            onClick={toggleShowInProducts}
            className="flex items-center gap-2.5 flex-shrink-0 group"
          >
            <span className="text-xs text-gray-500 font-medium">Show in Products</span>
            <div className={`relative w-9 h-5 rounded-full transition-colors ${vendor.show_in_products ? 'bg-primary-400' : 'bg-gray-200'}`}>
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${vendor.show_in_products ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
          </button>
        </div>
      </Card>

      {/* Contracts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Contracts {contracts.length > 0 && `· ${contracts.length}`}
          </h3>
        </div>

        {contracts.length === 0 ? (
          <Card>
            <div className="py-8 text-center">
              <FileText size={24} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No contracts yet.</p>
              <button onClick={() => setContractModal({})} className="text-xs text-primary-500 hover:underline mt-1">
                Add the first contract
              </button>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {contracts.map((c) => (
              <ContractCard
                key={c.id}
                contract={c}
                vendorId={id}
                onEdit={() => setContractModal(c)}
                onDelete={() => setDeleteContract(c)}
                onDocsChanged={load}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <Modal open={editVendor} onClose={() => setEditVendor(false)} title="Edit Vendor">
        <VendorFormModal
          vendor={vendor}
          onSave={() => { setEditVendor(false); load() }}
          onClose={() => setEditVendor(false)}
        />
      </Modal>

      <Modal
        open={!!contractModal}
        onClose={() => setContractModal(null)}
        title={contractModal?.id ? 'Edit Contract' : 'Add Contract'}
      >
        {contractModal !== null && (
          <ContractFormModal
            vendorId={id}
            initial={contractModal?.id ? contractModal : null}
            onSave={() => { setContractModal(null); load() }}
            onClose={() => setContractModal(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteContract}
        onClose={() => setDeleteContract(null)}
        onConfirm={handleDeleteContract}
        loading={deleting}
        title="Delete Contract"
        message={`Delete "${deleteContract?.title}"? All documents will also be removed.`}
      />

      {/* AI panel — appears once at least one document has been uploaded */}
      <VendorBrainPanel
        vendor={vendor}
        contracts={contracts}
        allDocs={allDocs}
      />
    </div>
  )
}
