/**
 * SlideDebug — Standalone slide playground.
 *
 * Open at /slide-lab in a separate browser tab.
 * Pick a slide type, fill in fields, see the PDF update live via PDFViewer.
 * No connection to any deal or saved data — pure dev/design tool.
 */
import { useState, useRef, useEffect } from 'react'
import { PDFViewer, Document } from '@react-pdf/renderer'
import '../lib/pdfFonts'
import { SLIDE_LIBRARY, SLIDE_MAP } from '../lib/slideLibrary'
import AssetLibrary from '../components/AssetLibrary'
import { supabase } from '../lib/supabase'

import { FullImageSlidePDF,           FullImageSlideForm }           from '../components/slides/FullImageSlide'
import { CoverSlidePDF,     CoverSlideForm }     from '../components/slides/CoverSlide'
import { AboutSlidePDF,     AboutSlideForm }     from '../components/slides/AboutSlide'
import { ProblemSlidePDF,   ProblemSlideForm }   from '../components/slides/ProblemSlide'
import { SolutionSlidePDF,  SolutionSlideForm }  from '../components/slides/SolutionSlide'
import { PricingSlidePDF,   PricingSlideForm }   from '../components/slides/PricingSlide'
import { CaseStudySlidePDF, CaseStudySlideForm } from '../components/slides/CaseStudySlide'
import { TeamSlidePDF,      TeamSlideForm }      from '../components/slides/TeamSlide'
import { FreeformSlidePDF,  FreeformSlideForm }  from '../components/slides/FreeformSlide'
import { TimelineSlidePDF,  TimelineSlideForm }  from '../components/slides/TimelineSlide'
import { ClosingSlidePDF,   ClosingSlideForm }   from '../components/slides/ClosingSlide'

// NOTE: these maps are intentionally defined INSIDE the component (below)
// so HMR re-evaluates them with fresh module references on every slide file save.

// Fallback mock deal used when no real deal is loaded
const MOCK_DEAL = {
  id:   'debug',
  name: 'Sample Deal',
  customers: { name: 'Sample Client' },
  acv: 12000,
  term_months: 12,
  close_date: new Date().toISOString(),
}


export default function SlideDebug() {
  // Defined inside component so HMR re-evaluates these with fresh imports on every save
  const PDF_COMPONENTS = {
    full_image: FullImageSlidePDF,
    cover:      CoverSlidePDF,
    about:      AboutSlidePDF,
    problem:    ProblemSlidePDF,
    solution:   SolutionSlidePDF,
    pricing:    PricingSlidePDF,
    case_study: CaseStudySlidePDF,
    team:       TeamSlidePDF,
    freeform:   FreeformSlidePDF,
    timeline:   TimelineSlidePDF,
    closing:    ClosingSlidePDF,
  }
  const SLIDE_FORMS = {
    full_image: FullImageSlideForm,
    cover:      CoverSlideForm,
    about:      AboutSlideForm,
    problem:    ProblemSlideForm,
    solution:   SolutionSlideForm,
    pricing:    PricingSlideForm,
    case_study: CaseStudySlideForm,
    team:       TeamSlideForm,
    freeform:   FreeformSlideForm,
    timeline:   TimelineSlideForm,
    closing:    ClosingSlideForm,
  }

  const [slideKey, setSlideKey]             = useState('timeline')
  const [fields, setFields]                 = useState(() => ({ ...(SLIDE_MAP['timeline']?.defaultFields || {}) }))
  const [pdfKey, setPdfKey]                 = useState(0)
  const [editorExpanded, setEditorExpanded] = useState(false)
  const [showAssets, setShowAssets]         = useState(false)
  const [assetTarget, setAssetTarget]       = useState(null)

  // Deal loader
  const [dealList, setDealList]         = useState([])
  const [selectedDealId, setSelectedDealId] = useState('')
  const [dealData, setDealData]         = useState({ deal: MOCK_DEAL, dealProducts: [], dealPartners: [], dealTeam: [] })
  const [dealLoading, setDealLoading]   = useState(false)

  const leftPanelRef = useRef(null)

  // Fetch deal list on mount
  useEffect(() => {
    supabase
      .from('deals')
      .select('id, name, company_name')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => setDealList(data || []))
  }, [])

  // Load full deal data when selection changes
  useEffect(() => {
    if (!selectedDealId) {
      setDealData({ deal: MOCK_DEAL, dealProducts: [], dealPartners: [] })
      return
    }
    setDealLoading(true)
    Promise.all([
      supabase.from('deals').select('*').eq('id', selectedDealId).single(),
      supabase.from('deal_products').select('*, products(name, commission_metric, unit_label, is_support_charge, billing_frequency, rate_overridden)').eq('deal_id', selectedDealId),
      supabase.from('deal_partners').select('*, partners(name)').eq('deal_id', selectedDealId).order('sort_order'),
      supabase.from('deal_team').select('*, people(name, role, email, title, bio)').eq('deal_id', selectedDealId),
    ]).then(([{ data: deal }, { data: products }, { data: partners }, { data: team }]) => {
      setDealData({
        deal:         deal || MOCK_DEAL,
        dealProducts: products || [],
        dealPartners: partners || [],
        dealTeam:     team || [],
      })
      setDealLoading(false)
    })
  }, [selectedDealId])

  function onPickAsset(fieldPath) {
    setAssetTarget(fieldPath)
    setShowAssets(true)
  }

  function handleAssetSelect(url) {
    if (!assetTarget) return
    const parts = assetTarget.split('.')
    if (parts.length === 1) {
      setFields(f => ({ ...f, [assetTarget]: url }))
    } else if (parts.length === 3 && parts[0] === 'members') {
      const idx = parseInt(parts[1])
      const key = parts[2]
      setFields(f => {
        const members = [...(f.members || [])]
        members[idx] = { ...members[idx], [key]: url }
        return { ...f, members }
      })
    }
    setAssetTarget(null)
  }

  useEffect(() => {
    const el = leftPanelRef.current
    if (!el) return
    const handler = (e) => setEditorExpanded(e.detail.expanded)
    el.addEventListener('rte-expand', handler)
    return () => el.removeEventListener('rte-expand', handler)
  }, [])

  function handleSlideKeyChange(key) {
    setSlideKey(key)
    setFields({ ...(SLIDE_MAP[key]?.defaultFields || {}) })
  }

  const PDFComponent = PDF_COMPONENTS[slideKey]
  const SlideForm    = SLIDE_FORMS[slideKey]

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#f8fafc' }}>

      {/* ── Left panel: controls ── */}
      <div ref={leftPanelRef} style={{ width: editorExpanded ? 520 : 320, flexShrink: 0, borderRight: '1px solid #e2e8f0', overflowY: 'auto', background: '#fff', display: 'flex', flexDirection: 'column', transition: 'width 0.2s ease' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            Slide Lab
          </div>
          <select
            value={slideKey}
            onChange={e => handleSlideKeyChange(e.target.value)}
            style={{
              width: '100%', padding: '8px 10px', fontSize: 13, fontWeight: 600,
              border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff',
              color: '#0f172a', cursor: 'pointer', outline: 'none',
            }}
          >
            {SLIDE_LIBRARY.map(def => (
              <option key={def.key} value={def.key}>{def.label}</option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
            {SLIDE_MAP[slideKey]?.description}
          </div>
        </div>

        {/* Deal loader */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 5 }}>Load deal data</div>
          <select
            value={selectedDealId}
            onChange={e => setSelectedDealId(e.target.value)}
            style={{
              width: '100%', padding: '6px 8px', fontSize: 12,
              border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff',
              color: selectedDealId ? '#0f172a' : '#94a3b8', cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="">— Use mock data —</option>
            {dealList.map(d => (
              <option key={d.id} value={d.id}>{d.name}{d.company_name ? ` · ${d.company_name}` : ''}</option>
            ))}
          </select>
          {dealLoading && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Loading…</div>
          )}
          {selectedDealId && !dealLoading && (
            <div style={{ fontSize: 11, color: '#57BB95', marginTop: 4 }}>
              ✓ {dealData.dealProducts.length} product{dealData.dealProducts.length !== 1 ? 's' : ''}, {dealData.dealPartners.length} partner{dealData.dealPartners.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Reset fields button */}
        <div style={{ padding: '8px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <button
            onClick={() => setFields({ ...(SLIDE_MAP[slideKey]?.defaultFields || {}) })}
            style={{
              fontSize: 11, color: '#94a3b8', background: 'none', border: 'none',
              cursor: 'pointer', padding: 0, textDecoration: 'underline',
            }}
          >
            Reset fields
          </button>
        </div>

        {/* Slide form */}
        <div style={{ padding: '20px', flex: 1 }}>
          {SlideForm && (
            <SlideForm
              fields={fields}
              onChange={setFields}
              onPickAsset={onPickAsset}
              deal={dealData.deal}
              dealProducts={dealData.dealProducts}
              dealPartners={dealData.dealPartners}
              dealTeam={dealData.dealTeam}
            />
          )}
        </div>

      </div>

      {/* ── Right panel: live PDF + JSON ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', background: '#fff', fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
          Field edits update live · After saving a code change, click
          <button
            onClick={() => setPdfKey(k => k + 1)}
            style={{
              padding: '3px 10px', fontSize: 11, fontWeight: 600,
              background: '#17263A', color: '#fff', border: 'none',
              borderRadius: 5, cursor: 'pointer',
            }}
          >
            ↺ Reload PDF
          </button>
        </div>
        {PDFComponent && (
          <PDFViewer key={pdfKey} width="100%" height="100%" showToolbar={false} style={{ border: 'none', flex: 1 }}>
            <Document>
              <PDFComponent
                fields={fields}
                deal={dealData.deal}
                dealProducts={dealData.dealProducts}
                dealPartners={dealData.dealPartners}
              />
            </Document>
          </PDFViewer>
        )}
        {/* Raw fields JSON — below the slide */}
        <details style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', background: '#fff', fontSize: 11, flexShrink: 0 }}>
          <summary style={{ color: '#94a3b8', cursor: 'pointer', userSelect: 'none' }}>Raw fields JSON</summary>
          <pre style={{
            marginTop: 8, padding: 10, background: '#f8fafc', borderRadius: 6,
            fontSize: 10, color: '#475569', overflow: 'auto', maxHeight: 180,
            border: '1px solid #e2e8f0',
          }}>
            {JSON.stringify(fields, null, 2)}
          </pre>
        </details>
      </div>

      {showAssets && (
        <AssetLibrary
          onSelect={handleAssetSelect}
          onClose={() => setShowAssets(false)}
        />
      )}
    </div>
  )
}
