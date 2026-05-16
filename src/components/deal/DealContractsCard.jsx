import { useState } from 'react'
import { Upload, FileText, FileCheck, Download, Eye, Sparkles, Loader, Trash2, History } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabase'
import Card, { CardHeader } from '../ui/Card'
import Button from '../ui/Button'
import ConfirmDialog from '../ui/ConfirmDialog'

export default function DealContractsCard({ contracts, predecessorContracts = [], predecessorName, dealId, load, logEvent, onAnalyzePdf }) {
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [deleteContractDlg, setDeleteContractDlg] = useState(null)

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${dealId}/${Date.now()}_${safeName}`
    const { error } = await supabase.storage.from('contracts').upload(path, file)
    if (error) { console.error('Upload error:', JSON.stringify(error)); setUploading(false); return }
    const existingVersion = contracts.find((c) => c.file_name === file.name)
    const version = existingVersion ? (existingVersion.version || 1) + 1 : 1
    const { data: contractData } = await supabase.from('contracts').insert([{
      deal_id: dealId,
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      mime_type: file.type,
      version,
      previous_version_id: existingVersion?.id || null,
    }]).select().single()
    await load()
    await logEvent(`Contract uploaded: ${file.name}${version > 1 ? ` (v${version})` : ''}`)
    setUploading(false)
    if (file.type === 'application/pdf' && contractData) {
      onAnalyzePdf?.(contractData)
    }
  }

  async function handleView(contract) {
    const { data } = await supabase.storage.from('contracts').createSignedUrl(contract.file_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function handleDownload(contract) {
    const { data } = await supabase.storage.from('contracts').download(contract.file_path)
    if (data) {
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = contract.file_name
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  async function handleDeleteContract(contract) {
    await logEvent(`Contract deleted: ${contract.file_name}`)
    await supabase.storage.from('contracts').remove([contract.file_path])
    await supabase.from('contracts').delete().eq('id', contract.id)
    setDeleteContractDlg(null)
    load()
  }

  return (
    <>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files?.[0]
          if (file) handleFileUpload({ target: { files: [file] } })
        }}
        className={`rounded-2xl transition-all ${dragging ? 'ring-2 ring-primary-400 ring-offset-2' : ''}`}
      >
        <Card>
          <CardHeader
            title="Contracts"
            action={
              <label className="cursor-pointer">
                <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.doc,.docx,.png,.jpg" />
                <Button size="sm" variant="secondary" loading={uploading} icon={<Upload size={14} />} as="span">
                  Upload
                </Button>
              </label>
            }
          />
          {contracts.length === 0 ? (
            <label className={`cursor-pointer flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 transition-colors ${dragging ? 'border-primary-400 bg-primary-50/60' : 'border-gray-200 hover:border-primary-300 hover:bg-primary-50/30'}`}>
              <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.doc,.docx,.png,.jpg" />
              <FileText size={32} className={dragging ? 'text-primary-400 mb-2' : 'text-gray-300 mb-2'} />
              <p className="text-sm font-medium text-gray-500">{dragging ? 'Drop to upload' : 'Drag & drop or click to upload'}</p>
              <p className="text-xs text-gray-400 mt-0.5">PDF, DOC, DOCX, PNG, JPG</p>
            </label>
          ) : (
            <>
              {dragging && (
                <div className="mb-3 flex items-center justify-center border-2 border-dashed border-primary-400 bg-primary-50/60 rounded-xl p-4">
                  <p className="text-sm font-medium text-primary-600">Drop to upload</p>
                </div>
              )}
              <div className="space-y-2">
                {contracts.map((contract) => (
                  <div key={contract.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50">
                    <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                      <FileCheck size={18} className="text-primary-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-navy-900 truncate">{contract.file_name}</p>
                        {contract.version > 1 && (
                          <span className="text-xs bg-navy-100 text-navy-600 font-medium px-1.5 py-0.5 rounded flex-shrink-0">v{contract.version}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">
                        {format(new Date(contract.uploaded_at), 'MMM d, yyyy')}
                        {contract.file_size && ` · ${(contract.file_size / 1024).toFixed(0)} KB`}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {contract.mime_type === 'application/pdf' && (
                        <button
                          onClick={() => onAnalyzePdf?.(contract)}
                          className="p-2 rounded-lg transition-colors text-gray-400 hover:text-primary-600 hover:bg-primary-50"
                          title="Analyze with AI"
                        >
                          <Sparkles size={15} />
                        </button>
                      )}
                      {contract.mime_type === 'application/pdf' && (
                        <button onClick={() => handleView(contract)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" title="View PDF">
                          <Eye size={15} />
                        </button>
                      )}
                      <button onClick={() => handleDownload(contract)} className="p-2 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors" title="Download">
                        <Download size={15} />
                      </button>
                      <button onClick={() => setDeleteContractDlg(contract)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {/* Previous contract reference */}
          {predecessorContracts.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <History size={11} />
                Previous Contract{predecessorName ? ` — ${predecessorName}` : ''}
              </p>
              <div className="space-y-2">
                {predecessorContracts.map((contract) => (
                  <div key={contract.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl bg-gray-50/60 opacity-75">
                    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <FileCheck size={18} className="text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-600 truncate">{contract.file_name}</p>
                      <p className="text-xs text-gray-400">
                        {format(new Date(contract.uploaded_at), 'MMM d, yyyy')}
                        {contract.file_size && ` · ${(contract.file_size / 1024).toFixed(0)} KB`}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {contract.mime_type === 'application/pdf' && (
                        <button onClick={() => handleView(contract)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" title="View PDF">
                          <Eye size={15} />
                        </button>
                      )}
                      <button onClick={() => handleDownload(contract)} className="p-2 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors" title="Download">
                        <Download size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={!!deleteContractDlg}
        onClose={() => setDeleteContractDlg(null)}
        onConfirm={() => handleDeleteContract(deleteContractDlg)}
        title="Delete Contract"
        message={`Are you sure you want to delete "${deleteContractDlg?.file_name}"? This cannot be undone.`}
      />
    </>
  )
}
