import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, ChevronUp, ChevronDown, CheckCircle, ExternalLink, Copy } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Button from './ui/Button'
import Spinner from './ui/Spinner'
import Input from './ui/Input'

// ─── TypeBadge ───────────────────────────────────────────────────────────────

function TypeBadge({ type }) {
  if (type === 'section') return (
    <span className="bg-primary-50 text-primary-600 text-xs px-2 py-0.5 rounded font-medium">Section</span>
  )
  if (type === 'subsection') return (
    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded font-medium">Subsection</span>
  )
  if (type === 'short') return (
    <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-medium">Short</span>
  )
  return (
    <span className="bg-purple-50 text-purple-700 text-xs px-2 py-0.5 rounded font-medium">Long</span>
  )
}

// ─── SectionLabel ────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function QuestionnaireBuilder({ deal, onCreated, onClose }) {
  // ── Loading state ─────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true)

  // ── Data from DB ──────────────────────────────────────────────────────────
  const [sets, setSets] = useState([])
  const [library, setLibrary] = useState([])

  // ── Step 1: Details fields ────────────────────────────────────────────────
  const [title, setTitle] = useState(`Discovery Questionnaire — ${deal.name}`)
  const [introText, setIntroText] = useState('')
  const [defaultIntroText, setDefaultIntroText] = useState('')
  const [expiresIn, setExpiresIn] = useState(30)
  const [reminderDays, setReminderDays] = useState(3)

  // ── Step 2: Question building ─────────────────────────────────────────────
  const [selectedSetId, setSelectedSetId] = useState('')
  const [setPreview, setSetPreview] = useState([])   // questions in the chosen set
  const [formItems, setFormItems] = useState([])     // { _key, question_id, source_set_id, question_text, question_type, question_help_text }
  const [setAdded, setSetAdded] = useState(false)

  // Inline new-question mini-form
  const [showNewQ, setShowNewQ] = useState(false)
  const [newQText, setNewQText] = useState('')
  const [newQType, setNewQType] = useState('short')
  const [newQHelp, setNewQHelp] = useState('')
  const [savingNewQ, setSavingNewQ] = useState(false)

  // Inline section/subsection mini-form
  const [showNewSection, setShowNewSection] = useState(false)
  const [newSectionText, setNewSectionText] = useState('')
  const [newSectionType, setNewSectionType] = useState('section')

  // ── Save state ────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [titleError, setTitleError] = useState('')

  // ── Success state ─────────────────────────────────────────────────────────
  const [created, setCreated] = useState(null)   // { id, token, title }
  const [copied, setCopied] = useState(false)

  // ── Load sets + questions + global intro default on mount ─────────────────
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
      const intro = defaultRes.data?.intro_text || ''
      setDefaultIntroText(intro)
      setIntroText(intro)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── When a set is chosen, load its questions for preview ─────────────────
  useEffect(() => {
    if (!selectedSetId) {
      setSetPreview([])
      return
    }
    async function loadSetQuestions() {
      const { data } = await supabase
        .from('questionnaire_set_questions')
        .select('sort_order, questionnaire_questions(id, text, type, help_text)')
        .eq('set_id', selectedSetId)
        .order('sort_order')
      setSetPreview(
        (data || []).map((r) => ({
          ...r.questionnaire_questions,
          sort_order: r.sort_order,
        }))
      )
    }
    loadSetQuestions()
  }, [selectedSetId])

  // ── Add set to form ───────────────────────────────────────────────────────
  function handleAddSet() {
    if (!selectedSetId || setPreview.length === 0) return
    const set = sets.find((s) => s.id === selectedSetId)
    const sectionHeader = {
      _key: `section-${selectedSetId}-${Date.now()}`,
      question_id: null,
      source_set_id: null,
      source_set_name: '',
      question_text: set?.name || 'Question Set',
      question_type: 'section',
      question_help_text: '',
    }
    const newItems = setPreview.map((q) => ({
      _key: `${q.id}-${selectedSetId}-${Date.now()}-${Math.random()}`,
      question_id: q.id,
      source_set_id: selectedSetId,
      source_set_name: set?.name || '',
      question_text: q.text,
      question_type: q.type,
      question_help_text: q.help_text || '',
    }))
    setFormItems((prev) => [...prev, sectionHeader, ...newItems])
    setSetAdded(true)
    setTimeout(() => setSetAdded(false), 2000)
  }

  // ── Toggle library question ───────────────────────────────────────────────
  function handleToggleLibraryQ(q) {
    const alreadyAdded = formItems.some(
      (item) => item.question_id === q.id && !item.source_set_id
    )
    if (alreadyAdded) {
      setFormItems((prev) =>
        prev.filter((item) => !(item.question_id === q.id && !item.source_set_id))
      )
    } else {
      setFormItems((prev) => [
        ...prev,
        {
          _key: `${q.id}-lib-${Date.now()}`,
          question_id: q.id,
          source_set_id: null,
          source_set_name: '',
          question_text: q.text,
          question_type: q.type,
          question_help_text: q.help_text || '',
        },
      ])
    }
  }

  // ── Add new question inline ───────────────────────────────────────────────
  async function handleAddNewQuestion() {
    if (!newQText.trim()) return
    setSavingNewQ(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error: err } = await supabase
        .from('questionnaire_questions')
        .insert({
          text: newQText.trim(),
          type: newQType,
          help_text: newQHelp.trim() || null,
          is_archived: false,
          created_by: user?.id,
        })
        .select('id, text, type, help_text')
        .single()

      if (err) throw err

      // Add to library list
      setLibrary((prev) => [...prev, data].sort((a, b) => a.text.localeCompare(b.text)))

      // Add to form items
      setFormItems((prev) => [
        ...prev,
        {
          _key: `${data.id}-new-${Date.now()}`,
          question_id: data.id,
          source_set_id: null,
          source_set_name: '',
          question_text: data.text,
          question_type: data.type,
          question_help_text: data.help_text || '',
        },
      ])

      // Reset mini-form
      setNewQText('')
      setNewQType('short')
      setNewQHelp('')
      setShowNewQ(false)
    } catch (e) {
      console.error(e)
    } finally {
      setSavingNewQ(false)
    }
  }

  // ── Reorder form items ────────────────────────────────────────────────────
  function handleAddSection() {
    if (!newSectionText.trim()) return
    setFormItems((prev) => [
      ...prev,
      {
        _key: `section-${Date.now()}-${Math.random()}`,
        question_id: null,
        source_set_id: null,
        source_set_name: '',
        question_text: newSectionText.trim(),
        question_type: newSectionType,
        question_help_text: '',
      },
    ])
    setNewSectionText('')
    setShowNewSection(false)
  }

  function moveItem(index, direction) {
    const next = [...formItems]
    const swapWith = index + direction
    if (swapWith < 0 || swapWith >= next.length) return
    ;[next[index], next[swapWith]] = [next[swapWith], next[index]]
    setFormItems(next)
  }

  function removeItem(index) {
    setFormItems((prev) => prev.filter((_, i) => i !== index))
  }

  function toggleItemType(index) {
    setFormItems((prev) => prev.map((item, i) => {
      if (i !== index) return item
      return { ...item, question_type: item.question_type === 'short' ? 'long' : 'short' }
    }))
  }

  // ── Save questionnaire ────────────────────────────────────────────────────
  async function handleSave() {
    setTitleError('')
    setError(null)

    if (!title.trim()) {
      setTitleError('Title is required.')
      return
    }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Calculate expires_at
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + Number(expiresIn || 30))

      // Generate a URL-safe token (base64url, 24 random bytes)
      // Done in JS because PostgreSQL <17 doesn't support encode(..., 'base64url')
      const rawBytes = crypto.getRandomValues(new Uint8Array(24))
      const token = btoa(String.fromCharCode(...rawBytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '')

      // 1. Insert questionnaire
      const { data: qData, error: qErr } = await supabase
        .from('questionnaires')
        .insert({
          deal_id: deal.id,
          title: title.trim(),
          intro_text: introText.trim() || null,
          expires_at: expiresAt.toISOString(),
          reminder_days: Number(reminderDays || 3),
          status: 'active',
          created_by: user?.id,
          token,
        })
        .select('id, token, title')
        .single()

      if (qErr) throw qErr

      // 2. Insert questionnaire_items
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

        const { error: itemErr } = await supabase
          .from('questionnaire_items')
          .insert(items)

        if (itemErr) throw itemErr
      }

      // 3. Create initial questionnaire_responses row (no status column — just link)
      await supabase
        .from('questionnaire_responses')
        .insert({ questionnaire_id: qData.id })

      setCreated({ id: qData.id, token: qData.token, title: qData.title })
      onCreated({ id: qData.id, token: qData.token, title: qData.title })
    } catch (e) {
      console.error(e)
      setError(e.message || 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Public link ───────────────────────────────────────────────────────────
  const publicLink = created
    ? `${window.location.origin}/q/${created.token}`
    : ''

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(publicLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const el = document.createElement('textarea')
      el.value = publicLink
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full overflow-y-auto">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-base font-semibold text-navy-900">New Questionnaire</h2>
            <p className="text-xs text-gray-500 mt-0.5">{deal.company_name} — {deal.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex-1 px-6 py-6 space-y-8">

          {/* ── Loading spinner ─────────────────────────────────────────── */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Spinner size="lg" />
              <p className="text-sm text-gray-400">Loading questions and sets…</p>
            </div>

          ) : created ? (
            /* ── Success state ─────────────────────────────────────────── */
            <div className="flex flex-col items-center text-center py-12 gap-6">
              <div className="w-14 h-14 rounded-full bg-primary-400/10 flex items-center justify-center">
                <CheckCircle size={32} className="text-primary-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-navy-900">Questionnaire Created</h3>
                <p className="text-sm text-gray-500 mt-1">{created.title}</p>
              </div>

              <div className="w-full">
                <p className="text-sm font-medium text-navy-900 mb-2 text-left">
                  Share this link with your customer:
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 font-mono truncate select-all">
                    {publicLink}
                  </div>
                  <button
                    onClick={handleCopy}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-navy-900"
                  >
                    <Copy size={14} />
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-2 text-left">
                  The link expires in {expiresIn} {Number(expiresIn) === 1 ? 'day' : 'days'}.
                </p>
              </div>

              <div className="flex gap-3">
                <a
                  href={publicLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-navy-900"
                >
                  <ExternalLink size={14} />
                  Open in new tab
                </a>
                <Button variant="secondary" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>

          ) : (
            /* ── Form ──────────────────────────────────────────────────── */
            <>
              {/* Step 1 — Details */}
              <section>
                <SectionLabel>Step 1 — Details</SectionLabel>
                <div className="space-y-4">
                  <Input
                    label="Title"
                    required
                    placeholder="e.g. Discovery Questionnaire — PBR 2026"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    error={titleError}
                  />

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-navy-900">Intro text</label>
                      <span className="text-xs text-gray-400">Edit from the Questionnaires page</span>
                    </div>
                    {defaultIntroText ? (
                      <div
                        className="w-full rounded-lg border border-gray-100 bg-gray-50 text-sm text-gray-500 px-3 py-2.5 leading-relaxed
                          [&_p]:my-1 [&_ul]:my-1.5 [&_ul]:pl-5 [&_ul]:list-disc
                          [&_ol]:my-1.5 [&_ol]:pl-5 [&_ol]:list-decimal
                          [&_li]:my-0.5 [&_strong]:font-semibold [&_strong]:text-gray-600"
                        dangerouslySetInnerHTML={{ __html: defaultIntroText }}
                      />
                    ) : (
                      <div className="w-full rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400 px-3 py-4 text-center italic">
                        No default intro text set. Add one from the Questionnaires page.
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-navy-900">Expires in</label>
                      <div className="relative flex items-center">
                        <input
                          type="number"
                          min={1}
                          value={expiresIn}
                          onChange={(e) => setExpiresIn(e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent px-3 py-2.5 pr-14"
                        />
                        <span className="absolute right-3 text-gray-400 text-sm select-none">days</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-navy-900">Reminder after</label>
                      <div className="relative flex items-center">
                        <input
                          type="number"
                          min={1}
                          value={reminderDays}
                          onChange={(e) => setReminderDays(e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent px-3 py-2.5 pr-36"
                        />
                        <span className="absolute right-3 text-gray-400 text-sm select-none whitespace-nowrap">
                          days of no activity
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Step 2 — Build questions */}
              <section>
                <SectionLabel>Step 2 — Build questions</SectionLabel>
                <div className="space-y-5">

                  {/* A. Add from Question Set */}
                  <div className="rounded-xl border border-gray-100 p-4 space-y-3">
                    <p className="text-sm font-semibold text-navy-900">Add from a Question Set</p>

                    <div className="flex gap-2">
                      <div className="flex-1">
                        <select
                          className="w-full rounded-lg border border-gray-200 bg-white text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent py-2.5 px-3"
                          value={selectedSetId}
                          onChange={(e) => setSelectedSetId(e.target.value)}
                        >
                          <option value="">— Choose a set —</option>
                          {sets.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                      <Button
                        variant={setAdded ? 'primary' : 'secondary'}
                        size="sm"
                        disabled={!selectedSetId || setPreview.length === 0}
                        onClick={handleAddSet}
                      >
                        {setAdded ? '✓ Added' : 'Add Set'}
                      </Button>
                    </div>

                    {setPreview.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-gray-400 font-medium">
                          {setPreview.length} question{setPreview.length !== 1 ? 's' : ''} in this set:
                        </p>
                        <div className="rounded-lg border border-gray-100 divide-y divide-gray-50 max-h-48 overflow-y-auto">
                          {setPreview.map((q, i) => (
                            <div key={q.id} className="flex items-start gap-3 px-3 py-2.5">
                              <span className="text-xs text-gray-400 mt-0.5 flex-shrink-0 w-4 text-right">
                                {i + 1}.
                              </span>
                              <span className="text-sm text-gray-700 flex-1">{q.text}</span>
                              <TypeBadge type={q.type} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedSetId && setPreview.length === 0 && (
                      <p className="text-xs text-gray-400">This set has no questions.</p>
                    )}
                  </div>

                  {/* B. Add from Question Library */}
                  <div className="rounded-xl border border-gray-100 p-4 space-y-3">
                    <p className="text-sm font-semibold text-navy-900">Add from the Question Library</p>

                    {library.length === 0 ? (
                      <p className="text-sm text-gray-400">No questions in the library yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                        {library.map((q) => {
                          const isSelected = formItems.some(
                            (item) => item.question_id === q.id && !item.source_set_id
                          )
                          return (
                            <button
                              key={q.id}
                              onClick={() => handleToggleLibraryQ(q)}
                              className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                                isSelected
                                  ? 'bg-primary-400/10 border-primary-400/40 text-primary-500 font-medium ring-1 ring-primary-300'
                                  : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="flex-1">{q.text}</span>
                                <TypeBadge type={q.type} />
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* C. Add section / subsection header */}
                  <div className="rounded-xl border border-gray-100 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-navy-900">Add a section header</p>
                      {!showNewSection && (
                        <button
                          onClick={() => { setShowNewSection(true); setShowNewQ(false) }}
                          className="flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600 font-medium"
                        >
                          <Plus size={14} />
                          Add header
                        </button>
                      )}
                    </div>

                    {showNewSection ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
                            <label className="text-sm font-medium text-navy-900">Header text <span className="text-red-500">*</span></label>
                            <input
                              type="text"
                              autoFocus
                              placeholder="e.g. Current Infrastructure & Vendors"
                              value={newSectionText}
                              onChange={(e) => setNewSectionText(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddSection()}
                              className="w-full rounded-lg border border-gray-200 bg-white text-sm text-navy-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent px-3 py-2.5"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-sm font-medium text-navy-900">Level</label>
                            <select
                              value={newSectionType}
                              onChange={(e) => setNewSectionType(e.target.value)}
                              className="w-full rounded-lg border border-gray-200 bg-white text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent py-2.5 px-3"
                            >
                              <option value="section">Section (numbered, green)</option>
                              <option value="subsection">Subsection (bold)</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleAddSection} disabled={!newSectionText.trim()}>
                            Add header
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { setShowNewSection(false); setNewSectionText('') }}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">
                        Break your form into numbered sections (e.g. "1. Infrastructure &amp; Vendors") or bold sub-headings.
                      </p>
                    )}
                  </div>

                  {/* D. Add new question inline */}
                  <div className="rounded-xl border border-gray-100 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-navy-900">New question</p>
                      {!showNewQ && (
                        <button
                          onClick={() => { setShowNewQ(true); setShowNewSection(false) }}
                          className="flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600 font-medium"
                        >
                          <Plus size={14} />
                          Add new
                        </button>
                      )}
                    </div>

                    {showNewQ && (
                      <div className="space-y-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-sm font-medium text-navy-900">
                            Question text <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. What are your primary business goals for the next 12 months?"
                            value={newQText}
                            onChange={(e) => setNewQText(e.target.value)}
                            className="w-full rounded-lg border border-gray-200 bg-white text-sm text-navy-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent px-3 py-2.5"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-sm font-medium text-navy-900">Type</label>
                            <select
                              value={newQType}
                              onChange={(e) => setNewQType(e.target.value)}
                              className="w-full rounded-lg border border-gray-200 bg-white text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent py-2.5 px-3"
                            >
                              <option value="short">Short answer</option>
                              <option value="long">Long answer</option>
                            </select>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-sm font-medium text-navy-900">
                              Help text <span className="text-gray-400 font-normal">(optional)</span>
                            </label>
                            <input
                              type="text"
                              placeholder="Hint shown below the question"
                              value={newQHelp}
                              onChange={(e) => setNewQHelp(e.target.value)}
                              className="w-full rounded-lg border border-gray-200 bg-white text-sm text-navy-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent px-3 py-2.5"
                            />
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={handleAddNewQuestion}
                            loading={savingNewQ}
                            disabled={!newQText.trim() || savingNewQ}
                          >
                            Add to form
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setShowNewQ(false)
                              setNewQText('')
                              setNewQType('short')
                              setNewQHelp('')
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    {!showNewQ && (
                      <p className="text-xs text-gray-400">
                        Create a new question and save it to the library at the same time.
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {/* Form items list */}
              <section>
                {(() => {
                  const qCount = formItems.filter(i => i.question_type !== 'section' && i.question_type !== 'subsection').length
                  const sCount = formItems.filter(i => i.question_type === 'section' || i.question_type === 'subsection').length
                  const parts = []
                  if (qCount) parts.push(`${qCount} question${qCount !== 1 ? 's' : ''}`)
                  if (sCount) parts.push(`${sCount} header${sCount !== 1 ? 's' : ''}`)
                  return <SectionLabel>Form layout {parts.length ? `— ${parts.join(', ')}` : ''}</SectionLabel>
                })()}

                {formItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center">
                    <p className="text-sm text-gray-400">
                      No questions added yet. Add from a set or the library above.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-100 divide-y divide-gray-50">
                    {formItems.map((item, idx) => {
                      const isSection = item.question_type === 'section'
                      const isSubsection = item.question_type === 'subsection'
                      const isHeader = isSection || isSubsection

                      return (
                      <div
                        key={item._key}
                        className={`flex items-start gap-3 px-4 py-3 ${isHeader ? 'bg-gray-50/60' : ''}`}
                      >
                        {/* Number / icon */}
                        {isHeader ? (
                          <span className={`text-xs mt-1 flex-shrink-0 w-5 text-right font-bold ${isSection ? 'text-primary-500' : 'text-gray-400'}`}>
                            {isSection ? '§' : '—'}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 mt-1 flex-shrink-0 w-5 text-right font-medium">
                            {idx + 1}.
                          </span>
                        )}

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${isSection ? 'font-bold text-navy-900' : isSubsection ? 'font-semibold text-gray-700' : 'text-gray-800'}`}>
                            {item.question_text}
                          </p>
                          {!isHeader && (
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <TypeBadge type={item.question_type} />
                              {item.source_set_id && (
                                <span className="text-xs text-purple-500 bg-purple-50 px-2 py-0.5 rounded font-medium">
                                  Set: {item.source_set_name}
                                </span>
                              )}
                              {item.question_help_text && (
                                <span className="text-xs text-gray-400 italic truncate max-w-xs">
                                  {item.question_help_text}
                                </span>
                              )}
                            </div>
                          )}
                          {isHeader && (
                            <TypeBadge type={item.question_type} />
                          )}
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {!isHeader && (
                            <button
                              onClick={() => toggleItemType(idx)}
                              className="text-xs px-1.5 py-0.5 rounded border mr-1 transition-colors font-medium"
                              style={item.question_type === 'long'
                                ? { color: '#7c3aed', background: '#f5f3ff', borderColor: '#ddd6fe' }
                                : { color: '#1d4ed8', background: '#eff6ff', borderColor: '#bfdbfe' }}
                              title="Toggle short / long answer"
                            >
                              {item.question_type === 'long' ? 'Long' : 'Short'}
                            </button>
                          )}
                          <button
                            onClick={() => moveItem(idx, -1)}
                            disabled={idx === 0}
                            className="p-1 text-gray-400 hover:text-navy-900 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
                            title="Move up"
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            onClick={() => moveItem(idx, 1)}
                            disabled={idx === formItems.length - 1}
                            className="p-1 text-gray-400 hover:text-navy-900 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
                            title="Move down"
                          >
                            <ChevronDown size={14} />
                          </button>
                          <button
                            onClick={() => removeItem(idx)}
                            className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors ml-1"
                            title="Remove"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    )})}

                  </div>
                )}
              </section>

              {/* Error */}
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        {!loading && !created && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-white sticky bottom-0">
            <p className="text-xs text-gray-400">
              {(() => {
                const qc = formItems.filter(i => i.question_type !== 'section' && i.question_type !== 'subsection').length
                return `${qc} question${qc !== 1 ? 's' : ''} on this form`
              })()}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} loading={saving} disabled={saving}>
                Create questionnaire
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
