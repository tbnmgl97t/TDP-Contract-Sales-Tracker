import { useState, useEffect } from 'react'
import { Eye, Copy, Check, Pencil, LayoutTemplate, Trash2, AlertTriangle, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useNavigate } from 'react-router-dom'
import Card, { CardHeader } from '../ui/Card'
import { Badge } from '../ui/Badge'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import ConfirmDialog from '../ui/ConfirmDialog'
import QuestionnaireBuilder from '../QuestionnaireBuilder'
import QuestionnaireResponsesDrawer from '../QuestionnaireResponsesDrawer'

export default function DealQuestionnairesCard({
  questionnaires,
  setQuestionnaires,
  deal,
  showBuilder,
  onCloseBuilder,
  onCreated,
}) {
  const navigate = useNavigate()
  const [copyingQ, setCopyingQ] = useState(null)
  const [copyTargetId, setCopyTargetId] = useState('')
  const [copyDeals, setCopyDeals] = useState([])
  const [copyingQSaving, setCopyingQSaving] = useState(false)
  const [editingQItems, setEditingQItems] = useState(null)
  const [editingQSaving, setEditingQSaving] = useState(false)
  const [viewingResponses, setViewingResponses] = useState(null)
  const [deleteQDlg, setDeleteQDlg] = useState(null)
  const [copiedLinkId, setCopiedLinkId] = useState(null)
  const [eventsMap, setEventsMap] = useState({})  // questionnaire_id → latest event types

  useEffect(() => {
    if (!questionnaires.length) return
    supabase
      .from('questionnaire_events')
      .select('questionnaire_id, event_type, created_at')
      .in('questionnaire_id', questionnaires.map((q) => q.id))
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const map = {}
        ;(data || []).forEach((e) => {
          if (!map[e.questionnaire_id]) map[e.questionnaire_id] = new Set()
          map[e.questionnaire_id].add(e.event_type)
        })
        setEventsMap(map)
      })
  }, [questionnaires])

  async function openCopyModal(q) {
    setCopyingQ(q)
    setCopyTargetId('')
    const { data } = await supabase
      .from('deals')
      .select('id, name, company_name, stage')
      .neq('id', deal.id)
      .is('deleted_at', null)
      .order('name')
    setCopyDeals(data || [])
  }

  async function handleCopyQuestionnaire() {
    if (!copyTargetId || !copyingQ) return
    setCopyingQSaving(true)
    try {
      const { data: sourceItems } = await supabase
        .from('questionnaire_items')
        .select('*')
        .eq('questionnaire_id', copyingQ.id)
        .order('sort_order')

      const rawBytes = crypto.getRandomValues(new Uint8Array(24))
      const token = btoa(String.fromCharCode(...rawBytes))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 30)

      const { data: { user } } = await supabase.auth.getUser()

      const targetDeal = copyDeals.find((d) => d.id === copyTargetId)
      const targetName = targetDeal?.name || targetDeal?.company_name || ''
      const newTitle = targetName
        ? copyingQ.title.replace(/—\s*.+$/, `— ${targetName}`)
        : copyingQ.title

      const { data: newQ, error } = await supabase
        .from('questionnaires')
        .insert({
          deal_id: copyTargetId,
          title: newTitle,
          intro_text: copyingQ.intro_text || null,
          expires_at: expiresAt.toISOString(),
          reminder_days: copyingQ.reminder_days || 3,
          status: 'active',
          created_by: user?.id,
          token,
        })
        .select('id')
        .single()

      if (error) throw error

      if (sourceItems?.length > 0) {
        await supabase.from('questionnaire_items').insert(
          sourceItems.map((item, idx) => ({
            questionnaire_id: newQ.id,
            question_id: item.question_id,
            source_set_id: item.source_set_id,
            sort_order: idx,
            question_text: item.question_text,
            question_type: item.question_type,
            question_help_text: item.question_help_text,
          }))
        )
      }

      await supabase.from('questionnaire_responses').insert({ questionnaire_id: newQ.id })
      setCopyingQ(null)
      setCopyTargetId('')
      navigate(`/deals/${copyTargetId}`)
    } catch (e) {
      console.error(e)
    } finally {
      setCopyingQSaving(false)
    }
  }

  async function openEditItems(q) {
    const { data: items } = await supabase
      .from('questionnaire_items')
      .select('id, question_text, question_type, question_help_text, sort_order')
      .eq('questionnaire_id', q.id)
      .order('sort_order')
    setEditingQItems({ q, items: items || [] })
  }

  async function handleSaveEditedItems() {
    if (!editingQItems) return
    setEditingQSaving(true)
    try {
      await Promise.all(
        editingQItems.items.map((item) =>
          supabase.from('questionnaire_items').update({ question_type: item.question_type }).eq('id', item.id)
        )
      )
      setEditingQItems(null)
    } catch (e) {
      console.error(e)
    } finally {
      setEditingQSaving(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Questionnaires"
          subtitle="Customer discovery forms"
          action={
            <Button variant="secondary" size="sm" onClick={() => onCreated?.(true)} icon={<FileText size={13} />}>
              New
            </Button>
          }
        />
        {questionnaires.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-400">No questionnaires yet.</p>
            <button onClick={() => onCreated?.(true)} className="text-xs text-primary-500 hover:underline mt-1">Create one</button>
          </div>
        ) : (
          <div className="space-y-2">
            {questionnaires.map((q) => {
              const statusColor = { active: 'green', submitted: 'blue', expired: 'gray', deactivated: 'gray' }[q.status] || 'gray'
              const answerCount = q._answerCount || 0
              const itemCount = q.questionnaire_items?.[0]?.count ?? 0
              const questionCount = typeof itemCount === 'string' ? parseInt(itemCount, 10) : (itemCount || 0)
              const publicUrl = `${window.location.origin}/q/${q.token}`
              const hasActivity = answerCount > 0 || q.submitted_at != null || q.status === 'submitted'
              const canDelete = !hasActivity
              const isDeactivated = q.status === 'deactivated'
              return (
                <div key={q.id} className={`flex items-center justify-between p-3 border rounded-xl hover:bg-gray-50 ${isDeactivated ? 'border-gray-100 opacity-60' : 'border-gray-100'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm font-medium truncate ${isDeactivated ? 'text-gray-400 line-through' : 'text-navy-900'}`}>{q.title}</p>
                      <Badge color={statusColor}>{q.status.charAt(0).toUpperCase() + q.status.slice(1)}</Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {questionCount} question{questionCount !== 1 ? 's' : ''}
                      {answerCount > 0
                        ? <span className={answerCount >= questionCount ? ' · text-primary-500 font-medium' : ''}>
                            {` · ${answerCount} / ${questionCount} answered`}
                          </span>
                        : ' · No responses yet'
                      }
                      {q.status === 'active' && ` · Expires ${format(new Date(q.expires_at), 'MMM d, yyyy')}`}
                      {q.submitted_at && ` · Submitted ${format(new Date(q.submitted_at), 'MMM d, yyyy')}`}
                    </p>
                    {/* Engagement trail */}
                    {q.status !== 'submitted' && q.status !== 'deactivated' && eventsMap[q.id] && (
                      <div className="flex items-center gap-2 mt-1.5">
                        {eventsMap[q.id].has('viewed') && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
                            Viewed
                          </span>
                        )}
                        {eventsMap[q.id].has('activity_started') && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                            In progress
                          </span>
                        )}
                        {eventsMap[q.id].has('reminder_sent') && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                            Reminder sent
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    {hasActivity && (
                      <button
                        onClick={() => setViewingResponses(q)}
                        className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors"
                        title="View responses"
                      >
                        <Eye size={14} />
                      </button>
                    )}
                    {q.status === 'active' && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(publicUrl)
                          setCopiedLinkId(q.id)
                          setTimeout(() => setCopiedLinkId(null), 2000)
                        }}
                        className={`p-1.5 rounded-lg transition-colors ${copiedLinkId === q.id ? 'text-primary-500 bg-primary-50' : 'text-gray-400 hover:text-primary-500 hover:bg-primary-50'}`}
                        title={copiedLinkId === q.id ? 'Copied!' : 'Copy shareable link'}
                      >
                        {copiedLinkId === q.id ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    )}
                    <button
                      onClick={() => openEditItems(q)}
                      className="p-1.5 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Edit questions"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => openCopyModal(q)}
                      className="p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Copy to another deal"
                    >
                      <LayoutTemplate size={14} />
                    </button>
                    {(q.status === 'active' || q.status === 'expired') && (
                      <button
                        onClick={async () => {
                          await supabase.from('questionnaires').update({ status: 'deactivated' }).eq('id', q.id)
                          setQuestionnaires(prev => prev.map(qi => qi.id === q.id ? { ...qi, status: 'deactivated' } : qi))
                        }}
                        className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
                        title="Deactivate (disables public link, keeps responses)"
                      >
                        <AlertTriangle size={14} />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => setDeleteQDlg(q)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete (no responses — safe to remove)"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Questionnaire builder */}
      {showBuilder && (
        <QuestionnaireBuilder
          deal={deal}
          onCreated={() => { onCloseBuilder(); onCreated?.() }}
          onClose={onCloseBuilder}
        />
      )}

      {/* Responses drawer */}
      {viewingResponses && (
        <QuestionnaireResponsesDrawer
          questionnaire={viewingResponses}
          onClose={() => setViewingResponses(null)}
          onReopened={() => {
            setViewingResponses(null)
            setQuestionnaires((prev) => prev.map((q) =>
              q.id === viewingResponses.id ? { ...q, status: 'active', submitted_at: null } : q
            ))
          }}
        />
      )}

      {/* Copy to another deal */}
      <Modal
        open={!!copyingQ}
        onClose={() => { setCopyingQ(null); setCopyTargetId('') }}
        title="Copy questionnaire to another deal"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setCopyingQ(null); setCopyTargetId('') }}>Cancel</Button>
            <Button onClick={handleCopyQuestionnaire} loading={copyingQSaving} disabled={!copyTargetId || copyingQSaving}>
              Copy &amp; go to deal
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            A new questionnaire will be created on the target deal with the same questions and settings. Responses are not copied.
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-navy-900">Questionnaire</label>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
              {copyingQ?.title}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-navy-900">Target deal</label>
            <select
              value={copyTargetId}
              onChange={(e) => setCopyTargetId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent py-2.5 px-3"
            >
              <option value="">— Select a deal —</option>
              {copyDeals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.company_name && d.company_name !== d.name ? ` — ${d.company_name}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* Edit question types */}
      <Modal
        open={!!editingQItems}
        onClose={() => setEditingQItems(null)}
        title="Edit questions"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingQItems(null)}>Cancel</Button>
            <Button onClick={handleSaveEditedItems} loading={editingQSaving} disabled={editingQSaving}>Save changes</Button>
          </>
        }
      >
        {editingQItems && (
          <div className="space-y-1">
            <p className="text-xs text-gray-400 mb-3">Click the type badge on any question to toggle between Short and Long answer.</p>
            {editingQItems.items.map((item, idx) => {
              const isHeader = item.question_type === 'section' || item.question_type === 'subsection'
              return (
                <div key={item.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${isHeader ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
                  <span className="text-xs text-gray-400 w-4 text-right flex-shrink-0">{isHeader ? '§' : `${idx + 1}.`}</span>
                  <span className="text-sm text-gray-800 flex-1">{item.question_text}</span>
                  {!isHeader && (
                    <button
                      onClick={() => setEditingQItems((prev) => ({
                        ...prev,
                        items: prev.items.map((it, i) => i === idx
                          ? { ...it, question_type: it.question_type === 'short' ? 'long' : 'short' }
                          : it
                        ),
                      }))}
                      className="text-xs px-2 py-0.5 rounded border font-medium transition-colors flex-shrink-0"
                      style={item.question_type === 'long'
                        ? { color: '#7c3aed', background: '#f5f3ff', borderColor: '#ddd6fe' }
                        : { color: '#1d4ed8', background: '#eff6ff', borderColor: '#bfdbfe' }}
                    >
                      {item.question_type === 'long' ? 'Long' : 'Short'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteQDlg}
        onClose={() => setDeleteQDlg(null)}
        onConfirm={async () => {
          await supabase.from('questionnaires').delete().eq('id', deleteQDlg.id)
          setQuestionnaires(prev => prev.filter(qi => qi.id !== deleteQDlg.id))
          setDeleteQDlg(null)
        }}
        title="Delete Questionnaire"
        message={`"${deleteQDlg?.title}" has no responses and will be permanently deleted.`}
      />
    </>
  )
}
