import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Printer } from 'lucide-react'
import { format } from 'date-fns'
import { fmt, buildCommissionSchedule } from '../lib/commission'
import {
  computeProductAcv,
  computePartnerStack,
  calcTotalCogs,
  calcTotalCommission,
  calcTotalSpif,
  calcTotalPayout,
  calcTrilogyMargin,
  calcTrilogyNet,
  calcTotalRevenue,
  calcIndividualCommission,
  groupScheduleByQuarter,
} from '../lib/deals'
import { effectiveCogs, productLineTotal, resolveMonthlyValue, resolveProductValue } from '../lib/products'
import { getMarginTier, calcMargin } from '../lib/margin'
import { StageBadge } from './ui/Badge'

export default function DealOverviewModal({ deal, dealProducts, dealTeam, dealPartners, approval, amendments = [], onClose, isManager, profile }) {
  const printRef = useRef(null)

  // Active products only for ACV / margin / commission totals
  const activeProducts = dealProducts.filter((dp) => dp.status !== 'cancelled')

  const totalCogs = calcTotalCogs(activeProducts)
  const totalCommission = calcTotalCommission(activeProducts)
  const productACV = computeProductAcv(activeProducts)
  const baseAcv = productACV > 0 ? productACV : (deal.acv || 0)
  const { partnerStack, customerAcv, partnerMultiplier } = computePartnerStack(baseAcv, dealPartners)

  const salesTeam = dealTeam.filter((m) => m.role === 'sales')
  const supportTeam = dealTeam.filter((m) => m.role === 'support')

  // Pass all products to schedule — cancelled ones self-prorate via shortened billing_months
  const schedule = isManager
    ? buildCommissionSchedule(deal, dealProducts, dealTeam.map((m) => ({ ...m, person_name: m.people?.name })))
    : []

  const quarterGroups = groupScheduleByQuarter(schedule)

  function handlePrint() {
    const original = document.title
    document.title = `${deal.name} — Deal Overview — ${format(new Date(), 'yyyy-MM-dd')}`
    window.print()
    document.title = original
  }

  return createPortal(
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
              activeProducts={activeProducts}
              amendments={amendments}
              totalCogs={totalCogs}
              totalCommission={totalCommission}
              baseAcv={baseAcv}
              partnerStack={partnerStack}
              customerAcv={customerAcv}
              partnerMultiplier={partnerMultiplier}
              salesTeam={salesTeam}
              supportTeam={supportTeam}
              quarterGroups={quarterGroups}
              isManager={isManager}
              profile={profile}
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
          activeProducts={activeProducts}
          amendments={amendments}
          totalCogs={totalCogs}
          totalCommission={totalCommission}
          baseAcv={baseAcv}
          partnerStack={partnerStack}
          customerAcv={customerAcv}
          partnerMultiplier={partnerMultiplier}
          salesTeam={salesTeam}
          supportTeam={supportTeam}
          quarterGroups={quarterGroups}
          isManager={isManager}
          profile={profile}
          approval={approval}
          printMode
        />
      </div>
    </>,
    document.body
  )
}

function OverviewContent({ deal, dealProducts, activeProducts, amendments, totalCogs, totalCommission, baseAcv, partnerStack, customerAcv, partnerMultiplier, salesTeam, supportTeam, quarterGroups, isManager, profile, printMode, approval }) {
  const contractMonths = deal.contract_months || 12
  const cancelledProducts = dealProducts.filter((dp) => dp.status === 'cancelled')
  const cancelledPaidTotal = cancelledProducts.reduce((sum, dp) => {
    const lineTotal = productLineTotal(dp, partnerMultiplier)
    const activeMonths = dp.billing_months ?? contractMonths
    return sum + lineTotal * (activeMonths / contractMonths)
  }, 0)
  const cancelledPaidRevenue = cancelledProducts.reduce((sum, dp) => {
    const activeMonths = dp.billing_months ?? contractMonths
    return sum + resolveProductValue(dp) * (activeMonths / contractMonths)
  }, 0)
  const cancelledPaidCogs = cancelledProducts.reduce((sum, dp) => {
    const activeMonths = dp.billing_months ?? contractMonths
    return sum + effectiveCogs(dp) * (activeMonths / contractMonths)
  }, 0)
  const annualInvestmentTotal = customerAcv + cancelledPaidTotal
  const displayBaseAcv = baseAcv + cancelledPaidRevenue
  const displayTotalCogs = totalCogs + cancelledPaidCogs
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
            (() => {
              const rate = deal.commission_locked_rate
                ?? dealProducts.find((dp) => dp.base_rate != null)?.base_rate
              const locked = deal.stage === 'contracted' && deal.commission_locked_rate != null
              return {
                label: locked ? 'Commission Rate (Locked)' : 'Commission Rate',
                value: rate != null ? `${(parseFloat(rate) * 100).toFixed(2)}%` : '—',
              }
            })(),
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

      {/* Customer Pricing Table */}
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Customer Pricing</h4>
        <div className="rounded-xl border border-gray-100 overflow-x-auto">
          {(() => {
            const fmtRate = (val, dec = 4) => {
              if (val == null || val === '') return '—'
              const n = parseFloat(val)
              if (isNaN(n) || n === 0) return '—'
              return `$${(n * partnerMultiplier).toFixed(dec)}`
            }
            const fmtRaw = (val, dec = 4) => {
              if (val == null || val === '') return '—'
              const n = parseFloat(val)
              if (isNaN(n) || n === 0) return '—'
              return `$${n.toFixed(dec)}`
            }
            const fmtQty = (val) => {
              if (val == null || val === '') return '—'
              const n = parseFloat(val)
              if (isNaN(n) || n === 0) return '—'
              return n.toLocaleString()
            }
            return (
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Product</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-400 text-xs italic">Unit</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs">Monthly</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs">Effective Rate</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs">Overage</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {dealProducts.map((dp) => {
                    const prod = dp.products
                    if (!prod) return null
                    const isGM = dp.commission_metric === 'GM'
                    const isSupport = !!prod.is_support_charge
                    const isCancelled = dp.status === 'cancelled'
                    const lineTotal = productLineTotal(dp, partnerMultiplier)
                    const monthlyVal = resolveMonthlyValue(dp, partnerMultiplier)
                    const monthlyCell = isGM && !isSupport
                      ? fmtQty(dp.monthly_quantity || dp.quantity)
                      : monthlyVal != null ? fmt(monthlyVal, 2) : '—'
                    const activeMonths = isCancelled ? (dp.billing_months ?? contractMonths) : contractMonths
                    const paidAmount = isCancelled ? lineTotal * (activeMonths / contractMonths) : lineTotal
                    const cancelAmendment = isCancelled && dp.cancellation_amendment_id
                      ? amendments.find((a) => a.id === dp.cancellation_amendment_id)
                      : null
                    return (
                      <tr key={dp.id} className={isCancelled ? 'opacity-60' : ''}>
                        <td className="px-4 py-2.5 font-medium text-gray-900">
                          <span className={isCancelled ? 'line-through text-gray-400' : ''}>{prod.name}</span>
                          {isCancelled && (
                            <span className="ml-2 text-[11px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-normal">
                              Cancelled{cancelAmendment?.effective_date ? ` ${format(new Date(cancelAmendment.effective_date + 'T12:00:00'), 'MMM d, yyyy')}` : ''}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-400 italic text-xs">{isGM && !isSupport ? prod.unit_label : ''}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{isCancelled ? '—' : monthlyCell}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{!isCancelled && isGM && !isSupport ? fmtRate(dp.unit_price_snapshot) : '—'}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{!isCancelled && isGM && !isSupport && dp.overage_rate && parseFloat(dp.overage_rate) > 0 ? fmtRaw(dp.overage_rate) : '—'}</td>
                        <td className="px-4 py-2.5 text-right">
                          {isCancelled ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-semibold text-amber-700">{fmt(paidAmount, 2)}</span>
                              <span className="text-[11px] text-gray-400">{activeMonths} of {contractMonths} mo · <span className="line-through">{fmt(lineTotal, 2)}</span></span>
                            </div>
                          ) : (
                            <span className="font-semibold text-purple-700">{fmt(lineTotal, 2)}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={5} className="px-4 py-2.5 font-semibold text-gray-900 text-sm">Annual Investment</td>
                    <td className="px-4 py-2.5 text-right font-bold text-purple-700">{fmt(annualInvestmentTotal, 2)}</td>
                  </tr>
                </tbody>
              </table>
            )
          })()}
        </div>
      </section>

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
                const isCancelled = dp.status === 'cancelled'
                const revenue = resolveProductValue(dp)
                const dpCogs = effectiveCogs(dp)
                const margin = totalCogs > 0 ? calcMargin(revenue, dpCogs) : null
                const customerCost = productLineTotal(dp, partnerMultiplier)
                const activeMonths = isCancelled ? (dp.billing_months ?? contractMonths) : contractMonths
                const lostFraction = isCancelled ? Math.max(0, contractMonths - activeMonths) / contractMonths : 0
                const paidRevenue = isCancelled ? revenue * (activeMonths / contractMonths) : revenue
                const paidCustomerCost = isCancelled ? customerCost * (activeMonths / contractMonths) : customerCost
                const paidCommission = isCancelled ? (dp.commission_amount ?? 0) * (activeMonths / contractMonths) : dp.commission_amount
                const cancelAmendment = isCancelled && dp.cancellation_amendment_id
                  ? amendments.find((a) => a.id === dp.cancellation_amendment_id)
                  : null
                return (
                  <tr key={dp.id} className={isCancelled ? 'opacity-60' : ''}>
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      <span className={isCancelled ? 'line-through text-gray-400' : ''}>{dp.products?.name}</span>
                      {isCancelled && (
                        <span className="ml-2 text-[11px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-normal">
                          Cancelled{cancelAmendment?.effective_date ? ` ${format(new Date(cancelAmendment.effective_date + 'T12:00:00'), 'MMM d, yyyy')}` : ''}
                        </span>
                      )}
                    </td>
                    {partnerStack.length > 0 && (
                      <td className="px-4 py-2.5 text-right font-semibold text-purple-700">
                        {isCancelled ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-amber-700">{fmt(paidCustomerCost, 2)}</span>
                            <span className="text-[11px] text-gray-400 line-through">{fmt(customerCost, 2)}</span>
                          </div>
                        ) : fmt(customerCost, 2)}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-right text-gray-700">
                      {isCancelled ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-amber-700">{fmt(paidRevenue, 2)}</span>
                          <span className="text-[11px] text-gray-400 line-through">{fmt(revenue, 2)}</span>
                        </div>
                      ) : fmt(revenue, 2)}
                    </td>
                    {totalCogs > 0 && isManager && <td className="px-4 py-2.5 text-right text-teal-700">{!isCancelled && margin != null ? fmt(margin, 2) : '—'}</td>}
                    {totalCogs > 0 && <td className="px-4 py-2.5 text-right text-gray-500">{!isCancelled && dpCogs > 0 ? fmt(dpCogs, 2) : '—'}</td>}
                    {isManager && (
                      <td className="px-4 py-2.5 text-right font-semibold text-indigo-700">
                        {isCancelled ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-amber-700">{fmt(paidCommission, 2)}</span>
                            <span className="text-[11px] text-gray-400 line-through">{fmt(dp.commission_amount, 2)}</span>
                          </div>
                        ) : fmt(dp.commission_amount, 2)}
                      </td>
                    )}
                  </tr>
                )
              })}
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td className="px-4 py-2.5 font-semibold text-gray-900 text-sm">Total</td>
                {partnerStack.length > 0 && <td className="px-4 py-2.5 text-right font-bold text-purple-700">{fmt(annualInvestmentTotal, 2)}</td>}
                <td className="px-4 py-2.5 text-right font-bold text-gray-900">
                  {fmt(calcTotalRevenue(activeProducts) + cancelledPaidRevenue, 2)}
                </td>
                {totalCogs > 0 && isManager && (
                  <td className="px-4 py-2.5 text-right font-bold text-teal-700">
                    {fmt(calcTotalRevenue(activeProducts) + cancelledPaidRevenue - displayTotalCogs, 2)}
                  </td>
                )}
                {totalCogs > 0 && <td className="px-4 py-2.5 text-right font-bold text-gray-700">{fmt(displayTotalCogs, 2)}</td>}
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
          const totalSpif = calcTotalSpif(supportTeam)
          const totalPayout = calcTotalPayout(totalCommission, totalSpif)
          const trilogyNet = calcTrilogyNet(displayBaseAcv, displayTotalCogs, totalPayout)
          return (
            <div className={`grid grid-cols-1 gap-3 ${isManager ? 'sm:grid-cols-2' : ''}`}>
              {/* Stack 1: Customer Price */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-1.5 text-sm">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Customer Price</p>
                {displayTotalCogs > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Vendor Cost (COGS)</span>
                    <span className="font-medium text-gray-900">{fmt(displayTotalCogs, 2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-teal-700">
                  <span>+ Trilogy Margin</span>
                  <span className="font-medium">+{fmt(calcTrilogyMargin(displayBaseAcv, displayTotalCogs), 2)}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-gray-200">
                  <span className="font-medium text-gray-700">Trilogy ACV</span>
                  <span className="font-medium text-gray-900">{fmt(displayBaseAcv, 2)}</span>
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
                  <span className="text-gray-900">{fmt(annualInvestmentTotal, 2)}</span>
                </div>
              </div>

              {/* Stack 2: Trilogy Net — manager only */}
              {isManager && <div className="bg-gray-50 rounded-xl p-4 space-y-1.5 text-sm">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Trilogy Net</p>
                <div className="flex justify-between">
                  <span className="font-medium text-gray-700">Trilogy ACV</span>
                  <span className="font-medium text-gray-900">{fmt(displayBaseAcv, 2)}</span>
                </div>
                {displayTotalCogs > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>− Vendor Cost (COGS)</span>
                    <span className="font-medium">−{fmt(displayTotalCogs, 2)}</span>
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
              </div>}
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
            {salesTeam.map((m) => {
              const isOwnRow = m.people?.email === profile?.email
              return (
                <div key={m.id} className="flex justify-between text-sm">
                  <div>
                    <span className="font-medium text-gray-900">{m.people?.name}</span>
                    <span className="text-gray-400 ml-2 text-xs">Sales</span>
                  </div>
                  {isManager && <span className="font-medium text-indigo-700">{m.commission_percent}% · {fmt(calcIndividualCommission(totalCommission, m.commission_percent), 2)}</span>}
                  {!isManager && isOwnRow && <span className="font-medium text-indigo-700">{fmt(calcIndividualCommission(totalCommission, m.commission_percent), 2)}</span>}
                </div>
              )
            })}
            {supportTeam.map((m) => {
              const isOwnRow = m.people?.email === profile?.email
              return (
                <div key={m.id} className="flex justify-between text-sm">
                  <div>
                    <span className="font-medium text-gray-900">{m.people?.name}</span>
                    <span className="text-gray-400 ml-2 text-xs">Support SPIF</span>
                  </div>
                  {(isManager || isOwnRow) && <span className="font-medium text-amber-700">{fmt(m.spif_amount, 2)}</span>}
                </div>
              )
            })}
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
