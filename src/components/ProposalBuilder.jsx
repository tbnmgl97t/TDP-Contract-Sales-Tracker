import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { pdf, PDFDownloadLink } from '@react-pdf/renderer'
import { supabase } from '../lib/supabase'
import ProposalPDF from './ProposalPDF'
import Button from './ui/Button'
import Spinner from './ui/Spinner'
import { X, Download, GripVertical, Plus, Minus, BarChart2, FileText, PanelLeftOpen, PanelLeftClose, RefreshCw } from 'lucide-react'
import { useUser } from '../contexts/UserContext'

// Sentinel slides for auto-generated pages
const COVER_SLIDE   = { id: '__cover__',   type: 'cover',   zones: [], zoneContent: {} }
const PRICING_SLIDE = { id: '__pricing__', type: 'pricing', zones: [], zoneContent: {} }

export default function ProposalBuilder({ deal, dealProducts, dealPartners, onClose }) {
  const { isManager, profile } = useUser()
  const [templates, setTemplates] = useState([])       // active-only, for ADD SLIDES + bg picker
  const [loading, setLoading] = useState(true)
  const [selectedSlides, setSelectedSlides] = useState([])
  const [saving, setSaving] = useState(false)
  const [dataBackground, setDataBackground] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [pdfGenerating, setPdfGenerating] = useState(false)
  const pdfUrlRef = useRef(null)

  // Wrapper that updates slides state (PDF regenerates via useEffect)
  function applySlides(slides) {
    setSelectedSlides(slides)
  }

  useEffect(() => {
    async function load() {
      const { data: allTmplData } = await supabase   // ALL templates — needed for slide reconstruction
        .from('proposal_slide_templates')
        .select('*')
        .order('sort_order')
      const { data: zoneData } = await supabase
        .from('proposal_slide_zones')
        .select('*')
        .order('sort_order')
      const { data: slideData } = await supabase
        .from('deal_proposal_slides')
        .select('*, deal_proposal_zone_content(*)')
        .eq('deal_id', deal.id)
        .order('sort_order')

      // All templates with zones (for reconstruction — includes inactive)
      const allTemplatesWithZones = (allTmplData || []).map((t) => ({
        ...t,
        zones: (zoneData || []).filter((z) => z.template_id === t.id),
      }))
      // Active-only for ADD SLIDES library and background picker
      const activeTemplates = allTemplatesWithZones.filter((t) => t.is_active)
      setTemplates(activeTemplates)

      const makeSlide = (tmpl, idx) => ({
        id: `temp-${Date.now()}-${idx}`,
        template: tmpl,
        zones: tmpl.zones || [],
        zoneContent: {},
        sort_order: idx,
      })

      // Helper: insert Cover + Pricing before any Thank You slide (smart default ordering)
      function buildDefaultSlides(realSlides) {
        const result = [...realSlides]
        const thankIdx = result.findIndex((s) => s.template?.name?.toLowerCase().includes('thank'))
        const insertAt = thankIdx === -1 ? result.length : thankIdx
        result.splice(insertAt, 0, { ...COVER_SLIDE }, { ...PRICING_SLIDE })
        return result
      }

      if (slideData && slideData.length > 0) {
        // Reconstruct saved template slides using ALL templates (including inactive)
        const saved = slideData.map((slide) => {
          const tmpl = allTemplatesWithZones.find((t) => t.id === slide.template_id)
          if (!tmpl) return null
          const zoneContent = {}
          ;(slide.deal_proposal_zone_content || []).forEach((zc) => {
            zoneContent[zc.zone_id] = zc.content
          })
          return { id: slide.id, template: tmpl, zones: tmpl.zones, zoneContent, sort_order: slide.sort_order }
        }).filter(Boolean)

        const savedOrder = localStorage.getItem(`proposal-order-${deal.id}`)
        if (savedOrder) {
          const templateIdOrder = JSON.parse(savedOrder)
          // Old format: no sentinels → discard and use smart default
          const hasNewFormat = templateIdOrder.includes('__pricing__') || templateIdOrder.includes('__cover__')
          if (!hasNewFormat) {
            localStorage.removeItem(`proposal-order-${deal.id}`)
            applySlides(buildDefaultSlides(saved))
          } else {
            // New format: reconstruct using stable template IDs
            const queues = {}
            saved.forEach((s) => {
              const tid = s.template.id
              if (!queues[tid]) queues[tid] = []
              queues[tid].push(s)
            })
            const full = templateIdOrder.map((id) => {
              if (id === '__cover__')   return { ...COVER_SLIDE }
              if (id === '__pricing__') return { ...PRICING_SLIDE }
              return queues[id]?.shift() || null
            }).filter(Boolean)
            // Append any slides not in the saved order
            Object.values(queues).forEach((q) => full.push(...q))
            applySlides(full)
          }
        } else {
          applySlides(buildDefaultSlides(saved))
        }
      } else {
        // New proposal — auto-populate with Title, data pages, Thank You
        const titleTmpl = activeTemplates.find((t) => t.name.toLowerCase() === 'title')
        const thanksTmpl = activeTemplates.find((t) => t.name.toLowerCase().includes('thank'))
        const auto = [
          titleTmpl ? makeSlide(titleTmpl, 0) : null,
          { ...COVER_SLIDE },
          { ...PRICING_SLIDE },
          thanksTmpl ? makeSlide(thanksTmpl, 3) : null,
        ].filter(Boolean)
        applySlides(auto.length > 0 ? auto : [{ ...COVER_SLIDE }, { ...PRICING_SLIDE }])
      }

      // Always use the Blank template as the background for Overview + Pricing slides
      const blankTmpl = activeTemplates.find((t) => t.name.toLowerCase() === 'blank')
      setDataBackground(blankTmpl || null)
      setLoading(false)
    }
    load()
  }, [deal.id])

  // Generate PDF on demand — called manually to avoid blocking the main thread
  function generatePreview() {
    if (loading || selectedSlides.length === 0) return
    setPdfGenerating(true)
    const doc = (
      <ProposalPDF
        deal={deal}
        dealProducts={dealProducts}
        dealPartners={dealPartners}
        selectedSlides={selectedSlides}
        isManager={isManager}
        dataBackgroundUrl={dataBackground?.image_url || null}
        userName={profile?.full_name || ''}
        userEmail={profile?.email || ''}
      />
    )
    pdf(doc).toBlob().then((blob) => {
      const url = URL.createObjectURL(blob) + '#navpanes=0&toolbar=1'
      setPdfUrl(url)
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current.split('#')[0])
      pdfUrlRef.current = url
      setPdfGenerating(false)
    }).catch(() => setPdfGenerating(false))
  }

  // Auto-generate once after initial load
  useEffect(() => {
    if (!loading && selectedSlides.length > 0) generatePreview()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  function addTemplate(template) {
    const newSlide = {
      id: `temp-${Date.now()}`,
      template,
      zones: template.zones || [],
      zoneContent: {},
      sort_order: selectedSlides.length,
    }
    // Insert before the first Pricing sentinel so new slides land before data pages
    const firstDataIdx = selectedSlides.findIndex((s) => s.type === 'pricing')
    if (firstDataIdx === -1) {
      applySlides([...selectedSlides, newSlide])
    } else {
      const updated = [...selectedSlides]
      updated.splice(firstDataIdx, 0, newSlide)
      applySlides(updated)
    }
  }

  function removeSlide(slideId) {
    applySlides(selectedSlides.filter((s) => s.id !== slideId))
  }

  function updateZoneContent(slideId, zoneId, text) {
    // Don't increment pdfKey on every keystroke — PDF updates on blur/save
    setSelectedSlides((prev) =>
      prev.map((s) =>
        s.id === slideId ? { ...s, zoneContent: { ...s.zoneContent, [zoneId]: text } } : s
      )
    )
  }

  function moveSlide(index, dir) {
    const updated = [...selectedSlides]
    const target = index + dir
    if (target < 0 || target >= updated.length) return
    ;[updated[index], updated[target]] = [updated[target], updated[index]]
    applySlides(updated)
  }

  async function saveProposal() {
    setSaving(true)

    // Persist full slide order using stable template IDs (pricing sentinel keeps its '__pricing__' id)
    localStorage.setItem(`proposal-order-${deal.id}`, JSON.stringify(
      selectedSlides.map((s) => s.type ? s.id : s.template.id)
    ))

    // Save only real template slides to DB
    const realSlides = selectedSlides.filter((s) => !s.type)
    await supabase.from('deal_proposal_slides').delete().eq('deal_id', deal.id)
    for (let i = 0; i < realSlides.length; i++) {
      const slide = realSlides[i]
      const { data: savedSlide, error } = await supabase
        .from('deal_proposal_slides')
        .insert({ deal_id: deal.id, template_id: slide.template.id, sort_order: i })
        .select()
        .single()
      if (error || !savedSlide) continue
      const zoneRows = Object.entries(slide.zoneContent)
        .filter(([, content]) => content)
        .map(([zone_id, content]) => ({ deal_proposal_slide_id: savedSlide.id, zone_id, content }))
      if (zoneRows.length > 0) {
        await supabase.from('deal_proposal_zone_content').insert(zoneRows)
      }
    }

    setSaving(false)
    alert('Proposal saved.')
  }

  if (loading) return createPortal(
    <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
      <Spinner />
    </div>,
    document.body
  )

  // Count real slides (exclude sentinels) for the header label
  const realCount = selectedSlides.filter((s) => !s.type).length

  return createPortal(
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 flex-shrink-0">
        <div>
          <h2 className="text-base font-semibold text-navy-900">Proposal Builder — {deal.name}</h2>
          <p className="text-xs text-gray-500 mt-0.5">Reorder any slide with the ↑ ↓ arrows. Overview and Pricing are auto-generated.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSidebarOpen((o) => !o)} className="p-2 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded-lg" title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
          <Button variant="secondary" icon={<RefreshCw size={14} />} loading={pdfGenerating} onClick={generatePreview}>Refresh Preview</Button>
          <Button variant="secondary" loading={saving} onClick={saveProposal}>Save</Button>
          <PDFDownloadLink
            document={<ProposalPDF deal={deal} dealProducts={dealProducts} dealPartners={dealPartners} selectedSlides={selectedSlides} isManager={isManager} dataBackgroundUrl={dataBackground?.image_url || null} />}
            fileName={`${deal.name.replace(/\s+/g, '-')}-Proposal.pdf`}
          >
            {({ loading: pdfLoading }) => (
              <Button variant="navy" icon={<Download size={14} />} loading={pdfLoading}>
                Export PDF
              </Button>
            )}
          </PDFDownloadLink>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg ml-2">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel */}
        <div className={`flex-shrink-0 bg-white border-r border-gray-200 flex flex-col transition-all duration-200 ${sidebarOpen ? 'w-80 overflow-y-auto' : 'w-0 overflow-hidden'}`}>

          {/* Template library */}
          <div className="p-4 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Add Slides</p>
            <div className="space-y-2">
              {templates.map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => addTemplate(tmpl)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg border border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-colors text-left"
                >
                  <img src={tmpl.image_url} alt={tmpl.name} className="w-14 h-10 object-cover rounded flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-navy-900 truncate">{tmpl.name}</p>
                    <p className="text-xs text-gray-400">{tmpl.zones.length} zone{tmpl.zones.length !== 1 ? 's' : ''}</p>
                  </div>
                  <Plus size={14} className="text-primary-400 flex-shrink-0" />
                </button>
              ))}
              {templates.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No templates. Add them in Settings → Proposal Slides.</p>
              )}
            </div>
          </div>

          {/* Selected slides list */}
          <div className="p-4 flex-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Slides ({selectedSlides.length})
            </p>
            {selectedSlides.length === 0 && (
              <p className="text-sm text-gray-400">Click a template above to add it to the proposal.</p>
            )}
            <div className="space-y-3">
              {selectedSlides.map((slide, index) => {
                const isData = !!slide.type
                const isCover = slide.type === 'cover'
                const isPricing = slide.type === 'pricing'

                return (
                  <div key={slide.id} className={`border rounded-xl overflow-hidden ${isData ? 'border-primary-200 bg-primary-50/30' : 'border-gray-200'}`}>
                    {/* Slide header */}
                    <div className={`flex items-center gap-2 px-3 py-2 border-b ${isData ? 'bg-primary-50 border-primary-100' : 'bg-gray-50 border-gray-100'}`}>
                      <GripVertical size={14} className="text-gray-300 flex-shrink-0" />
                      {isCover ? (
                        <div className="w-10 h-7 rounded flex-shrink-0 bg-navy-800 flex items-center justify-center">
                          <FileText size={13} className="text-primary-400" />
                        </div>
                      ) : isPricing ? (
                        <div className="w-10 h-7 rounded flex-shrink-0 bg-navy-800 flex items-center justify-center">
                          <BarChart2 size={13} className="text-primary-400" />
                        </div>
                      ) : (
                        <img src={slide.template.image_url} alt="" className="w-10 h-7 object-cover rounded flex-shrink-0" />
                      )}
                      <p className="flex-1 text-sm font-medium text-navy-900 truncate">
                        {isCover ? 'Overview' : isPricing ? 'Pricing Summary' : slide.template.name}
                      </p>
                      <div className="flex items-center gap-1">
                        <button onClick={() => moveSlide(index, -1)} disabled={index === 0} className="p-1 text-gray-400 hover:text-navy-900 disabled:opacity-30">↑</button>
                        <button onClick={() => moveSlide(index, 1)} disabled={index === selectedSlides.length - 1} className="p-1 text-gray-400 hover:text-navy-900 disabled:opacity-30">↓</button>
                        {!isData && (
                          <button onClick={() => removeSlide(slide.id)} className="p-1 text-gray-400 hover:text-red-500">
                            <Minus size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Data slide label */}
                    {isData && (
                      <p className="text-xs text-primary-500 px-3 py-2">Auto-generated · not removable</p>
                    )}

                    {/* Zone text inputs for regular slides */}
                    {!isData && slide.zones.length > 0 && (
                      <div className="p-3 space-y-2">
                        {slide.zones.map((zone) => (
                          <div key={zone.id}>
                            <label className="text-xs font-medium text-gray-600 block mb-1">{zone.label}</label>
                            <textarea
                              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary-400"
                              rows={2}
                              placeholder={zone.default_text || zone.label}
                              value={slide.zoneContent[zone.id] || ''}
                              onChange={(e) => updateZoneContent(slide.id, zone.id, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    {!isData && slide.zones.length === 0 && (
                      <p className="text-xs text-gray-400 px-3 py-2">Image only — no editable zones</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right panel: PDF preview */}
        <div className="flex-1 bg-gray-100 overflow-hidden relative">
          {pdfUrl && !pdfGenerating && <iframe src={pdfUrl} width="100%" height="100%" style={{ border: 'none', display: 'block' }} title="Proposal Preview" />}
          {(!pdfUrl || pdfGenerating) && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
              {pdfGenerating ? <><Spinner /><p className="text-sm">Generating preview…</p></> : <p className="text-sm">Click Refresh Preview to load.</p>}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
