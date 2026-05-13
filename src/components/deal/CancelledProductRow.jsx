import { Lock } from 'lucide-react'
import { fmt } from '../../lib/commission'
import { resolveProductValue, effectiveCogs } from '../../lib/products'

export default function CancelledProductRow({ item, products, contractMonths, isManager }) {
  const prod = products.find((p) => p.id === item.product_id)
  const activeMonths = item.billing_months ?? contractMonths
  const fullAnnual = resolveProductValue(item)
  const monthlyRate = contractMonths > 0 ? fullAnnual / contractMonths : 0
  const paidAmount = fullAnnual * (activeMonths / contractMonths)
  const cogs = effectiveCogs(item)
  const fullCommission = item.commission_amount ?? 0
  const earnedCommission = fullCommission * (activeMonths / contractMonths)

  return (
    <div className="border border-amber-200 bg-amber-50/40 rounded-xl px-4 py-4 flex items-start gap-3">
      <div className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center">
        <Lock size={12} className="text-amber-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="font-medium text-gray-400 line-through text-sm">{prod?.name || item.products?.name || 'Product'}</span>
          <span className="text-[11px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-medium">Cancelled</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-xs mb-3">
          <div>
            <p className="text-gray-400 uppercase tracking-wide text-[10px] font-medium mb-0.5">Original Rate</p>
            <p className="text-gray-600 font-medium">{monthlyRate > 0 ? fmt(monthlyRate, 2) + '/mo' : '—'}</p>
          </div>
          <div>
            <p className="text-gray-400 uppercase tracking-wide text-[10px] font-medium mb-0.5">Full Contract</p>
            <p className="text-gray-600 font-medium">{fmt(fullAnnual, 2)} <span className="text-gray-400 font-normal">({contractMonths} mo)</span></p>
          </div>
          <div>
            <p className="text-gray-400 uppercase tracking-wide text-[10px] font-medium mb-0.5">Actually Billed</p>
            <p className="text-amber-700 font-semibold">{fmt(paidAmount, 2)} <span className="text-gray-400 font-normal">({activeMonths} mo)</span></p>
          </div>
          {cogs > 0 && (
            <div>
              <p className="text-gray-400 uppercase tracking-wide text-[10px] font-medium mb-0.5">Vendor Cost</p>
              <p className="text-gray-600 font-medium">{fmt(cogs, 2)} <span className="text-gray-400 font-normal">billed</span></p>
            </div>
          )}
          {isManager && fullCommission > 0 && (
            <div>
              <p className="text-gray-400 uppercase tracking-wide text-[10px] font-medium mb-0.5">Commission Earned</p>
              <p className="text-indigo-600 font-semibold">{fmt(earnedCommission, 2)} <span className="text-gray-400 font-normal line-through">{fmt(fullCommission, 2)}</span></p>
            </div>
          )}
        </div>
        <p className="text-[11px] text-amber-600">Managed via Amendment — edit from the Deal Detail page</p>
      </div>
    </div>
  )
}
