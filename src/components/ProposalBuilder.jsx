import { useState, useEffect } from 'react'
import { PDFViewer, PDFDownloadLink } from '@react-pdf/renderer'
import { supabase } from '../lib/supabase'
import ProposalPDF from './ProposalPDF'
import Button from './ui/Button'
import Spinner from './ui/Spinner'
import { X, Download, GripVertical, Plus, Minus } from 'lucide-react'
import { useUser } from '../contexts/UserContext'

export default function ProposalBuilder({ deal, dealProducts, dealTeam, dealPartners, onClose }) {
  const { isManager } = useUser()
  const [templates, setTemplates] = useState([])  // all active templates from DB
  const [loading, setLoading] = useState(true)
  // selectedSlides: [{ id (deal_proposal_slide id or temp id), template, zones, zoneContent: {zoneId: text}, sort_order }]
  const [selectedSlides, setSelectedSlides] = useState([])
  const [saving, setSaving] = useState(false)

  // Load templates + existing saved slides for this deal
  useEffect(() => {
    async function load() {
      const { data: tmplData } = await supabase
        .from('proposal_slide_templates')
        .select('*')
        .eq('is_active', true)
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

      const templatesWithZones = (tmplData || []).map((t) => ({
        ...t,
        zones: (zoneData || []).filter((z) => z.template_id === t.id),
      }))
      setTemplates(templatesWithZones)

      // Reconstruct saved slides
      if (slideData && slideData.length > 0) {
        const saved = slideData.map((slide) => {
          const tmpl = templatesWithZones.find((t) => t.id === slide.template_id)
          if (!tmpl) return null
          const zoneContent = {}
          ;(slide.deal_proposal_zone_content || []).forEach((zc) => {
            zoneContent[zc.zone_id] = zc.content
          })
          return { id: slide.id, template: tmpl, zones: tmpl.zones, zoneContent, sort_order: slide.sort_order }
        }).filter(Boolean)
        setSelectedSlides(saved)
      }
      setLoading(false)
    }
    load()
  }, [deal.id])

  function addTemplate(template) {
    const newSlide = {
      id: `temp-${Date.now()}`,
      template,
      zones: template.zones || [],
      zoneContent: {},
      sort_order: selectedSlides.length,
    }
    setSelectedSlides((prev) => [...prev, newSlide])
  }

  function removeSlide(slideId) {
    setSelectedSlides((prev) => prev.filter((s) => s.id !== slideId))
  }

  function updateZoneContent(slideId, zoneId, text) {
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
    setSelectedSlides(updated)
  }

  async function saveProposal() {
    setSaving(true)
    // Delete existing slides for this deal and re-insert
    await supabase.from('deal_proposal_slides').delete().eq('deal_id', deal.id)

    for (let i = 0; i < selectedSlides.length; i++) {
      const slide = selectedSlides[i]
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

  if (loading) return (
    <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
      <Spinner />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 flex-shrink-0">
        <div>
          <h2 className="text-base font-semibold text-navy-900">Proposal Builder — {deal.name}</h2>
          <p className="text-xs text-gray-500 mt-0.5">Cover + Pricing + Team pages are always included automatically.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" loading={saving} onClick={saveProposal}>Save</Button>
          <PDFDownloadLink
            document={<ProposalPDF deal={deal} dealProducts={dealProducts} dealTeam={dealTeam} dealPartners={dealPartners} selectedSlides={selectedSlides} isManager={isManager} />}
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

      {/* Body: left panel (slide config) + right panel (PDF preview) */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel */}
        <div className="w-80 flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto flex flex-col">
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

          {/* Selected slides + zone editors */}
          <div className="p-4 flex-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Selected Slides ({selectedSlides.length})
            </p>
            {selectedSlides.length === 0 && (
              <p className="text-sm text-gray-400">Click a template above to add it to the proposal.</p>
            )}
            <div className="space-y-3">
              {selectedSlides.map((slide, index) => (
                <div key={slide.id} className="border border-gray-200 rounded-xl overflow-hidden">
                  {/* Slide header */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <GripVertical size={14} className="text-gray-300 flex-shrink-0" />
                    <img src={slide.template.image_url} alt="" className="w-10 h-7 object-cover rounded flex-shrink-0" />
                    <p className="flex-1 text-sm font-medium text-navy-900 truncate">{slide.template.name}</p>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveSlide(index, -1)} disabled={index === 0} className="p-1 text-gray-400 hover:text-navy-900 disabled:opacity-30">↑</button>
                      <button onClick={() => moveSlide(index, 1)} disabled={index === selectedSlides.length - 1} className="p-1 text-gray-400 hover:text-navy-900 disabled:opacity-30">↓</button>
                      <button onClick={() => removeSlide(slide.id)} className="p-1 text-gray-400 hover:text-red-500">
                        <Minus size={14} />
                      </button>
                    </div>
                  </div>
                  {/* Zone text inputs */}
                  {slide.zones.length > 0 && (
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
                  {slide.zones.length === 0 && (
                    <p className="text-xs text-gray-400 px-3 py-2">Image only — no editable zones</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel: PDF preview */}
        <div className="flex-1 bg-gray-100 overflow-hidden">
          <PDFViewer width="100%" height="100%" style={{ border: 'none' }}>
            <ProposalPDF
              deal={deal}
              dealProducts={dealProducts}
              dealTeam={dealTeam}
              dealPartners={dealPartners}
              selectedSlides={selectedSlides}
              isManager={isManager}
            />
          </PDFViewer>
        </div>
      </div>
    </div>
  )
}
