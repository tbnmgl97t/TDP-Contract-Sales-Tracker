import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, Handshake, DollarSign, Users, ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Card, { CardHeader } from '../components/ui/Card'
import { StageBadge } from '../components/ui/Badge'
import { DEAL_STAGES } from '../lib/constants'
import { fmt } from '../lib/commission'
import { PageSpinner } from '../components/ui/Spinner'

function StatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className="text-2xl font-bold text-navy-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={19} className="text-white" />
        </div>
      </div>
    </Card>
  )
}

export default function Dashboard() {
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('deals')
        .select('id, name, company_name, stage, acv, total_contract_value, created_at')
        .order('created_at', { ascending: false })
      setDeals(data || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <PageSpinner />

  const activeDeals = deals.filter((d) => d.stage !== 'closed_lost')
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Deals"
          value={activeDeals.length}
          sub={`${deals.length} total`}
          icon={Handshake}
          color="bg-primary-400"
        />
        <StatCard
          label="Pipeline ACV"
          value={fmt(totalPipeline)}
          sub="Annual contract value"
          icon={TrendingUp}
          color="bg-navy-900"
        />
        <StatCard
          label="Contracted"
          value={fmt(totalContracted)}
          sub={`${contracted.length} deals`}
          icon={DollarSign}
          color="bg-accent-400"
        />
        <StatCard
          label="Deal Stages"
          value={stageCounts.filter((s) => s.count > 0).length}
          sub="Active stages"
          icon={Users}
          color="bg-purple-500"
        />
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
                    <div
                      className="h-full bg-primary-400 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm flex-shrink-0">
                  <span className="text-gray-500 w-5 text-right">{s.count}</span>
                  <span className="font-medium text-navy-900 w-20 text-right">{fmt(s.value)}</span>
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
            <button
              onClick={() => navigate('/deals')}
              className="flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600 font-medium"
            >
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
                  <span className="text-primary-600 font-semibold text-sm">
                    {deal.company_name?.[0]?.toUpperCase() || 'D'}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-navy-900 truncate">{deal.name}</p>
                  <p className="text-xs text-gray-500 truncate">{deal.company_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                <StageBadge stage={deal.stage} />
                <span className="text-sm font-semibold text-navy-900">{fmt(deal.acv)}</span>
              </div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}
