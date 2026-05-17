import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, GripVertical, Trash2, Settings, ChevronDown, ChevronUp } from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/logActivity'
import Button from './ui/Button'
import Input from './ui/Input'
import Spinner from './ui/Spinner'
import TypeBadge from './questionnaire/TypeBadge'
import QuestionnaireSuccessView from './questionnaire/QuestionnaireSuccessView'
import RichTextEditor from './ui/RichTextEditor'

// ─── Sortable question row ───────────────────────────────────────────────────

function SortableItem({ item, isActive, onClick, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item._key })
  const isHeader = item.question_type === 'section' || item.question_type === 'subsection'

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors group ${
        isActive
          ? 'border-primary-400 bg-primary-50'
          : 'border-gray-200 hover:border-gray-300 bg-white'
      }`}
    >
      <div
        {...attributes} {...listeners}
        className="p-0.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={13} />
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-xs truncate ${
          item.question_type === 'section'    ? 'font-bold text-navy-900' :
          item.question_type === 'subsection' ? 'font-semibold text-gray-700' :
          isActive ? 'font-medium text-primary-700' : 'text-gray-700'
        }`}>
          {item.question_text || <span className="italic text-gray-400">Untitled</span>}
        </p>
        {!isHeader && (
          <div className="mt-0.5">
            <TypeBadge type={item.question_type} />
          </div>
        )}
        {isHeader && <TypeBadge type={item.question_type} />}
      </div>

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

// ─── Live preview ────────────────────────────────────────────────────────────

function LivePreview({ title, introText, formItems }) {
  let qNum = 0
  let sNum = 0

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="bg-navy-900 rounded-xl px-6 py-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-md bg-primary-400 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xs">SF</span>
            </div>
            <span className="text-white/70 text-xs font-medium tracking-wide">SalesFlow · Trilogy Digital</span>
          </div>
          <h1 className="text-white font-bold text-lg leading-tight">
            {title || <span className="opacity-40 italic">Questionnaire title…</span>}
          </h1>
        </div>

        {/* Intro */}
        {introText && (
          <div
            className="bg-white rounded-xl border border-gray-100 px-6 py-4 mb-6 text-sm text-gray-600 leading-relaxed
              [&_p]:my-1 [&_ul]:my-1.5 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:my-1.5 [&_ol]:pl-5 [&_ol]:list-decimal
              [&_li]:my-0.5 [&_strong]:font-semibold [&_strong]:text-gray-700"
            dangerouslySetInnerHTML={{ __html: introText }}
          />
        )}

        {/* Questions */}
        {formItems.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center">
            <p className="text-sm text-gray-400 italic">Questions will appear here as you add them.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {formItems.map((item) => {
              const isSection    = item.question_type === 'section'
              const isSubsection = item.question_type === 'subsection'
              const isQuestion   = !isSection && !isSubsection

              if (isSection) {
                sNum++
                qNum = 0
                return (
                  <div key={item._key} className="pt-2">
                    <h2 className="text-sm font-bold text-navy-900 uppercase tracking-wide border-b border-gray-200 pb-2">
                      {sNum}. {item.question_text || 'Section'}
                    </h2>
                  </div>
                )
              }
              if (isSubsection) {
                return (
                  <div key={item._key}>
                    <h3 className="text-sm font-semibold text-gray-700">{item.question_text || 'Subsection'}</h3>
                  </div>
                )
              }

              qNum++
              return (
                <div key={item._key} className="bg-white rounded-xl border border-gray-100 px-5 py-4">
                  <p className="text-sm font-medium text-navy-900 mb-1">
                    {qNum}. {item.question_text || <span className="italic text-gray-400">Question text…</span>}
                  </p>
                  {item.question_help_text && (
                    <p className="text-xs text-gray-400 mb-2">{item.question_help_text}</p>
                  )}
                  {item.question_type === 'long' ? (
                    <RichTextEditor
                      value=""
                      onChange={() => {}}
                      placeholder="Your answer…"
                    />
                  ) : (
                    <input
                      disabled
                      type="text"
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-400 px-3 py-2 cursor-not-allowed"
                      placeholder="Short answer…"
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}

        <p className="text-center text-xs text-gray-300 mt-8">Preview only · Responses not recorded here</p>
      </div>
    </div>
  )
}

// ─── Item editor (middle panel when a question is selected) ──────────────────

function ItemEditor({ item, onChange }) {
  const isHeader = item.question_type === 'section' || item.question_type === 'subsection'

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          {item.question_type === 'section' ? 'Section Title' :
           item.question_type === 'subsection' ? 'Subsection Title' : 'Question Text'}
        </label>
        <textarea
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-400"
          value={item.question_text}
          onChange={(e) => onChange({ ...item, question_text: e.target.value })}
        />
      </div>

      {!isHeader && (
        <>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Help Text <span className="font-normal text-gray-400">(optional hint below question)</span></label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              placeholder="e.g. Please be as specific as possible."
              value={item.question_help_text || ''}
              onChange={(e) => onChange({ ...item, question_help_text: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Answer Type</label>
            <div className="flex gap-2">
              {['short', 'long'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => onChange({ ...item, question_type: type })}
                  className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                    item.question_type === type
                      ? 'border-primary-400 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {type === 'short' ? 'Short Answer' : 'Long Answer'}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Add panel (shown when no item is selected or + Add is clicked) ──────────

function AddPanel({ sets, library, formItems, onAddItems, onAddItem }) {
  const [tab, setTab] = useState('set') // set | library | new | section
  const [selectedSetId, setSelectedSetId] = useState('')
  const [setPreview, setSetPreview] = useState([])
  const [setAdded, setSetAdded] = useState(false)
  const [newText, setNewText] = useState('')
  const [newHelp, setNewHelp] = useState('')
  const [newType, setNewType] = useState('short')
  const [sectionText, setSectionText] = useState('')
  const [sectionType, setSectionType] = useState('section')

  useEffect(() => {
    if (!selectedSetId) { setSetPreview([]); return }
    supabase
      .from('questionnaire_set_questions')
      .select('sort_order, questionnaire_questions(id, text, type, help_text)')
      .eq('set_id', selectedSetId)
      .order('sort_order')
      .then(({ data }) => {
        setSetPreview((data || []).map((r) => ({ ...r.questionnaire_questions, sort_order: r.sort_order })))
      })
  }, [selectedSetId])

  function addSet() {
    if (!selectedSetId || setPreview.length === 0) return
    const set = sets.find((s) => String(s.id) === String(selectedSetId))
    const header = {
      _key: `section-${selectedSetId}-${Date.now()}`,
      question_id: null, source_set_id: null, source_set_name: '',
      question_text: set?.name || 'Question Set',
      question_type: 'section', question_help_text: '',
    }
    const items = setPreview.map((q) => ({
      _key: `${q.id}-${selectedSetId}-${Date.now()}-${Math.random()}`,
      question_id: q.id, source_set_id: selectedSetId,
      source_set_name: set?.name || '',
      question_text: q.text, question_type: q.type,
      question_help_text: q.help_text || '',
    }))
    onAddItems([header, ...items])
    setSetAdded(true)
    setTimeout(() => setSetAdded(false), 2000)
  }

  async function addNewQuestion() {
    if (!newText.trim()) return
    const { data: q } = await supabase
      .from('questionnaire_questions')
      .insert({ text: newText.trim(), type: newType, help_text: newHelp.trim() || null, is_archived: false })
      .select('id')
      .single()
    onAddItem({
      _key: `new-${Date.now()}`,
      question_id: q?.id || null, source_set_id: null, source_set_name: '',
      question_text: newText.trim(), question_type: newType,
      question_help_text: newHelp.trim(),
    })
    setNewText('')
    setNewHelp('')
    setNewType('short')
  }

  function addSection() {
    if (!sectionText.trim()) return
    onAddItem({
      _key: `${sectionType}-${Date.now()}`,
      question_id: null, source_set_id: null, source_set_name: '',
      question_text: sectionText.trim(), question_type: sectionType,
      question_help_text: '',
    })
    setSectionText('')
  }

  const TABS = [
    { key: 'set',     label: 'From Set' },
    { key: 'library', label: 'Library' },
    { key: 'new',     label: 'New Question' },
    { key: 'section', label: 'Section / Header' },
  ]

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex border-b border-gray-100">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
              tab === t.key
                ? 'border-primary-400 text-primary-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* From Set */}
      {tab === 'set' && (
        <div className="space-y-3">
          <select
            className="w-full rounded-lg border border-gray-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
            value={selectedSetId}
            onChange={(e) => setSelectedSetId(e.target.value)}
          >
            <option value="">— Choose a set —</option>
            {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {setPreview.length > 0 && (
            <div className="rounded-lg border border-gray-100 divide-y divide-gray-50 max-h-48 overflow-y-auto">
              {setPreview.map((q, i) => (
                <div key={q.id} className="flex items-start gap-3 px-3 py-2">
                  <span className="text-xs text-gray-400 mt-0.5 w-4 flex-shrink-0">{i + 1}.</span>
                  <span className="text-xs text-gray-700 flex-1">{q.text}</span>
                  <TypeBadge type={q.type} />
                </div>
              ))}
            </div>
          )}
          <Button
            size="sm"
            variant={setAdded ? 'primary' : 'secondary'}
            disabled={!selectedSetId || setPreview.length === 0}
            onClick={addSet}
          >
            {setAdded ? '✓ Added' : `Add ${setPreview.length > 0 ? setPreview.length + ' questions' : 'Set'}`}
          </Button>
        </div>
      )}

      {/* Library */}
      {tab === 'library' && (
        <div className="space-y-2">
          {library.length === 0 ? (
            <p className="text-sm text-gray-400">No questions in the library yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {library.map((q) => {
                const isSelected = formItems.some((item) => item.question_id === q.id && !item.source_set_id)
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      if (isSelected) return
                      onAddItem({
                        _key: `${q.id}-lib-${Date.now()}`,
                        question_id: q.id, source_set_id: null, source_set_name: '',
                        question_text: q.text, question_type: q.type,
                        question_help_text: q.help_text || '',
                      })
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                      isSelected
                        ? 'bg-primary-50 border-primary-300 text-primary-600 cursor-default'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex-1 truncate">{q.text}</span>
                      <TypeBadge type={q.type} />
                      {isSelected && <span className="text-xs text-primary-500 font-medium">Added</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* New question */}
      {tab === 'new' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Question Text</label>
            <textarea
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-400"
              placeholder="Enter your question…"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Help Text <span className="font-normal text-gray-400">(optional)</span></label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              placeholder="Hint shown below the question"
              value={newHelp}
              onChange={(e) => setNewHelp(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            {['short', 'long'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setNewType(t)}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                  newType === t ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500'
                }`}
              >
                {t === 'short' ? 'Short Answer' : 'Long Answer'}
              </button>
            ))}
          </div>
          <Button size="sm" disabled={!newText.trim()} onClick={addNewQuestion}>
            + Add Question
          </Button>
        </div>
      )}

      {/* Section / Header */}
      {tab === 'section' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            {[{ key: 'section', label: 'Section' }, { key: 'subsection', label: 'Subsection' }].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setSectionType(t.key)}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                  sectionType === t.key ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              {sectionType === 'section' ? 'Section Title' : 'Subsection Title'}
            </label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              placeholder={sectionType === 'section' ? 'e.g. Technical Infrastructure' : 'e.g. Current Setup'}
              value={sectionText}
              onChange={(e) => setSectionText(e.target.value)}
            />
          </div>
          <Button size="sm" disabled={!sectionText.trim()} onClick={addSection}>
            + Add Header
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function QuestionnaireBuilder({ deal, onCreated, onClose, onLogged }) {
  const [loading, setLoading]           = useState(true)
  const [sets, setSets]                 = useState([])
  const [library, setLibrary]           = useState([])
  const [defaultIntroText, setDefaultIntroText] = useState('')

  // Settings
  const [title, setTitle]               = useState(`Discovery Questionnaire — ${deal.name}`)
  const [expiresIn, setExpiresIn]       = useState(30)
  const [reminderDays, setReminderDays] = useState(3)
  const [showSettings, setShowSettings] = useState(false)

  // Questions
  const [formItems, setFormItems]       = useState([])
  const [activeKey, setActiveKey]       = useState(null)  // selected item _key
  const [showAdd, setShowAdd]           = useState(false) // show add panel

  // Save / success
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState(null)
  const [created, setCreated]           = useState(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [setsRes, questionsRes, defaultRes] = await Promise.all([
        supabase.from('questionnaire_sets').select('id, name, description').order('name'),
        supabase.from('questionnaire_questions').select('id, text, type, help_text').eq('is_archived', false).order('text'),
        supabase.from('questionnaire_defaults').select('intro_text').eq('id', 1).maybeSingle(),
      ])
      if (cancelled) return
      setSets(setsRes.data || [])
      setLibrary(questionsRes.data || [])
      setDefaultIntroText(defaultRes.data?.intro_text || '')
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    setFormItems((prev) => {
      const oldIdx = prev.findIndex((i) => i._key === active.id)
      const newIdx = prev.findIndex((i) => i._key === over.id)
      return arrayMove(prev, oldIdx, newIdx)
    })
  }

  function updateItem(key, updated) {
    setFormItems((prev) => prev.map((i) => i._key === key ? updated : i))
  }

  function removeItem(key) {
    setFormItems((prev) => prev.filter((i) => i._key !== key))
    if (activeKey === key) setActiveKey(null)
  }

  function addItems(items) {
    setFormItems((prev) => [...prev, ...items])
    setShowAdd(false)
    // Select the last added question item
    const lastQ = [...items].reverse().find((i) => i.question_type !== 'section' && i.question_type !== 'subsection')
    if (lastQ) setActiveKey(lastQ._key)
  }

  function addItem(item) {
    setFormItems((prev) => [...prev, item])
    setShowAdd(false)
    setActiveKey(item._key)
  }

  async function handleSave() {
    setError(null)
    if (!title.trim()) { setError('Title is required.'); return }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + Number(expiresIn || 30))
      const rawBytes = crypto.getRandomValues(new Uint8Array(24))
      const token = btoa(String.fromCharCode(...rawBytes))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

      const { data: qData, error: qErr } = await supabase
        .from('questionnaires')
        .insert({
          deal_id: deal.id,
          title: title.trim(),
          intro_text: defaultIntroText.trim() || null,
          expires_at: expiresAt.toISOString(),
          reminder_days: Number(reminderDays || 3),
          status: 'active',
          created_by: user?.id,
          token,
        })
        .select('id, token, title')
        .single()

      if (qErr) throw qErr

      if (formItems.length > 0) {
        const items = formItems.map((item, idx) => ({
          questionnaire_id: qData.id,
          question_id: item.question_id,
          source_set_id: item.source_set_id || null,
          sort_order: idx,
          question_text: item.question_text,
          question_type: item.question_type,
          question_help_text: item.question_help_text || null,
        }))
        const { error: itemErr } = await supabase.from('questionnaire_items').insert(items)
        if (itemErr) throw itemErr
      }

      await supabase.from('questionnaire_responses').insert({ questionnaire_id: qData.id })

      await logActivity({
        dealId:      deal.id,
        description: `Questionnaire created: "${qData.title}" (${formItems.filter(i => i.question_type !== 'section' && i.question_type !== 'subsection').length} questions)`,
        recordId:    qData.id,
      })
      onLogged?.()

      const result = { id: qData.id, token: qData.token, title: qData.title }
      setCreated(result)
      onCreated(result)
    } catch (e) {
      console.error(e)
      setError(e.message || 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const publicLink   = created ? `${window.location.origin}/q/${created.token}` : ''
  const qCount       = formItems.filter((i) => i.question_type !== 'section' && i.question_type !== 'subsection').length
  const activeItem   = formItems.find((i) => i._key === activeKey)
  const middleMode   = showAdd ? 'add' : activeItem ? 'edit' : 'add'

  return createPortal(
    <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-white flex-shrink-0">
        <div>
          <p className="text-xs text-gray-400 font-medium">{deal.company_name || deal.name}</p>
          <h2 className="text-sm font-semibold text-navy-900 leading-tight">{title || 'New Questionnaire'}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{qCount} question{qCount !== 1 ? 's' : ''}</span>
          {!created && (
            <>
              <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button size="sm" onClick={handleSave} loading={saving}>Create Questionnaire</Button>
            </>
          )}
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors ml-1">
            <X size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center gap-3 flex-col">
          <Spinner size="lg" />
          <p className="text-sm text-gray-400">Loading…</p>
        </div>
      ) : created ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <QuestionnaireSuccessView
            created={created}
            publicLink={publicLink}
            expiresIn={expiresIn}
            onClose={onClose}
            onCopy={async () => {
              await logActivity({
                dealId:      deal.id,
                description: `Questionnaire link copied: "${created.title}"`,
                recordId:    created.id,
              })
              onLogged?.()
            }}
          />
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">

          {/* ── Left panel — question list ─────────────────────────────────── */}
          <div className="w-64 flex-shrink-0 border-r border-gray-100 flex flex-col bg-white">

            {/* Settings accordion */}
            <div className="border-b border-gray-100">
              <button
                type="button"
                onClick={() => setShowSettings((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <span className="flex items-center gap-1.5"><Settings size={12} /> Settings</span>
                {showSettings ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {showSettings && (
                <div className="px-4 pb-4 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Title</label>
                    <input
                      type="text"
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-400"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Expires</label>
                      <div className="relative">
                        <input type="number" min={1} value={expiresIn}
                          onChange={(e) => setExpiresIn(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs pr-8 focus:outline-none focus:ring-2 focus:ring-primary-400"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">d</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Reminder</label>
                      <div className="relative">
                        <input type="number" min={1} value={reminderDays}
                          onChange={(e) => setReminderDays(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs pr-8 focus:outline-none focus:ring-2 focus:ring-primary-400"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">d</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Question list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={formItems.map((i) => i._key)} strategy={verticalListSortingStrategy}>
                  {formItems.map((item) => (
                    <SortableItem
                      key={item._key}
                      item={item}
                      isActive={activeKey === item._key && !showAdd}
                      onClick={() => { setActiveKey(item._key); setShowAdd(false) }}
                      onRemove={() => removeItem(item._key)}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              {formItems.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6 italic">No questions yet.</p>
              )}
            </div>

            {/* Add button */}
            <div className="p-3 border-t border-gray-100 flex-shrink-0">
              <button
                type="button"
                onClick={() => { setShowAdd(true); setActiveKey(null) }}
                className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                  showAdd
                    ? 'border-primary-400 bg-primary-50 text-primary-600'
                    : 'border-dashed border-gray-300 text-gray-500 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50'
                }`}
              >
                <Plus size={13} /> Add Question
              </button>
            </div>
          </div>

          {/* ── Middle panel — editor / add ────────────────────────────────── */}
          <div className="w-80 flex-shrink-0 border-r border-gray-100 flex flex-col bg-white overflow-y-auto">
            <div className="p-5 flex-1">
              {middleMode === 'edit' && activeItem ? (
                <>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Edit Question</p>
                  <ItemEditor
                    item={activeItem}
                    onChange={(updated) => updateItem(activeKey, updated)}
                  />
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Add Questions</p>
                  <AddPanel
                    sets={sets}
                    library={library}
                    formItems={formItems}
                    onAddItems={addItems}
                    onAddItem={addItem}
                  />
                </>
              )}

              {error && (
                <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* ── Right panel — live preview ─────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            <LivePreview
              title={title}
              introText={defaultIntroText}
              formItems={formItems}
            />
          </div>

        </div>
      )}
    </div>,
    document.body
  )
}
