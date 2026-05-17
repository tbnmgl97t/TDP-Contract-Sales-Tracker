import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer'
import { computeProductAcv, computePartnerStack, calcTotalCogs, calcTotalCommission, calcTotalSpif, calcIndividualCommission, calcCancelledContributions } from '../lib/deals'
import { resolveProductValue, effectiveCogs } from '../lib/products'

Font.register({
  family: 'Poppins',
  fonts: [
    { src: '/fonts/Poppins-Regular.ttf',  fontWeight: 400 },
    { src: '/fonts/Poppins-Medium.ttf',   fontWeight: 500 },
    { src: '/fonts/Poppins-SemiBold.ttf', fontWeight: 600 },
    { src: '/fonts/Poppins-Bold.ttf',     fontWeight: 700 },
  ],
})

// Brand colours
const NAVY   = '#17263A'
const GREEN  = '#57BB95'
const LIGHT  = '#F8FAFC'
const GRAY   = '#64748B'
const BORDER = '#E2E8F0'
const RED    = '#EF4444'

function money(n) {
  if (n == null || isNaN(n)) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function moneyK(n) {
  if (n == null || isNaN(n)) return '—'
  if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(1) + 'k'
  return money(n)
}
function pct(n) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toFixed(1) + '%'
}
function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const s = StyleSheet.create({
  page:      { fontFamily: 'Poppins', fontSize: 9, color: NAVY, backgroundColor: '#ffffff', padding: 0 },

  // Page 1 — header bar
  header:    { backgroundColor: NAVY, paddingHorizontal: 40, paddingVertical: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  headerL:   { flex: 1 },
  headerLabel:{ fontSize: 8, color: '#94A3B8', fontWeight: 500, letterSpacing: 1.2, marginBottom: 4 },
  dealName:  { fontSize: 20, fontWeight: 700, color: '#FFFFFF', marginBottom: 3 },
  company:   { fontSize: 11, fontWeight: 400, color: GREEN },
  prepFor:   { fontSize: 8, color: '#94A3B8', textAlign: 'right', marginBottom: 2 },
  prepName:  { fontSize: 11, fontWeight: 600, color: '#FFFFFF', textAlign: 'right' },
  genDate:   { fontSize: 8, color: '#64748B', textAlign: 'right', marginTop: 2 },

  // Stat cards row
  statsRow:  { flexDirection: 'row', paddingHorizontal: 40, paddingTop: 24, gap: 12 },
  statCard:  { flex: 1, backgroundColor: LIGHT, borderRadius: 8, padding: 14, borderWidth: 1, borderColor: BORDER },
  statLabel: { fontSize: 8, color: GRAY, fontWeight: 600, marginBottom: 5 },
  statValue: { fontSize: 16, fontWeight: 700, color: NAVY },
  statSub:   { fontSize: 8, color: GRAY, marginTop: 2 },

  // Approval badge
  approvedBadge: { backgroundColor: '#DCFCE7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 5 },
  approvedText:  { fontSize: 7, color: '#166534', fontWeight: 600 },
  pendingBadge:  { backgroundColor: '#FEF9C3', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 5 },
  pendingText:   { fontSize: 7, color: '#854D0E', fontWeight: 600 },

  // Section
  section:   { paddingHorizontal: 40, paddingTop: 22 },
  secTitle:  { fontSize: 9, fontWeight: 700, color: NAVY, marginBottom: 10 },

  // Table
  tableHead: { flexDirection: 'row', backgroundColor: NAVY, borderRadius: 5, paddingHorizontal: 10, paddingVertical: 8 },
  tableRow:  { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: BORDER },
  tableRowAlt:{ flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: BORDER, backgroundColor: LIGHT },
  thTxt:     { fontSize: 8, fontWeight: 600, color: '#FFFFFF' },
  tdTxt:     { fontSize: 8.5, color: NAVY },
  tdGray:    { fontSize: 8.5, color: GRAY },

  // Executive summary box
  summaryBox:{ backgroundColor: LIGHT, borderRadius: 8, borderWidth: 1, borderColor: BORDER, padding: 14, marginTop: 0 },
  summaryTxt:{ fontSize: 8.5, color: NAVY, lineHeight: 1.6 },

  // Justification
  justBox:   { backgroundColor: '#F0FDF4', borderRadius: 6, borderWidth: 1, borderColor: '#BBF7D0', padding: 10, marginTop: 5 },
  justTxt:   { fontSize: 8, color: '#166534', lineHeight: 1.5 },

  // Page 2
  p2Header:  { backgroundColor: NAVY, paddingHorizontal: 40, paddingVertical: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  p2Title:   { fontSize: 13, fontWeight: 700, color: '#FFFFFF' },
  p2Sub:     { fontSize: 8, color: '#94A3B8' },

  // Products table
  prodHead:  { flexDirection: 'row', backgroundColor: NAVY, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 8, marginBottom: 1 },
  prodRow:   { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 1, borderColor: BORDER },

  // Pricing stack
  priceRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderColor: BORDER },
  priceRowFinal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, marginTop: 2 },

  // Commission schedule
  schedHead: { flexDirection: 'row', backgroundColor: NAVY, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 8 },
  schedRow:  { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 7, borderBottomWidth: 1, borderColor: BORDER },
  schedRowAlt:{ flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 7, borderBottomWidth: 1, borderColor: BORDER, backgroundColor: LIGHT },

  footer: { position: 'absolute', bottom: 20, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between' },
  footerTxt: { fontSize: 7, color: '#CBD5E1' },
})


// ─── Page 1: Executive Summary ────────────────────────────────────────────────
function Page1({ deal, dealProducts, dealTeam, dealPartners, approval, asOfDate }) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  // Use the same lib functions as DealDetail + DealOverviewModal
  const activeProducts  = dealProducts.filter((dp) => dp.status !== 'cancelled')
  const cancelled       = calcCancelledContributions(dealProducts, deal.contract_months || 12)
  const trilogyAcv      = computeProductAcv(activeProducts) + cancelled.revenue
  const { customerAcv } = computePartnerStack(trilogyAcv, dealPartners)
  const displayCustomerAcv = customerAcv
  const totalCogs       = calcTotalCogs(activeProducts) + cancelled.cogs
  const netRevenue      = trilogyAcv - totalCogs
  const marginPct       = trilogyAcv > 0 ? (netRevenue / trilogyAcv) * 100 : 0
  const prodCommission  = deal.is_tbn_property ? 0 : calcTotalCommission(activeProducts)
  const totalSpif       = calcTotalSpif(dealTeam)
  const totalCommission = prodCommission + totalSpif
  const tcv             = displayCustomerAcv * (deal.contract_months || 12) / 12

  const salesTeam   = dealTeam.filter((m) => m.role === 'sales')
  const supportTeam = dealTeam.filter((m) => m.role === 'support')

  const isApproved = approval?.status === 'auto_approved' || approval?.status === 'approved'
  const isPending  = approval?.status === 'pending'

  return (
    <Page size="LETTER" orientation="landscape" style={s.page}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerL}>
          <Text style={s.headerLabel}>EXECUTIVE DEAL REPORT</Text>
          <Text style={s.dealName}>{deal.name}</Text>
          <Text style={s.company}>{deal.company_name}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Image src="/td_logo.png" style={{ width: 80, marginBottom: 6, opacity: 0.9 }} />
          <Text style={s.genDate}>{today}</Text>
          {asOfDate && (
            <Text style={[s.genDate, { color: '#57BB95', marginTop: 1 }]}>
              As of {new Date(asOfDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </Text>
          )}
          <Text style={[s.genDate, { marginTop: 1 }]}>
            {deal.contract_start ? `${fmtDate(deal.contract_start)} — ${fmtDate(deal.contract_end)}` : ''}
            {deal.contract_months ? `  ·  ${deal.contract_months} months` : ''}
          </Text>
        </View>
      </View>

      {/* Stat cards */}
      <View style={s.statsRow}>
        <View style={s.statCard}>
          <Text style={s.statLabel}>TOTAL CONTRACT VALUE</Text>
          <Text style={s.statValue}>{money(tcv)}</Text>
          <Text style={s.statSub}>{deal.contract_months || 12}-month term</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statLabel}>TRILOGY NET</Text>
          <Text style={s.statValue}>{money(netRevenue - totalCommission)}</Text>
          <Text style={s.statSub}>After COGS & commission</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statLabel}>TRILOGY MARGIN</Text>
          <Text style={[s.statValue, { color: marginPct >= 30 ? '#16A34A' : marginPct >= 15 ? '#D97706' : RED }]}>
            {pct(marginPct)}
          </Text>
          <Text style={s.statSub}>Gross margin</Text>
          <Text style={s.statSub}>{money(netRevenue)} / yr</Text>
          {isApproved && <View style={s.approvedBadge}><Text style={s.approvedText}>✓ Approved</Text></View>}
          {isPending  && <View style={s.pendingBadge}><Text style={s.pendingText}>⚠ Pending Approval</Text></View>}
        </View>
        <View style={s.statCard}>
          <Text style={s.statLabel}>TOTAL COMMISSION</Text>
          <Text style={s.statValue}>{money(totalCommission)}</Text>
          <Text style={s.statSub}>{dealTeam.length} team member{dealTeam.length !== 1 ? 's' : ''}</Text>
        </View>
        <View style={[s.statCard, { borderColor: NAVY }]}>
          <Text style={s.statLabel}>DEAL TYPE</Text>
          <Text style={[s.statValue, { fontSize: 12 }]}>{deal.deal_type === 'renewal' ? 'Renewal' : 'New Business'}</Text>
          <Text style={s.statSub}>{deal.stage?.charAt(0).toUpperCase() + deal.stage?.slice(1)}</Text>
        </View>
      </View>

      {/* Team + Justifications */}
      <View style={s.section}>
        <Text style={s.secTitle}>Deal Team & Commission Allocation</Text>

        {/* Header row */}
        <View style={s.tableHead}>
          <Text style={[s.thTxt, { flex: 2 }]}>Team Member</Text>
          <Text style={[s.thTxt, { flex: 1 }]}>Role</Text>
          <Text style={[s.thTxt, { flex: 1 }]}>Allocation</Text>
          <Text style={[s.thTxt, { flex: 1 }]}>Amount</Text>
          <Text style={[s.thTxt, { flex: 3 }]}>Justification</Text>
        </View>

        {[...salesTeam, ...supportTeam].map((m, i) => {
          const isSupport = m.role === 'support'
          const amount = isSupport
            ? (m.spif_amount || 0)
            : calcIndividualCommission(prodCommission, m.commission_percent)
          const alloc = isSupport ? 'SPIF' : `${m.commission_percent || 0}%`
          const just = stripHtml(m.commission_justification)
          const RowStyle = i % 2 === 0 ? s.tableRow : s.tableRowAlt
          return (
            <View key={m.id || i} style={RowStyle}>
              <Text style={[s.tdTxt, { flex: 2, fontWeight: 600 }]}>{m.people?.name || '—'}</Text>
              <Text style={[s.tdGray, { flex: 1 }]}>{isSupport ? 'Support' : 'Sales'}</Text>
              <Text style={[s.tdTxt, { flex: 1, color: GREEN, fontWeight: 600 }]}>{alloc}</Text>
              <Text style={[s.tdTxt, { flex: 1, fontWeight: 600 }]}>{money(amount)}</Text>
              <Text style={[s.tdGray, { flex: 3, lineHeight: 1.4 }]}>{just || '—'}</Text>
            </View>
          )
        })}
      </View>

      <View style={s.footer}>
        <Text style={s.footerTxt}>Trilogy Digital — Confidential</Text>
        <Text style={s.footerTxt}>Page 1 of 3</Text>
      </View>
    </Page>
  )
}

// ─── Page 2: Detailed Breakdown ───────────────────────────────────────────────
function Page2({ deal, dealProducts, dealPartners, quarterGroups }) {
  const activeProducts  = dealProducts.filter((dp) => dp.status !== 'cancelled')
  const cancelled       = calcCancelledContributions(dealProducts, deal.contract_months || 12)
  const trilogyAcv      = computeProductAcv(activeProducts) + cancelled.revenue
  const { customerAcv, partnerStack } = computePartnerStack(computeProductAcv(activeProducts), dealPartners)
  const displayCustomerAcv = customerAcv + cancelled.revenue
  const totalCogs       = calcTotalCogs(activeProducts) + cancelled.cogs
  const netRevenue      = trilogyAcv - totalCogs
  const totalCommission = deal.is_tbn_property ? 0 : calcTotalCommission(activeProducts)

  return (
    <Page size="LETTER" orientation="landscape" style={s.page}>
      {/* Header */}
      <View style={s.p2Header}>
        <View>
          <Text style={s.p2Title}>{deal.name} — Detailed Breakdown</Text>
          <Text style={s.p2Sub}>{deal.company_name}  ·  For internal review</Text>
        </View>
        <Text style={[s.p2Sub, { textAlign: 'right' }]}>Page 2 of 3</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 20, paddingHorizontal: 40, paddingTop: 20, flex: 1 }}>

        {/* Left: Products */}
        <View style={{ flex: 3 }}>
          <Text style={s.secTitle}>Products & Services</Text>
          <View style={s.prodHead}>
            <Text style={[s.thTxt, { flex: 3 }]}>Product</Text>
            <Text style={[s.thTxt, { flex: 1.2, textAlign: 'right' }]}>Monthly</Text>
            <Text style={[s.thTxt, { flex: 1.2, textAlign: 'right' }]}>Annual</Text>
            <Text style={[s.thTxt, { flex: 1, textAlign: 'right' }]}>Margin</Text>
            <Text style={[s.thTxt, { flex: 1.2, textAlign: 'right' }]}>Commission</Text>
          </View>

          {activeProducts.map((dp, i) => {
            const annual = computeProductAcv([dp])
            const monthly = annual > 0 ? annual / 12 : null
            const cogs = effectiveCogs(dp)
            const marginP = annual > 0 ? ((annual - cogs) / annual) * 100 : null
            return (
              <View key={dp.id || i} style={i % 2 === 0 ? s.prodRow : [s.prodRow, { backgroundColor: LIGHT }]}>
                <Text style={[s.tdTxt, { flex: 3, fontWeight: 500 }]}>{dp.products?.name || '—'}</Text>
                <Text style={[s.tdGray, { flex: 1.2, textAlign: 'right' }]}>{monthly != null ? money(monthly) : '—'}</Text>
                <Text style={[s.tdTxt, { flex: 1.2, textAlign: 'right', fontWeight: 600 }]}>{money(annual)}</Text>
                <Text style={[s.tdTxt, { flex: 1, textAlign: 'right', color: marginP != null && marginP >= 30 ? '#16A34A' : marginP != null && marginP < 15 ? RED : '#D97706' }]}>
                  {marginP != null ? pct(marginP) : '—'}
                </Text>
                <Text style={[s.tdTxt, { flex: 1.2, textAlign: 'right' }]}>{money(dp.commission_amount)}</Text>
              </View>
            )
          })}

        </View>

        {/* Right: Pricing stack */}
        <View style={{ flex: 1.4 }}>
          <Text style={s.secTitle}>Pricing Stack</Text>
          <View style={{ backgroundColor: LIGHT, borderRadius: 8, borderWidth: 1, borderColor: BORDER, padding: 14 }}>

            <View style={s.priceRow}>
              <Text style={s.tdGray}>Vendor Cost (COGS)</Text>
              <Text style={[s.tdTxt, { fontWeight: 600 }]}>{money(totalCogs)}</Text>
            </View>
            <View style={s.priceRow}>
              <Text style={{ fontSize: 8, color: '#16A34A', fontWeight: 600 }}>+ Trilogy Margin</Text>
              <Text style={{ fontSize: 8, color: '#16A34A', fontWeight: 700 }}>+{money(netRevenue)}</Text>
            </View>
            <View style={[s.priceRow, { borderBottomWidth: 0 }]}>
              <Text style={[s.tdTxt, { fontWeight: 700 }]}>Trilogy ACV</Text>
              <Text style={[s.tdTxt, { fontWeight: 700 }]}>{money(trilogyAcv)}</Text>
            </View>

            {dealPartners.length > 0 && (
              <>
                <View style={{ height: 1, backgroundColor: BORDER, marginVertical: 8 }} />
                {partnerStack.map((p, i) => (
                  <View key={i} style={s.priceRow}>
                    <Text style={s.tdGray}>{p.partners?.name || 'Partner'} ({p.commission_pct}%)</Text>
                    <Text style={[s.tdTxt, { color: '#7C3AED', fontWeight: 600 }]}>+{money(p.commission_amount)}</Text>
                  </View>
                ))}
                <View style={[s.priceRow, { borderBottomWidth: 0 }]}>
                  <Text style={[s.tdTxt, { fontWeight: 700 }]}>Customer ACV</Text>
                  <Text style={[s.tdTxt, { fontWeight: 700 }]}>{money(displayCustomerAcv)}</Text>
                </View>
              </>
            )}

            <View style={{ height: 1, backgroundColor: BORDER, marginVertical: 8 }} />
            <View style={s.priceRow}>
              <Text style={s.tdGray}>Sales Commission</Text>
              <Text style={[s.tdTxt, { fontWeight: 600 }]}>{money(totalCommission)}</Text>
            </View>
            <View style={[s.priceRowFinal, { backgroundColor: NAVY, borderRadius: 6, paddingHorizontal: 10 }]}>
              <Text style={{ fontSize: 8, color: '#94A3B8', fontWeight: 600 }}>Trilogy Take-Home</Text>
              <Text style={{ fontSize: 9, color: GREEN, fontWeight: 700 }}>{money(netRevenue - totalCommission)}</Text>
            </View>
          </View>

          {/* Margin indicator */}
          {trilogyAcv > 0 && (
            <View style={{ marginTop: 12, backgroundColor: LIGHT, borderRadius: 8, borderWidth: 1, borderColor: BORDER, padding: 12 }}>
              <Text style={s.statLabel}>MARGIN BREAKDOWN</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={s.tdGray}>Gross Margin</Text>
                <Text style={[s.tdTxt, { fontWeight: 600 }]}>{pct((netRevenue / trilogyAcv) * 100)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={s.tdGray}>After Commission</Text>
                <Text style={[s.tdTxt, { fontWeight: 600, color: GREEN }]}>
                  {trilogyAcv > 0 ? pct(((netRevenue - totalCommission) / trilogyAcv) * 100) : '—'}
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>

      <View style={s.footer}>
        <Text style={s.footerTxt}>Trilogy Digital — Confidential · {deal.name}</Text>
        <Text style={s.footerTxt}>Page 2 of 3</Text>
      </View>
    </Page>
  )
}

// ─── Page 3: Commission Schedule ─────────────────────────────────────────────
function Page3({ deal, quarterGroups }) {
  const quarters = Object.values(quarterGroups || {}).sort((a, b) => a.year !== b.year ? a.year - b.year : a.quarter - b.quarter)

  if (!quarters.length) return null

  return (
    <Page size="LETTER" orientation="landscape" style={s.page}>
      {/* Header */}
      <View style={s.p2Header}>
        <View>
          <Text style={s.p2Title}>{deal.name} — Commission Schedule</Text>
          <Text style={s.p2Sub}>{deal.company_name}  ·  Quarterly payout breakdown</Text>
        </View>
        <Text style={[s.p2Sub, { textAlign: 'right' }]}>Page 3 of 3</Text>
      </View>

      <View style={{ paddingHorizontal: 40, paddingTop: 24 }}>
        {/* Table header */}
        <View style={s.schedHead}>
          <Text style={[s.thTxt, { flex: 1 }]}>Quarter</Text>
          <Text style={[s.thTxt, { flex: 2.5 }]}>Person</Text>
          <Text style={[s.thTxt, { flex: 1.5 }]}>Type</Text>
          <Text style={[s.thTxt, { flex: 1, textAlign: 'right' }]}>Amount</Text>
        </View>

        {quarters.map((group, gi) =>
          group.entries.map((entry, ei) => {
            const rowIdx = quarters.slice(0, gi).reduce((sum, g) => sum + g.entries.length, 0) + ei
            const isGroupStart = ei === 0
            const isGroupEnd = ei === group.entries.length - 1
            return (
              <View key={`${group.key}-${ei}`} style={[
                rowIdx % 2 === 0 ? s.schedRow : s.schedRowAlt,
                isGroupEnd && gi < quarters.length - 1 ? { marginBottom: 6 } : {},
              ]}>
                <Text style={[s.tdTxt, { flex: 1, fontWeight: 700, color: isGroupStart ? NAVY : 'transparent' }]}>
                  {`${group.year} Q${group.quarter}`}
                </Text>
                <Text style={[s.tdTxt, { flex: 2.5 }]}>{entry.person_name}</Text>
                <Text style={[s.tdGray, { flex: 1.5 }]}>{entry.type === 'spif' ? 'SPIF' : 'Commission'}</Text>
                <Text style={[s.tdTxt, { flex: 1, textAlign: 'right', fontWeight: 600, color: GREEN }]}>{money(entry.amount)}</Text>
              </View>
            )
          })
        )}
      </View>

      <View style={s.footer}>
        <Text style={s.footerTxt}>Trilogy Digital — Confidential · {deal.name}</Text>
        <Text style={s.footerTxt}>Page 3 of 3</Text>
      </View>
    </Page>
  )
}

// ─── Document export ──────────────────────────────────────────────────────────
export default function ExecReportPDF({ deal, dealProducts, dealTeam, dealPartners, approval, quarterGroups, asOfDate }) {
  return (
    <Document title={`${deal.name} — Executive Report`} author="Trilogy Digital" creator="SalesFlow">
      <Page1
        deal={deal}
        dealProducts={dealProducts}
        dealTeam={dealTeam}
        dealPartners={dealPartners}
        approval={approval}
        asOfDate={asOfDate}
      />
      <Page2
        deal={deal}
        dealProducts={dealProducts}
        dealPartners={dealPartners}
      />
      <Page3
        deal={deal}
        quarterGroups={quarterGroups}
      />
    </Document>
  )
}
