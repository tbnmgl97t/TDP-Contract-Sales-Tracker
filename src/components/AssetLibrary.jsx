import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useUser } from '../contexts/UserContext'
import { X, Upload, Search, Image as ImageIcon } from 'lucide-react'
import Spinner from './ui/Spinner'

const BUCKET = 'proposal-slides'
const CATEGORIES = ['all', 'logo', 'team', 'case_study', 'general']

export default function AssetLibrary({ onSelect, onClose }) {
  const { profile } = useUser()
  const [assets, setAssets]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [uploading, setUploading]   = useState(false)
  const [category, setCategory]     = useState('all')
  const [search, setSearch]         = useState('')
  const [uploadCat, setUploadCat]   = useState('general')
  const [uploadName, setUploadName] = useState('')
  const fileRef = useRef(null)

  async function loadAssets() {
    setLoading(true)
    const { data } = await supabase
      .from('proposal_assets')
      .select('*')
      .order('created_at', { ascending: false })
    setAssets(data || [])
    setLoading(false)
  }

  useEffect(() => { loadAssets() }, [])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)

    const ext  = file.name.split('.').pop()
    const path = `assets/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const name = uploadName.trim() || file.name.replace(/\.[^.]+$/, '')

    const { error: storErr } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: '3600' })
    if (storErr) { setUploading(false); alert('Upload failed: ' + storErr.message); return }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)

    const { error: dbErr } = await supabase.from('proposal_assets').insert({
      name,
      url: publicUrl,
      bucket_path: path,
      category: uploadCat,
      uploaded_by: profile?.email || null,
    })
    if (dbErr) { setUploading(false); alert('DB insert failed: ' + dbErr.message); return }

    setUploadName('')
    e.target.value = ''
    setUploading(false)
    loadAssets()
  }

  async function handleDelete(asset) {
    if (!confirm(`Delete "${asset.name}"?`)) return
    await supabase.storage.from(BUCKET).remove([asset.bucket_path])
    await supabase.from('proposal_assets').delete().eq('id', asset.id)
    loadAssets()
  }

  const filtered = assets.filter((a) => {
    if (category !== 'all' && a.category !== category) return false
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-navy-900">Asset Library</h2>
            <p className="text-xs text-gray-500 mt-0.5">Upload once, reuse across proposals</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {/* Upload row */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <input
            type="text"
            className="flex-1 min-w-40 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            placeholder="Asset name (optional)"
            value={uploadName}
            onChange={(e) => setUploadName(e.target.value)}
          />
          <select
            value={uploadCat}
            onChange={(e) => setUploadCat(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
          >
            <option value="general">General</option>
            <option value="logo">Logo</option>
            <option value="team">Team</option>
            <option value="case_study">Case Study</option>
          </select>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors"
          >
            {uploading ? <Spinner size="sm" /> : <Upload size={14} />}
            {uploading ? 'Uploading…' : 'Upload Image'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-40">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              className="w-full pl-8 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all capitalize ${category === c ? 'bg-white text-navy-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Spinner /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <ImageIcon size={36} className="mb-3 opacity-40" />
              <p className="text-sm">No assets found. Upload one above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
              {filtered.map((asset) => (
                <div key={asset.id} className="group relative rounded-xl overflow-hidden border border-gray-200 hover:border-primary-400 cursor-pointer transition-colors" onClick={() => { onSelect(asset.url); onClose() }}>
                  <img src={asset.url} alt={asset.name} className="w-full aspect-video object-cover bg-gray-100" />
                  <div className="px-2 py-1.5">
                    <p className="text-xs font-medium text-navy-900 truncate">{asset.name}</p>
                    <p className="text-[10px] text-gray-400 capitalize">{asset.category}</p>
                  </div>
                  {/* Delete */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDelete(asset) }}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-500 text-white text-xs hidden group-hover:flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
