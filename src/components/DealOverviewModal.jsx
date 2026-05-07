import { useRef } from 'react'
import { X, Printer } from 'lucide-react'
import { format } from 'date-fns'
import { fmt, buildCommissionSchedule, getMarginTier } from '../lib/commission'
import { StageBadge } from './ui/Badge'

export default function DealOverviewModal({ deal, dealProducts, dealTeam, dealPartners, approval, onClose, isManager }) {
  const printRef = useRef(null)

  // Derive COGS for support charges that may not have cogs_amount saved
  function effectiveCogs(dp) {
    if (dp.cogs_amount) return dp.cogs_amount
    if (dp.products?.is_support_charge && dp.support_cogs_pct != null) {
      return (dp.annual_value || 0) * dp.support_cogs_pct / 100
    }
    return 0
  }

  // Totals
  const totalCogs = dealProducts.reduce((s, p) => s + effectiveCogs(p), 0)
  const totalCommission = dealProducts.reduce((s, p) => s + (p.commission_amount || 0), 0)

  // ACV
  const productACV = dealProducts.reduce((s, p) => {
    if (p.commission_metric === 'GM') {
      if (p.monthly_cost != null && p.monthly_cost > 0) return s + p.monthly_cost * 12
      return s + (p.yearly_cost || (p.net_revenue || 0) + (p.cogs_amount || 0))
    }
    return s + (p.annual_value || 0)
  }, 0)
  const baseAcv = productACV > 0 ? productACV : (deal.acv || 0)

  // Partner stack
  let _cv = baseAcv
  const partnerStack = dealPartners.map((dp) => {
    const pct = parseFloat(dp.commission_pct) / 100
    const prev = _cv
    _cv = pct > 0 && pct < 1 ? prev / (1 - pct) : prev
    return { ...dp, commission_amount: _cv - prev }
  })
  const customerAcv = _cv

  // Team
  const salesTeam = dealTeam.filter((m) => m.role === 'sales')
  const supportTeam = dealTeam.filter((m) => m.role === 'support')

  // Commission schedule (manager only)
  const schedule = isManager
    ? buildCommissionSchedule(deal, dealProducts, dealTeam.map((m) => ({ ...m, person_name: m.people?.name })))
    : []

  const quarterGroups = schedule.reduce((acc, entry) => {
    const key = `${entry.year} Q${entry.quarter}`
    if (!acc[key]) acc[key] = { key, quarter: entry.quarter, year: entry.year, entries: [] }
    acc[key].entries.push(entry)
    return acc
  }, {})

  function handlePrint() {
    const original = document.title
    document.title = `${deal.name} — Deal Overview — ${format(new Date(), 'yyyy-MM-dd')}`
    window.print()
    document.title = original
  }

  return (
    <>
      {/* Print isolation styles */}
      <style>{`
        @media print {
          html, body { background: white !important; margin: 0; }
          body * { visibility: hidden; }
          #deal-overview-print, #deal-overview-print * { visibility: visible; }
          #deal-overview-print { position: absolute; top: 0; left: 0; width: 100%; background: white !important; }
          #deal-overview-print * { background: transparent !important; }
          .no-print { display: none !important; }
        }
        @media screen {
          #deal-overview-print { display: none; }
        }
      `}</style>

      {/* Screen modal */}
      <div className="no-print fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto p-4 py-8">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl">
          {/* Modal header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
            <div>
              <h3 className="text-base font-semibold text-navy-900">{deal.name}</h3>
              <p className="text-xs text-gray-500">{deal.company_name} — Deal Overview</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-navy-900 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors"
              >
                <Printer size={14} />
                Print / PDF
              </button>
              <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Modal body */}
          <div className="px-6 py-5 space-y-6" ref={printRef}>
            <OverviewContent
              deal={deal}
              dealProducts={dealProducts}
              totalCogs={totalCogs}
              totalCommission={totalCommission}
              baseAcv={baseAcv}
              partnerStack={partnerStack}
              customerAcv={customerAcv}
              salesTeam={salesTeam}
              supportTeam={supportTeam}
              quarterGroups={quarterGroups}
              isManager={isManager}
              effectiveCogs={effectiveCogs}
              approval={approval}
            />
          </div>
        </div>
      </div>

      {/* Print-only version */}
      <div id="deal-overview-print" className="p-8 max-w-3xl mx-auto font-sans">
        <div className="flex items-start justify-between mb-6 pb-4 border-b-2 border-gray-200">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{deal.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{deal.company_name}</p>
          </div>
          <div className="text-right text-xs text-gray-400">
            <p>Trilogy Digital</p>
            <p>Deal Overview</p>
            <p>{format(new Date(), 'MMM d, yyyy')}</p>
          </div>
        </div>
        <OverviewContent
          deal={deal}
          dealProducts={dealProducts}
          totalCogs={totalCogs}
          totalCommission={totalCommission}
          baseAcv={baseAcv}
          partnerStack={partnerStack}
          customerAcv={customerAcv}
          salesTeam={salesTeam}
          supportTeam={supportTeam}
          quarterGroups={quarterGroups}
          isManager={isManager}
          effectiveCogs={effectiveCogs}
          approval={approval}
          printMode
        />
      </div>
    </>
  )
}

function OverviewContent({ deal, dealProducts, totalCogs, totalCommission, baseAcv, partnerStack, customerAcv, salesTeam, supportTeam, quarterGroups, isManager, printMode, effectiveCogs, approval }) {
  const row = (label, value, accent) => (
    <div className={`flex justify-between text-sm py-1 ${accent ? 'font-semibold' : ''}`}>
      <span className={accent ? 'text-gray-900' : 'text-gray-500'}>{label}</span>
      <span className={accent ? 'text-gray-900' : 'text-gray-800 font-medium'}>{value}</span>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Deal Info */}
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Deal Info</h4>
        <div className="bg-gray-50 rounded-xl px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          {[
            { label: 'Customer', value: deal.company_name },
            { label: 'Stage', value: deal.stage ? deal.stage.charAt(0).toUpperCase() + deal.stage.slice(1) : '—' },
            { label: 'Type', value: deal.deal_type === 'renewal' ? 'Renewal' : 'New Business' },
            { label: 'Contract Start', value: deal.contract_start ? format(new Date(deal.contract_start + 'T12:00:00'), 'MMM d, yyyy') : '—' },
            { label: 'Contract End', value: deal.contract_end ? format(new Date(deal.contract_end + 'T12:00:00'), 'MMM d, yyyy') : '—' },
            { label: 'Length', value: `${deal.contract_months || 12} months` },
            { label: 'Customer ACV', value: fmt(customerAcv, 2), accent: true },
          ].map(({ label, value, accent }) => (
            <div key={label}>
              <p className="text-xs text-gray-400">{label}</p>
              <p className={`font-medium truncate ${accent ? 'text-navy-900' : 'text-gray-800'}`}>{value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Margin / Approval banner */}
      {approval && (() => {
        const tier = getMarginTier(baseAcv, totalCogs)
        const styles = { green: 'bg-green-50 border-green-200 text-green-800', yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800', red: 'bg-red-50 border-red-200 text-red-800' }
        const labels = { green: 'Healthy Margin', yellow: 'Low Margin — Review Required', red: 'Below Minimum Margin' }
        const dots = { green: 'bg-green-400', yellow: 'bg-yellow-400', red: 'bg-red-400' }
        const statusLabel = { auto_approved: 'Auto-approved', pending: 'Pending approval', approved: 'Approved', rejected: 'Rejected' }
        return (
          <div className={`border rounded-xl px-4 py-2.5 flex items-center gap-2.5 text-sm ${styles[tier] || 'bg-gray-50 border-gray-200 text-gray-700'}`}>
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dots[tier] || 'bg-gray-400'}`} />
            <span className="font-semibold">{labels[tier] || 'Margin'}</span>
            {approval.margin_pct != null && <span className="opacity-75 text-xs">({(approval.margin_pct * 100).toFixed(1)}%)</span>}
            <span className="text-xs opacity-60">· {statusLabel[approval.status] || approval.status}</span>
          </div>
        )
      })()}

      {/* Products */}
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Products & Services</h4>
        <div className="rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Product</th>
                {partnerStack.length > 0 && <th className="text-right px-4 py-2.5 font-medium text-purple-500 text-xs">Customer Cost</th>}
                <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs">Trilogy Revenue</th>
                {totalCogs > 0 && isManager && <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs">Trilogy Margin</th>}
                {totalCogs > 0 && <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs">COGS</th>}
                {isManager && <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs">Commission</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {dealProducts.map((dp) => {
                const revenue = dp.total_revenue || dp.annual_value || dp.yearly_cost || 0
                const dpCogs = effectiveCogs(dp)
                const margin = totalCogs > 0 ? revenue - dpCogs : null
                const partnerMultiplier = baseAcv > 0 ? customerAcv / baseAcv : 1
                const customerCost = revenue * partnerMultiplier
                return (
                  <tr key={dp.id}>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{dp.products?.name}</td>
                    {partnerStack.length > 0 && <td className="px-4 py-2.5 text-right font-semibold text-purple-700">{fmt(customerCost, 2)}</td>}
                    <td className="px-4 py-2.5 text-right text-gray-700">{fmt(revenue, 2)}</td>
                    {totalCogs > 0 && isManager && <td className="px-4 py-2.5 text-right text-teal-700">{margin != null ? fmt(margin, 2) : '—'}</td>}
                    {totalCogs > 0 && <td className="px-4 py-2.5 text-right text-gray-500">{dpCogs > 0 ? fmt(dpCogs, 2) : '—'}</td>}
                    {isManager && <td className="px-4 py-2.5 text-right font-semibold text-indigo-700">{fmt(dp.commission_amount, 2)}</td>}
                  </tr>
                )
              })}
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td className="px-4 py-2.5 font-semibold text-gray-900 text-sm">Total</td>
                {partnerStack.length > 0 && <td className="px-4 py-2.5 text-right font-bold text-purple-700">{fmt(customerAcv, 2)}</td>}
                <td className="px-4 py-2.5 text-right font-bold text-gray-900">
                  {fmt(dealProducts.reduce((s, p) => s + (p.total_revenue || p.annual_value || p.yearly_cost || 0), 0), 2)}
                </td>
                {totalCogs > 0 && isManager && (
                  <td className="px-4 py-2.5 text-right font-bold text-teal-700">
                    {fmt(dealProducts.reduce((s, p) => s + (p.total_revenue || p.annual_value || p.yearly_cost || 0) - effectiveCogs(p), 0), 2)}
                  </td>
                )}
                {totalCogs > 0 && <td className="px-4 py-2.5 text-right font-bold text-gray-700">{fmt(totalCogs, 2)}</td>}
                {isManager && <td className="px-4 py-2.5 text-right font-bold text-indigo-700">{fmt(totalCommission, 2)}</td>}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Pricing Stack */}
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Pricing Stack</h4>
        {(() => {
          const totalSpif = supportTeam.reduce((s, m) => s + (m.spif_amount || 0), 0)
          const totalPayout = totalCommission + totalSpif
          const trilogyNet = baseAcv - totalCogs - totalPayout
          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Stack 1: Customer Price */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-1.5 text-sm">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Customer Price</p>
                {totalCogs > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Vendor Cost (COGS)</span>
                    <span className="font-medium text-gray-900">{fmt(totalCogs, 2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-teal-700">
                  <span>+ Trilogy Margin</span>
                  <span className="font-medium">+{fmt(baseAcv - totalCogs, 2)}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-gray-200">
                  <span className="font-medium text-gray-700">Trilogy ACV</span>
                  <span className="font-medium text-gray-900">{fmt(baseAcv, 2)}</span>
                </div>
                {partnerStack.map((dp) => (
                  <div key={dp.id} className="space-y-0.5">
                    <div className="flex justify-between text-purple-700">
                      <span>+ {dp.partners?.name} ({dp.commission_pct}%)</span>
                      <span className="font-medium">+{fmt(dp.commission_amount, 2)}</span>
                    </div>
                    <p className="text-xs text-purple-400 pl-3">Referral commission</p>
                  </div>
                ))}
                <div className="flex justify-between pt-1.5 border-t border-gray-200 font-semibold">
                  <span className="text-gray-900">Customer ACV</span>
                  <span className="text-gray-900">{fmt(customerAcv, 2)}</span>
                </div>
              </div>

              {/* Stack 2: Trilogy Net */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-1.5 text-sm">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Trilogy Net</p>
                <div className="flex justify-between">
                  <span className="font-medium text-gray-700">Trilogy ACV</span>
                  <span className="font-medium text-gray-900">{fmt(baseAcv, 2)}</span>
                </div>
                {totalCogs > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>− Vendor Cost (COGS)</span>
                    <span className="font-medium">−{fmt(totalCogs, 2)}</span>
                  </div>
                )}
                {!deal.is_tbn_property && totalPayout > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>− Internal Commissions{totalSpif > 0 ? ' + SPIFs' : ''}</span>
                    <span className="font-medium">−{fmt(totalPayout, 2)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1.5 border-t border-gray-200 font-bold">
                  <span className="text-gray-900">Trilogy Net</span>
                  <span className={trilogyNet >= 0 ? 'text-teal-700' : 'text-red-600'}>{fmt(trilogyNet, 2)}</span>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Spacer — preserves layout when partners are present */}
        {partnerStack.length > 0 && <div className="mt-3 pt-3 border-t border-gray-100" />}
      </section>

      {/* Team */}
      {(salesTeam.length > 0 || supportTeam.length > 0) && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Team</h4>
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            {salesTeam.map((m) => (
              <div key={m.id} className="flex justify-between text-sm">
                <div>
                  <span className="font-medium text-gray-900">{m.people?.name}</span>
                  <span className="text-gray-400 ml-2 text-xs">Sales</span>
                </div>
                {isManager
                  ? <span className="font-medium text-indigo-700">{m.commission_percent}% · {fmt(totalCommission * (m.commission_percent / 100), 2)}</span>
                  : <span className="font-medium text-indigo-700">{fmt(totalCommission * (m.commission_percent / 100), 2)}</span>
                }
              </div>
            ))}
            {supportTeam.map((m) => (
              <div key={m.id} className="flex justify-between text-sm">
                <div>
                  <span className="font-medium text-gray-900">{m.people?.name}</span>
                  <span className="text-gray-400 ml-2 text-xs">Support SPIF</span>
                </div>
                <span className="font-medium text-amber-700">{fmt(m.spif_amount, 2)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Commission Schedule — manager only */}
      {isManager && Object.keys(quarterGroups).length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Commission Schedule</h4>
          <div className="space-y-3">
            {Object.values(quarterGroups).sort((a, b) => a.year !== b.year ? a.year - b.year : a.quarter - b.quarter).map((group) => {
              const total = group.entries.reduce((s, e) => s + (e.amount || 0), 0)
              return (
                <div key={group.key} className="rounded-xl border border-gray-100 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 flex items-center justify-between border-b border-gray-100">
                    <span className="text-sm font-semibold text-gray-900">{group.year} Q{group.quarter}</span>
                    <span className="text-sm font-bold text-indigo-700">{fmt(total, 2)}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {group.entries.map((entry, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{entry.person_name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${entry.type === 'spif' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                            {entry.type === 'spif' ? 'SPIF' : `${entry.role} commission`}
                          </span>
                        </div>
                        <span className="font-semibold text-gray-900">{fmt(entry.amount, 2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {printMode && (
        <div className="pt-4 border-t border-gray-200 text-xs text-gray-400 text-center">
          Confidential — Trilogy Digital Internal Use Only
        </div>
      )}
    </div>
  )
}
