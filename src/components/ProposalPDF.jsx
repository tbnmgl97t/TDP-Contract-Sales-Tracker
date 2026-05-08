import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'

// Slide dimensions: US Letter in points (72pt/inch)
// 8.5" × 11" = 612 × 792 pt
const W = 612
const H = 792

const styles = StyleSheet.create({
  page: { width: W, height: H, position: 'relative', backgroundColor: '#ffffff' },
  bgImage: { position: 'absolute', top: 0, left: 0, width: W, height: H },
  zoneText: { position: 'absolute' },
  // Cover page styles
  coverPage: { width: W, height: H, backgroundColor: '#17263A', justifyContent: 'center', padding: 60 },
  coverTitle: { fontSize: 36, color: '#ffffff', fontFamily: 'Helvetica-Bold', marginBottom: 12 },
  coverSubtitle: { fontSize: 18, color: '#57BB95', fontFamily: 'Helvetica', marginBottom: 8 },
  coverMeta: { fontSize: 12, color: '#94a3b8', fontFamily: 'Helvetica', marginTop: 40 },
  // Pricing page styles
  pricingPage: { width: W, height: H, padding: 50, backgroundColor: '#ffffff' },
  sectionTitle: { fontSize: 22, color: '#17263A', fontFamily: 'Helvetica-Bold', marginBottom: 20 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f8fafc', padding: '8 10', borderBottom: '1 solid #e2e8f0' },
  tableRow: { flexDirection: 'row', padding: '8 10', borderBottom: '1 solid #f1f5f9' },
  tableCell: { fontSize: 10, color: '#374151', fontFamily: 'Helvetica', flex: 1 },
  tableCellRight: { fontSize: 10, color: '#374151', fontFamily: 'Helvetica', flex: 1, textAlign: 'right' },
  tableCellBold: { fontSize: 10, color: '#17263A', fontFamily: 'Helvetica-Bold', flex: 1 },
  totalRow: { flexDirection: 'row', padding: '10 10', backgroundColor: '#17263A' },
  totalLabel: { fontSize: 11, color: '#ffffff', fontFamily: 'Helvetica-Bold', flex: 3 },
  totalValue: { fontSize: 11, color: '#57BB95', fontFamily: 'Helvetica-Bold', flex: 1, textAlign: 'right' },
  // Team page
  teamPage: { width: W, height: H, padding: 50, backgroundColor: '#ffffff' },
  teamMember: { flexDirection: 'row', alignItems: 'center', padding: '10 0', borderBottom: '1 solid #f1f5f9' },
  teamName: { fontSize: 13, color: '#17263A', fontFamily: 'Helvetica-Bold', flex: 2 },
  teamRole: { fontSize: 11, color: '#6b7280', fontFamily: 'Helvetica', flex: 1 },
  teamAmount: { fontSize: 13, color: '#57BB95', fontFamily: 'Helvetica-Bold', flex: 1, textAlign: 'right' },
})

function fmt(n, dec = 2) {
  if (n == null || isNaN(n)) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

// Cover page — always first
function CoverPage({ deal, customerAcv }) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  return (
    <Page size="LETTER" style={styles.coverPage}>
      <Text style={styles.coverTitle}>{deal.name}</Text>
      <Text style={styles.coverSubtitle}>{deal.customers?.name || ''}</Text>
      <Text style={[styles.coverSubtitle, { fontSize: 14, color: '#cbd5e1', marginTop: 4 }]}>
        Proposal — {today}
      </Text>
      {customerAcv > 0 && (
        <View style={{ marginTop: 40, padding: 20, backgroundColor: '#1e3a5f', borderRadius: 8 }}>
          <Text style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'Helvetica', marginBottom: 4 }}>Annual Contract Value</Text>
          <Text style={{ fontSize: 28, color: '#57BB95', fontFamily: 'Helvetica-Bold' }}>{fmt(customerAcv)}</Text>
        </View>
      )}
      <Text style={styles.coverMeta}>Prepared by Trilogy Digital</Text>
    </Page>
  )
}

// Full-page template image slide (no zones or zones with content overlaid)
function TemplatePage({ template, zones, zoneContent }) {
  return (
    <Page size="LETTER" style={styles.page}>
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
              fontFamily: zone.font_weight === 'bold' ? 'Helvetica-Bold' : 'Helvetica',
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

// Pricing table page — always included, built from deal data
function PricingPage({ dealProducts, customerAcv, partnerMultiplier }) {
  const m = partnerMultiplier || 1
  return (
    <Page size="LETTER" style={styles.pricingPage}>
      <Text style={styles.sectionTitle}>Pricing Summary</Text>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableCellBold, { flex: 3 }]}>Product</Text>
        <Text style={[styles.tableCellBold, { textAlign: 'right' }]}>Annual Total</Text>
      </View>
      {dealProducts.map((dp) => {
        const lineTotal = (dp.total_revenue || dp.annual_value || dp.yearly_cost || 0) * m
        return (
          <View key={dp.id} style={styles.tableRow}>
            <Text style={[styles.tableCell, { flex: 3 }]}>{dp.products?.name}</Text>
            <Text style={styles.tableCellRight}>{fmt(lineTotal)}</Text>
          </View>
        )
      })}
      <View style={styles.totalRow}>
        <Text style={[styles.totalLabel, { flex: 3 }]}>Annual Investment</Text>
        <Text style={styles.totalValue}>{fmt(customerAcv)}</Text>
      </View>
    </Page>
  )
}

// Team page — only included when dealTeam has members
function TeamPage({ dealTeam }) {
  const sales = dealTeam.filter((m) => m.role === 'sales')
  const support = dealTeam.filter((m) => m.role === 'support')
  return (
    <Page size="LETTER" style={styles.teamPage}>
      <Text style={styles.sectionTitle}>Your Team</Text>
      {sales.length > 0 && (
        <>
          <Text style={{ fontSize: 11, color: '#6b7280', fontFamily: 'Helvetica', marginBottom: 8, marginTop: 8 }}>SALES</Text>
          {sales.map((m) => (
            <View key={m.id} style={styles.teamMember}>
              <Text style={styles.teamName}>{m.people?.name}</Text>
              <Text style={styles.teamRole}>Account Executive</Text>
            </View>
          ))}
        </>
      )}
      {support.length > 0 && (
        <>
          <Text style={{ fontSize: 11, color: '#6b7280', fontFamily: 'Helvetica', marginBottom: 8, marginTop: 16 }}>SUPPORT</Text>
          {support.map((m) => (
            <View key={m.id} style={styles.teamMember}>
              <Text style={styles.teamName}>{m.people?.name}</Text>
              <Text style={styles.teamRole}>Customer Success</Text>
            </View>
          ))}
        </>
      )}
    </Page>
  )
}

// Main export — the full PDF document
export default function ProposalPDF({ deal, dealProducts, dealTeam, dealPartners, selectedSlides, isManager }) {
  // Compute customer ACV (same logic as DealDetail)
  const productACV = dealProducts.reduce((s, p) => {
    if (p.commission_metric === 'GM') {
      if (p.monthly_cost != null && p.monthly_cost > 0) return s + p.monthly_cost * 12
      return s + (p.yearly_cost || (p.net_revenue || 0) + (p.cogs_amount || 0))
    }
    return s + (p.annual_value || 0)
  }, 0)
  let _cv = productACV
  ;(dealPartners || []).filter((p) => p.partner_id && parseFloat(p.commission_pct) > 0).forEach((p) => {
    const pct = parseFloat(p.commission_pct) / 100
    if (pct > 0 && pct < 1) _cv = _cv / (1 - pct)
  })
  const customerAcv = _cv
  const partnerMultiplier = productACV > 0 ? customerAcv / productACV : 1

  return (
    <Document>
      <CoverPage deal={deal} customerAcv={customerAcv} />
      {selectedSlides.map((slide) => (
        <TemplatePage
          key={slide.id}
          template={slide.template}
          zones={slide.zones || []}
          zoneContent={slide.zoneContent || {}}
        />
      ))}
      <PricingPage dealProducts={dealProducts} customerAcv={customerAcv} partnerMultiplier={partnerMultiplier} />
      {dealTeam.length > 0 && <TeamPage dealTeam={dealTeam} isManager={isManager} />}
    </Document>
  )
}
