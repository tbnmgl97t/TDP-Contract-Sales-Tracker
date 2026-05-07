import { useRef } from 'react'
import { X, Download } from 'lucide-react'
import { format } from 'date-fns'
import { fmt } from '../lib/commission'

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtRate(val, decimals = 4) {
  if (val == null || val === '') return '—'
  const n = parseFloat(val)
  if (isNaN(n) || n === 0) return '—'
  return `$${n.toFixed(decimals)}`
}

function fmtQty(val) {
  if (val == null || val === '') return '—'
  const n = parseFloat(val)
  if (isNaN(n) || n === 0) return '—'
  return n.toLocaleString()
}

// Build proposal rows from deal_products, marking up by partner commission
// partnerMultiplier = 1 / (1 - totalPartnerPct)  e.g. 1/0.925 for 7.5%
function buildRows(dealProducts, partnerMultiplier = 1) {
  const rows = []
  for (const dp of dealProducts) {
    const prod = dp.products
    if (!prod) continue

    const isGM = dp.commission_metric === 'GM'
    const isSupport = !!prod.is_support_charge
    const m = partnerMultiplier

    if (isSupport) {
      rows.push({
        product: prod.name,
        unit: '',
        monthly: '',
        effective: '',
        overage: '',
        total: (dp.annual_value || 0) * m,
        isSupport: true,
      })
    } else if (isGM) {
      const qty = dp.monthly_quantity || dp.quantity || ''
      const effectiveRate = dp.unit_price_snapshot ? parseFloat(dp.unit_price_snapshot) * m : null
      const overageRate = dp.overage_rate ? parseFloat(dp.overage_rate) * m : null
      const lineTotal = (dp.total_revenue || dp.yearly_cost || 0) * m
      rows.push({
        product: prod.name,
        unit: prod.unit_label || '',
        monthly: qty,
        effective: effectiveRate,
        overage: overageRate,
        total: lineTotal,
        isSupport: false,
      })
    } else {
      // NAVC/RAV flat-rate
      rows.push({
        product: prod.name,
        unit: '',
        monthly: '',
        effective: '',
        overage: '',
        total: (dp.annual_value || dp.yearly_cost || 0) * m,
        isSupport: false,
      })
    }
  }
  return rows
}

// ─── Slide components ────────────────────────────────────────────────────────

function PlayTriangle({ style, color = '#CBDD56', small = false }) {
  const size = small ? 60 : 340
  return (
    <svg
      width={size}
      height={size * 0.96}
      viewBox="0 0 100 96"
      style={style}
    >
      <polygon points="0,0 100,48 0,96" fill={color} />
    </svg>
  )
}

const SLIDE_STYLE = {
  width: '100%',
  aspectRatio: '16/9',
  background: '#132338',
  backgroundImage:
    'radial-gradient(ellipse at 85% 10%, rgba(0,133,123,0.35) 0%, transparent 55%), radial-gradient(ellipse at 15% 90%, rgba(87,187,149,0.18) 0%, transparent 45%)',
  fontFamily: "'Poppins', system-ui, sans-serif",
  color: '#FFFFFF',
  position: 'relative',
  overflow: 'hidden',
  pageBreakAfter: 'always',
  breakAfter: 'page',
}

// Small Trilogy "T>" logo for top-left corner of each slide
function TrilogyCornerLogo() {
  return (
    <div style={{
      position: 'absolute', top: '4%', left: '3.5%',
      display: 'flex', alignItems: 'center', gap: 6, zIndex: 10,
    }}>
      <svg width="28" height="22" viewBox="0 0 28 22">
        <defs>
          <linearGradient id="tg" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#57BB95" />
            <stop offset="100%" stopColor="#CBDD56" />
          </linearGradient>
        </defs>
        <polygon points="0,0 20,11 0,22" fill="url(#tg)" />
        <polygon points="14,4 28,11 14,18" fill="url(#tg)" opacity="0.65" />
      </svg>
      <span style={{ fontSize: '0.75em', fontWeight: 700, letterSpacing: '0.12em', color: '#FFFFFF', lineHeight: 1 }}>
        TRILOGY DIGITAL
      </span>
    </div>
  )
}

// Slide 1 — Cover
function SlideCover() {
  return (
    <div style={SLIDE_STYLE}>
      <TrilogyCornerLogo />
      {/* Large Trilogy logo centered-left */}
      <div style={{
        position: 'absolute', left: '8%', top: '50%', transform: 'translateY(-50%)',
        display: 'flex', alignItems: 'center', gap: 18,
      }}>
        <svg width="90" height="72" viewBox="0 0 28 22">
          <defs>
            <linearGradient id="tg2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#57BB95" />
              <stop offset="100%" stopColor="#CBDD56" />
            </linearGradient>
          </defs>
          <polygon points="0,0 20,11 0,22" fill="url(#tg2)" />
          <polygon points="14,4 28,11 14,18" fill="url(#tg2)" opacity="0.65" />
        </svg>
        <div>
          <div style={{ fontSize: '2.8em', fontWeight: 800, letterSpacing: '0.15em', lineHeight: 1 }}>TRILOGY</div>
          <div style={{ fontSize: '2.8em', fontWeight: 300, letterSpacing: '0.25em', lineHeight: 1 }}>DIGITAL</div>
        </div>
      </div>

      {/* Decorative triangles right side */}
      <div style={{ position: 'absolute', right: '4%', top: '10%' }}>
        <PlayTriangle color="#CBDD56" />
      </div>
      <div style={{ position: 'absolute', right: '1%', bottom: '5%' }}>
        <PlayTriangle color="#57BB95" small />
      </div>
      <div style={{ position: 'absolute', right: '18%', top: '5%' }}>
        <PlayTriangle color="#CBDD56" small style={{ opacity: 0.6 }} />
      </div>
    </div>
  )
}

// Slide 2 — Presenter / Client info
function SlideContact({ deal, presentedBy, presentedDate }) {
  return (
    <div style={SLIDE_STYLE}>
      <TrilogyCornerLogo />
      {/* Presenter block */}
      <div style={{
        position: 'absolute', left: '10%', top: '50%', transform: 'translateY(-50%)',
        lineHeight: 1.7,
      }}>
        <div style={{ fontSize: '1em', fontWeight: 300, opacity: 0.7, marginBottom: 4 }}>
          {presentedDate}
        </div>
        <div style={{ fontSize: '1.3em', fontWeight: 700, marginBottom: 2 }}>
          {presentedBy?.name || 'Marcus Lopez'}
        </div>
        <div style={{ fontSize: '0.9em', fontWeight: 400, opacity: 0.75 }}>
          {presentedBy?.email || 'mlopez@trilogydigital.com'}
        </div>
      </div>

      {/* Client name right side */}
      <div style={{
        position: 'absolute', right: '8%', top: '50%', transform: 'translateY(-50%)',
        textAlign: 'right',
      }}>
        <div style={{ fontSize: '2.2em', fontWeight: 800, letterSpacing: '0.08em', lineHeight: 1 }}>
          {(deal.company_name || '').toUpperCase()}
        </div>
        <div style={{
          width: '100%', height: 4, marginTop: 10,
          background: 'linear-gradient(90deg, #57BB95, #CBDD56)',
          borderRadius: 2,
        }} />
      </div>
    </div>
  )
}

// Slide 3 — Pricing table
function SlidePricing({ rows, totalRevenue, deal }) {
  const contractYear = deal.contract_start
    ? new Date(deal.contract_start + 'T12:00:00').getFullYear()
    : new Date().getFullYear()

  return (
    <div style={{ ...SLIDE_STYLE, display: 'flex', flexDirection: 'column', padding: '4% 4% 3%' }}>
      <TrilogyCornerLogo />

      {/* Title */}
      <div style={{
        textAlign: 'center', fontWeight: 800, fontSize: '1.4em',
        letterSpacing: '0.2em', marginBottom: '3%', marginTop: '4%',
        color: '#FFFFFF',
      }}>
        {contractYear} ANNUAL PRICING
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowX: 'auto' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse',
          fontSize: '0.72em', color: '#132338',
        }}>
          <thead>
            <tr style={{ background: '#CBDD56' }}>
              {['PRODUCT', '', 'MONTHLY', 'EFFECTIVE', 'OVERAGE', 'TOTAL'].map((h, i) => (
                <th key={i} style={{
                  padding: '6px 10px',
                  textAlign: i >= 2 ? 'right' : 'left',
                  fontWeight: 700, fontSize: '0.9em', letterSpacing: '0.06em',
                  borderBottom: '3px solid #00857B',
                  whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const bg = i % 2 === 0 ? '#9AD6BF' : 'rgba(255,255,255,0.06)'
              const textColor = i % 2 === 0 ? '#132338' : '#FFFFFF'
              return (
                <tr key={i} style={{ background: bg }}>
                  <td style={{ padding: '6px 10px', fontWeight: 700, color: textColor }}>{row.product}</td>
                  <td style={{ padding: '6px 10px', color: textColor, opacity: 0.75, fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                    {row.unit}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', color: textColor }}>{fmtQty(row.monthly)}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', color: textColor }}>{fmtRate(row.effective, 4)}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', color: textColor }}>{fmtRate(row.overage, 4)}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: textColor }}>
                    {fmt(row.total, 2)}
                  </td>
                </tr>
              )
            })}
            {/* Total row */}
            <tr style={{ background: '#CBDD56', borderTop: '2px solid #00857B' }}>
              <td colSpan={5} style={{ padding: '7px 10px', fontWeight: 800, color: '#132338', letterSpacing: '0.05em' }}>
                ANNUAL INVESTMENT:
              </td>
              <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: '#132338', fontSize: '1.05em' }}>
                {fmt(totalRevenue, 2)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Slide 4 — Thank You
function SlideThankYou() {
  return (
    <div style={SLIDE_STYLE}>
      <TrilogyCornerLogo />
      {/* Thank You text */}
      <div style={{
        position: 'absolute', left: '10%', top: '50%', transform: 'translateY(-50%)',
      }}>
        <div style={{ fontSize: '4.5em', fontWeight: 800, lineHeight: 1 }}>Thank You</div>
        <div style={{ fontSize: '1em', fontWeight: 400, opacity: 0.6, marginTop: 12 }}>
          www.trilogydigital.com
        </div>
      </div>
      {/* Decorative triangles */}
      <div style={{ position: 'absolute', right: '4%', top: '8%' }}>
        <svg width="320" height="308" viewBox="0 0 100 96">
          <defs>
            <linearGradient id="tg3" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#CBDD56" />
              <stop offset="100%" stopColor="#00857B" />
            </linearGradient>
          </defs>
          <polygon points="0,0 100,48 0,96" fill="url(#tg3)" />
        </svg>
      </div>
      <div style={{ position: 'absolute', right: '8%', bottom: '8%' }}>
        <PlayTriangle color="#57BB95" small />
      </div>
      <div style={{ position: 'absolute', right: '30%', top: '8%' }}>
        <PlayTriangle color="#CBDD56" small style={{ opacity: 0.55 }} />
      </div>
    </div>
  )
}

// ─── Main modal ──────────────────────────────────────────────────────────────

export default function ProposalModal({ deal, dealProducts, dealTeam, dealPartners = [], onClose }) {
  const printRef = useRef(null)

  // Sum all partner commission percentages → compute markup multiplier
  // e.g. 7.5% partner → multiplier = 1 / (1 - 0.075) ≈ 1.08108
  const totalPartnerPct = (dealPartners || []).reduce((s, p) => s + (parseFloat(p.commission_pct) || 0), 0)
  const partnerMultiplier = totalPartnerPct > 0 ? 1 / (1 - totalPartnerPct / 100) : 1

  const rows = buildRows(dealProducts, partnerMultiplier)
  const totalRevenue = rows.reduce((s, r) => s + (r.total || 0), 0)

  const salesRep = dealTeam?.find((m) => m.role === 'sales')
  const presenter = salesRep
    ? { name: salesRep.people?.name, email: salesRep.people?.email }
    : { name: 'Marcus Lopez', email: 'mlopez@trilogydigital.com' }

  const presentedDate = deal.contract_start
    ? format(new Date(deal.contract_start + 'T12:00:00'), 'MMMM d, yyyy')
    : format(new Date(), 'MMMM d, yyyy')

  function handlePrint() {
    const original = document.title
    document.title = `${deal.name} — Proposal`
    window.print()
    document.title = original
  }

  return (
    <>
      <style>{`
        @media print {
          html, body { margin: 0; padding: 0; background: #132338 !important; }
          body * { visibility: hidden; }
          #proposal-print, #proposal-print * { visibility: visible; }
          #proposal-print {
            position: absolute; top: 0; left: 0; width: 100%;
          }
          #proposal-print .proposal-slide {
            width: 100vw !important;
            page-break-after: always;
            break-after: page;
          }
          .no-print { display: none !important; }
          @page { size: landscape; margin: 0; }
        }
        @media screen {
          #proposal-print { display: none; }
        }
      `}</style>

      {/* Screen modal */}
      <div className="no-print fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto p-4 py-8">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
            <div>
              <h3 className="text-base font-semibold text-navy-900">{deal.name}</h3>
              <p className="text-xs text-gray-500">{deal.company_name} — Proposal</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-navy-900 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors"
              >
                <Download size={14} />
                Export PDF
              </button>
              <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Slides preview */}
          <div className="p-6 space-y-4" ref={printRef}>
            {[
              <SlideCover key="cover" />,
              <SlideContact key="contact" deal={deal} presentedBy={presenter} presentedDate={presentedDate} />,
              <SlidePricing key="pricing" rows={rows} totalRevenue={totalRevenue} deal={deal} />,
              <SlideThankYou key="thanks" />,
            ].map((slide, i) => (
              <div key={i} className="rounded-xl overflow-hidden shadow-lg border border-gray-200">
                <div className="bg-gray-100 px-3 py-1 text-xs text-gray-400 font-medium">Slide {i + 1}</div>
                {slide}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Print-only version — full bleed, no labels */}
      <div id="proposal-print">
        {[
          <div key="cover" className="proposal-slide"><SlideCover /></div>,
          <div key="contact" className="proposal-slide"><SlideContact deal={deal} presentedBy={presenter} presentedDate={presentedDate} /></div>,
          <div key="pricing" className="proposal-slide"><SlidePricing rows={rows} totalRevenue={totalRevenue} deal={deal} /></div>,
          <div key="thanks" className="proposal-slide"><SlideThankYou /></div>,
        ]}
      </div>
    </>
  )
}
