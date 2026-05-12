import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { X, GitBranch, Upload, Download, Trash2, FileCheck, Loader, AlertTriangle, TrendingDown, TrendingUp, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Modal from './ui/Modal'
import Button from './ui/Button'
import Input, { Textarea } from './ui/Input'
import { fmt, buildCommissionSchedule } from '../lib/commission'
import { productLineTotal, effectiveCogs } from '../lib/products'
import { calcMonthsBetweenDates, computePartnerStack } from '../lib/deals'

// ─── financial impact summary ─────────────────────────────────────────────────

function CancellationSummary({ amendment, cancelledDp, deal, dealProducts, dealTeam, dealPartners }) {
  if (!cancelledDp) return null

  const allProductAcv = dealProducts.reduce((sum, dp) => {
    if (dp.commission_metric === 'GM') return sum + Math.max(0, dp.net_revenue || 0)
    return sum + (dp.annual_value || 0)
  }, 0)
  const { partnerMultiplier } = computePartnerStack(allProductAcv, dealPartners)

  const trilogyRevenueFull = cancelledDp.commission_metric === 'GM'
    ? Math.max(0, cancelledDp.net_revenue || 0)
    : (cancelledDp.annual_value || 0)
  const cogsFull = effectiveCogs(cancelledDp)
  const grossMarginFull = trilogyRevenueFull - cogsFull
  const customerRevenueFull = productLineTotal(cancelledDp, partnerMultiplier)
  const partnerRevenueFull = dealPartners.length > 0 ? customerRevenueFull - trilogyRevenueFull : 0

  const originalMonths = cancelledDp.billing_months ?? (deal.contract_months || 12)
  // billing_months on the dp was already shortened when the amendment was saved —
  // so we derive what was forfeited vs. what was kept.
  const keptMonths = cancelledDp.billing_months ?? originalMonths
  const contractMonths = deal.contract_months || 12
  const lostMonths = Math.max(0, contractMonths - keptMonths)
  const lostFraction = contractMonths > 0 ? lostMonths / contractMonths : 0

  const trilogyLost  = trilogyRevenueFull * lostFraction
  const marginLost   = grossMarginFull * lostFraction
  const customerLost = customerRevenueFull * lostFraction
  const partnerLost  = partnerRevenueFull * lostFraction

  // Commission forfeited
  const keptSchedule = buildCommissionSchedule(
    deal,
    [cancelledDp],
    dealTeam.map((m) => ({ ...m, person_name: m.people?.name }))
  )
  const fullSchedule = buildCommissionSchedule(
    deal,
    [{ ...cancelledDp, billing_months: contractMonths }],
    dealTeam.map((m) => ({ ...m, person_name: m.people?.name }))
  )
  const fullTotal = fullSchedule.reduce((s, e) => s + e.amount, 0)
  const keptTotal = keptSchedule.reduce((s, e) => s + e.amount, 0)
  const commissionLost = Math.max(0, fullTotal - keptTotal)

  const billingStart = cancelledDp.billing_start_date || deal.contract_start
  const fmtD = (s) => s ? format(new Date(s + 'T12:00:00'), 'MMM d, yyyy') : '—'

  const metrics = [
    dealPartners.length > 0 && { label: 'Customer ACV', value: fmt(customerLost, 2) },
    { label: 'Trilogy revenue', value: fmt(trilogyLost, 2) },
    cogsFull > 0 && { label: 'Gross margin', value: fmt(marginLost, 2) },
    dealPartners.length > 0 && partnerLost > 0 && { label: 'Partner revenue', value: fmt(partnerLost, 2) },
    commissionLost > 0 && { label: 'Commission', value: fmt(commissionLost, 2) },
  ].filter(Boolean)

  return (
    <div className="border border-amber-200 rounded-xl overflow-hidden text-sm">
      <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold text-amber-800">
          <TrendingDown size={14} />
          Cancellation — {cancelledDp.products?.name}
        </div>
        <span className="text-xs font-medium text-amber-600 bg-amber-100 border border-amber-200 rounded-full px-2.5 py-0.5">
          {keptMonths} of {contractMonths} months active
        </span>
      </div>
      <div className="px-4 py-3 bg-white space-y-3">
        {/* Timeline */}
        <div>
          <div className="h-5 rounded-md overflow-hidden flex border border-gray-200">
            <div
              className="bg-green-100 border-r border-green-300 flex items-center justify-center"
              style={{ width: `${Math.round((keptMonths / contractMonths) * 100)}%` }}
            >
              <span className="text-[10px] font-semibold text-green-700 px-1 truncate">{keptMonths} mo</span>
            </div>
            <div className="bg-amber-100 flex items-center justify-center flex-1">
              <span className="text-[10px] font-semibold text-amber-700 px-1 truncate">{lostMonths} mo</span>
            </div>
          </div>
          <div className="flex justify-between mt-1 text-[11px] text-gray-400">
            <span>{fmtD(billingStart)}</span>
            <span className="text-amber-600 font-medium">↑ {fmtD(amendment.effective_date)}</span>
            <span>{fmtD(deal.contract_end)}</span>
          </div>
        </div>

        {/* Forfeited value chips */}
        {metrics.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Forfeited value</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {metrics.map(({ label, value }) => (
                <div key={label} className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-500">{label}</p>
                  <p className="font-bold text-amber-900">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function AdditionSummary({ addedDp, deal, dealProducts, dealTeam, dealPartners }) {
  if (!addedDp) return null

  const allProductAcv = dealProducts.reduce((sum, dp) => {
    if (dp.commission_metric === 'GM') return sum + Math.max(0, dp.net_revenue || 0)
    return sum + (dp.annual_value || 0)
  }, 0)
  const { partnerMultiplier } = computePartnerStack(allProductAcv, dealPartners)

  const trilogyRevenue  = addedDp.commission_metric === 'GM'
    ? Math.max(0, addedDp.net_revenue || 0)
    : (addedDp.annual_value || 0)
  const cogs            = effectiveCogs(addedDp)
  const grossMargin     = trilogyRevenue - cogs
  const customerRevenue = productLineTotal(addedDp, partnerMultiplier)
  const partnerRevenue  = dealPartners.length > 0 ? customerRevenue - trilogyRevenue : 0

  const schedule = buildCommissionSchedule(
    deal,
    [addedDp],
    dealTeam.map((m) => ({ ...m, person_name: m.people?.name }))
  )
  const totalCommission = schedule.reduce((s, e) => s + e.amount, 0)

  const byQ = {}
  schedule.forEach((e) => {
    const key = `${e.year}-${e.quarter}`
    if (!byQ[key]) byQ[key] = { label: `${e.year} Q${e.quarter}`, total: 0 }
    byQ[key].total += e.amount
  })

  const fmtD = (s) => s ? format(new Date(s + 'T12:00:00'), 'MMM d, yyyy') : '—'
  const addedMonths = addedDp.billing_months || deal.contract_months || 12

  const metrics = [
    dealPartners.length > 0 && { label: 'Customer ACV', value: fmt(customerRevenue, 2) },
    { label: 'Trilogy revenue', value: fmt(trilogyRevenue, 2) },
    cogs > 0 && { label: 'Gross margin', value: fmt(grossMargin, 2) },
    dealPartners.length > 0 && partnerRevenue > 0 && { label: 'Partner revenue', value: fmt(partnerRevenue, 2) },
    totalCommission > 0 && { label: 'Commission', value: fmt(totalCommission, 2) },
  ].filter(Boolean)

  return (
    <div className="border border-green-200 rounded-xl overflow-hidden text-sm">
      <div className="px-4 py-3 bg-green-50 border-b border-green-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold text-green-800">
          <TrendingUp size={14} />
          Addition — {addedDp.products?.name}
        </div>
        <span className="text-xs font-medium text-green-600 bg-green-100 border border-green-200 rounded-full px-2.5 py-0.5">
          {addedMonths} months
        </span>
      </div>
      <div className="px-4 py-3 bg-white space-y-3">
        <div className="flex justify-between text-[11px] text-gray-400 mb-1">
          <span>Starts {fmtD(addedDp.billing_start_date)}</span>
          <span>Ends {fmtD(deal.contract_end)}</span>
        </div>
        {metrics.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Added value</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {metrics.map(({ label, value }) => (
                <div key={label} className="bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                  <p className="text-xs text-green-500">{label}</p>
                  <p className="font-bold text-green-900">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {Object.values(byQ).length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Commission by quarter</p>
            <div className="flex flex-wrap gap-2">
              {Object.values(byQ).map(({ label, total }) => (
                <div key={label} className="bg-green-50 border border-green-100 rounded-lg px-3 py-1.5">
                  <p className="text-xs text-green-500">{label}</p>
                  <p className="font-bold text-green-900">{fmt(total, 2)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export default function EditAmendmentModal({
  amendment, cancelledDp, addedDp,
  deal, dealProducts, dealTeam, dealPartners,
  onSaved, onClose,
}) {
  const [effectiveDate, setEffectiveDate] = useState(amendment.effective_date)
  const [note, setNote] = useState(amendment.note || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Documents
  const [docs, setDocs] = useState([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => { loadDocs() }, [amendment.id])

  async function loadDocs() {
    const { data } = await supabase
      .from('amendment_documents')
      .select('*')
      .eq('amendment_id', amendment.id)
      .order('uploaded_at', { ascending: false })
    setDocs(data || [])
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${deal.id}/amendments/${amendment.id}/${Date.now()}_${safeName}`
    const { error: upErr } = await supabase.storage.from('contracts').upload(path, file)
    if (upErr) { setError('Upload failed: ' + upErr.message); setUploading(false); return }
    await supabase.from('amendment_documents').insert({
      amendment_id: amendment.id,
      deal_id: deal.id,
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      mime_type: file.type,
    })
    await loadDocs()
    setUploading(false)
  }

  async function handleOpen(doc) {
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

  async function handleDeleteDoc(doc) {
    await supabase.storage.from('contracts').remove([doc.file_path])
    await supabase.from('amendment_documents').delete().eq('id', doc.id)
    setDocs((prev) => prev.filter((d) => d.id !== doc.id))
  }

  async function handleSave() {
    setError(null)
    setSaving(true)
    try {
      const { error: aErr } = await supabase
        .from('deal_amendments')
        .update({ effective_date: effectiveDate, note: note || null })
        .eq('id', amendment.id)
      if (aErr) throw aErr

      // If cancellation date changed, recalculate billing_months
      if (cancelledDp && effectiveDate !== amendment.effective_date) {
        const billingStart = cancelledDp.billing_start_date || deal.contract_start
        if (billingStart) {
          const newMonths = Math.max(0, calcMonthsBetweenDates(
            new Date(billingStart + 'T00:00:00'),
            new Date(effectiveDate + 'T00:00:00')
          ))
          const { error: dpErr } = await supabase
            .from('deal_products')
            .update({ billing_months: newMonths })
            .eq('id', cancelledDp.id)
          if (dpErr) throw dpErr
        }
      }

      onSaved()
      onClose()
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const isCancellation = !!cancelledDp

  return (
    <Modal
      open
      onClose={onClose}
      title="Amendment Details"
      size="lg"
      footer={
        <>
          {error && <p className="text-xs text-red-600 mr-auto">{error}</p>}
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={handleSave} loading={saving}>Save Changes</Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Financial summary */}
        {isCancellation ? (
          <CancellationSummary
            amendment={amendment}
            cancelledDp={cancelledDp}
            deal={deal}
            dealProducts={dealProducts}
            dealTeam={dealTeam}
            dealPartners={dealPartners}
          />
        ) : (
          <AdditionSummary
            addedDp={addedDp}
            deal={deal}
            dealProducts={dealProducts}
            dealTeam={dealTeam}
            dealPartners={dealPartners}
          />
        )}

        {/* Editable fields */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Effective date"
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            hint={isCancellation ? 'Changing date recalculates billing period' : undefined}
          />
          <div />
        </div>
        <Textarea
          label="Note"
          placeholder="Reason for amendment, reference number, etc."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
        />

        {/* Supporting documents */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-navy-900">Supporting Documents</p>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
            <Button size="sm" variant="secondary" loading={uploading} icon={<Upload size={13} />} onClick={() => fileInputRef.current?.click()}>
              Upload
            </Button>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            Attach the cancellation notice, signed addendum, email thread, or any other supporting file.
          </p>

          {docs.length === 0 && !uploading && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl p-6 hover:border-primary-300 hover:bg-primary-50/20 transition-colors cursor-pointer"
            >
              <Upload size={22} className="text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">Drag & drop or click to upload</p>
              <p className="text-xs text-gray-300 mt-0.5">PDF, DOC, PNG, JPG, EML</p>
            </button>
          )}

          {docs.length > 0 && (
            <div className="space-y-2">
              {docs.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => handleOpen(doc)}
                  className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:bg-primary-50/40 hover:border-primary-200 transition-colors cursor-pointer group"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                    <FileCheck size={15} className="text-primary-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-navy-900 truncate group-hover:text-primary-700 transition-colors">
                      {doc.file_name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {format(new Date(doc.uploaded_at), 'MMM d, yyyy')}
                      {doc.file_size && ` · ${(doc.file_size / 1024).toFixed(0)} KB`}
                    </p>
                  </div>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleOpen(doc)}
                      className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      title="Open in new tab"
                    >
                      <ExternalLink size={14} />
                    </button>
                    <button
                      onClick={() => handleDownload(doc)}
                      className="p-1.5 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Download"
                    >
                      <Download size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteDoc(doc)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {uploading && (
                <div className="flex items-center gap-2 p-3 border border-gray-100 rounded-xl text-sm text-gray-400">
                  <Loader size={14} className="animate-spin" />
                  Uploading…
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
