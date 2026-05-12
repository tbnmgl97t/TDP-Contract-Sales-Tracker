import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ─── Utility ────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function TopBar() {
  return (
    <div className="bg-navy-900 px-6 py-4">
      <div className="max-w-2xl mx-auto flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-tdp-gradient flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">SF</span>
        </div>
        <span className="text-white font-semibold text-sm tracking-wide">
          SalesFlow&nbsp;&middot;&nbsp;Trilogy Digital
        </span>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-8 w-8 text-primary-400"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

function StatusPage({ icon, title, message }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <TopBar />
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">{icon}</div>
          <h2 className="text-lg font-semibold text-navy-900 mb-2">{title}</h2>
          <p className="text-sm text-gray-500">{message}</p>
          <p className="text-xs text-gray-400 mt-6">Trilogy Digital · SalesFlow</p>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function QuestionnairePublic() {
  const { token } = useParams()

  // Core data
  const [status, setStatus] = useState('loading') // loading | not_found | expired | deactivated | already_submitted | ready | submitted
  const [questionnaire, setQuestionnaire] = useState(null)
  const [items, setItems] = useState([])
  const [responseId, setResponseId] = useState(null)

  // Answer state: localAnswers for instant UI, savedAnswers mirrors DB
  const [localAnswers, setLocalAnswers] = useState({}) // { [item_id]: string }
  const [savedAnswers, setSavedAnswers] = useState({}) // { [item_id]: string }

  // Save indicator
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved

  // Presence
  const [presenceCount, setPresenceCount] = useState(0)

  // Track whether activity_started has been fired this session
  const activityStartedFiredRef = useRef(false)

  // Debounce timers: { [item_id]: timeoutId }
  const debounceTimers = useRef({})

  // Supabase realtime channel ref
  const channelRef = useRef(null)

  // ── 1. Load questionnaire by token ───────────────────────────────────────

  useEffect(() => {
    if (!token) {
      setStatus('not_found')
      return
    }
    loadQuestionnaire()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function loadQuestionnaire() {
    setStatus('loading')

    const { data: q, error } = await supabase
      .from('questionnaires')
      .select('*')
      .eq('token', token)
      .maybeSingle()

    if (error || !q) {
      setStatus('not_found')
      return
    }

    // Status checks
    if (q.status === 'deactivated') {
      setStatus('deactivated')
      return
    }
    if (q.status === 'submitted') {
      setStatus('already_submitted')
      return
    }
    if (
      q.status === 'expired' ||
      (q.expires_at && new Date(q.expires_at) < new Date())
    ) {
      setQuestionnaire(q)
      setStatus('expired')
      return
    }

    setQuestionnaire(q)

    // ── 2. Load items
    const { data: itemData } = await supabase
      .from('questionnaire_items')
      .select('*')
      .eq('questionnaire_id', q.id)
      .order('sort_order', { ascending: true })

    setItems(itemData ?? [])

    // ── 3. Get or create response
    const { data: existingResponse } = await supabase
      .from('questionnaire_responses')
      .select('id')
      .eq('questionnaire_id', q.id)
      .maybeSingle()

    let rid = existingResponse?.id ?? null

    if (!rid) {
      const { data: newResponse, error: insertErr } = await supabase
        .from('questionnaire_responses')
        .insert({ questionnaire_id: q.id })
        .select('id')
        .single()

      if (!insertErr && newResponse) {
        rid = newResponse.id
      }
    }

    setResponseId(rid)

    // ── 4. Load existing answers
    if (rid) {
      const { data: answerData } = await supabase
        .from('questionnaire_answers')
        .select('item_id, answer')
        .eq('response_id', rid)

      const answerMap = {}
      for (const row of answerData ?? []) {
        answerMap[row.item_id] = row.answer ?? ''
      }
      setLocalAnswers(answerMap)
      setSavedAnswers(answerMap)

      // If answers already exist, mark activity as started so we don't re-fire
      if (Object.keys(answerMap).length > 0) {
        activityStartedFiredRef.current = true
      }
    }

    // ── 5. Track "viewed" event
    await supabase
      .from('questionnaire_events')
      .insert({ questionnaire_id: q.id, event_type: 'viewed' })

    supabase.functions.invoke('send-questionnaire-email', {
      body: { questionnaire_id: q.id, event_type: 'viewed' },
    })

    setStatus('ready')
  }

  // ── 6. Realtime collaboration ─────────────────────────────────────────────

  useEffect(() => {
    if (!responseId || !questionnaire) return

    const channel = supabase
      .channel(`questionnaire-${questionnaire.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'questionnaire_answers',
          filter: `response_id=eq.${responseId}`,
        },
        (payload) => {
          if (payload.new) {
            setLocalAnswers((prev) => ({
              ...prev,
              [payload.new.item_id]: payload.new.answer ?? '',
            }))
            setSavedAnswers((prev) => ({
              ...prev,
              [payload.new.item_id]: payload.new.answer ?? '',
            }))
          }
        }
      )
      .on('presence', { event: 'sync' }, () => {
        setPresenceCount(Object.keys(channel.presenceState()).length)
      })
      .subscribe(async (subscribeStatus) => {
        if (subscribeStatus === 'SUBSCRIBED') {
          await channel.track({ session: crypto.randomUUID() })
        }
      })

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [responseId, questionnaire])

  // ── 7 & 8. Auto-save with debounce + activity_started tracking ───────────

  const saveAnswer = useCallback(
    async (itemId, answer) => {
      if (!responseId) return

      setSaveState('saving')

      await supabase.from('questionnaire_answers').upsert(
        {
          response_id: responseId,
          item_id: itemId,
          answer,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'response_id,item_id' }
      )

      setSavedAnswers((prev) => ({ ...prev, [itemId]: answer }))
      setSaveState('saved')

      // Reset "saved" badge after 2 s
      setTimeout(() => setSaveState('idle'), 2000)
    },
    [responseId]
  )

  function handleAnswerChange(itemId, value) {
    setLocalAnswers((prev) => ({ ...prev, [itemId]: value }))
    setSaveState('saving')

    // ── 8. Track activity_started on first keystroke
    if (!activityStartedFiredRef.current && questionnaire) {
      const hasAnyAnswer = Object.values(savedAnswers).some((v) => v?.trim())
      if (!hasAnyAnswer && questionnaire.activity_started_at === null) {
        activityStartedFiredRef.current = true
        supabase
          .from('questionnaires')
          .update({ activity_started_at: new Date().toISOString() })
          .eq('id', questionnaire.id)
          .then(() => {})

        supabase
          .from('questionnaire_events')
          .insert({ questionnaire_id: questionnaire.id, event_type: 'activity_started' })
          .then(() => {})

        supabase.functions.invoke('send-questionnaire-email', {
          body: { questionnaire_id: questionnaire.id, event_type: 'activity_started' },
        })
      }
    }

    // Debounce save
    if (debounceTimers.current[itemId]) {
      clearTimeout(debounceTimers.current[itemId])
    }
    debounceTimers.current[itemId] = setTimeout(() => {
      saveAnswer(itemId, value)
      delete debounceTimers.current[itemId]
    }, 800)
  }

  // Cleanup pending debounce timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout)
    }
  }, [])

  // ── 9. Submit ─────────────────────────────────────────────────────────────

  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!questionnaire || !responseId) return
    setSubmitting(true)

    await supabase
      .from('questionnaires')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', questionnaire.id)

    await supabase
      .from('questionnaire_events')
      .insert({ questionnaire_id: questionnaire.id, event_type: 'submitted' })

    await supabase.functions.invoke('send-questionnaire-email', {
      body: { questionnaire_id: questionnaire.id, event_type: 'submitted' },
    })

    setSubmitting(false)
    setStatus('submitted')
  }

  // ─── Render states ────────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <TopBar />
        <div className="flex-1 flex items-center justify-center">
          <Spinner />
        </div>
      </div>
    )
  }

  if (status === 'not_found' || status === 'deactivated') {
    return (
      <StatusPage
        icon="🔒"
        title="Form unavailable"
        message="This form is no longer available. Please contact the Trilogy Digital team if you believe this is an error."
      />
    )
  }

  if (status === 'expired') {
    return (
      <StatusPage
        icon="⏰"
        title="Form expired"
        message={`This form expired on ${formatDate(questionnaire?.expires_at)}. Please contact the Trilogy Digital team for assistance.`}
      />
    )
  }

  if (status === 'already_submitted') {
    return (
      <StatusPage
        icon="✅"
        title="Already submitted"
        message="Thank you! This questionnaire has already been submitted."
      />
    )
  }

  if (status === 'submitted') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <TopBar />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 max-w-sm w-full text-center">
            {/* Green checkmark */}
            <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-5">
              <svg
                className="w-8 h-8 text-primary-400"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12.75l6 6 9-13.5"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-navy-900 mb-2">
              Responses submitted!
            </h2>
            <p className="text-sm text-gray-500">
              Your responses have been submitted. The Trilogy Digital team will be in touch.
            </p>
            <p className="text-xs text-gray-400 mt-8">Trilogy Digital · SalesFlow</p>
          </div>
        </div>
      </div>
    )
  }

  // ── Ready: main form ───────────────────────────────────────────────────────

  const isExpiringSoon =
    questionnaire?.expires_at && new Date(questionnaire.expires_at) > new Date()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <TopBar />

      <main className="flex-1 py-10 px-4">
        <div className="max-w-2xl mx-auto">

          {/* Header card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 mb-6">
            <h1 className="text-2xl font-bold text-navy-900 leading-snug">
              {questionnaire.title}
            </h1>

            {questionnaire.intro_text && (
              <p className="mt-3 text-sm text-gray-500 leading-relaxed whitespace-pre-wrap">
                {questionnaire.intro_text}
              </p>
            )}

            {/* Meta row */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {questionnaire.expires_at && isExpiringSoon && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-3 py-1">
                  <svg
                    className="w-3.5 h-3.5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"
                    />
                  </svg>
                  Due {formatDate(questionnaire.expires_at)}
                </span>
              )}

              {presenceCount > 1 && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 bg-primary-50 border border-primary-200 rounded-full px-3 py-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-400" />
                  </span>
                  {presenceCount} people currently editing
                </span>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 mb-6" />

          {/* Questions */}
          <div className="space-y-4">
            {(() => {
              let sectionNum = 0
              let questionNum = 0
              const hasSections = items.some(i => i.question_type === 'section' || i.question_type === 'subsection')
              return items.map((item) => {
                if (item.question_type === 'section') {
                  sectionNum++
                  return (
                    <div key={item.id} className="pt-4 pb-1">
                      <h2 className="text-lg font-bold text-primary-500">
                        {sectionNum}. {item.question_text}
                      </h2>
                      <div className="mt-2 border-b border-gray-200" />
                    </div>
                  )
                }

                if (item.question_type === 'subsection') {
                  return (
                    <div key={item.id} className="pt-2 pb-0.5">
                      <h3 className="text-sm font-bold text-navy-900">{item.question_text}</h3>
                    </div>
                  )
                }

                questionNum++
                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6"
                  >
                    <label className="block mb-1">
                      <span className="text-sm font-semibold text-navy-900">
                        {hasSections ? '' : `${questionNum}. `}{item.question_text}
                      </span>
                    </label>

                    {item.question_help_text && (
                      <p className="text-xs text-gray-400 mb-3 leading-relaxed">
                        {item.question_help_text}
                      </p>
                    )}

                    {!item.question_help_text && <div className="mb-3" />}

                    {item.question_type === 'long' ? (
                      <textarea
                        rows={5}
                        value={localAnswers[item.id] ?? ''}
                        onChange={(e) => handleAnswerChange(item.id, e.target.value)}
                        placeholder="Your answer…"
                        className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent resize-none"
                      />
                    ) : (
                      <input
                        type="text"
                        value={localAnswers[item.id] ?? ''}
                        onChange={(e) => handleAnswerChange(item.id, e.target.value)}
                        placeholder="Your answer…"
                        className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent"
                      />
                    )}
                  </div>
                )
              })
            })()}
          </div>

          {/* Footer: save indicator + submit */}
          <div className="mt-8 flex items-center justify-between gap-4">
            {/* Save indicator */}
            <div className="h-5 flex items-center">
              {saveState === 'saving' && (
                <span className="text-xs text-gray-400 flex items-center gap-1.5">
                  <svg
                    className="animate-spin h-3 w-3 text-gray-400"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Saving…
                </span>
              )}
              {saveState === 'saved' && (
                <span className="text-xs text-primary-500 flex items-center gap-1">
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 12.75l6 6 9-13.5"
                    />
                  </svg>
                  Saved
                </span>
              )}
            </div>

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-2 bg-primary-400 hover:bg-primary-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors"
            >
              {submitting ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Submitting…
                </>
              ) : (
                'Submit responses'
              )}
            </button>
          </div>

          <p className="text-center text-xs text-gray-400 mt-10">
            © {new Date().getFullYear()} Trilogy Digital. All rights reserved.
          </p>
        </div>
      </main>
    </div>
  )
}
