import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, Handshake, DollarSign, Users, ArrowRight, Landmark, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Card, { CardHeader } from '../components/ui/Card'
import { StageBadge } from '../components/ui/Badge'
import { DEAL_STAGES } from '../lib/constants'
import { fmt } from '../lib/commission'
import { calcTotalCommission, calcTotalSpif, calcTotalPayout, calcTrilogyNet, calcEstimatedCommission } from '../lib/deals'
import { getMarginPct } from '../lib/margin'
import { PageSpinner } from '../components/ui/Spinner'
import { useUser } from '../contexts/UserContext'

const EARLY_STAGES = ['lead', 'qualified', 'discovery']
const LATE_STAGES = ['proposal', 'negotiation', 'contracted']

function StatCard({ label, value, sub, icon: Icon, color, onClick }) {
  const inner = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-navy-900 mt-1 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={19} className="text-white" />
      </div>
    </div>
  )

  if (onClick) {
    return (
      <button onClick={onClick} className="w-full text-left rounded-2xl bg-white border border-gray-100 p-4 hover:border-primary-300 hover:shadow-sm transition-all">
        {inner}
        <p className="text-xs text-primary-500 mt-2 font-medium">View estimator →</p>
      </button>
    )
  }

  return <Card>{inner}</Card>
}

function EstimatorModal({ deals, dealFinancials, estRate, setEstRate, onClose }) {
  const activeDeals = deals.filter((d) => d.stage !== 'closed_lost' && d.stage !== 'contracted')

  const stageRows = DEAL_STAGES.filter((s) => s.key !== 'closed_lost' && s.key !== 'contracted').map((s) => {
    const isEarly = EARLY_STAGES.includes(s.key)
    const stageDeals = activeDeals.filter((d) => d.stage === s.key)
    const acv = stageDeals.reduce((sum, d) => sum + (d.acv || 0), 0)
    const fin = stageDeals.reduce(
      (acc, d) => {
        const f = dealFinancials[d.id]
        return {
          commission: acc.commission + (f?.commission || 0),
          dealAcv: acc.dealAcv + (f?.dealAcv || 0),
          cogs: acc.cogs + (f?.cogs || 0),
        }
      },
      { commission: 0, dealAcv: 0, cogs: 0 }
    )
    const commission = isEarly ? calcEstimatedCommission(acv, estRate) : fin.commission
    const marginPct = !isEarly ? getMarginPct(fin.dealAcv, fin.cogs) : null
    return { key: s.key, label: s.label, count: stageDeals.length, acv, commission, marginPct, isEarly }
  })

  const earlyRows = stageRows.filter((r) => EARLY_STAGES.includes(r.key))
  const lateRows = stageRows.filter((r) => LATE_STAGES.includes(r.key))
  const earlyCommission = earlyRows.reduce((s, r) => s + r.commission, 0)
  const lateCommission = lateRows.reduce((s, r) => s + r.commission, 0)
  const totalAcv = stageRows.reduce((s, r) => s + r.acv, 0)
  const totalCommission = earlyCommission + lateCommission

  function SectionRows({ rows, isEarly }) {
    return rows.map((row) => (
      <tr key={row.key} className={row.count === 0 ? 'opacity-35' : ''}>
        <td className="py-2.5 pl-2"><StageBadge stage={row.key} /></td>
        <td className="py-2.5 text-right text-gray-500 tabular-nums">{row.count}</td>
        <td className="py-2.5 text-right text-gray-700 tabular-nums">{row.acv > 0 ? fmt(row.acv, 2) : '—'}</td>
        <td className="py-2.5 text-right tabular-nums">
          {row.commission > 0 ? (
            <>
              <span className={isEarly ? 'text-amber-600' : 'text-indigo-700'}>{fmt(row.commission, 2)}</span>
              <span className="text-gray-300 text-xs ml-1">{isEarly ? 'est.' : 'actual'}</span>
            </>
          ) : '—'}
        </td>
        <td className="py-2.5 text-right tabular-nums">
          {row.marginPct != null ? (
            <span className={row.marginPct >= 0.30 ? 'text-teal-600' : row.marginPct >= 0.15 ? 'text-amber-600' : 'text-red-500'}>
              {(row.marginPct * 100).toFixed(1)}%
            </span>
          ) : <span className="text-gray-300 text-xs">—</span>}
        </td>
      </tr>
    ))
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-semibold text-navy-900">Margin & Commission Estimator</h3>
            <p className="text-xs text-gray-400 mt-0.5">Early-stage deals use estimated rate · Proposal+ use actual data</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Rate input */}
        <div className="px-6 pt-4 pb-2 flex items-center gap-3">
          <span className="text-sm text-gray-500">Est. commission rate for early-stage deals</span>
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden ml-auto">
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={estRate}
              onChange={(e) => setEstRate(parseFloat(e.target.value) || 0)}
              className="w-14 px-2 py-1.5 text-sm text-right text-navy-900 focus:outline-none"
            />
            <span className="px-2 py-1.5 text-gray-400 text-sm bg-gray-50 border-l border-gray-200">%</span>
          </div>
        </div>

        {/* Table */}
        <div className="px-6 pb-6 overflow-x-auto">
          <table className="w-full text-sm min-w-[460px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left pb-2 pl-2 font-medium text-gray-400 text-xs uppercase tracking-wide">Stage</th>
                <th className="text-right pb-2 font-medium text-gray-400 text-xs uppercase tracking-wide">Deals</th>
                <th className="text-right pb-2 font-medium text-gray-400 text-xs uppercase tracking-wide">ACV</th>
                <th className="text-right pb-2 font-medium text-gray-400 text-xs uppercase tracking-wide">Commission</th>
                <th className="text-right pb-2 font-medium text-gray-400 text-xs uppercase tracking-wide">Margin</th>
              </tr>
            </thead>
            <tbody>
              <SectionRows rows={earlyRows} isEarly={true} />
              <tr>
                <td colSpan={5} className="pt-1 pb-1">
                  <div className="border-t border-dashed border-gray-200" />
                </td>
              </tr>
              <SectionRows rows={lateRows} isEarly={false} />
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200">
                <td className="pt-3 pl-2 font-semibold text-gray-900 text-xs uppercase tracking-wide">Total</td>
                <td className="pt-3 text-right font-semibold text-gray-700 tabular-nums">{activeDeals.length}</td>
                <td className="pt-3 text-right font-semibold text-gray-900 tabular-nums">{fmt(totalAcv, 2)}</td>
                <td className="pt-3 text-right font-bold text-navy-900 tabular-nums">{fmt(totalCommission, 2)}</td>
                <td className="pt-3 text-right text-gray-300 text-xs">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function Dashboard() {
  const [deals, setDeals] = useState([])
  const [trilogyNet, setTrilogyNet] = useState(null)
  const [dealFinancials, setDealFinancials] = useState({})
  const [estRate, setEstRate] = useState(7)
  const [showEstimator, setShowEstimator] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const navigate = useNavigate()
  const { isManager } = useUser()

  useEffect(() => {
    async function load() {
      let { data, error: err } = await supabase
        .from('deals')
        .select('id, name, company_name, stage, acv, total_contract_value, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (err) {
        const { data: fallback, error: err2 } = await supabase
          .from('deals')
          .select('id, name, company_name, stage, acv, total_contract_value, created_at')
          .order('created_at', { ascending: false })
        if (err2) { setError('Failed to load dashboard data. Please refresh.'); setLoading(false); return }
        data = fallback
      }
      setDeals(data || [])

      // Seed estimator rate from global commission settings
      const { data: settings } = await supabase.from('commission_settings').select('global_commission_rate').eq('id', 1).single()
      if (settings?.global_commission_rate) {
        setEstRate(parseFloat((parseFloat(settings.global_commission_rate) * 100).toFixed(2)))
      }

      if (isManager) {
        const lateIds = (data || []).filter((d) => LATE_STAGES.includes(d.stage)).map((d) => d.id)
        const contractedIds = (data || []).filter((d) => d.stage === 'contracted').map((d) => d.id)

        if (lateIds.length > 0) {
          const [{ data: products }, { data: team }] = await Promise.all([
            supabase.from('deal_products')
              .select('deal_id, commission_metric, annual_value, yearly_cost, net_revenue, cogs_amount, commission_amount')
              .in('deal_id', lateIds),
            supabase.from('deal_team')
              .select('deal_id, role, spif_amount')
              .in('deal_id', contractedIds),
          ])

          const finMap = {}
          for (const id of lateIds) {
            const dps = (products || []).filter((p) => p.deal_id === id)
            const dealAcv = dps.reduce((s, p) => {
              if (p.commission_metric === 'GM') return s + (p.yearly_cost || ((p.net_revenue || 0) + (p.cogs_amount || 0)))
              return s + (p.annual_value || 0)
            }, 0)
            finMap[id] = {
              commission: calcTotalCommission(dps),
              dealAcv,
              cogs: dps.reduce((s, p) => s + (p.cogs_amount || 0), 0),
            }
          }
          setDealFinancials(finMap)

          let net = 0
          for (const id of contractedIds) {
            const f = finMap[id]
            if (!f) continue
            const spif = calcTotalSpif((team || []).filter((t) => t.deal_id === id && t.role === 'support'))
            net += calcTrilogyNet(f.dealAcv, f.cogs, calcTotalPayout(f.commission, spif))
          }
          setTrilogyNet(net)
        } else {
          setTrilogyNet(0)
          setDealFinancials({})
        }
      }

      setLoading(false)
    }
    load()
  }, [isManager])

  if (loading) return <PageSpinner />
  if (error) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <p className="text-sm font-medium text-red-600">{error}</p>
      <button onClick={() => window.location.reload()} className="text-xs text-primary-500 hover:text-primary-600 underline">Refresh</button>
    </div>
  )

  const activeDeals = deals.filter((d) => d.stage !== 'closed_lost' && d.stage !== 'contracted')
  const contracted = deals.filter((d) => d.stage === 'contracted')
  const totalPipeline = activeDeals.reduce((s, d) => s + (d.acv || 0), 0)
  const totalContracted = contracted.reduce((s, d) => s + (d.total_contract_value || d.acv || 0), 0)
  const recentDeals = deals.slice(0, 6)

  const stageCounts = DEAL_STAGES.filter((s) => s.key !== 'closed_lost').map((s) => ({
    ...s,
    count: deals.filter((d) => d.stage === s.key).length,
    value: deals.filter((d) => d.stage === s.key).reduce((sum, d) => sum + (d.acv || 0), 0),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-navy-900">Welcome back</h2>
        <p className="text-sm text-gray-500 mt-0.5">Here's what's happening with your pipeline.</p>
      </div>

      {/* Stats */}
      <div className={`grid grid-cols-2 ${isManager ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4`}>
        <StatCard label="Active Deals" value={activeDeals.length} sub={`${deals.length} total`} icon={Handshake} color="bg-primary-400" />
        <StatCard
          label="Pipeline ACV"
          value={fmt(totalPipeline, 2)}
          sub="Annual contract value"
          icon={TrendingUp}
          color="bg-navy-900"
          onClick={isManager ? () => setShowEstimator(true) : undefined}
        />
        <StatCard label="Contracted" value={fmt(totalContracted, 2)} sub={`${contracted.length} deals`} icon={DollarSign} color="bg-accent-400" />
        <StatCard label="Deal Stages" value={stageCounts.filter((s) => s.count > 0).length} sub="Active stages" icon={Users} color="bg-purple-500" />
        {isManager && trilogyNet !== null && (
          <StatCard label="Trilogy Take-Home" value={fmt(trilogyNet, 2)} sub="Contracted · net of COGS & payouts" icon={Landmark} color="bg-teal-500" />
        )}
      </div>

      {/* Pipeline by stage */}
      <Card>
        <CardHeader title="Pipeline by Stage" />
        <div className="space-y-3">
          {stageCounts.map((s) => {
            const pct = totalPipeline > 0 ? (s.value / totalPipeline) * 100 : 0
            return (
              <div key={s.key} className="flex items-center gap-3">
                <StageBadge stage={s.key} />
                <div className="flex-1 mx-2">
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm flex-shrink-0">
                  <span className="text-gray-500 w-5 text-right">{s.count}</span>
                  <span className="font-medium text-navy-900 w-20 text-right">{fmt(s.value, 2)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Recent deals */}
      <Card>
        <CardHeader
          title="Recent Deals"
          action={
            <button onClick={() => navigate('/deals')} className="flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600 font-medium">
              View all <ArrowRight size={14} />
            </button>
          }
        />
        <div className="space-y-2">
          {recentDeals.length === 0 && (
            <p className="text-sm text-gray-400 py-4 text-center">No deals yet. Create your first deal!</p>
          )}
          {recentDeals.map((deal) => (
            <button
              key={deal.id}
              onClick={() => navigate(`/deals/${deal.id}`)}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors text-left group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-600 font-semibold text-sm">{deal.company_name?.[0]?.toUpperCase() || 'D'}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-navy-900 truncate">{deal.name}</p>
                  <p className="text-xs text-gray-500 truncate">{deal.company_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                <StageBadge stage={deal.stage} />
                <span className="text-sm font-semibold text-navy-900">{fmt(deal.acv, 2)}</span>
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Estimator modal */}
      {showEstimator && (
        <EstimatorModal
          deals={deals}
          dealFinancials={dealFinancials}
          estRate={estRate}
          setEstRate={setEstRate}
          onClose={() => setShowEstimator(false)}
        />
      )}
    </div>
  )
}
