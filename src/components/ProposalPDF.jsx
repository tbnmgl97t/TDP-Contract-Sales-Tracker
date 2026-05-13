import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer'
import { computeProductAcv, computePartnerStack } from '../lib/deals'
import { productLineTotal } from '../lib/products'

// Register Poppins (Trilogy Digital brand font)
Font.register({
  family: 'Poppins',
  fonts: [
    { src: '/fonts/Poppins-Regular.ttf',   fontWeight: 400 },
    { src: '/fonts/Poppins-Medium.ttf',    fontWeight: 500 },
    { src: '/fonts/Poppins-SemiBold.ttf',  fontWeight: 600 },
    { src: '/fonts/Poppins-Bold.ttf',      fontWeight: 700 },
    { src: '/fonts/Poppins-ExtraBold.ttf', fontWeight: 800 },
    { src: '/fonts/Poppins-Italic.ttf',    fontWeight: 400, fontStyle: 'italic' },
  ],
})

// Slide dimensions: 16:9 widescreen in points (72pt/inch)
// 13.33" × 7.5" = 960 × 540 pt  (matches 1920×1080 at 2x)
const W = 960
const H = 540

const styles = StyleSheet.create({
  page: { width: W, height: H, position: 'relative', backgroundColor: '#ffffff' },
  bgImage: { position: 'absolute', top: 0, left: 0, width: W, height: H },
  zoneText: { position: 'absolute' },
  // Cover page styles
  coverPage: { width: W, height: H, backgroundColor: '#17263A', justifyContent: 'center', padding: 70, flexDirection: 'column' },
  coverTitle:    { fontSize: 42, color: '#ffffff', fontFamily: 'Poppins', fontWeight: 800, marginBottom: 10 },
  coverSubtitle: { fontSize: 20, color: '#57BB95', fontFamily: 'Poppins', fontWeight: 400, marginBottom: 6 },
  coverMeta:     { fontSize: 12, color: '#64748b', fontFamily: 'Poppins', fontWeight: 400, marginTop: 32 },
  // Pricing page styles
  sectionTitle: { fontSize: 22, color: '#17263A', fontFamily: 'Poppins', fontWeight: 700, marginBottom: 20 },
  tableCell:     { fontSize: 10, color: '#374151', fontFamily: 'Poppins', fontWeight: 400, flex: 1 },
  tableCellBold: { fontSize: 10, color: '#17263A', fontFamily: 'Poppins', fontWeight: 600, flex: 1 },
})

function fmt(n, dec = 2) {
  if (n == null || isNaN(n)) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

// Overview (cover) page
function CoverPage({ deal, customerAcv, backgroundUrl, userName, userEmail }) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const hasBg = !!backgroundUrl
  return (
    <Page size={[W, H]} style={hasBg ? { width: W, height: H } : styles.coverPage}>
      {hasBg && <Image src={backgroundUrl} style={{ position: 'absolute', top: 0, left: 0, width: W, height: H }} />}
      <View style={hasBg
        ? { position: 'absolute', top: 0, left: 0, width: W, height: H, justifyContent: 'center', padding: 70, flexDirection: 'column' }
        : { flexDirection: 'column' }
      }>
        <Text style={styles.coverTitle}>{deal.name}</Text>
        <Text style={styles.coverSubtitle}>{deal.customers?.name || ''}</Text>
        <Text style={[styles.coverSubtitle, { fontSize: 14, color: '#cbd5e1', marginTop: 4 }]}>
          Proposal — {today}{deal.contract_months ? `  ·  ${deal.contract_months}-Month Contract` : ''}
        </Text>
        {(userName || userEmail) && (
          <View style={{ marginTop: 12 }}>
            {userName && userName !== userEmail
              ? <Text style={{ fontSize: 13, color: '#ffffff', fontFamily: 'Poppins', fontWeight: 600 }}>{userName}</Text>
              : null}
            {userEmail
              ? <Text style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'Poppins', fontWeight: 400, marginTop: 2 }}>{userEmail}</Text>
              : null}
          </View>
        )}
        {customerAcv > 0 && (
          <View style={{ marginTop: 40, padding: 20, backgroundColor: hasBg ? 'rgba(30,58,95,0.85)' : '#1e3a5f', borderRadius: 8 }}>
            <Text style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'Poppins', fontWeight: 400, marginBottom: 4 }}>Annual Contract Value</Text>
            <Text style={{ fontSize: 28, color: '#57BB95', fontFamily: 'Poppins', fontWeight: 800 }}>{fmt(customerAcv)}</Text>
          </View>
        )}
      </View>
    </Page>
  )
}

// Full-page template image slide (no zones or zones with content overlaid)
function TemplatePage({ template, zones, zoneContent }) {
  return (
    <Page size={[W, H]} style={styles.page}>
      <Image src={template.image_url} style={styles.bgImage} />
      {zones.map((zone) => {
        const text = zoneContent[zone.id] || zone.default_text || ''
        if (!text) return null
        return (
          <Text
            key={zone.id}
            style={[styles.zoneText, {
              left: (zone.x_pct / 100) * W,
              top: (zone.y_pct / 100) * H,
              width: (zone.w_pct / 100) * W,
              height: (zone.h_pct / 100) * H,
              fontSize: zone.font_size,
              color: zone.font_color,
              fontFamily: 'Poppins',
              fontWeight: zone.font_weight === 'bold' ? 700 : 400,
              textAlign: zone.text_align,
            }]}
          >
            {text}
          </Text>
        )
      })}
    </Page>
  )
}

// Pricing table page — built from deal data
function PricingPage({ dealProducts, customerAcv, partnerMultiplier, backgroundUrl }) {
  const m = partnerMultiplier || 1
  const hasBg = !!backgroundUrl
  const hasOneTimeFees = dealProducts.some((dp) => dp.products?.billing_frequency === 'one_time')
  const textPrimary = hasBg ? '#ffffff' : '#0f2236'
  const textSecondary = hasBg ? '#cbd5e1' : '#374151'
  const rowEven = hasBg ? 'rgba(87,187,149,0.18)' : '#daf0e8'
  const rowOdd = hasBg ? 'rgba(255,255,255,0.06)' : '#f0faf6'
  const COL = { product: 2.8, unit: 1.8, monthly: 1.4, effective: 1.4, overage: 1.4, total: 1.6 }

  return (
    <Page size={[W, H]} style={{ backgroundColor: hasBg ? undefined : '#f4faf7' }}>
      {hasBg && <Image src={backgroundUrl} style={{ position: 'absolute', top: 0, left: 0, width: W, height: H }} />}
      <View style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, paddingHorizontal: 46, paddingVertical: 30, justifyContent: 'center' }}>

        {/* Title */}
        <Text style={{ fontSize: 32, color: textPrimary, fontFamily: 'Poppins', fontWeight: 800, textAlign: 'center', letterSpacing: 2, marginBottom: 20 }}>
          ONE YEAR PRICING
        </Text>

        {/* Header row */}
        <View style={{ flexDirection: 'row', backgroundColor: '#57BB95', paddingVertical: 11, paddingHorizontal: 12, borderRadius: 2 }}>
          <Text style={{ flex: COL.product,   fontSize: 13, color: '#ffffff', fontFamily: 'Poppins', fontWeight: 700 }}>PRODUCT</Text>
          <Text style={{ flex: COL.unit,      fontSize: 13, color: '#ffffff', fontFamily: 'Poppins', fontWeight: 700 }}> </Text>
          <Text style={{ flex: COL.monthly,   fontSize: 13, color: '#ffffff', fontFamily: 'Poppins', fontWeight: 700, textAlign: 'right' }}>MONTHLY</Text>
          <Text style={{ flex: COL.effective, fontSize: 13, color: '#ffffff', fontFamily: 'Poppins', fontWeight: 700, textAlign: 'right' }}>EFFECTIVE</Text>
          <Text style={{ flex: COL.overage,   fontSize: 13, color: '#ffffff', fontFamily: 'Poppins', fontWeight: 700, textAlign: 'right' }}>OVERAGE</Text>
          <Text style={{ flex: COL.total,     fontSize: 13, color: '#ffffff', fontFamily: 'Poppins', fontWeight: 700, textAlign: 'right' }}>TOTAL</Text>
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
          // For fixed-price recurring products, monthly = lineTotal/12 (always consistent with Total column)
          const fixedMonthlyCost = (!isGM && !isOneTime && !isMilestone && lineTotal > 0)
            ? lineTotal / 12
            : null
          const bg = idx % 2 === 0 ? rowEven : rowOdd

          // For one-time fees, collapse the middle columns and show a "One-Time Fee" label
          if (isOneTime) {
            return (
              <View key={dp.id} style={{ flexDirection: 'row', backgroundColor: bg, paddingVertical: 11, paddingHorizontal: 12, alignItems: 'center' }}>
                <Text style={{ flex: COL.product, fontSize: 13, color: textPrimary, fontFamily: 'Poppins', fontWeight: 600 }}>
                  {dp.products?.name}
                </Text>
                <Text style={{ flex: COL.unit + COL.monthly + COL.effective + COL.overage, fontSize: 11, color: textSecondary, fontFamily: 'Poppins', fontWeight: 400, fontStyle: 'italic' }}>
                  One-Time Fee
                </Text>
                <Text style={{ flex: COL.total, fontSize: 13, color: textPrimary, fontFamily: 'Poppins', fontWeight: 700, textAlign: 'right' }}>
                  {fmt(lineTotal)}
                </Text>
              </View>
            )
          }

          return (
            <View key={dp.id} style={{ flexDirection: 'row', backgroundColor: bg, paddingVertical: 11, paddingHorizontal: 12, alignItems: 'center' }}>
              <Text style={{ flex: COL.product,   fontSize: 13, color: textPrimary,   fontFamily: 'Poppins', fontWeight: 600 }}>
                {dp.products?.name}
              </Text>
              <Text style={{ flex: COL.unit,      fontSize: 11, color: textSecondary, fontFamily: 'Poppins', fontWeight: 400 }}>
                {dp.products?.unit_label || ''}
              </Text>
              <Text style={{ flex: COL.monthly,   fontSize: 12, color: textSecondary, fontFamily: 'Poppins', fontWeight: 400, fontStyle: 'italic', textAlign: 'right' }}>
                {qty != null ? Number(qty).toLocaleString('en-US') : fixedMonthlyCost != null ? fmt(fixedMonthlyCost) : ''}
              </Text>
              <Text style={{ flex: COL.effective, fontSize: 12, color: textSecondary, fontFamily: 'Poppins', fontWeight: 400, fontStyle: 'italic', textAlign: 'right' }}>
                {effectiveRate != null && effectiveRate > 0 ? `$ ${effectiveRate.toFixed(4)}` : ''}
              </Text>
              <Text style={{ flex: COL.overage,   fontSize: 12, color: textSecondary, fontFamily: 'Poppins', fontWeight: 400, fontStyle: 'italic', textAlign: 'right' }}>
                {overageRate != null ? `$ ${overageRate.toFixed(4)}` : ''}
              </Text>
              <Text style={{ flex: COL.total,     fontSize: 13, color: textPrimary,   fontFamily: 'Poppins', fontWeight: 700, textAlign: 'right' }}>
                {fmt(lineTotal)}
              </Text>
            </View>
          )
        })}

        {/* Annual Investment row */}
        <View style={{ flexDirection: 'row', backgroundColor: hasBg ? 'rgba(15,34,54,0.85)' : '#17263A', paddingVertical: 12, paddingHorizontal: 12, marginTop: 4, borderRadius: 2 }}>
          <Text style={{ flex: COL.product + COL.unit + COL.monthly + COL.effective + COL.overage, fontSize: 14, color: '#ffffff', fontFamily: 'Poppins', fontWeight: 700 }}>
            {hasOneTimeFees ? 'Total Investment:' : 'Annual Investment:'}
          </Text>
          <Text style={{ flex: COL.total, fontSize: 14, color: '#57BB95', fontFamily: 'Poppins', fontWeight: 700, textAlign: 'right' }}>
            {fmt(customerAcv)}
          </Text>
        </View>

      </View>
    </Page>
  )
}

// Main export — the full PDF document
export default function ProposalPDF({ deal, dealProducts, dealPartners, selectedSlides, isManager, dataBackgroundUrl, userName, userEmail }) {
  const productACV = computeProductAcv(dealProducts)
  const { customerAcv, partnerMultiplier } = computePartnerStack(productACV, dealPartners)

  return (
    <Document>
      {selectedSlides.map((slide) => {
        if (slide.type === 'cover') {
          return <CoverPage key="__cover__" deal={deal} customerAcv={customerAcv} backgroundUrl={dataBackgroundUrl} userName={userName} userEmail={userEmail} />
        }
        if (slide.type === 'pricing') {
          return <PricingPage key="__pricing__" dealProducts={dealProducts} customerAcv={customerAcv} partnerMultiplier={partnerMultiplier} backgroundUrl={dataBackgroundUrl} />
        }
        return (
          <TemplatePage
            key={slide.id}
            template={slide.template}
            zones={slide.zones || []}
            zoneContent={slide.zoneContent || {}}
          />
        )
      })}
    </Document>
  )
}
