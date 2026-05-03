import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, LayoutList, Columns, ChevronRight, Trash2, RotateCcw, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Card from '../components/ui/Card'
import { StageBadge } from '../components/ui/Badge'
import Button from '../components/ui/Button'
import SearchBar from '../components/ui/SearchBar'
import EmptyState from '../components/ui/EmptyState'
import { DEAL_STAGES } from '../lib/constants'
import { fmt } from '../lib/commission'
import { PageSpinner } from '../components/ui/Spinner'
import { clsx } from 'clsx'
import { format } from 'date-fns'

const PAGE_SIZE = 25

function DealCard({ deal, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-white border border-gray-100 rounded-xl p-3.5 text-left hover:border-primary-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm font-semibold text-navy-900 truncate pr-2 leading-tight">{deal.name}</p>
        <ChevronRight size={14} className="text-gray-300 group-hover:text-primary-400 flex-shrink-0 mt-0.5 transition-colors" />
      </div>
      <p className="text-xs text-gray-500 mb-3 truncate">{deal.company_name}</p>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-navy-900">{fmt(deal.acv, 2)}</span>
        <span className="text-xs text-gray-400">{deal.deal_type || 'new'}</span>
      </div>
    </button>
  )
}

function KanbanView({ deals, onDealClick, onStageChange }) {
  async function handleDrop(e, targetStage) {
    const dealId = e.dataTransfer.getData('dealId')
    if (!dealId) return
    await supabase.from('deals').update({ stage: targetStage }).eq('id', dealId)
    onStageChange()
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-[70vh]">
      {DEAL_STAGES.map((stage) => {
        const stageDeals = deals.filter((d) => d.stage === stage.key)
        const stageValue = stageDeals.reduce((s, d) => s + (d.acv || 0), 0)
        return (
          <div
            key={stage.key}
            className="flex-shrink-0 w-64"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, stage.key)}
          >
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <StageBadge stage={stage.key} />
                <span className="text-xs font-medium text-gray-500">{stageDeals.length}</span>
              </div>
              {stageValue > 0 && <p className="text-xs text-gray-400">{fmt(stageValue, 2)}</p>}
            </div>
            <div className="space-y-2 min-h-[200px]">
              {stageDeals.map((deal) => (
                <div key={deal.id} draggable onDragStart={(e) => e.dataTransfer.setData('dealId', deal.id)}>
                  <DealCard deal={deal} onClick={() => onDealClick(deal.id)} />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ListView({ deals, onDealClick, page, setPage }) {
  const totalPages = Math.ceil(deals.length / PAGE_SIZE)
  const paginated = deals.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="space-y-3">
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Deal</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide hidden sm:table-cell">Company</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide hidden md:table-cell">Stage</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide hidden md:table-cell">Type</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">ACV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map((deal) => (
                <tr key={deal.id} onClick={() => onDealClick(deal.id)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-navy-900 truncate max-w-[160px]">{deal.name}</p>
                    <p className="text-xs text-gray-500 sm:hidden">{deal.company_name}</p>
                  </td>
                  <td className="px-4 py-3.5 hidden sm:table-cell text-gray-600 truncate max-w-[160px]">{deal.company_name}</td>
                  <td className="px-4 py-3.5 hidden md:table-cell"><StageBadge stage={deal.stage} /></td>
                  <td className="px-4 py-3.5 hidden md:table-cell text-gray-500 capitalize">{deal.deal_type || 'new'}</td>
                  <td className="px-4 py-3.5 text-right font-semibold text-navy-900">{fmt(deal.acv, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {paginated.length === 0 && (
            <EmptyState title="No deals found" description="Try adjusting your search or filter." />
          )}
        </div>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{deals.length} deals · page {page + 1} of {totalPages}</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRightIcon size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TrashView({ onBack }) {
  const [trashDeals, setTrashDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [restoringId, setRestoringId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  async function load() {
    const { data } = await supabase
      .from('deals')
      .select('id, name, company_name, stage, acv, deleted_at')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
    setTrashDeals(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleRestore(deal) {
    setRestoringId(deal.id)
    await supabase.from('deals').update({ deleted_at: null }).eq('id', deal.id)
    setTrashDeals((prev) => prev.filter((d) => d.id !== deal.id))
    setRestoringId(null)
  }

  async function handlePermanentDelete(deal) {
    setDeletingId(deal.id)
    await supabase.from('deals').delete().eq('id', deal.id)
    setTrashDeals((prev) => prev.filter((d) => d.id !== deal.id))
    setDeletingId(null)
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-primary-500 hover:text-primary-600 font-medium">
          <ChevronLeft size={15} /> Back to Deals
        </button>
        <span className="text-gray-300">·</span>
        <span className="text-sm text-gray-500">{trashDeals.length} deleted deal{trashDeals.length !== 1 ? 's' : ''}</span>
      </div>

      {trashDeals.length === 0 ? (
        <Card>
          <EmptyState title="Trash is empty" description="Deleted deals will appear here and can be restored." />
        </Card>
      ) : (
        <Card padding={false}>
          <div className="divide-y divide-gray-50">
            {trashDeals.map((deal) => (
              <div key={deal.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-navy-900 truncate">{deal.name}</p>
                  <p className="text-xs text-gray-500">{deal.company_name} · deleted {format(new Date(deal.deleted_at), 'MMM d, yyyy')}</p>
                </div>
                <StageBadge stage={deal.stage} />
                <span className="text-sm font-semibold text-navy-900 w-20 text-right">{fmt(deal.acv, 2)}</span>
                <div className="flex gap-1.5 ml-2">
                  <button
                    onClick={() => handleRestore(deal)}
                    disabled={restoringId === deal.id}
                    className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 border border-primary-200 hover:border-primary-300 bg-primary-50 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
                  >
                    <RotateCcw size={11} /> Restore
                  </button>
                  <button
                    onClick={() => handlePermanentDelete(deal)}
                    disabled={deletingId === deal.id}
                    className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 bg-red-50 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={11} /> Delete Forever
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

export default function Deals() {
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [view, setView] = useState('kanban')
  const [page, setPage] = useState(0)
  const [showTrash, setShowTrash] = useState(false)
  const navigate = useNavigate()

  async function load() {
    let { data, error } = await supabase
      .from('deals')
      .select('id, name, company_name, stage, deal_type, acv, total_contract_value, contract_start, contract_months')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    // Fallback if deleted_at column doesn't exist yet (migration pending)
    if (error) {
      const { data: fallback } = await supabase
        .from('deals')
        .select('id, name, company_name, stage, deal_type, acv, total_contract_value, contract_start, contract_months')
        .order('created_at', { ascending: false })
      data = fallback
    }
    setDeals(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    return deals.filter((d) => {
      const matchSearch = !search || d.name?.toLowerCase().includes(search.toLowerCase()) || d.company_name?.toLowerCase().includes(search.toLowerCase())
      const matchStage = stageFilter === 'all' || d.stage === stageFilter
      return matchSearch && matchStage
    })
  }, [deals, search, stageFilter])

  // Reset page when filter changes
  const prevFilter = useMemo(() => `${search}|${stageFilter}`, [search, stageFilter])
  useEffect(() => { setPage(0) }, [prevFilter])

  if (loading) return <PageSpinner />

  if (showTrash) return <TrashView onBack={() => setShowTrash(false)} />

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search deals or companies..."
          className="flex-1"
        />
        <div className="flex gap-2 flex-wrap">
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-navy-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
          >
            <option value="all">All Stages</option>
            {DEAL_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setView('kanban')}
              className={clsx('px-3 py-2.5 text-sm transition-colors', view === 'kanban' ? 'bg-navy-900 text-white' : 'text-gray-500 hover:bg-gray-50')}
            >
              <Columns size={16} />
            </button>
            <button
              onClick={() => setView('list')}
              className={clsx('px-3 py-2.5 text-sm transition-colors', view === 'list' ? 'bg-navy-900 text-white' : 'text-gray-500 hover:bg-gray-50')}
            >
              <LayoutList size={16} />
            </button>
          </div>
          <button
            onClick={() => setShowTrash(true)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-navy-900 border border-gray-200 bg-white rounded-lg px-3 py-2.5 transition-colors"
          >
            <Trash2 size={14} /> Trash
          </button>
          <Button onClick={() => navigate('/deals/new')} icon={<Plus size={15} />}>New Deal</Button>
        </div>
      </div>

      {view === 'kanban' ? (
        <KanbanView deals={filtered} onDealClick={(id) => navigate(`/deals/${id}`)} onStageChange={load} />
      ) : (
        <ListView deals={filtered} onDealClick={(id) => navigate(`/deals/${id}`)} page={page} setPage={setPage} />
      )}
    </div>
  )
}
