import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'
import Modal from './ui/Modal'
import Button from './ui/Button'

export default function AttachVendorContractModal({ dealId, onClose, onAttached }) {
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [attaching, setAttaching] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('vendor_contracts')
        .select('*, vendors(name)')
        .is('deal_id', null)
        .order('end_date')
      setContracts(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = contracts.filter((vc) => {
    const q = search.toLowerCase()
    return (
      vc.title?.toLowerCase().includes(q) ||
      vc.vendors?.name?.toLowerCase().includes(q)
    )
  })

  async function handleAttach() {
    if (!selectedId) return
    setAttaching(true)
    await supabase.from('vendor_contracts').update({ deal_id: dealId }).eq('id', selectedId)
    setAttaching(false)
    onAttached()
  }

  return (
    <Modal open onClose={onClose} title="Attach Vendor Contract" size="sm">
      <div className="space-y-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by vendor or contract title…"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300"
        />

        {loading ? (
          <p className="text-xs text-gray-400 text-center py-6">Loading contracts…</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">
            {contracts.length === 0
              ? 'No unlinked vendor contracts found.'
              : 'No contracts match your search.'}
          </p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {filtered.map((vc) => (
              <button
                key={vc.id}
                onClick={() => setSelectedId(vc.id === selectedId ? null : vc.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                  selectedId === vc.id
                    ? 'border-primary-300 bg-primary-50'
                    : 'border-gray-100 hover:bg-gray-50'
                }`}
              >
                <p className="text-sm font-medium text-navy-900">{vc.vendors?.name}</p>
                <p className="text-xs text-gray-500 truncate">{vc.title}</p>
                {vc.end_date && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Ends {format(parseISO(vc.end_date), 'MMM d, yyyy')}
                    {vc.notice_period_days ? ` · ${vc.notice_period_days}d notice` : ''}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleAttach} loading={attaching} disabled={!selectedId}>
            Attach Contract
          </Button>
        </div>
      </div>
    </Modal>
  )
}
