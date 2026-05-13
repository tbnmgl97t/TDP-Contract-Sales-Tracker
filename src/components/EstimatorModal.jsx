import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { fmt } from '../lib/commission'
import { calcEstimatedCommission } from '../lib/deals'
import { getMarginPct } from '../lib/margin'
import { StageBadge } from '../components/ui/Badge'
import { DEAL_STAGES } from '../lib/constants'

const EARLY_STAGES = ['lead', 'qualified', 'discovery']
const LATE_STAGES = ['proposal', 'negotiation', 'contracted']

export default function EstimatorModal({ deals, dealFinancials, estRate, setEstRate, onClose }) {
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
