import { ChevronRight } from 'lucide-react'
import { fmt } from '../../lib/commission'
import { productLineTotal, resolveMonthlyValue } from '../../lib/products'
import { format } from 'date-fns'

export default function DealProductsTable({ dealProducts, amendments, deal, customerAcv, partnerMultiplier }) {
  const fmtRate = (val) => {
    if (val == null || val === '') return '—'
    const n = parseFloat(val)
    if (isNaN(n) || n === 0) return '—'
    return `$${(n * partnerMultiplier).toFixed(4)}`
  }
  const fmtRaw = (val) => {
    if (val == null || val === '') return '—'
    const n = parseFloat(val)
    if (isNaN(n) || n === 0) return '—'
    return `$${n.toFixed(4)}`
  }
  const fmtQty = (val) => {
    if (val == null || val === '') return '—'
    const n = parseFloat(val)
    if (isNaN(n) || n === 0) return '—'
    return n.toLocaleString()
  }

  const contractMonths = deal.contract_months || 12

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2 font-medium text-gray-500 text-xs uppercase tracking-wide">Product</th>
            <th className="text-left py-2 font-medium text-gray-400 text-xs uppercase tracking-wide hidden sm:table-cell italic">Unit</th>
            <th className="text-right py-2 font-medium text-gray-500 text-xs uppercase tracking-wide hidden md:table-cell">Monthly</th>
            <th className="text-right py-2 font-medium text-gray-500 text-xs uppercase tracking-wide hidden md:table-cell">Effective Rate</th>
            <th className="text-right py-2 font-medium text-gray-500 text-xs uppercase tracking-wide hidden md:table-cell">Overage</th>
            <th className="text-right py-2 font-medium text-gray-500 text-xs uppercase tracking-wide hidden md:table-cell">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {dealProducts.map((dp) => {
            const milestones = dp.milestones || []
            const hasMilestones = milestones.length > 1
            const prod = dp.products
            const isGM = dp.commission_metric === 'GM'
            const isSupport = !!prod?.is_support_charge
            const isCancelled = dp.status === 'cancelled'
            const cancellationAmendment = isCancelled && dp.cancellation_amendment_id
              ? amendments.find((a) => a.id === dp.cancellation_amendment_id)
              : null
            const lineTotal = productLineTotal(dp, partnerMultiplier)
            const monthlyVal = resolveMonthlyValue(dp, partnerMultiplier)
            const monthlyCell = isGM && !isSupport
              ? fmtQty(dp.monthly_quantity || dp.quantity)
              : monthlyVal != null ? fmt(monthlyVal, 2) : '—'
            const activeMonths = isCancelled ? (dp.billing_months ?? contractMonths) : contractMonths
            const paidAmount = isCancelled ? lineTotal * (activeMonths / contractMonths) : lineTotal

            return (
              <>
                <tr key={dp.id} className={`${hasMilestones ? 'border-b-0' : ''} ${isCancelled ? 'opacity-60' : ''}`}>
                  <td className="py-3 font-medium text-navy-900">
                    <span className={isCancelled ? 'line-through text-gray-400' : ''}>{prod?.name}</span>
                    {isCancelled && (
                      <span className="ml-2 text-xs bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-normal not-italic">
                        Cancelled{cancellationAmendment?.effective_date ? ` ${format(new Date(cancellationAmendment.effective_date + 'T12:00:00'), 'MMM d, yyyy')}` : ''}
                      </span>
                    )}
                    {!isCancelled && dp.amendment_id && (() => {
                      const addAmendment = amendments.find((a) => a.id === dp.amendment_id)
                      return (
                        <span className="ml-2 text-xs bg-green-100 text-green-700 rounded px-1.5 py-0.5 font-normal">
                          Added{addAmendment?.effective_date ? ` ${format(new Date(addAmendment.effective_date + 'T12:00:00'), 'MMM d, yyyy')}` : ''}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="py-3 hidden sm:table-cell text-gray-400 italic text-xs">{isGM && !isSupport ? prod?.unit_label : ''}</td>
                  <td className="py-3 text-right hidden md:table-cell text-gray-700">{isCancelled ? '—' : monthlyCell}</td>
                  <td className="py-3 text-right hidden md:table-cell text-gray-700">{!isCancelled && isGM && !isSupport ? fmtRate(dp.unit_price_snapshot) : '—'}</td>
                  <td className="py-3 text-right hidden md:table-cell text-gray-700">{!isCancelled && isGM && !isSupport && dp.overage_rate && parseFloat(dp.overage_rate) > 0 ? fmtRaw(dp.overage_rate) : '—'}</td>
                  <td className="py-3 text-right hidden md:table-cell">
                    {isCancelled ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-semibold text-amber-700">{fmt(paidAmount, 2)}</span>
                        <span className="text-[11px] text-gray-400">{activeMonths} of {contractMonths} mo · <span className="line-through">{fmt(lineTotal, 2)}</span></span>
                      </div>
                    ) : (
                      <span className="font-semibold text-navy-900">{fmt(lineTotal, 2)}</span>
                    )}
                  </td>
                </tr>
                {hasMilestones && milestones.map((m, i) => (
                  <tr key={`${dp.id}-m-${i}`} className={`bg-gray-50/60 ${isCancelled ? 'opacity-50' : ''}`}>
                    <td className="py-2 pl-6 text-xs text-gray-500" colSpan={1}>
                      <div className="flex items-center gap-1.5">
                        <ChevronRight size={11} className="text-gray-300 flex-shrink-0" />
                        <span className="font-medium text-gray-600">{m.label || `Payment ${i + 1}`}</span>
                      </div>
                    </td>
                    <td className="py-2 hidden sm:table-cell text-xs text-gray-400">
                      {m.payment_date ? format(new Date(m.payment_date + 'T12:00:00'), 'MMM d, yyyy') : '—'}
                    </td>
                    <td colSpan={3} className="py-2 hidden md:table-cell" />
                    <td className="py-2 text-right text-xs font-medium text-gray-600 hidden md:table-cell">{fmt(productLineTotal({ ...dp, total_revenue: parseFloat(m.amount) || 0 }, partnerMultiplier), 2)}</td>
                  </tr>
                ))}
              </>
            )
          })}
          <tr className="border-t-2 border-gray-200">
            <td colSpan={5} className="py-2 font-semibold text-navy-900 text-sm">Annual Investment</td>
            <td className="py-2 text-right font-bold text-navy-900 hidden md:table-cell">{fmt(customerAcv, 2)}</td>
          </tr>
        </tbody>
      </table>
      {dealProducts.length === 0 && (
        <p className="text-sm text-gray-400 py-6 text-center">No products added.</p>
      )}
    </div>
  )
}
