import Card, { CardHeader } from '../ui/Card'
import { fmt } from '../../lib/commission'
import { calcTrilogyMargin } from '../../lib/deals'
import { getMarginTier, getMarginPct } from '../../lib/margin'

const BANNER_STYLES = {
  green: 'bg-green-50 border-green-200 text-green-800',
  yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  red: 'bg-red-50 border-red-200 text-red-800',
}
const TIER_LABEL = { green: 'Healthy Margin', yellow: 'Low Margin — Review Required', red: 'Below Minimum Margin' }
const DOT_COLOR = { green: 'bg-green-400', yellow: 'bg-yellow-400', red: 'bg-red-400' }

export default function PricingBreakdownCard({ productBaseAcv, totalVendorCost, customerAcv, stackedPartners, partners }) {
  if (productBaseAcv <= 0) return null

  const marginTier = getMarginTier(productBaseAcv, totalVendorCost)
  const marginPct = totalVendorCost > 0 ? getMarginPct(productBaseAcv, totalVendorCost) : null

  return (
    <Card>
      <CardHeader title="Pricing Breakdown" />
      <div className="space-y-1.5 text-sm">
        {totalVendorCost > 0 && (
          <>
            <div className="flex justify-between">
              <span className="text-gray-500">Vendor Cost (COGS)</span>
              <span className="font-medium text-navy-900">{fmt(totalVendorCost, 2)}</span>
            </div>
            <div className="flex justify-between text-teal-700">
              <span>+ Trilogy Margin</span>
              <span className="font-medium">+{fmt(calcTrilogyMargin(productBaseAcv, totalVendorCost), 2)}</span>
            </div>
            <div className="flex justify-between pt-1.5 border-t border-gray-200">
              <span className="text-gray-600 font-medium">Trilogy ACV</span>
              <span className="font-medium text-navy-900">{fmt(productBaseAcv, 2)}</span>
            </div>
          </>
        )}
        {totalVendorCost === 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">Trilogy ACV (base)</span>
            <span className="font-medium text-navy-900">{fmt(productBaseAcv, 2)}</span>
          </div>
        )}
        {stackedPartners.map((p) => {
          const pt = partners.find((x) => x.id === p.partner_id)
          return (
            <div key={p.partner_id} className="flex justify-between text-purple-700">
              <span>+ {pt?.name} ({p.commission_pct}%)</span>
              <span className="font-medium">+{fmt(p.commission_amount, 2)}</span>
            </div>
          )
        })}
        <div className="flex justify-between pt-1.5 border-t border-gray-200 font-semibold">
          <span className="text-navy-900">Customer ACV</span>
          <span className="text-navy-900">{fmt(customerAcv, 2)}</span>
        </div>
      </div>
      {marginTier && (
        <div className={`mt-3 border rounded-xl px-4 py-3 flex items-center gap-2.5 ${BANNER_STYLES[marginTier]}`}>
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${DOT_COLOR[marginTier]}`} />
          <span className="text-sm font-semibold">{TIER_LABEL[marginTier]}</span>
          {marginPct != null && (
            <span className="text-xs opacity-75">({(marginPct * 100).toFixed(1)}%)</span>
          )}
        </div>
      )}
    </Card>
  )
}
