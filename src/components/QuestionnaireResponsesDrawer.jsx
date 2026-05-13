import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Download, RotateCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Spinner from './ui/Spinner'
import { format } from 'date-fns'

function RichAnswer({ html }) {
  if (!html) return <span className="text-gray-400 italic text-sm">No answer</span>

  // Plain text (old answers before rich text) — no HTML tags
  const isPlain = !/<[a-z][\s\S]*>/i.test(html)
  if (isPlain) {
    return <p className="text-sm text-gray-800 whitespace-pre-wrap">{html}</p>
  }

  return (
    <div
      className="prose prose-sm max-w-none text-gray-800
        [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1
        [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1
        [&_li]:my-0.5
        [&_p]:my-1
        [&_strong]:font-semibold
        [&_em]:italic"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default function QuestionnaireResponsesDrawer({ questionnaire, onClose, onReopened }) {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])       // questionnaire_items in order
  const [answers, setAnswers] = useState({})   // item_id → answer string
  const [reopening, setReopening] = useState(false)
  const [confirmReopen, setConfirmReopen] = useState(false)

  useEffect(() => {
    if (!questionnaire) return
    let cancelled = false

    async function load() {
      setLoading(true)

      // 1. Load items (questions + headers) in order
      const { data: itemData } = await supabase
        .from('questionnaire_items')
        .select('id, question_text, question_type, question_help_text, sort_order')
        .eq('questionnaire_id', questionnaire.id)
        .order('sort_order')

      // 2. Load the response row to get its id
      const { data: responseData } = await supabase
        .from('questionnaire_responses')
        .select('id')
        .eq('questionnaire_id', questionnaire.id)
        .maybeSingle()

      let answerMap = {}
      if (responseData?.id) {
        const { data: answerData } = await supabase
          .from('questionnaire_answers')
          .select('item_id, answer')
          .eq('response_id', responseData.id)

        for (const row of answerData || []) {
          answerMap[row.item_id] = row.answer ?? ''
        }
      }

      if (!cancelled) {
        setItems(itemData || [])
        setAnswers(answerMap)
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [questionnaire?.id])

  async function handleReopen() {
    setReopening(true)
    try {
      await supabase
        .from('questionnaires')
        .update({ status: 'active', submitted_at: null })
        .eq('id', questionnaire.id)
      onReopened?.()
      onClose()
    } catch (e) {
      console.error(e)
    } finally {
      setReopening(false)
    }
  }

  function htmlToPlainText(html) {
    if (!html) return ''
    // Use the browser's DOM parser to walk nodes properly
    const doc = new DOMParser().parseFromString(html, 'text/html')

    function walkNode(node, indent = 0, listType = null, listIndex = { n: 1 }) {
      const lines = []
      const pad = '    '.repeat(indent)

      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent
        if (text) lines.push(text)
        return lines
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return lines

      const tag = node.tagName.toLowerCase()

      if (tag === 'ul' || tag === 'ol') {
        const childIdx = { n: 1 }
        for (const child of node.childNodes) {
          lines.push(...walkNode(child, indent, tag, childIdx))
        }
        return lines
      }

      if (tag === 'li') {
        const bullet = listType === 'ol' ? `${listIndex.n++}. ` : '• '
        // Collect direct text / inline content first, then any nested lists
        let inlineText = ''
        const nestedLines = []
        for (const child of node.childNodes) {
          const childTag = child.tagName?.toLowerCase()
          if (childTag === 'ul' || childTag === 'ol') {
            nestedLines.push(...walkNode(child, indent + 1, childTag, { n: 1 }))
          } else {
            inlineText += child.textContent
          }
        }
        if (inlineText.trim()) lines.push(`${pad}${bullet}${inlineText.trim()}`)
        lines.push(...nestedLines)
        return lines
      }

      if (tag === 'p' || tag === 'div') {
        const inner = Array.from(node.childNodes).flatMap(c => walkNode(c, indent, listType, listIndex))
        const text = inner.join('').trim()
        if (text) lines.push(`${pad}${text}`)
        return lines
      }

      if (tag === 'br') {
        lines.push('')
        return lines
      }

      // Inline elements (strong, em, span, a…) — just collect text
      for (const child of node.childNodes) {
        lines.push(...walkNode(child, indent, listType, listIndex))
      }
      return lines
    }

    const result = walkNode(doc.body)
    return result.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  }

  function handleExportText() {
    const lines = []
    lines.push(questionnaire.title)
    if (questionnaire.submitted_at) {
      lines.push(`Submitted: ${format(new Date(questionnaire.submitted_at), 'MMMM d, yyyy h:mm a')}`)
    }
    lines.push('')

    let sectionNum = 0
    let questionNum = 0

    for (const item of items) {
      if (item.question_type === 'section') {
        sectionNum++
        lines.push('')
        lines.push(`${sectionNum}. ${item.question_text}`)
        lines.push('─'.repeat(40))
      } else if (item.question_type === 'subsection') {
        lines.push('')
        lines.push(item.question_text)
      } else {
        questionNum++
        const raw = answers[item.id] || ''
        const isPlain = !/<[a-z][\s\S]*>/i.test(raw)
        const plain = isPlain ? raw.trim() : htmlToPlainText(raw)
        lines.push('')
        lines.push(`Q${questionNum}. ${item.question_text}`)
        lines.push(plain || '(no answer)')
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const ts = format(new Date(), 'yyyy-MM-dd_HHmm')
    a.download = `${questionnaire.title.replace(/[^a-z0-9]/gi, '_')}_responses_${ts}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const questionItems = items.filter(i => i.question_type !== 'section' && i.question_type !== 'subsection')
  const answeredCount = questionItems.filter(i => answers[i.id] && answers[i.id].trim() !== '' && answers[i.id] !== '<p></p>').length

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-base font-semibold text-navy-900 truncate">{questionnaire.title}</h2>
            <div className="flex items-center gap-3 mt-0.5">
              {questionnaire.submitted_at ? (
                <p className="text-xs text-gray-500">
                  Submitted {format(new Date(questionnaire.submitted_at), 'MMM d, yyyy · h:mm a')}
                </p>
              ) : (
                <p className="text-xs text-amber-600 font-medium">In progress</p>
              )}
              {!loading && (
                <p className="text-xs text-gray-400">
                  {answeredCount} / {questionItems.length} answered
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {questionnaire.status === 'submitted' && (
              confirmReopen ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">Reopen for editing?</span>
                  <button
                    onClick={handleReopen}
                    disabled={reopening}
                    className="px-2.5 py-1 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {reopening ? 'Reopening…' : 'Yes, reopen'}
                  </button>
                  <button
                    onClick={() => setConfirmReopen(false)}
                    className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmReopen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                  title="Reopen for editing"
                >
                  <RotateCcw size={13} />
                  Reopen
                </button>
              )
            )}
            <button
              onClick={handleExportText}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Export as text"
            >
              <Download size={13} />
              Export
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size="lg" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">No questions found.</div>
          ) : (
            <div className="px-6 py-6 space-y-1">
              {(() => {
                let sectionNum = 0
                let questionNum = 0
                return items.map((item) => {
                  if (item.question_type === 'section') {
                    sectionNum++
                    return (
                      <div key={item.id} className="pt-6 pb-2 first:pt-0">
                        <h3 className="text-sm font-bold text-primary-500 uppercase tracking-wide">
                          {sectionNum}. {item.question_text}
                        </h3>
                        <div className="mt-2 border-b border-gray-100" />
                      </div>
                    )
                  }
                  if (item.question_type === 'subsection') {
                    return (
                      <div key={item.id} className="pt-3 pb-1">
                        <h4 className="text-xs font-bold text-navy-900 uppercase tracking-wide">{item.question_text}</h4>
                      </div>
                    )
                  }
                  questionNum++
                  const answer = answers[item.id]
                  const hasAnswer = answer && answer.trim() !== '' && answer !== '<p></p>'
                  return (
                    <div key={item.id} className="py-4 border-b border-gray-50 last:border-0">
                      <div className="flex items-start gap-2 mb-2">
                        <span className="text-xs text-gray-400 mt-0.5 flex-shrink-0 w-5 text-right">{questionNum}.</span>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-navy-900">{item.question_text}</p>
                          {item.question_help_text && (
                            <p className="text-xs text-gray-400 mt-0.5">{item.question_help_text}</p>
                          )}
                        </div>
                      </div>
                      <div className={`ml-7 rounded-lg px-4 py-3 ${hasAnswer ? 'bg-gray-50 border border-gray-100' : 'bg-amber-50 border border-amber-100'}`}>
                        {hasAnswer
                          ? <RichAnswer html={answer} />
                          : <span className="text-xs text-amber-600 italic">No answer provided</span>
                        }
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
