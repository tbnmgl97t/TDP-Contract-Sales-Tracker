import '../../lib/pdfFonts'
import { Page, Text, View, Image } from '@react-pdf/renderer'
import { computeProductAcv, computePartnerStack } from '../../lib/deals'
import { productLineTotal } from '../../lib/products'
import { fmt } from '../../lib/commission'

const W = 960
const H = 540
const FONT = 'Poppins'

const COL = { product: 2.8, unit: 1.8, monthly: 1.4, effective: 1.4, overage: 1.4, total: 1.6 }

// ─── PDF ────────────────────────────────────────────────────────────────────

export function PricingSlidePDF({ fields = {}, deal, dealProducts = [], dealPartners = [] }) {
  const productACV = computeProductAcv(dealProducts)
  const { customerAcv, partnerMultiplier } = computePartnerStack(productACV, dealPartners)
  const m = partnerMultiplier || 1
  const hasOneTimeFees = dealProducts.some((dp) => dp.products?.billing_frequency === 'one_time')
  const count = dealProducts.length

  // Adaptive sizing — scale down for long product lists
  // Budget: 540 total - 60 page pad - 46 title - 37 header - 42 total row - 10 note gap = ~345 for data rows
  const pagePad    = count > 8 ? 24 : 30
  const titleSize  = count > 8 ? 26 : 32
  const titleMB    = count > 8 ? 14 : 20
  const rowPadV    = count > 8 ? 7  : 11
  const rowFSize   = count > 8 ? 11 : 13
  const rowFSizeSm = count > 8 ? 10 : 12
  const hdrFSize   = count > 8 ? 11 : 13
  const totalPadV  = count > 8 ? 9  : 12
  const totalFSize = count > 8 ? 12 : 14

  return (
    <Page size={[W, H]} style={{ backgroundColor: '#ffffff' }}>
      <View style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, paddingHorizontal: 46, paddingVertical: pagePad, justifyContent: 'center' }}>
        {/* Title */}
        <Text style={{ fontSize: titleSize, color: '#17263A', fontFamily: FONT, fontWeight: 800, textAlign: 'center', letterSpacing: 2, marginBottom: deal?.contract_months ? 6 : titleMB }}>
          {deal?.contract_months ? `${deal.contract_months}-MONTH PRICING` : 'PRICING'}
        </Text>
        {deal?.contract_months ? (
          <Text style={{ fontSize: 10, color: '#94a3b8', fontFamily: FONT, fontWeight: 400, textAlign: 'center', letterSpacing: 1, textTransform: 'uppercase', marginBottom: titleMB }}>
            {deal.contract_months}-Month Contract · Annual Investment
          </Text>
        ) : null}

        {/* Header row */}
        <View style={{ flexDirection: 'row', backgroundColor: '#17263A', paddingVertical: rowPadV, paddingHorizontal: 12, borderRadius: 2 }}>
          <Text style={{ flex: COL.product,   fontSize: hdrFSize, color: '#ffffff', fontFamily: FONT, fontWeight: 700 }}>PRODUCT</Text>
          <Text style={{ flex: COL.unit,      fontSize: hdrFSize, color: '#ffffff', fontFamily: FONT, fontWeight: 700 }}> </Text>
          <Text style={{ flex: COL.monthly,   fontSize: hdrFSize, color: '#ffffff', fontFamily: FONT, fontWeight: 700, textAlign: 'right' }}>MONTHLY</Text>
          <Text style={{ flex: COL.effective, fontSize: hdrFSize, color: '#ffffff', fontFamily: FONT, fontWeight: 700, textAlign: 'right' }}>EFFECTIVE</Text>
          <Text style={{ flex: COL.overage,   fontSize: hdrFSize, color: '#ffffff', fontFamily: FONT, fontWeight: 700, textAlign: 'right' }}>OVERAGE</Text>
          <Text style={{ flex: COL.total,     fontSize: hdrFSize, color: '#ffffff', fontFamily: FONT, fontWeight: 700, textAlign: 'right' }}>TOTAL</Text>
        </View>

        {/* Data rows */}
        {dealProducts.map((dp, idx) => {
          const lineTotal = productLineTotal(dp, m)
          const isGM = dp.commission_metric === 'GM'
          const isSupport = dp.products?.is_support_charge
          const isOneTime = dp.products?.billing_frequency === 'one_time'
          const isMilestone = dp.products?.billing_frequency === 'milestone'
          const snapshotRate = dp.unit_price_snapshot != null && dp.unit_price_snapshot !== '' ? parseFloat(dp.unit_price_snapshot) : null
          const effectiveRate = isGM && !isSupport && snapshotRate != null ? snapshotRate * m : null
          const overageRate = dp.overage_rate != null && dp.overage_rate !== '' ? parseFloat(dp.overage_rate) : null
          const rawQty = dp.monthly_quantity ?? dp.quantity
          const qty = isGM && !isSupport && rawQty != null && rawQty !== '' ? parseFloat(rawQty) : null
          const fixedMonthlyCost = (!isGM && !isOneTime && !isMilestone && lineTotal > 0) ? lineTotal / 12 : null
          const bg = idx % 2 === 0 ? '#f1f5f9' : '#ffffff'

          if (isOneTime) {
            return (
              <View key={dp.id} style={{ flexDirection: 'row', backgroundColor: bg, paddingVertical: rowPadV, paddingHorizontal: 12, alignItems: 'center' }}>
                <Text style={{ flex: COL.product, fontSize: rowFSize, color: '#0f2236', fontFamily: FONT, fontWeight: 600 }}>{dp.products?.name}</Text>
                <Text style={{ flex: COL.unit + COL.monthly + COL.effective + COL.overage, fontSize: rowFSizeSm, color: '#374151', fontFamily: FONT, fontWeight: 400, fontStyle: 'italic' }}>One-Time Fee</Text>
                <Text style={{ flex: COL.total, fontSize: rowFSize, color: '#0f2236', fontFamily: FONT, fontWeight: 700, textAlign: 'right' }}>{fmt(lineTotal)}</Text>
              </View>
            )
          }

          return (
            <View key={dp.id} style={{ flexDirection: 'row', backgroundColor: bg, paddingVertical: rowPadV, paddingHorizontal: 12, alignItems: 'center' }}>
              <Text style={{ flex: COL.product,   fontSize: rowFSize,   color: '#0f2236', fontFamily: FONT, fontWeight: 600 }}>{dp.products?.name}</Text>
              <Text style={{ flex: COL.unit,      fontSize: rowFSizeSm, color: '#374151', fontFamily: FONT, fontWeight: 400 }}>{dp.products?.unit_label || ''}</Text>
              <Text style={{ flex: COL.monthly,   fontSize: rowFSizeSm, color: '#374151', fontFamily: FONT, fontWeight: 400, fontStyle: 'italic', textAlign: 'right' }}>
                {qty != null ? Number(qty).toLocaleString('en-US') : fixedMonthlyCost != null ? fmt(fixedMonthlyCost) : ''}
              </Text>
              <Text style={{ flex: COL.effective, fontSize: rowFSizeSm, color: '#374151', fontFamily: FONT, fontWeight: 400, fontStyle: 'italic', textAlign: 'right' }}>
                {effectiveRate != null && effectiveRate > 0 ? `$ ${effectiveRate.toFixed(4)}` : ''}
              </Text>
              <Text style={{ flex: COL.overage,   fontSize: rowFSizeSm, color: '#374151', fontFamily: FONT, fontWeight: 400, fontStyle: 'italic', textAlign: 'right' }}>
                {overageRate != null ? `$ ${overageRate.toFixed(4)}` : ''}
              </Text>
              <Text style={{ flex: COL.total, fontSize: rowFSize, color: '#0f2236', fontFamily: FONT, fontWeight: 700, textAlign: 'right' }}>{fmt(lineTotal)}</Text>
            </View>
          )
        })}

        {/* Total row */}
        <View style={{ flexDirection: 'row', backgroundColor: '#17263A', paddingVertical: totalPadV, paddingHorizontal: 12, marginTop: 4, borderRadius: 2 }}>
          <Text style={{ flex: COL.product + COL.unit + COL.monthly + COL.effective + COL.overage, fontSize: totalFSize, color: '#ffffff', fontFamily: FONT, fontWeight: 700 }}>
            {hasOneTimeFees ? 'Total Investment:' : 'Annual Investment:'}
          </Text>
          <Text style={{ flex: COL.total, fontSize: totalFSize, color: '#57BB95', fontFamily: FONT, fontWeight: 700, textAlign: 'right' }}>{fmt(customerAcv)}</Text>
        </View>

        {/* Note */}
        {fields.note && (
          <Text style={{ fontSize: 11, color: '#64748b', fontFamily: FONT, fontWeight: 400, marginTop: 10, textAlign: 'center', fontStyle: 'italic' }}>
            {fields.note}
          </Text>
        )}
      </View>
    </Page>
  )
}

// ─── Form ────────────────────────────────────────────────────────────────────

export function PricingSlideForm({ fields = {}, onChange, deal, dealProducts = [], dealPartners = [] }) {
  const set = (key, val) => onChange({ ...fields, [key]: val })
  const productACV = computeProductAcv(dealProducts)
  const { customerAcv } = computePartnerStack(productACV, dealPartners)

  return (
    <div className="space-y-5">
      <div className="bg-primary-50 rounded-xl p-4 border border-primary-100">
        <p className="text-xs font-semibold text-primary-700 mb-1">Auto-generated from deal products</p>
        <p className="text-sm text-primary-600">
          The pricing table is built live from your deal's products and partners.
          Annual Investment: <strong>{fmt(customerAcv)}</strong> across {dealProducts.length} product{dealProducts.length !== 1 ? 's' : ''}.
        </p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Footer Note (optional)</label>
        <input
          type="text"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          placeholder="e.g. Pricing valid for 30 days. Subject to contract terms."
          value={fields.note || ''}
          onChange={(e) => set('note', e.target.value)}
        />
      </div>
    </div>
  )
}
