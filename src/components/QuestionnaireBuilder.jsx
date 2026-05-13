import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Button from './ui/Button'
import Input from './ui/Input'
import Spinner from './ui/Spinner'
import TypeBadge from './questionnaire/TypeBadge'
import AddFromSetPanel from './questionnaire/AddFromSetPanel'
import AddSectionPanel from './questionnaire/AddSectionPanel'
import AddNewQuestionPanel from './questionnaire/AddNewQuestionPanel'
import FormItemsList from './questionnaire/FormItemsList'
import QuestionnaireSuccessView from './questionnaire/QuestionnaireSuccessView'

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  )
}

export default function QuestionnaireBuilder({ deal, onCreated, onClose }) {
  const [loading, setLoading] = useState(true)
  const [sets, setSets] = useState([])
  const [library, setLibrary] = useState([])

  // Step 1 fields
  const [title, setTitle] = useState(`Discovery Questionnaire — ${deal.name}`)
  const [defaultIntroText, setDefaultIntroText] = useState('')
  const [expiresIn, setExpiresIn] = useState(30)
  const [reminderDays, setReminderDays] = useState(3)

  // Form items
  const [formItems, setFormItems] = useState([])

  // Save / success
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [titleError, setTitleError] = useState('')
  const [created, setCreated] = useState(null)

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

  // ── Library toggle ──────────────────────────────────────────────────────────
  function handleToggleLibraryQ(q) {
    const alreadyAdded = formItems.some((item) => item.question_id === q.id && !item.source_set_id)
    if (alreadyAdded) {
      setFormItems((prev) => prev.filter((item) => !(item.question_id === q.id && !item.source_set_id)))
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

  // ── Form items CRUD ─────────────────────────────────────────────────────────
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
    setFormItems((prev) =>
      prev.map((item, i) =>
        i !== index ? item : { ...item, question_type: item.question_type === 'short' ? 'long' : 'short' }
      )
    )
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  async function handleSave() {
    setTitleError('')
    setError(null)
    if (!title.trim()) { setTitleError('Title is required.'); return }

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

      setCreated({ id: qData.id, token: qData.token, title: qData.title })
      onCreated({ id: qData.id, token: qData.token, title: qData.title })
    } catch (e) {
      console.error(e)
      setError(e.message || 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const publicLink = created ? `${window.location.origin}/q/${created.token}` : ''
  const qCount = formItems.filter((i) => i.question_type !== 'section' && i.question_type !== 'subsection').length

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full overflow-y-auto">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
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

        {/* ── Body ───────────────────────────────────────────────────────────── */}
        <div className="flex-1 px-6 py-6 space-y-8">

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Spinner size="lg" />
              <p className="text-sm text-gray-400">Loading questions and sets…</p>
            </div>

          ) : created ? (
            <QuestionnaireSuccessView
              created={created}
              publicLink={publicLink}
              expiresIn={expiresIn}
              onClose={onClose}
            />

          ) : (
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

                  <AddFromSetPanel
                    sets={sets}
                    onAdd={(items) => setFormItems((prev) => [...prev, ...items])}
                  />

                  {/* Question Library (inline — needs formItems for isSelected) */}
                  <div className="rounded-xl border border-gray-100 p-4 space-y-3">
                    <p className="text-sm font-semibold text-navy-900">Add from the Question Library</p>
                    {library.length === 0 ? (
                      <p className="text-sm text-gray-400">No questions in the library yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                        {library.map((q) => {
                          const isSelected = formItems.some((item) => item.question_id === q.id && !item.source_set_id)
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

                  <AddSectionPanel
                    onAdd={(item) => setFormItems((prev) => [...prev, item])}
                  />

                  <AddNewQuestionPanel
                    onAdd={(formItem, libraryQ) => {
                      setLibrary((prev) => [...prev, libraryQ].sort((a, b) => a.text.localeCompare(b.text)))
                      setFormItems((prev) => [...prev, formItem])
                    }}
                  />
                </div>
              </section>

              <FormItemsList
                formItems={formItems}
                onMove={moveItem}
                onRemove={removeItem}
                onToggleType={toggleItemType}
              />

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        {!loading && !created && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-white sticky bottom-0">
            <p className="text-xs text-gray-400">
              {qCount} question{qCount !== 1 ? 's' : ''} on this form
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
