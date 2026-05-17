import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Pencil, Trash2, Upload, Eye, Download, FileText, ScanSearch, CheckCircle2, RefreshCw } from 'lucide-react'
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

const AGREEMENT_TYPES = [
  { value: 'agreement', label: 'Agreement', desc: 'General Partner Agreement', color: 'blue'   },
  { value: 'nda',       label: 'NDA',       desc: 'Non-Disclosure Agreement',  color: 'purple' },
  { value: 'reseller',  label: 'Reseller',  desc: 'Reseller Agreement',        color: 'green'  },
  { value: 'referral',  label: 'Referral',  desc: 'Referral Agreement',        color: 'teal'   },
  { value: 'other',     label: 'Other',     desc: 'Other Agreement Type',      color: 'gray'   },
]

function typeMeta(type) {
  return AGREEMENT_TYPES.find((t) => t.value === type) || AGREEMENT_TYPES.at(-1)
}

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── Agreement form modal ──────────────────────────────────────────────────────
function AgreementFormModal({ partnerId, initial, onSave, onClose }) {
  const { profile } = useUser()
  const [form, setForm] = useState({
    title:              initial?.title              || '',
    agreement_type:     initial?.agreement_type     || 'agreement',
    start_date:         initial?.start_date         || '',
    end_date:           initial?.end_date           || '',
    notes:              initial?.notes              || '',
    notice_period_days: initial?.notice_period_days != null ? String(initial.notice_period_days) : '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.title.trim() || !form.start_date) return
    setSaving(true)
    const payload = {
      title:              form.title.trim(),
      agreement_type:     form.agreement_type,
      start_date:         form.start_date,
      end_date:           form.end_date || null,
      notes:              form.notes || null,
      notice_period_days: form.notice_period_days !== '' ? parseInt(form.notice_period_days, 10) : null,
    }
    if (initial?.id) {
      await supabase.from('partner_agreements').update(payload).eq('id', initial.id)
    } else {
      await supabase.from('partner_agreements').insert({
        ...payload,
        partner_id: partnerId,
      })
    }
    setSaving(false)
    onSave()
  }

  return (
    <div className="space-y-4">
      <Input
        label="Agreement Title"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        placeholder="e.g., Reseller Agreement 2024"
        required
      />
      <Select
        label="Agreement Type"
        value={form.agreement_type}
        onChange={(e) => setForm({ ...form, agreement_type: e.target.value })}
      >
        {AGREEMENT_TYPES.map((t) => (
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
          label="End Date"
          type="date"
          value={form.end_date}
          onChange={(e) => setForm({ ...form, end_date: e.target.value })}
          hint="Leave blank if ongoing"
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
        placeholder="Key terms, conditions, renewal notes…"
        rows={3}
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={saving} disabled={!form.title.trim() || !form.start_date}>
          {initial?.id ? 'Update' : 'Add'} Agreement
        </Button>
      </div>
    </div>
  )
}

// ─── Partner edit form modal ───────────────────────────────────────────────────
function PartnerFormModal({ partner, vendors, onSave, onClose }) {
  const [form, setForm] = useState({
    name:                   partner.name,
    default_commission_pct: partner.default_commission_pct ?? 7.5,
    vendor_id:              partner.vendor_id || '',
    active:                 partner.active ?? true,
    notes:                  partner.notes || '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    await supabase.from('partners').update({
      name:                   form.name.trim(),
      default_commission_pct: parseFloat(form.default_commission_pct) || 0,
      vendor_id:              form.vendor_id || null,
      active:                 form.active,
      notes:                  form.notes || null,
    }).eq('id', partner.id)
    setSaving(false)
    onSave()
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
          value={form.vendor_id}
          onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}
        >
          <option value="">Not a vendor</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>
      </div>
      <Textarea
        label="Notes"
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
        placeholder="Agreement terms, referral conditions..."
      />
      <div className="flex items-center gap-3">
        <input
          id="partner-active-edit"
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
          className="w-4 h-4 rounded border-gray-300 text-primary-400 focus:ring-primary-400"
        />
        <label htmlFor="partner-active-edit" className="text-sm text-navy-900">Active</label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={saving}>Update Partner</Button>
      </div>
    </div>
  )
}

// ─── Reusable doc row ─────────────────────────────────────────────────────────
function DocRow({ doc, onView, onDownload, onDelete, onReanalyze, reanalyzing }) {
  const isPdf = doc.mime_type === 'application/pdf' || doc.file_name?.toLowerCase().endsWith('.pdf')
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
        {onReanalyze && isPdf && (
          <button
            onClick={() => onReanalyze(doc)}
            disabled={reanalyzing}
            className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-40"
            title="Re-extract notice period with AI"
          >
            <ScanSearch size={13} className={reanalyzing ? 'animate-pulse' : ''} />
          </button>
        )}
        <button onClick={() => onView(doc)} className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors" title="Open"><Eye size={13} /></button>
        <button onClick={() => onDownload(doc)} className="p-1.5 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors" title="Download"><Download size={13} /></button>
        <button onClick={() => onDelete(doc)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete"><Trash2 size={13} /></button>
      </div>
    </div>
  )
}

// ─── Agreement card (with documents) ──────────────────────────────────────────
function AgreementCard({ agreement: initialAgreement, partnerId, partnerName, onEdit, onDelete, onDocsChanged }) {
  const { profile, isManager } = useUser()
  const [agreement, setAgreement] = useState(initialAgreement)
  const [docs, setDocs] = useState([])
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [deleteDoc, setDeleteDoc] = useState(null)
  const [showRenewalForm, setShowRenewalForm] = useState(false)
  const [renewalNote, setRenewalNote] = useState('')
  const [savingRenewal, setSavingRenewal] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => { setAgreement(initialAgreement) }, [initialAgreement])
  useEffect(() => { loadDocs() }, [agreement.id])

  async function loadDocs() {
    const { data } = await supabase
      .from('partner_agreement_documents')
      .select('*')
      .eq('agreement_id', agreement.id)
      .order('uploaded_at', { ascending: false })
    setDocs(data || [])
  }

  async function extractNoticePeriod(path) {
    setExtracting(true)
    try {
      const { data } = await supabase.functions.invoke('analyze-contract', {
        body: { file_path: path }
      })
      const raw = typeof data.result === 'string'
        ? data.result.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
        : JSON.stringify(data.result)
      const result = JSON.parse(raw)
      if (result.termination_notice_days && result.termination_notice_days > 0) {
        await supabase.from('partner_agreements')
          .update({ notice_period_days: result.termination_notice_days })
          .eq('id', agreement.id)
        setAgreement((a) => ({ ...a, notice_period_days: result.termination_notice_days }))
        onDocsChanged?.()
      }
    } catch (e) {
      console.warn('Notice period extraction failed:', e)
    } finally {
      setExtracting(false)
    }
  }

  async function uploadFile(file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `partners/${partnerId}/agreements/${agreement.id}/${Date.now()}_${safeName}`
    const { error } = await supabase.storage.from('contracts').upload(path, file)
    if (error) { console.error('Upload failed:', error); return false }
    await supabase.from('partner_agreement_documents').insert({
      agreement_id: agreement.id,
      partner_id:   partnerId,
      file_name:    file.name,
      file_path:    path,
      file_size:    file.size,
      mime_type:    file.type,
      uploaded_by:  profile?.email || null,
    })
    if (file.type === 'application/pdf') {
      extractNoticePeriod(path)
    }
    return true
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    await uploadFile(file)
    await loadDocs()
    onDocsChanged?.()
    setUploading(false)
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
    await supabase.from('partner_agreement_documents').delete().eq('id', deleteDoc.id)
    setDeleteDoc(null)
    loadDocs()
  }

  async function logPartnerActivity(description) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('audit_log').insert({
        deal_id:    null,
        table_name: 'partner_agreements',
        record_id:  agreement.id,
        action:     'event',
        changed_by: user?.email || null,
        description,
      })
    } catch (e) {
      console.warn('[logPartnerActivity]', e)
    }
  }

  async function handleMarkRenewal() {
    setSavingRenewal(true)
    try {
      const now = new Date().toISOString()
      const updates = {
        renewal_intent:    true,
        renewal_noted_by:  profile?.email || profile?.full_name || 'Manager',
        renewal_noted_at:  now,
        renewal_note:      renewalNote.trim() || null,
      }
      await supabase.from('partner_agreements').update(updates).eq('id', agreement.id)
      setAgreement((a) => ({ ...a, ...updates }))
      await logPartnerActivity(
        `Renewal planned for agreement "${agreement.title}" (${partnerName})${renewalNote.trim() ? ` — "${renewalNote.trim()}"` : ''} by ${updates.renewal_noted_by}`
      )
      setShowRenewalForm(false)
      setRenewalNote('')
      onDocsChanged?.()
    } finally {
      setSavingRenewal(false)
    }
  }

  async function handleClearRenewal() {
    await supabase.from('partner_agreements').update({
      renewal_intent:   false,
      renewal_noted_by: null,
      renewal_noted_at: null,
      renewal_note:     null,
    }).eq('id', agreement.id)
    setAgreement((a) => ({ ...a, renewal_intent: false, renewal_noted_by: null, renewal_noted_at: null, renewal_note: null }))
    await logPartnerActivity(`Renewal plan cleared for agreement "${agreement.title}" (${partnerName}) by ${profile?.email || 'Manager'}`)
    onDocsChanged?.()
  }

  const meta = typeMeta(agreement.agreement_type)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const isExpired = !!agreement.end_date && new Date(agreement.end_date) < today

  // Notice period / notification date logic
  let notificationDate = null
  let daysUntilNotification = null
  if (agreement.end_date && agreement.notice_period_days) {
    const endDt = new Date(agreement.end_date + 'T12:00:00')
    notificationDate = new Date(endDt)
    notificationDate.setDate(notificationDate.getDate() - agreement.notice_period_days)
    daysUntilNotification = Math.round((notificationDate - today) / (1000 * 60 * 60 * 24))
  }
  const noticeActive  = notificationDate !== null && daysUntilNotification <= 0  && !isExpired && !agreement.renewal_intent
  const noticeWarning = notificationDate !== null && daysUntilNotification > 0 && daysUntilNotification <= 60 && !isExpired && !agreement.renewal_intent
  const isExpiring    = noticeActive || noticeWarning
  const renewalPlanned = !!agreement.renewal_intent && !isExpired && notificationDate !== null

  return (
    <div className={`border rounded-2xl overflow-hidden ${isExpired ? 'border-gray-200' : renewalPlanned ? 'border-green-200' : isExpiring ? 'border-amber-200' : 'border-gray-100'}`}>
      {/* Agreement header */}
      <div className={`flex items-start justify-between gap-3 px-4 py-3.5 ${isExpired ? 'bg-gray-50' : renewalPlanned ? 'bg-green-50/40' : isExpiring ? 'bg-amber-50/40' : 'bg-white'}`}>
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${isExpired ? 'bg-gray-100' : renewalPlanned ? 'bg-green-50' : isExpiring ? 'bg-amber-50' : 'bg-primary-50'}`}>
            <FileText size={16} className={isExpired ? 'text-gray-400' : renewalPlanned ? 'text-green-500' : isExpiring ? 'text-amber-500' : 'text-primary-500'} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-sm font-semibold ${isExpired ? 'text-gray-500' : 'text-navy-900'}`}>{agreement.title}</p>
              {renewalPlanned && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700"><CheckCircle2 size={10} /> Planned for Renewal</span>}
              <Badge color={meta.color}>{meta.label}</Badge>
              {isExpired && <Badge color="gray">Expired</Badge>}
              {noticeActive  && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600">⚠ Notice period active</span>}
              {noticeWarning && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Notice due in {daysUntilNotification} day{daysUntilNotification !== 1 ? 's' : ''}</span>}
              {extracting && <span className="text-xs text-gray-400 italic">Extracting notice period…</span>}
            </div>
            <p className="text-xs text-gray-400 mt-1 flex flex-wrap gap-x-2">
              {agreement.start_date && <span>Started {format(new Date(agreement.start_date + 'T12:00:00'), 'MMM d, yyyy')}</span>}
              {isExpired && <span className="text-gray-400 font-medium">Expired {format(new Date(agreement.end_date + 'T12:00:00'), 'MMM d, yyyy')}</span>}
              {!isExpired && agreement.end_date && <span className="text-gray-500">Ends {format(new Date(agreement.end_date + 'T12:00:00'), 'MMM d, yyyy')}</span>}
            </p>
            {agreement.notice_period_days != null && (
              <p className="text-xs text-gray-400 mt-0.5">
                {agreement.notice_period_days}-day notice period
                {notificationDate && !isExpired && (
                  <span className={`ml-1 ${noticeActive ? 'text-red-400 font-medium' : noticeWarning ? 'text-amber-600 font-medium' : ''}`}>
                    · Notify by {format(notificationDate, 'MMM d, yyyy')}
                  </span>
                )}
              </p>
            )}
            {agreement.notes && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{agreement.notes}</p>}
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={onEdit} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-navy-900 transition-colors"><Pencil size={13} /></button>
          <button onClick={onDelete} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
        </div>
      </div>

      {/* Renewal intent banner — shown when warning is active OR renewal already planned */}
      {(isExpiring || renewalPlanned) && (
        <div className={`border-t px-4 py-3 ${renewalPlanned ? 'bg-green-50/60 border-green-100' : 'bg-amber-50/60 border-amber-100'}`}>
          {renewalPlanned ? (
            /* ── Renewal planned state ── */
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0">
                <CheckCircle2 size={15} className="text-green-500 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-green-800">
                    Renewal planned by {agreement.renewal_noted_by}
                    {agreement.renewal_noted_at && (
                      <span className="font-normal text-green-600 ml-1">
                        · {format(new Date(agreement.renewal_noted_at), 'MMM d, yyyy')}
                      </span>
                    )}
                  </p>
                  {agreement.renewal_note && (
                    <p className="text-xs text-green-700 mt-0.5 italic">"{agreement.renewal_note}"</p>
                  )}
                </div>
              </div>
              {isManager && (
                <button
                  onClick={handleClearRenewal}
                  className="text-xs text-green-600 hover:text-red-500 transition-colors flex-shrink-0 flex items-center gap-1"
                  title="Clear renewal plan"
                >
                  <RefreshCw size={11} /> Clear
                </button>
              )}
            </div>
          ) : showRenewalForm ? (
            /* ── Manager note form ── */
            <div className="space-y-2">
              <p className="text-xs font-semibold text-amber-800">Note renewal intention</p>
              <textarea
                value={renewalNote}
                onChange={(e) => setRenewalNote(e.target.value)}
                placeholder="Optional note (e.g. agreed to renew for 1 year at same rate)"
                rows={2}
                className="w-full text-xs border border-amber-200 rounded-lg px-2.5 py-1.5 bg-white resize-none focus:outline-none focus:ring-1 focus:ring-amber-400 placeholder:text-gray-400"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleMarkRenewal}
                  disabled={savingRenewal}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 size={12} />{savingRenewal ? 'Saving…' : 'Confirm Renewal Plan'}
                </button>
                <button
                  onClick={() => { setShowRenewalForm(false); setRenewalNote('') }}
                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* ── Warning state — action prompt ── */
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-amber-700">
                {noticeActive
                  ? 'The notification window has passed — action required.'
                  : `Notification deadline in ${daysUntilNotification} day${daysUntilNotification !== 1 ? 's' : ''}.`}
                {!isManager && <span className="ml-1 text-amber-600">Contact a manager to record renewal intent.</span>}
              </p>
              {isManager && (
                <button
                  onClick={() => setShowRenewalForm(true)}
                  className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                >
                  <CheckCircle2 size={12} /> Plan to Renew
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Documents */}
      <div className="border-t border-gray-50 bg-gray-50/60 px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Documents {docs.length > 0 && `· ${docs.length}`}
          </p>
          <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={handleUpload} />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex items-center gap-1.5 text-xs font-medium text-primary-500 hover:text-primary-600 transition-colors disabled:opacity-50">
            <Upload size={12} />{uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
        {docs.length === 0 && !uploading && <p className="text-xs text-gray-400 py-0.5">No documents yet.</p>}
        {docs.map((doc) => (
          <DocRow
            key={doc.id}
            doc={doc}
            onView={handleView}
            onDownload={handleDownload}
            onDelete={setDeleteDoc}
            onReanalyze={(d) => extractNoticePeriod(d.file_path)}
            reanalyzing={extracting}
          />
        ))}
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
export default function PartnerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isManager } = useUser()

  const [partner, setPartner] = useState(null)
  const [agreements, setAgreements] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)

  const [editPartner, setEditPartner] = useState(false)
  const [agreementModal, setAgreementModal] = useState(null)  // null | {} (new) | agreement (edit)
  const [deleteAgreement, setDeleteAgreement] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    const [{ data: p }, { data: a }, { data: v }] = await Promise.all([
      supabase.from('partners').select('*, vendors(name)').eq('id', id).single(),
      supabase.from('partner_agreements').select('*').eq('partner_id', id).order('created_at', { ascending: false }),
      supabase.from('vendors').select('id, name').order('name'),
    ])
    setPartner(p)
    setAgreements(a || [])
    setVendors(v || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function handleDeleteAgreement() {
    setDeleting(true)
    await supabase.from('partner_agreements').delete().eq('id', deleteAgreement.id)
    setDeleteAgreement(null)
    setDeleting(false)
    load()
  }

  if (loading) return <PageSpinner />
  if (!partner) return <div className="text-sm text-gray-400 py-10 text-center">Partner not found.</div>

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/partners')} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-navy-900 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-navy-900">{partner.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {partner.default_commission_pct}% commission
              {partner.vendors?.name && <span className="ml-2">· Linked to {partner.vendors.name}</span>}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {isManager && (
            <Button variant="secondary" icon={<Pencil size={14} />} onClick={() => setEditPartner(true)}>
              Edit Partner
            </Button>
          )}
          <Button icon={<Plus size={14} />} onClick={() => setAgreementModal({})}>Add Agreement</Button>
        </div>
      </div>

      {/* Partner meta card */}
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            {partner.notes
              ? <p className="text-sm text-gray-600">{partner.notes}</p>
              : <p className="text-sm text-gray-400 italic">No notes.</p>
            }
          </div>
          <Badge color={partner.active ? 'green' : 'gray'}>{partner.active ? 'Active' : 'Inactive'}</Badge>
        </div>
      </Card>

      {/* Agreements */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Agreements {agreements.length > 0 && `· ${agreements.length}`}
          </h3>
        </div>

        {agreements.length === 0 ? (
          <Card>
            <div className="py-8 text-center">
              <FileText size={24} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No agreements yet.</p>
              <button onClick={() => setAgreementModal({})} className="text-xs text-primary-500 hover:underline mt-1">
                Add the first agreement
              </button>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {agreements.map((a) => (
              <AgreementCard
                key={a.id}
                agreement={a}
                partnerId={id}
                partnerName={partner?.name || ''}
                onEdit={() => setAgreementModal(a)}
                onDelete={() => setDeleteAgreement(a)}
                onDocsChanged={load}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <Modal open={editPartner} onClose={() => setEditPartner(false)} title="Edit Partner">
        <PartnerFormModal
          partner={partner}
          vendors={vendors}
          onSave={() => { setEditPartner(false); load() }}
          onClose={() => setEditPartner(false)}
        />
      </Modal>

      <Modal
        open={!!agreementModal}
        onClose={() => setAgreementModal(null)}
        title={agreementModal?.id ? 'Edit Agreement' : 'Add Agreement'}
      >
        {agreementModal !== null && (
          <AgreementFormModal
            partnerId={id}
            initial={agreementModal?.id ? agreementModal : null}
            onSave={() => { setAgreementModal(null); load() }}
            onClose={() => setAgreementModal(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteAgreement}
        onClose={() => setDeleteAgreement(null)}
        onConfirm={handleDeleteAgreement}
        loading={deleting}
        title="Delete Agreement"
        message={`Delete "${deleteAgreement?.title}"? All documents will also be removed.`}
      />
    </div>
  )
}
