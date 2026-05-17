import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { differenceInDays, parseISO, format } from 'date-fns'
import { TrendingUp, Handshake, DollarSign, Users, ArrowRight, Landmark, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Card, { CardHeader } from '../components/ui/Card'
import { StageBadge } from '../components/ui/Badge'
import { DEAL_STAGES } from '../lib/constants'
import { fmt } from '../lib/commission'
import { calcTotalCommission, calcTotalSpif, calcTotalPayout, calcTrilogyNet, computeProductAcv, calcCancelledContributions } from '../lib/deals'
import { getMarginPct } from '../lib/margin'
import { PageSpinner } from '../components/ui/Spinner'
import { useUser } from '../contexts/UserContext'
import EstimatorModal from '../components/EstimatorModal'
import Modal from '../components/ui/Modal'

const RENEWAL_WINDOW_DAYS = 90

const LATE_STAGES = ['proposal', 'negotiation', 'contracted']

function StatCard({ label, value, sub, icon: Icon, color, onClick, clickLabel = 'View details →' }) {
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
        <p className="text-xs text-primary-500 mt-2 font-medium">{clickLabel}</p>
      </button>
    )
  }

  return <Card>{inner}</Card>
}

export default function Dashboard() {
  const [deals, setDeals] = useState([])
  const [trilogyNet, setTrilogyNet] = useState(null)
  const [dealFinancials, setDealFinancials] = useState({})
  const [estRate, setEstRate] = useState(7)
  const [showEstimator, setShowEstimator] = useState(false)
  const [showContracted, setShowContracted] = useState(false)
  const [renewedDealIds, setRenewedDealIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const navigate = useNavigate()
  const { isManager } = useUser()

  useEffect(() => {
    async function load() {
      let { data, error: err } = await supabase
        .from('deals')
        .select('id, name, company_name, stage, acv, total_contract_value, contract_months, created_at, contract_end')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (err) {
        const { data: fallback, error: err2 } = await supabase
          .from('deals')
          .select('id, name, company_name, stage, acv, total_contract_value, contract_months, created_at, contract_end')
          .order('created_at', { ascending: false })
        if (err2) { setError('Failed to load dashboard data. Please refresh.'); setLoading(false); return }
        data = fallback
      }
      setDeals(data || [])

      // Load which contracted deals already have a renewal in flight
      const contractedIds = (data || []).filter((d) => d.stage === 'contracted').map((d) => d.id)
      if (contractedIds.length > 0) {
        const { data: renewals } = await supabase
          .from('deals')
          .select('predecessor_deal_id')
          .in('predecessor_deal_id', contractedIds)
          .is('deleted_at', null)
        setRenewedDealIds(new Set((renewals || []).map((r) => r.predecessor_deal_id).filter(Boolean)))
      }

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
              .select('deal_id, commission_metric, annual_value, yearly_cost, monthly_cost, net_revenue, cogs_amount, commission_amount, status, billing_months')
              .in('deal_id', lateIds),
            supabase.from('deal_team')
              .select('deal_id, role, spif_amount')
              .in('deal_id', contractedIds),
          ])

          const dealMap = Object.fromEntries((data || []).map((d) => [d.id, d]))
          const finMap = {}
          for (const id of lateIds) {
            const dps = (products || []).filter((p) => p.deal_id === id)
            const activeDps = dps.filter((p) => p.status !== 'cancelled')
            const contractMonths = dealMap[id]?.contract_months || 12
            const cancelled = calcCancelledContributions(dps, contractMonths)
            finMap[id] = {
              commission: calcTotalCommission(dps),
              dealAcv: computeProductAcv(activeDps) + cancelled.revenue,
              cogs: activeDps.reduce((s, p) => s + (p.cogs_amount || 0), 0),
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

  const upcomingRenewals = useMemo(() => {
    const today = new Date()
    return deals
      .filter((d) => d.stage === 'contracted' && d.contract_end)
      .map((d) => ({ ...d, daysLeft: differenceInDays(parseISO(d.contract_end), today) }))
      .filter((d) => d.daysLeft >= 0 && d.daysLeft <= RENEWAL_WINDOW_DAYS)
      .sort((a, b) => a.daysLeft - b.daysLeft)
  }, [deals])

  if (loading) return <PageSpinner />
  if (error) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <p className="text-sm font-medium text-red-600">{error}</p>
      <button onClick={() => window.location.reload()} className="text-xs text-primary-500 hover:text-primary-600 underline">Refresh</button>
    </div>
  )

  const activeDeals = deals.filter((d) => !['closed_lost', 'closed_won', 'contracted'].includes(d.stage))
  const contracted = deals.filter((d) => d.stage === 'contracted')

  // Use product-computed ACV from dealFinancials where available (proposal/negotiation/contracted);
  // fall back to manually-entered d.acv for early stages (lead/qualified/discovery)
  const dealAcv = (d) => dealFinancials[d.id]?.dealAcv ?? d.acv ?? 0

  const totalPipeline = activeDeals.reduce((s, d) => s + dealAcv(d), 0)
  const totalContracted = contracted.reduce((s, d) => s + dealAcv(d), 0)
  const recentDeals = deals.slice(0, 6)

  const stageCounts = DEAL_STAGES.filter((s) => !['closed_lost', 'closed_won'].includes(s.key)).map((s) => ({
    ...s,
    count: deals.filter((d) => d.stage === s.key).length,
    value: deals.filter((d) => d.stage === s.key).reduce((sum, d) => sum + dealAcv(d), 0),
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
          clickLabel="View estimator →"
        />
        <StatCard label="Contracted ACV" value={fmt(totalContracted, 2)} sub={`${contracted.length} deals`} icon={DollarSign} color="bg-accent-400" onClick={() => setShowContracted(true)} clickLabel="View ACV breakdown →" />
        <StatCard label="Deal Stages" value={stageCounts.filter((s) => s.count > 0).length} sub="Active stages" icon={Users} color="bg-purple-500" />
        {isManager && trilogyNet !== null && (
          <StatCard label="Trilogy Take-Home" value={fmt(trilogyNet, 2)} sub="Contracted · net of COGS & payouts" icon={Landmark} color="bg-teal-500" />
        )}
      </div>

      {/* Pipeline by stage */}
      <Card>
        <CardHeader title="Pipeline by Stage" />
        <div className="space-y-3">
          <div className="flex items-center gap-3 pb-1 border-b border-gray-50">
            <div className="w-24 flex-shrink-0" />
            <div className="flex-1 mx-2" />
            <div className="flex items-center gap-3 text-xs flex-shrink-0 text-gray-400 uppercase tracking-wide font-semibold">
              <span className="w-5 text-right">#</span>
              <span className="w-20 text-right">ACV</span>
            </div>
          </div>
          {stageCounts.map((s) => {
            const allValues = stageCounts.map((sc) => sc.value)
            const maxValue = Math.max(...allValues, 1)
            const pct = (s.value / maxValue) * 100
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

      {/* Upcoming renewals */}
      {upcomingRenewals.length > 0 && (
        <Card>
          <CardHeader title="Upcoming Renewals" subtitle={`${upcomingRenewals.length} contract${upcomingRenewals.length !== 1 ? 's' : ''} expiring within ${RENEWAL_WINDOW_DAYS} days`} />
          <div className="divide-y divide-gray-50">
            {upcomingRenewals.map((d) => {
              const urgent = d.daysLeft <= 30
              const soon   = d.daysLeft <= 60
              const dotColor  = urgent ? 'bg-red-400'    : soon ? 'bg-amber-400'    : 'bg-green-400'
              const badgeCls  = urgent ? 'bg-red-50 text-red-600' : soon ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'
              const hasRenewal = renewedDealIds.has(d.id)
              const fin = dealFinancials[d.id]
              const displayAcv = fin?.dealAcv || d.acv || 0
              const marginPct = fin ? (getMarginPct(fin.dealAcv, fin.cogs) ?? null) * 100 : null
              return (
                <div
                  key={d.id}
                  className="flex items-center gap-3 py-3 -mx-4 px-4"
                >
                  <button
                    onClick={() => navigate(`/deals/${d.id}`)}
                    className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-75 transition-opacity text-left"
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-navy-900 truncate">{d.name}</p>
                      <p className="text-xs text-gray-400 truncate">{d.company_name}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-navy-900">{fmt(displayAcv, 0)}<span className="text-xs font-normal text-gray-400"> /yr</span></p>
                      <p className="text-xs text-gray-400">
                        {format(parseISO(d.contract_end), 'MMM d, yyyy')}
                        {isManager && marginPct != null && (
                          <span className={`ml-2 font-medium ${marginPct >= 30 ? 'text-green-600' : marginPct >= 15 ? 'text-amber-500' : 'text-red-500'}`}>
                            · {marginPct.toFixed(1)}% margin
                          </span>
                        )}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${badgeCls}`}>
                      {d.daysLeft === 0 ? 'Today' : `${d.daysLeft}d`}
                    </span>
                  </button>
                  {isManager && (
                    hasRenewal
                      ? <span className="text-xs text-primary-500 font-medium flex-shrink-0">Renewal in progress</span>
                      : (
                        <button
                          onClick={() => navigate(`/deals/${d.id}`, { state: { openRenewal: true } })}
                          className="flex items-center gap-1 text-xs font-medium text-primary-500 hover:text-primary-600 transition-colors flex-shrink-0 whitespace-nowrap"
                        >
                          <RefreshCw size={11} /> Start Renewal
                        </button>
                      )
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

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
                <span className="text-sm font-semibold text-navy-900">{fmt(dealAcv(deal), 2)}</span>
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

      <Modal open={showContracted} onClose={() => setShowContracted(false)} title="Contracted ACV Breakdown" size="sm">
        <div className="space-y-1">
          {[...contracted]
            .sort((a, b) => (dealFinancials[b.id]?.dealAcv ?? b.acv ?? 0) - (dealFinancials[a.id]?.dealAcv ?? a.acv ?? 0))
            .map((d) => {
              const dealAcv = dealFinancials[d.id]?.dealAcv ?? d.acv ?? 0
              return (
                <button
                  key={d.id}
                  onClick={() => { setShowContracted(false); navigate(`/deals/${d.id}`) }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left group"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy-900 truncate">{d.name}</p>
                    <p className="text-xs text-gray-400">{d.company_name}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span className="text-sm font-semibold text-navy-900">{fmt(dealAcv, 2)}</span>
                    <ArrowRight size={13} className="text-gray-300 group-hover:text-primary-400 transition-colors" />
                  </div>
                </button>
              )
            })}
          <div className="border-t border-gray-100 mt-2 pt-3 flex justify-between px-3">
            <span className="text-sm font-semibold text-gray-500">Total</span>
            <span className="text-sm font-bold text-navy-900">{fmt(totalContracted, 2)}</span>
          </div>
        </div>
      </Modal>
    </div>
  )
}
