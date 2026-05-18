/**
 * ProposalBuilder v2 — Component-based proposal editor.
 *
 * Features:
 * - Drag-to-reorder slides via @dnd-kit/sortable
 * - 10 structured slide types with dedicated forms and PDF components
 * - Asset library for shared images
 * - Saves to `proposal_slides` table
 * - Falls back to legacy builder if no v2 slides exist and legacy slides do
 */
import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { pdf } from '@react-pdf/renderer'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabase'
import { SLIDE_LIBRARY, SLIDE_MAP } from '../lib/slideLibrary'
import ProposalPDFv2 from './ProposalPDFv2'
import AssetLibrary from './AssetLibrary'
import Spinner from './ui/Spinner'
import Button from './ui/Button'
import {
  X, Download, RefreshCw, Plus, Trash2, GripVertical,
  Layout, Building2, AlertCircle, Zap, DollarSign, Award,
  Users, FileText, Clock, Send, Star, Pencil, Check,
} from 'lucide-react'

// Map slide_key → lucide icon component
const SLIDE_ICONS = {
  full_image: Layout,
  cover:      Layout,
  about:      Building2,
  problem:    AlertCircle,
  solution:   Zap,
  pricing:    DollarSign,
  case_study: Award,
  team:       Users,
  freeform:   FileText,
  timeline:   Clock,
  closing:    Send,
}

// Lazy-load slide form components (avoids heavy imports until needed)
import { FullImageSlideForm }           from './slides/FullImageSlide'
import { CoverSlideForm }     from './slides/CoverSlide'
import { AboutSlideForm }     from './slides/AboutSlide'
import { ProblemSlideForm }   from './slides/ProblemSlide'
import { SolutionSlideForm }  from './slides/SolutionSlide'
import { PricingSlideForm }   from './slides/PricingSlide'
import { CaseStudySlideForm } from './slides/CaseStudySlide'
import { TeamSlideForm }      from './slides/TeamSlide'
import { FreeformSlideForm }  from './slides/FreeformSlide'
import { TimelineSlideForm }  from './slides/TimelineSlide'
import { ClosingSlideForm }   from './slides/ClosingSlide'
import { logActivity }        from '../lib/logActivity'

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

// ─── SortableSlide item ──────────────────────────────────────────────────────

function SortableSlide({ slide, isActive, onClick, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  const def = SLIDE_MAP[slide.slide_key]
  const Icon = SLIDE_ICONS[slide.slide_key] || FileText

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors group ${
        isActive
          ? 'border-primary-400 bg-primary-50'
          : 'border-gray-200 hover:border-gray-300 bg-white'
      }`}
    >
      {/* Drag handle */}
      <div {...attributes} {...listeners} className="p-0.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <GripVertical size={14} />
      </div>

      {/* Icon */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-primary-500' : 'bg-gray-100'}`}>
        <Icon size={14} className={isActive ? 'text-white' : 'text-gray-500'} />
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold truncate ${isActive ? 'text-primary-700' : 'text-navy-900'}`}>
          {slide.label || def?.label || slide.slide_key}
        </p>
        {slide.label && (
          <p className="text-[10px] text-gray-400 truncate">{def?.label}</p>
        )}
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        className="flex-shrink-0 p-1 rounded text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

// ─── Inline-editable slide label header ──────────────────────────────────────

function SlideLabelHeader({ slide, onLabelChange }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState('')
  const inputRef              = useRef(null)
  const def                   = SLIDE_MAP[slide.slide_key]
  const Icon                  = SLIDE_ICONS[slide.slide_key] || FileText

  function startEdit() {
    setDraft(slide.label || '')
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function commit() {
    onLabelChange(draft.trim())
    setEditing(false)
  }

  function handleKey(e) {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(false)
  }

  return (
    <div className="flex items-center gap-2 mb-5">
      <div className="w-8 h-8 rounded-lg bg-navy-900 flex items-center justify-center flex-shrink-0">
        <Icon size={14} className="text-primary-400" />
      </div>
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={handleKey}
              placeholder={def?.label || slide.slide_key}
              className="flex-1 text-sm font-semibold text-navy-900 border-b border-primary-400 outline-none bg-transparent py-0.5 min-w-0"
            />
            <button type="button" onMouseDown={(e) => { e.preventDefault(); commit() }} className="text-primary-500 flex-shrink-0">
              <Check size={13} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 group">
            <p className="text-sm font-semibold text-navy-900 truncate">
              {slide.label || def?.label || slide.slide_key}
            </p>
            <button
              type="button"
              onClick={startEdit}
              className="text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              title="Rename slide"
            >
              <Pencil size={11} />
            </button>
          </div>
        )}
        <p className="text-xs text-gray-400 truncate">
          {slide.label ? def?.label : def?.description}
        </p>
      </div>
    </div>
  )
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export default function ProposalBuilder({ deal, dealProducts, dealPartners, dealTeam = [], onClose, onLogged }) {
  const [loadState, setLoadState]       = useState('loading') // 'loading' | 'ready'
  const [slides, setSlides]             = useState([])
  const [activeSlideId, setActiveSlideId] = useState(null)
  const [showPicker, setShowPicker]     = useState(false)
  const [saving, setSaving]             = useState(false)
  const [exporting, setExporting]       = useState(false)
  const [dirty, setDirty]               = useState(false)
  const [pdfUrl, setPdfUrl]             = useState(null)
  const [pdfGenerating, setPdfGenerating] = useState(false)
  const [showAssets, setShowAssets]     = useState(false)
  const [assetTargetField, setAssetTargetField] = useState(null) // { slideId, fieldPath }
  const [savingDefault, setSavingDefault]       = useState(false) // 'update' | 'new' | false
  const [savedDefault, setSavedDefault]         = useState(false) // 'update' | 'new' | false
  const [savingOrderDefault, setSavingOrderDefault] = useState(false)
  const [savedOrderDefault, setSavedOrderDefault]   = useState(false)
  const [pickerDefaults, setPickerDefaults] = useState([]) // rows from proposal_default_slides for the picker
  const [editorExpanded, setEditorExpanded] = useState(false)
  const [staleConflict, setStaleConflict] = useState(false) // true = show overwrite warning
  const pdfUrlRef    = useRef(null)
  const formPanelRef = useRef(null)
  const slidesRef    = useRef(slides)
  const loadedAtRef  = useRef(null) // max updated_at when slides were last loaded/saved

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // ── Editor expand listener ─────────────────────────────────────────────────

  useEffect(() => {
    const el = formPanelRef.current
    if (!el) return
    const handler = (e) => setEditorExpanded(e.detail.expanded)
    el.addEventListener('rte-expand', handler)
    return () => el.removeEventListener('rte-expand', handler)
  }, [])

  // ── Load picker defaults ───────────────────────────────────────────────────

  async function loadPickerDefaults() {
    const { data } = await supabase
      .from('proposal_default_slides')
      .select('*')
      .order('position')
    setPickerDefaults(data || [])
  }

  useEffect(() => { loadPickerDefaults() }, [])

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      // Check for existing saved slides for this deal
      const { data: saved } = await supabase
        .from('proposal_slides')
        .select('*')
        .eq('deal_id', deal.id)
        .order('position')

      if (saved && saved.length > 0) {
        setSlides(saved.map((r) => ({ id: r.id, slide_key: r.slide_key, position: r.position, fields: r.fields || {}, label: r.label || '' })))
        setActiveSlideId(saved[0].id)
        // Record the freshest timestamp so we can detect concurrent edits on save
        const maxUpdatedAt = saved.reduce((max, r) => (!max || r.updated_at > max ? r.updated_at : max), null)
        loadedAtRef.current = maxUpdatedAt
        setLoadState('ready')
        return
      }

      // No saved slides — try to load from defaults table
      const { data: dbDefaults } = await supabase
        .from('proposal_default_slides')
        .select('*')
        .order('position')

      if (dbDefaults && dbDefaults.length > 0) {
        const slides = dbDefaults.map((r) => ({
          id: `default-${r.id}`,
          slide_key: r.slide_key,
          position: r.position,
          fields: r.fields || {},
          label: r.label || '',
        }))
        setSlides(slides)
        setActiveSlideId(slides[0].id)
      } else {
        // Fallback: hardcoded starter
        const slides = [
          { id: `new-${Date.now()}-0`, slide_key: 'cover',   position: 0, label: '', fields: { ...SLIDE_MAP['cover'].defaultFields, title: deal.name, subtitle: deal.customers?.name || '' } },
          { id: `new-${Date.now()}-1`, slide_key: 'pricing', position: 1, label: '', fields: { ...SLIDE_MAP['pricing'].defaultFields } },
          { id: `new-${Date.now()}-2`, slide_key: 'closing', position: 2, label: '', fields: { ...SLIDE_MAP['closing'].defaultFields } },
        ]
        setSlides(slides)
        setActiveSlideId(slides[0].id)
      }
      setLoadState('ready')
    }
    load()
  }, [deal.id])

  // ── Slide mutations ────────────────────────────────────────────────────────

  function addSlideFromDefault(row) {
    const def = SLIDE_MAP[row.slide_key]
    if (!def) return
    const newSlide = {
      id: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      slide_key: row.slide_key,
      position: slides.length,
      label: row.label || '',
      fields: { ...(row.fields || def.defaultFields) },
    }
    setSlides((prev) => {
      const closingIdx = prev.findIndex((s) => s.slide_key === 'closing')
      if (closingIdx !== -1) {
        const updated = [...prev]
        updated.splice(closingIdx, 0, newSlide)
        return updated
      }
      return [...prev, newSlide]
    })
    setActiveSlideId(newSlide.id)
    setShowPicker(false)
    setDirty(true)
  }

  function addSlide(slideKey) {
    const def = SLIDE_MAP[slideKey]
    if (!def) return
    const newSlide = {
      id: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      slide_key: slideKey,
      position: slides.length,
      label: '',
      fields: { ...def.defaultFields },
    }
    setSlides((prev) => {
      // Insert before last slide (closing) if present
      const closingIdx = prev.findIndex((s) => s.slide_key === 'closing')
      if (closingIdx !== -1) {
        const updated = [...prev]
        updated.splice(closingIdx, 0, newSlide)
        return updated
      }
      return [...prev, newSlide]
    })
    setActiveSlideId(newSlide.id)
    setShowPicker(false)
    setDirty(true)
  }

  function removeSlide(slideId) {
    setSlides((prev) => {
      const filtered = prev.filter((s) => s.id !== slideId)
      if (activeSlideId === slideId) {
        setActiveSlideId(filtered[0]?.id || null)
      }
      return filtered
    })
    setDirty(true)
  }

  function updateSlideFields(slideId, newFields) {
    setSlides((prev) => prev.map((s) => s.id === slideId ? { ...s, fields: newFields } : s))
    setDirty(true)
  }

  function updateSlideLabel(slideId, label) {
    setSlides((prev) => prev.map((s) => s.id === slideId ? { ...s, label } : s))
    setDirty(true)
  }

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    setSlides((prev) => {
      const oldIdx = prev.findIndex((s) => s.id === active.id)
      const newIdx = prev.findIndex((s) => s.id === over.id)
      return arrayMove(prev, oldIdx, newIdx)
    })
    setDirty(true)
  }

  // ── Asset library ──────────────────────────────────────────────────────────

  function openAssetPicker(slideId, fieldPath) {
    setAssetTargetField({ slideId, fieldPath })
    setShowAssets(true)
  }

  function handleAssetSelect(url) {
    if (!assetTargetField) return
    const { slideId, fieldPath } = assetTargetField
    const slide = slides.find((s) => s.id === slideId)
    if (!slide) return

    // Handle nested paths like "members.0.photo_url"
    const parts = fieldPath.split('.')
    if (parts.length === 1) {
      updateSlideFields(slideId, { ...slide.fields, [fieldPath]: url })
    } else if (parts.length === 3 && parts[0] === 'members') {
      const idx = parseInt(parts[1])
      const key = parts[2]
      const members = [...(slide.fields.members || [])]
      members[idx] = { ...members[idx], [key]: url }
      updateSlideFields(slideId, { ...slide.fields, members })
    }
    setAssetTargetField(null)
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function saveProposal({ force = false } = {}) {
    setSaving(true)

    // Use ref so we always get the latest reordered slides, not a stale closure
    const currentSlides = slidesRef.current
    const isFirstSave = currentSlides.every((s) => !s.id)

    // ── Stale-save check ──────────────────────────────────────────────────────
    // If we have a known load timestamp and this isn't a forced overwrite, check
    // whether someone else saved after we opened the builder.
    if (!force && loadedAtRef.current) {
      const { data: latest } = await supabase
        .from('proposal_slides')
        .select('updated_at')
        .eq('deal_id', deal.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()
      if (latest?.updated_at && latest.updated_at > loadedAtRef.current) {
        setSaving(false)
        setStaleConflict(true)
        return
      }
    }

    // Delete existing v2 slides for this deal
    await supabase.from('proposal_slides').delete().eq('deal_id', deal.id)

    // Re-insert all current slides with updated positions
    const rows = currentSlides.map((s, i) => ({
      deal_id:   deal.id,
      slide_key: s.slide_key,
      position:  i,
      label:     s.label || null,
      fields:    s.fields,
    }))

    const { data: saved, error } = await supabase
      .from('proposal_slides')
      .insert(rows)
      .select()
      .order('position')   // ensure returned rows match insertion order

    if (error) {
      alert('Save failed: ' + error.message)
      setSaving(false)
      return
    }

    // Update local IDs to real DB IDs — match by position so order changes don't scramble IDs
    if (saved) {
      const idByPosition = Object.fromEntries(saved.map((r) => [r.position, r.id]))
      setSlides((prev) =>
        prev.map((s, i) => ({ ...s, id: idByPosition[i] || s.id }))
      )
    }

    await logActivity({
      dealId:      deal.id,
      description: isFirstSave
        ? `Proposal created (${currentSlides.length} slide${currentSlides.length !== 1 ? 's' : ''})`
        : `Proposal updated (${currentSlides.length} slide${currentSlides.length !== 1 ? 's' : ''})`,
      recordId:    saved?.[0]?.id || 'proposal',
    })
    onLogged?.()

    // Update our "loaded at" baseline to now so subsequent saves in the same
    // session don't false-positive against our own write.
    if (saved?.length) {
      const maxUpdatedAt = saved.reduce((max, r) => (!max || r.updated_at > max ? r.updated_at : max), null)
      loadedAtRef.current = maxUpdatedAt
    }

    setDirty(false)
    setSaving(false)
  }

  // ── Export PDF ─────────────────────────────────────────────────────────────

  async function handleExport() {
    setExporting(true)
    try {
      const doc = (
        <ProposalPDFv2
          slides={slidesRef.current}
          deal={deal}
          dealProducts={dealProducts}
          dealPartners={dealPartners}
        />
      )
      const blob = await pdf(doc).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(deal.name || 'Proposal').replace(/\s+/g, '-')}-Proposal-${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      await logActivity({
        dealId:      deal.id,
        description: `Proposal exported as PDF`,
        recordId:    deal.id,
      })
      onLogged?.()
    } finally {
      setExporting(false)
    }
  }

  // ── Save as default ────────────────────────────────────────────────────────

  async function getDefaultCount() {
    const { count } = await supabase
      .from('proposal_default_slides')
      .select('id', { count: 'exact', head: true })
    return count ?? 0
  }

  // Update the first existing default for this slide_key (or create one if none exists)
  async function saveAsDefault() {
    if (!activeSlide) return
    setSavingDefault('update')

    const { data: existing } = await supabase
      .from('proposal_default_slides')
      .select('id')
      .eq('slide_key', activeSlide.slide_key)
      .order('position')
      .limit(1)
      .single()

    if (existing) {
      await supabase
        .from('proposal_default_slides')
        .update({ fields: activeSlide.fields, label: activeSlide.label || null })
        .eq('id', existing.id)
    } else {
      const count = await getDefaultCount()
      await supabase
        .from('proposal_default_slides')
        .insert({ slide_key: activeSlide.slide_key, position: count, fields: activeSlide.fields, label: activeSlide.label || null })
    }

    setSavingDefault(false)
    setSavedDefault('update')
    loadPickerDefaults()
    setTimeout(() => setSavedDefault(false), 2500)
  }

  // Always insert a new default row (makes a named copy)
  async function saveAsNewDefault() {
    if (!activeSlide) return
    setSavingDefault('new')

    const def   = SLIDE_MAP[activeSlide.slide_key]
    const count = await getDefaultCount()
    // Auto-name if no custom label: "Full Image 2", "Full Image 3", etc.
    const label = activeSlide.label || def?.label || activeSlide.slide_key

    await supabase
      .from('proposal_default_slides')
      .insert({ slide_key: activeSlide.slide_key, position: count, fields: activeSlide.fields, label })

    setSavingDefault(false)
    setSavedDefault('new')
    loadPickerDefaults()
    setTimeout(() => setSavedDefault(false), 2500)
  }

  // ── Save order as default ──────────────────────────────────────────────────

  async function saveOrderAsDefault() {
    if (slides.length === 0) return
    setSavingOrderDefault(true)

    // Replace all defaults with the current slide arrangement
    await supabase.from('proposal_default_slides').delete().neq('id', '00000000-0000-0000-0000-000000000000') // delete all
    const rows = slides.map((s, i) => ({
      slide_key: s.slide_key,
      position:  i,
      label:     s.label || null,
      fields:    s.fields,
    }))
    await supabase.from('proposal_default_slides').insert(rows)

    setSavingOrderDefault(false)
    setSavedOrderDefault(true)
    loadPickerDefaults()
    setTimeout(() => setSavedOrderDefault(false), 2500)
  }

  // ── PDF preview ────────────────────────────────────────────────────────────

  function generatePreview(slidesOverride) {
    const effectiveSlides = Array.isArray(slidesOverride) ? slidesOverride : slidesRef.current
    if (effectiveSlides.length === 0) return
    setPdfGenerating(true)
    const doc = (
      <ProposalPDFv2
        slides={effectiveSlides}
        deal={deal}
        dealProducts={dealProducts}
        dealPartners={dealPartners}
      />
    )
    pdf(doc).toBlob()
      .then((blob) => {
        const url = URL.createObjectURL(blob) + '#navpanes=0&toolbar=1'
        setPdfUrl(url)
        if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current.split('#')[0])
        pdfUrlRef.current = url
        setPdfGenerating(false)
      })
      .catch((err) => { console.error('PDF generation error:', err); setPdfGenerating(false) })
  }

  // Keep slidesRef current after every committed render (useLayoutEffect is safe in concurrent mode)
  useLayoutEffect(() => {
    slidesRef.current = slides
  })

  // Auto-generate once after initial load
  useEffect(() => {
    if (loadState === 'ready') generatePreview()
  }, [loadState]) // eslint-disable-line react-hooks/exhaustive-deps

  // Patch team slides with deal team members as soon as both are available.
  // Reads from slidesRef.current (synced by useLayoutEffect) so it always has committed state.
  useEffect(() => {
    if (!dealTeam.length || loadState !== 'ready') return
    const current = slidesRef.current
    let patched = false
    const patchedSlides = current.map((s) => {
      if (s.slide_key !== 'team') return s
      const hasRealMembers = (s.fields.members || []).some((m) => m.name)
      if (hasRealMembers) return s
      const loaded = dealTeam
        .filter((m) => m.people?.name)
        .map((m) => ({
          name:      m.people.name  || '',
          title:     m.people.title || '',
          bio:       m.people.bio   || '',
          photo_url: '',
          _id:       `member-deal-${m.id}`,
        }))
      if (!loaded.length) return s
      patched = true
      return { ...s, fields: { ...s.fields, members: loaded } }
    })
    if (patched) {
      setSlides(patchedSlides)
      generatePreview(patchedSlides)
    }
  }, [dealTeam.length, loadState]) // eslint-disable-line react-hooks/exhaustive-deps


  // ── Active slide state ─────────────────────────────────────────────────────

  const activeSlide = slides.find((s) => s.id === activeSlideId)
  const SlideForm   = activeSlide ? SLIDE_FORMS[activeSlide.slide_key] : null

  // ── Has-legacy screen ──────────────────────────────────────────────────────

  if (loadState === 'loading') {
    return createPortal(
      <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
        <Spinner />
      </div>,
      document.body
    )
  }

  // ── Main UI ────────────────────────────────────────────────────────────────

  return createPortal(
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3.5 bg-white border-b border-gray-200 flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-navy-900">Proposal Builder — {deal.name}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{slides.length} slide{slides.length !== 1 ? 's' : ''}{dirty ? ' · Unsaved changes' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={<RefreshCw size={14} />} loading={pdfGenerating} onClick={() => generatePreview()}>
            Refresh Preview
          </Button>
          <Button variant="secondary" loading={saving} onClick={saveProposal}>
            Save
          </Button>
          <Button variant="navy" icon={<Download size={14} />} loading={exporting} onClick={handleExport}>Export PDF</Button>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg ml-1">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">

        {/* Left panel — slide list */}
        <div className="w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          {/* Add slide button */}
          <div className="p-3 border-b border-gray-100 flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowPicker((o) => !o)}
              className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl border text-sm font-medium transition-colors ${showPicker ? 'bg-primary-500 text-white border-primary-500' : 'border-dashed border-gray-300 text-gray-500 hover:border-primary-400 hover:text-primary-500'}`}
            >
              <Plus size={14} />
              Add Slide
            </button>
          </div>

          {/* Slide type picker */}
          {showPicker && (
            <div className="p-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
              {/* Saved defaults section */}
              {pickerDefaults.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Your Saved Slides</p>
                  <div className="space-y-1 mb-3">
                    {pickerDefaults.map((row) => {
                      const def = SLIDE_MAP[row.slide_key]
                      const Icon = SLIDE_ICONS[row.slide_key] || FileText
                      return (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => addSlideFromDefault(row)}
                          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white hover:shadow-sm text-left transition-all group"
                        >
                          <div className="w-7 h-7 rounded-lg bg-primary-100 group-hover:bg-primary-500 flex items-center justify-center flex-shrink-0 transition-colors">
                            <Icon size={13} className="text-primary-500 group-hover:text-white transition-colors" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-navy-900">{row.label || def?.label || row.slide_key}</p>
                            <p className="text-[10px] text-gray-400 truncate">{row.label ? def?.label : def?.description}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  <div className="border-t border-gray-200 mb-2" />
                </>
              )}

              {/* All slide types */}
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Slide Types</p>
              <div className="space-y-1">
                {SLIDE_LIBRARY.map((def) => {
                  const Icon = SLIDE_ICONS[def.key] || FileText
                  return (
                    <button
                      key={def.key}
                      type="button"
                      onClick={() => addSlide(def.key)}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white hover:shadow-sm text-left transition-all group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-gray-200 group-hover:bg-primary-500 flex items-center justify-center flex-shrink-0 transition-colors">
                        <Icon size={13} className="text-gray-500 group-hover:text-white transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-navy-900">{def.label}</p>
                        <p className="text-[10px] text-gray-400 truncate">{def.description}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Sortable slide list */}
          <div className="p-3 flex-1 space-y-1.5">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={slides.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                {slides.map((slide) => (
                  <SortableSlide
                    key={slide.id}
                    slide={slide}
                    isActive={slide.id === activeSlideId}
                    onClick={() => setActiveSlideId(slide.id)}
                    onRemove={() => removeSlide(slide.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {slides.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6">Click "Add Slide" to start building.</p>
            )}
          </div>

          {/* Save order as default */}
          {slides.length > 0 && (
            <div className="p-3 border-t border-gray-100 flex-shrink-0">
              <button
                type="button"
                onClick={saveOrderAsDefault}
                disabled={savingOrderDefault}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-dashed border-gray-200 text-[11px] font-medium text-gray-400 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-50"
              >
                {savingOrderDefault
                  ? <><RefreshCw size={11} className="animate-spin" /><span>Saving…</span></>
                  : savedOrderDefault
                    ? <><Star size={11} className="text-primary-500 fill-primary-500" /><span className="text-primary-600">Order Saved as Default ✓</span></>
                    : <><Star size={11} /><span>Save Order as Default</span></>
                }
              </button>
            </div>
          )}
        </div>

        {/* Right panel — slide form */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Form panel */}
          <div
            ref={formPanelRef}
            style={{ width: editorExpanded ? 520 : 320, transition: 'width 0.2s ease' }}
            className="flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto"
          >
            {activeSlide && SlideForm ? (
              <div className="p-5">
                <SlideLabelHeader
                  slide={activeSlide}
                  onLabelChange={(label) => updateSlideLabel(activeSlide.id, label)}
                />
                <SlideForm
                  fields={activeSlide.fields}
                  onChange={(newFields) => updateSlideFields(activeSlide.id, newFields)}
                  onPickAsset={(fieldPath) => openAssetPicker(activeSlide.id, fieldPath)}
                  deal={deal}
                  dealProducts={dealProducts}
                  dealPartners={dealPartners}
                  dealTeam={dealTeam}
                />

                {/* Save as Default / Save as New Slide */}
                <div className="mt-6 pt-4 border-t border-gray-100 space-y-2">
                  {/* Save as Default — updates existing */}
                  <button
                    type="button"
                    onClick={saveAsDefault}
                    disabled={!!savingDefault}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-dashed border-gray-300 text-xs font-medium text-gray-500 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-50"
                  >
                    {savingDefault === 'update'
                      ? <><RefreshCw size={12} className="animate-spin" /><span>Saving…</span></>
                      : savedDefault === 'update'
                        ? <><Star size={12} className="text-primary-500 fill-primary-500" /><span className="text-primary-600">Default Updated ✓</span></>
                        : <><Star size={12} /><span>Save as Default</span></>
                    }
                  </button>

                  {/* Save as New Slide — always inserts */}
                  <button
                    type="button"
                    onClick={saveAsNewDefault}
                    disabled={!!savingDefault}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-dashed border-gray-300 text-xs font-medium text-gray-500 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-50"
                  >
                    {savingDefault === 'new'
                      ? <><RefreshCw size={12} className="animate-spin" /><span>Saving…</span></>
                      : savedDefault === 'new'
                        ? <><Star size={12} className="text-primary-500 fill-primary-500" /><span className="text-primary-600">Saved as New Slide ✓</span></>
                        : <><Plus size={12} /><span>Save as New Slide</span></>
                    }
                  </button>

                  <p className="text-[10px] text-gray-400 text-center pt-0.5">
                    <span className="font-medium text-gray-500">Save as Default</span> updates existing · <span className="font-medium text-gray-500">Save as New</span> adds a copy
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 p-8 text-center">
                <div>
                  <Layout size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select a slide to edit it.</p>
                </div>
              </div>
            )}
          </div>

          {/* PDF Preview iframe */}
          <div className="flex-1 bg-gray-100 relative overflow-hidden">
            {pdfUrl && !pdfGenerating && (
              <iframe src={pdfUrl} width="100%" height="100%" style={{ border: 'none', display: 'block' }} title="Proposal Preview" />
            )}
            {(!pdfUrl || pdfGenerating) && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                {pdfGenerating
                  ? <><Spinner /><p className="text-sm mt-2">Generating preview…</p></>
                  : <><RefreshCw size={24} className="opacity-30" /><p className="text-sm">Click Refresh Preview to load.</p></>
                }
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Asset library modal */}
      {showAssets && (
        <AssetLibrary
          onSelect={handleAssetSelect}
          onClose={() => setShowAssets(false)}
        />
      )}

      {/* Stale-save conflict warning */}
      {staleConflict && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-yellow-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 3h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-navy-900">Proposal changed by someone else</p>
                <p className="text-sm text-gray-500 mt-1">
                  This proposal was saved by another user after you opened it. Saving now will overwrite their changes.
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                className="flex-1 text-sm font-medium border border-gray-200 rounded-xl px-4 py-2.5 hover:bg-gray-50 transition-colors"
                onClick={async () => {
                  setStaleConflict(false)
                  // Reload slides from DB so they see the latest version
                  const { data } = await supabase
                    .from('proposal_slides')
                    .select('*')
                    .eq('deal_id', deal.id)
                    .order('position')
                  if (data?.length) {
                    setSlides(data.map((r) => ({ id: r.id, slide_key: r.slide_key, position: r.position, fields: r.fields || {}, label: r.label || '' })))
                    const maxUpdatedAt = data.reduce((max, r) => (!max || r.updated_at > max ? r.updated_at : max), null)
                    loadedAtRef.current = maxUpdatedAt
                    setDirty(false)
                  }
                }}
              >
                Discard my changes
              </button>
              <button
                className="flex-1 text-sm font-medium bg-navy-900 text-white rounded-xl px-4 py-2.5 hover:bg-navy-800 transition-colors"
                onClick={() => { setStaleConflict(false); saveProposal({ force: true }) }}
              >
                Save anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
