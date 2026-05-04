import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import Card, { CardHeader } from '../components/ui/Card'
import { StageBadge } from '../components/ui/Badge'
import { DEAL_STAGES } from '../lib/constants'
import { fmt } from '../lib/commission'
import { PageSpinner } from '../components/ui/Spinner'

const PAGE_MONTHS = 6

export default function Analytics() {
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('deals')
      .select('id, name, company_name, stage, acv, deal_type, created_at')
      .is('deleted_at', null)
      .then(({ data, error }) => {
        if (error) {
          // Fallback if deleted_at column doesn't exist yet
          return supabase.from('deals').select('id, name, company_name, stage, acv, deal_type, created_at')
            .then(({ data: fallback }) => { setDeals(fallback || []); setLoading(false) })
        }
        setDeals(data || [])
        setLoading(false)
      })
  }, [])

  const stats = useMemo(() => {
    const contracted = deals.filter((d) => d.stage === 'contracted')
    const closedLost = deals.filter((d) => d.stage === 'closed_lost')
    const active = deals.filter((d) => d.stage !== 'closed_lost' && d.stage !== 'contracted')
    const total = contracted.length + closedLost.length
    const winRate = total > 0 ? (contracted.length / total) * 100 : 0
    const avgAcv = active.length > 0 ? active.reduce((s, d) => s + (d.acv || 0), 0) / active.length : 0
    const pipeline = active.reduce((s, d) => s + (d.acv || 0), 0)

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const closedThisMonth = contracted.filter((d) => d.created_at && new Date(d.created_at) >= monthStart).length

    return { winRate, avgAcv, pipeline, closedThisMonth, contracted: contracted.length, closedLost: closedLost.length, active: active.length }
  }, [deals])

  const stageData = useMemo(() =>
    DEAL_STAGES.map((s) => ({
      ...s,
      count: deals.filter((d) => d.stage === s.key).length,
      value: deals.filter((d) => d.stage === s.key).reduce((sum, d) => sum + (d.acv || 0), 0),
    })), [deals])

  const monthlyData = useMemo(() => {
    const now = new Date()
    return Array.from({ length: PAGE_MONTHS }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (PAGE_MONTHS - 1) + i, 1)
      const yr = d.getFullYear()
      const mo = d.getMonth()
      const count = deals.filter((deal) => {
        if (!deal.created_at) return false
        const c = new Date(deal.created_at)
        return c.getFullYear() === yr && c.getMonth() === mo
      }).length
      return { label: d.toLocaleString('default', { month: 'short' }), yr, mo, count }
    })
  }, [deals])

  const maxMonthCount = Math.max(...monthlyData.map((m) => m.count), 1)

  const topCompanies = useMemo(() => {
    const map = {}
    deals.filter((d) => d.stage !== 'closed_lost' && d.stage !== 'contracted').forEach((d) => {
      const co = d.company_name || 'Unknown'
      if (!map[co]) map[co] = { name: co, count: 0, value: 0 }
      map[co].count++
      map[co].value += d.acv || 0
    })
    return Object.values(map).sort((a, b) => b.value - a.value).slice(0, 5)
  }, [deals])

  const typeBreakdown = useMemo(() => {
    const newDeals = deals.filter((d) => d.deal_type !== 'renewal' && d.stage !== 'closed_lost' && d.stage !== 'contracted')
    const renewals = deals.filter((d) => d.deal_type === 'renewal' && d.stage !== 'closed_lost' && d.stage !== 'contracted')
    return { new: newDeals.length, renewals: renewals.length, newValue: newDeals.reduce((s, d) => s + (d.acv || 0), 0), renewalValue: renewals.reduce((s, d) => s + (d.acv || 0), 0) }
  }, [deals])

  const maxStageValue = Math.max(...stageData.map((s) => s.value), 1)

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-navy-900">Pipeline Analytics</h2>
        <p className="text-sm text-gray-500 mt-0.5">Deal performance and pipeline health overview.</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Win Rate', value: `${stats.winRate.toFixed(0)}%`, sub: `${stats.contracted} won · ${stats.closedLost} lost` },
          { label: 'Avg Deal ACV', value: fmt(stats.avgAcv, 0), sub: `across ${stats.active} active deals` },
          { label: 'Pipeline Value', value: fmt(stats.pipeline, 0), sub: 'total active ACV' },
          { label: 'Contracted This Month', value: stats.closedThisMonth, sub: 'new deals contracted' },
        ].map(({ label, value, sub }) => (
          <Card key={label}>
            <p className="text-sm text-gray-500 font-medium">{label}</p>
            <p className="text-2xl font-bold text-navy-900 mt-1">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Pipeline funnel */}
        <Card>
          <CardHeader title="Pipeline by Stage" />
          <div className="space-y-3">
            {stageData.map((s) => {
              const pct = maxStageValue > 0 ? (s.value / maxStageValue) * 100 : 0
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <StageBadge stage={s.key} />
                  <div className="flex-1 mx-1">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm flex-shrink-0">
                    <span className="text-gray-400 w-4 text-right text-xs">{s.count}</span>
                    <span className="font-medium text-navy-900 w-20 text-right">{s.value > 0 ? fmt(s.value, 0) : '—'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Deal type breakdown */}
        <Card>
          <CardHeader title="New Business vs Renewals" subtitle="Active pipeline only" />
          <div className="space-y-4">
            {[
              { label: 'New Business', count: typeBreakdown.new, value: typeBreakdown.newValue, color: 'bg-primary-400' },
              { label: 'Renewals', count: typeBreakdown.renewals, value: typeBreakdown.renewalValue, color: 'bg-navy-600' },
            ].map(({ label, count, value, color }) => {
              const total = typeBreakdown.new + typeBreakdown.renewals
              const pct = total > 0 ? (count / total) * 100 : 0
              return (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                      <span className="text-sm font-medium text-navy-900">{label}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-navy-900">{count}</span>
                      <span className="text-xs text-gray-400 ml-2">{fmt(value, 0)}</span>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
            {(typeBreakdown.new + typeBreakdown.renewals) === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No active deals.</p>
            )}
          </div>
        </Card>
      </div>

      {/* Monthly trend */}
      <Card>
        <CardHeader title="Monthly Deal Activity" subtitle={`Deals created — past ${PAGE_MONTHS} months`} />
        <div className="flex items-end gap-3 h-32 pt-2">
          {monthlyData.map((m) => {
            const heightPct = maxMonthCount > 0 ? (m.count / maxMonthCount) * 100 : 0
            return (
              <div key={`${m.yr}-${m.mo}`} className="flex-1 flex flex-col items-center gap-1.5 h-full">
                <div className="flex-1 w-full flex items-end">
                  <div
                    className="w-full bg-primary-400 rounded-t-md transition-all min-h-[2px]"
                    style={{ height: `${Math.max(heightPct, m.count > 0 ? 4 : 2)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 font-medium">{m.label}</p>
                <p className="text-xs text-gray-400">{m.count}</p>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Top companies */}
      <Card>
        <CardHeader title="Top Companies by Pipeline" subtitle="Active deals only" />
        {topCompanies.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No pipeline data.</p>
        ) : (
          <div className="space-y-2">
            {topCompanies.map((co, i) => {
              const pct = topCompanies[0].value > 0 ? (co.value / topCompanies[0].value) * 100 : 0
              return (
                <div key={co.name} className="flex items-center gap-3">
                  <span className="w-5 text-xs font-bold text-gray-400 flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-navy-900 truncate">{co.name}</p>
                      <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                        <span className="text-xs text-gray-400">{co.count} deal{co.count !== 1 ? 's' : ''}</span>
                        <span className="text-sm font-bold text-navy-900">{fmt(co.value, 0)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
