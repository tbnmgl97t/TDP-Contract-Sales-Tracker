import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { DollarSign, TrendingUp, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Card, { CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { buildCommissionSchedule, fmt } from '../lib/commission'
import { PageSpinner } from '../components/ui/Spinner'
import { clsx } from 'clsx'

const QUARTERS = [1, 2, 3, 4]
const NOW = new Date()
const CURRENT_YEAR = NOW.getFullYear()
const CURRENT_Q = Math.floor(NOW.getMonth() / 3) + 1

export default function Commission() {
  const [deals, setDeals] = useState([])
  const [dealProducts, setDealProducts] = useState([])
  const [dealTeams, setDealTeams] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR)
  const [selectedQ, setSelectedQ] = useState(CURRENT_Q)
  const navigate = useNavigate()

  useEffect(() => {
    async function load() {
      const [
        { data: d },
        { data: dps },
        { data: teams },
        { data: peeps },
      ] = await Promise.all([
        supabase.from('deals').select('*').eq('is_tbn_property', false),
        supabase.from('deal_products').select('*'),
        supabase.from('deal_team').select('*, people(name, role)'),
        supabase.from('people').select('*').order('name'),
      ])
      setDeals(d || [])
      setDealProducts(dps || [])
      setDealTeams(teams || [])
      setPeople(peeps || [])
      setLoading(false)
    }
    load()
  }, [])

  const schedule = useMemo(() => {
    if (!deals.length) return []
    const all = []
    deals
      .filter((d) => d.stage === 'contracted' || d.stage === 'proposal' || d.stage === 'negotiation')
      .forEach((deal) => {
        const prods = dealProducts.filter((p) => p.deal_id === deal.id)
        const team = dealTeams
          .filter((m) => m.deal_id === deal.id)
          .map((m) => ({ ...m, person_name: m.people?.name }))
        const entries = buildCommissionSchedule(deal, prods, team)
        entries.forEach((e) => all.push({ ...e, deal_id: deal.id, deal_name: deal.name, company: deal.company_name }))
      })
    return all
  }, [deals, dealProducts, dealTeams])

  const quarterEntries = useMemo(() =>
    schedule.filter((e) => e.year === selectedYear && e.quarter === selectedQ),
    [schedule, selectedYear, selectedQ]
  )

  const byPerson = useMemo(() => {
    const map = {}
    quarterEntries.forEach((e) => {
      if (!map[e.person_id]) map[e.person_id] = { person_id: e.person_id, name: e.person_name, commission: 0, spif: 0, entries: [] }
      if (e.type === 'commission') map[e.person_id].commission += e.amount
      if (e.type === 'spif') map[e.person_id].spif += e.amount
      map[e.person_id].entries.push(e)
    })
    return Object.values(map).sort((a, b) => (b.commission + b.spif) - (a.commission + a.spif))
  }, [quarterEntries])

  const totalCommission = byPerson.reduce((s, p) => s + p.commission, 0)
  const totalSpif = byPerson.reduce((s, p) => s + p.spif, 0)

  const years = Array.from({ length: 3 }, (_, i) => CURRENT_YEAR - 1 + i)

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-navy-900">Commission Dashboard</h2>
        <p className="text-sm text-gray-500 mt-0.5">Quarterly commission breakdown based on contracted deals.</p>
      </div>

      {/* Quarter selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-400 text-navy-900"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden">
          {QUARTERS.map((q) => (
            <button
              key={q}
              onClick={() => setSelectedQ(q)}
              className={clsx(
                'px-5 py-2.5 text-sm font-medium transition-colors',
                selectedQ === q ? 'bg-navy-900 text-white' : 'text-gray-500 hover:bg-gray-50'
              )}
            >
              Q{q}
            </button>
          ))}
        </div>
        {selectedYear === CURRENT_YEAR && selectedQ === CURRENT_Q && (
          <Badge color="green">Current Quarter</Badge>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <p className="text-xs text-gray-500 mb-1">Total Commission</p>
          <p className="text-2xl font-bold text-navy-900">{fmt(totalCommission)}</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500 mb-1">Total SPIFs</p>
          <p className="text-2xl font-bold text-accent-500">{fmt(totalSpif)}</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500 mb-1">Total Payout</p>
          <p className="text-2xl font-bold text-primary-500">{fmt(totalCommission + totalSpif)}</p>
        </Card>
      </div>

      {/* By person */}
      {byPerson.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <DollarSign size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500">No commission data for {selectedYear} Q{selectedQ}</p>
            <p className="text-xs text-gray-400 mt-1">Commission is calculated for contracted deals only.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {byPerson.map((person) => {
            const total = person.commission + person.spif
            const dealBreakdown = {}
            person.entries.forEach((e) => {
              const key = e.deal_id
              if (!dealBreakdown[key]) dealBreakdown[key] = { deal_id: e.deal_id, deal_name: e.deal_name, company: e.company, commission: 0, spif: 0 }
              if (e.type === 'commission') dealBreakdown[key].commission += e.amount
              if (e.type === 'spif') dealBreakdown[key].spif += e.amount
            })
            return (
              <Card key={person.person_id}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold">
                      {person.name?.[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-navy-900">{person.name}</p>
                      <div className="flex gap-2 mt-0.5">
                        {person.commission > 0 && <Badge color="green">Commission: {fmt(person.commission)}</Badge>}
                        {person.spif > 0 && <Badge color="yellow">SPIF: {fmt(person.spif)}</Badge>}
                      </div>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-navy-900">{fmt(total)}</p>
                </div>

                {/* Deal breakdown */}
                <div className="border-t border-gray-100 pt-3 space-y-2">
                  {Object.values(dealBreakdown).map((db) => (
                    <button
                      key={db.deal_id}
                      onClick={() => navigate(`/deals/${db.deal_id}`)}
                      className="w-full flex items-center justify-between py-2 text-sm hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors"
                    >
                      <div className="text-left">
                        <p className="font-medium text-navy-900">{db.deal_name}</p>
                        <p className="text-xs text-gray-400">{db.company}</p>
                      </div>
                      <div className="flex gap-3 items-center">
                        {db.commission > 0 && <span className="text-primary-600 font-medium">{fmt(db.commission)}</span>}
                        {db.spif > 0 && <span className="text-accent-600 font-medium">+{fmt(db.spif)} SPIF</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Annual view */}
      <Card>
        <CardHeader title="Annual Commission Overview" subtitle={`${selectedYear} — all quarters`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">Person</th>
                {QUARTERS.map((q) => (
                  <th key={q} className={clsx('text-right py-2.5 font-medium text-xs uppercase tracking-wide', q === selectedQ ? 'text-primary-600' : 'text-gray-500')}>Q{q}</th>
                ))}
                <th className="text-right py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {people.filter((p) => p.role !== 'management').map((person) => {
                const qTotals = QUARTERS.map((q) => {
                  const entries = schedule.filter((e) => e.person_id === person.id && e.year === selectedYear && e.quarter === q)
                  return entries.reduce((s, e) => s + (e.amount || 0), 0)
                })
                const yearTotal = qTotals.reduce((s, v) => s + v, 0)
                if (yearTotal === 0) return null
                return (
                  <tr key={person.id} className="hover:bg-gray-50">
                    <td className="py-3 font-medium text-navy-900">{person.name}</td>
                    {qTotals.map((qt, i) => (
                      <td key={i} className={clsx('py-3 text-right', QUARTERS[i] === selectedQ ? 'font-bold text-primary-600' : 'text-gray-700', qt === 0 ? 'text-gray-300' : '')}>
                        {qt > 0 ? fmt(qt) : '—'}
                      </td>
                    ))}
                    <td className="py-3 text-right font-bold text-navy-900">{fmt(yearTotal)}</td>
                  </tr>
                )
              }).filter(Boolean)}
            </tbody>
          </table>
          {people.every((p) => {
            const qs = QUARTERS.map((q) => schedule.filter((e) => e.person_id === p.id && e.year === selectedYear && e.quarter === q).reduce((s, e) => s + e.amount, 0))
            return qs.every((v) => v === 0)
          }) && (
            <p className="text-sm text-gray-400 py-8 text-center">No commission data for {selectedYear}.</p>
          )}
        </div>
      </Card>
    </div>
  )
}
