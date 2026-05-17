import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Copy, Check, X, Pencil, Archive, Trash2, ChevronUp, ChevronDown,
  ClipboardList, BookOpen, Layers, Settings2,
} from 'lucide-react'
import { format, addDays } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useUser } from '../contexts/UserContext'
import Card, { CardHeader } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input, { Select } from '../components/ui/Input'
import { PageSpinner } from '../components/ui/Spinner'
import { Badge } from '../components/ui/Badge'
import RichTextEditor from '../components/ui/RichTextEditor'
import ConfirmDialog from '../components/ui/ConfirmDialog'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(str) {
  if (!str) return '—'
  return format(new Date(str), 'MMM d, yyyy')
}

const STATUS_BADGE = {
  active: 'green',
  submitted: 'blue',
  expired: 'gray',
  deactivated: 'gray',
}

// ---------------------------------------------------------------------------
// Tab 1: Questionnaires list
// ---------------------------------------------------------------------------

function QuestionnairesTab() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [copiedId, setCopiedId] = useState(null)
  const [busy, setBusy] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('questionnaires')
      .select('*, deals(name, company_name)')
      .order('created_at', { ascending: false })
    if (statusFilter !== 'all') q = q.eq('status', statusFilter)
    const { data } = await q
    setRows(data || [])
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  async function handleCopy(e, row) {
    e.stopPropagation()
    const url = `${window.location.origin}/q/${row.token}`
    await navigator.clipboard.writeText(url)
    setCopiedId(row.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function handleDeactivate(e, row) {
    e.stopPropagation()
    setBusy((b) => ({ ...b, [row.id]: true }))
    await supabase.from('questionnaires').update({ status: 'deactivated' }).eq('id', row.id)
    setBusy((b) => ({ ...b, [row.id]: false }))
    load()
  }

  async function handleExtend(e, row) {
    e.stopPropagation()
    setBusy((b) => ({ ...b, [row.id]: true }))
    const base = row.expires_at ? new Date(row.expires_at) : new Date()
    const newExpiry = addDays(base, 30).toISOString()
    const updates = { expires_at: newExpiry }
    if (row.status === 'expired') updates.status = 'active'
    await supabase.from('questionnaires').update(updates).eq('id', row.id)
    setBusy((b) => ({ ...b, [row.id]: false }))
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-44"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="submitted">Submitted</option>
          <option value="expired">Expired</option>
          <option value="deactivated">Deactivated</option>
        </Select>
      </div>

      {loading ? (
        <PageSpinner />
      ) : rows.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <ClipboardList size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">No questionnaires yet</p>
          </div>
        </Card>
      ) : (
        <Card padding={false}>
          <div className="divide-y divide-gray-50">
            {rows.map((row) => (
              <div
                key={row.id}
                onClick={() => navigate(`/deals/${row.deal_id}`)}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy-900 truncate">{row.title}</p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {row.deals?.name || '—'}
                    {row.deals?.company_name ? ` · ${row.deals.company_name}` : ''}
                  </p>
                </div>
                <Badge color={STATUS_BADGE[row.status] || 'gray'} className="flex-shrink-0 capitalize">
                  {row.status}
                </Badge>
                <div className="hidden sm:flex flex-col items-end text-xs text-gray-400 flex-shrink-0 w-28">
                  <span>Created {fmtDate(row.created_at)}</span>
                  {row.expires_at && <span className="mt-0.5">Expires {fmtDate(row.expires_at)}</span>}
                </div>
                <div
                  className="flex items-center gap-2 flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="secondary"
                    size="xs"
                    icon={copiedId === row.id ? <Check size={13} /> : <Copy size={13} />}
                    onClick={(e) => handleCopy(e, row)}
                  >
                    {copiedId === row.id ? 'Copied!' : 'Copy link'}
                  </Button>
                  {row.status === 'active' && (
                    <Button
                      variant="secondary"
                      size="xs"
                      loading={busy[row.id]}
                      onClick={(e) => handleDeactivate(e, row)}
                    >
                      Deactivate
                    </Button>
                  )}
                  {(row.status === 'active' || row.status === 'expired') && (
                    <Button
                      variant="secondary"
                      size="xs"
                      loading={busy[row.id]}
                      onClick={(e) => handleExtend(e, row)}
                    >
                      Extend 30d
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 2: Question Library
// ---------------------------------------------------------------------------

const BLANK_QUESTION = { text: '', type: 'short', help_text: '' }

function QuestionForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial ? { text: initial.text, type: initial.type, help_text: initial.help_text || '' } : { ...BLANK_QUESTION })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!form.text.trim()) { setError('Question text is required'); return }
    setSaving(true)
    const payload = { text: form.text.trim(), type: form.type, help_text: form.help_text.trim() || null }
    if (initial?.id) {
      await supabase.from('questionnaire_questions').update(payload).eq('id', initial.id)
    } else {
      await supabase.from('questionnaire_questions').insert([payload])
    }
    setSaving(false)
    onSave()
  }

  return (
    <Card className="mb-4">
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="Question text"
            value={form.text}
            onChange={(e) => { setForm({ ...form, text: e.target.value }); setError('') }}
            error={error}
            required
            className="sm:col-span-2"
          />
          <Select
            label="Type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="short">Short text</option>
            <option value="long">Long text</option>
          </Select>
        </div>
        <Input
          label="Help text (optional)"
          value={form.help_text}
          onChange={(e) => setForm({ ...form, help_text: e.target.value })}
          placeholder="Shown beneath the question to guide the respondent"
        />
        <div className="flex gap-2 pt-1">
          <Button size="sm" loading={saving} onClick={handleSave}>Save</Button>
          <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </Card>
  )
}

function QuestionLibraryTab() {
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [archiving, setArchiving] = useState({})

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('questionnaire_questions')
      .select('*')
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
    setQuestions(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleArchive(q) {
    setArchiving((a) => ({ ...a, [q.id]: true }))
    await supabase.from('questionnaire_questions').update({ is_archived: true }).eq('id', q.id)
    setArchiving((a) => ({ ...a, [q.id]: false }))
    load()
  }

  function afterSave() {
    setShowAdd(false)
    setEditingId(null)
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!showAdd && (
          <Button size="sm" icon={<Plus size={15} />} onClick={() => { setShowAdd(true); setEditingId(null) }}>
            Add Question
          </Button>
        )}
      </div>

      {showAdd && (
        <QuestionForm onSave={afterSave} onCancel={() => setShowAdd(false)} />
      )}

      {loading ? (
        <PageSpinner />
      ) : questions.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <BookOpen size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">No questions yet. Add one to get started.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {questions.map((q) =>
            editingId === q.id ? (
              <QuestionForm key={q.id} initial={q} onSave={afterSave} onCancel={() => setEditingId(null)} />
            ) : (
              <Card key={q.id}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-navy-900">{q.text}</p>
                    {q.help_text && <p className="text-xs text-gray-500 mt-1">{q.help_text}</p>}
                  </div>
                  <Badge color={q.type === 'short' ? 'blue' : 'yellow'} className="flex-shrink-0">
                    {q.type === 'short' ? 'Short' : 'Long'}
                  </Badge>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={<Pencil size={13} />}
                      onClick={() => { setEditingId(q.id); setShowAdd(false) }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={<Archive size={13} />}
                      loading={archiving[q.id]}
                      onClick={() => handleArchive(q)}
                    >
                      Archive
                    </Button>
                  </div>
                </div>
              </Card>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 3: Question Sets
// ---------------------------------------------------------------------------

function SetForm({ initial, allQuestions, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [selected, setSelected] = useState(() => {
    if (!initial?.questionnaire_set_questions) return []
    return [...initial.questionnaire_set_questions]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((sq) => sq.questionnaire_questions)
      .filter(Boolean)
  })
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState('')

  const available = allQuestions.filter((q) => !selected.find((s) => s.id === q.id))

  function addQuestion(q) {
    setSelected((prev) => [...prev, q])
  }

  function removeQuestion(q) {
    setSelected((prev) => prev.filter((s) => s.id !== q.id))
  }

  function moveUp(idx) {
    if (idx === 0) return
    setSelected((prev) => {
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next
    })
  }

  function moveDown(idx) {
    setSelected((prev) => {
      if (idx >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next
    })
  }

  async function handleSave() {
    if (!name.trim()) { setNameError('Set name is required'); return }
    setSaving(true)
    const payload = { name: name.trim(), description: description.trim() || null }
    let setId = initial?.id
    if (initial?.id) {
      await supabase.from('questionnaire_sets').update(payload).eq('id', initial.id)
      await supabase.from('questionnaire_set_questions').delete().eq('set_id', initial.id)
    } else {
      const { data } = await supabase.from('questionnaire_sets').insert([payload]).select('id').single()
      setId = data?.id
    }
    if (setId && selected.length > 0) {
      const items = selected.map((q, i) => ({ set_id: setId, question_id: q.id, sort_order: i }))
      await supabase.from('questionnaire_set_questions').insert(items)
    }
    setSaving(false)
    onSave()
  }

  return (
    <Card className="mb-4">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Set name"
            value={name}
            onChange={(e) => { setName(e.target.value); setNameError('') }}
            error={nameError}
            required
          />
          <Input
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Available questions */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Available questions</p>
            {available.length === 0 ? (
              <p className="text-xs text-gray-400 italic">All questions added</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {available.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => addQuestion(q)}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg border border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-colors"
                  >
                    <span className="font-medium text-navy-800">{q.text}</span>
                    <Badge color={q.type === 'short' ? 'blue' : 'yellow'} className="ml-2">
                      {q.type === 'short' ? 'Short' : 'Long'}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected questions */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Questions in this set ({selected.length})</p>
            {selected.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Click questions to add them</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {selected.map((q, idx) => (
                  <div key={q.id} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-primary-200 bg-primary-50">
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => moveUp(idx)} disabled={idx === 0} className="text-gray-400 hover:text-navy-700 disabled:opacity-30 leading-none">
                        <ChevronUp size={12} />
                      </button>
                      <button onClick={() => moveDown(idx)} disabled={idx === selected.length - 1} className="text-gray-400 hover:text-navy-700 disabled:opacity-30 leading-none">
                        <ChevronDown size={12} />
                      </button>
                    </div>
                    <span className="flex-1 font-medium text-navy-800 truncate">{q.text}</span>
                    <button onClick={() => removeQuestion(q)} className="text-gray-400 hover:text-red-500 transition-colors">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button size="sm" loading={saving} onClick={handleSave}>Save Set</Button>
          <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </Card>
  )
}

function QuestionSetsTab() {
  const [sets, setSets] = useState([])
  const [allQuestions, setAllQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [expandedSets, setExpandedSets] = useState({})

  function toggleExpanded(id) {
    setExpandedSets(prev => ({ ...prev, [id]: !prev[id] }))
  }

  async function load() {
    setLoading(true)
    const [setsRes, qRes] = await Promise.all([
      supabase
        .from('questionnaire_sets')
        .select('*, questionnaire_set_questions(*, questionnaire_questions(*))')
        .order('created_at', { ascending: false }),
      supabase
        .from('questionnaire_questions')
        .select('*')
        .eq('is_archived', false)
        .order('created_at', { ascending: false }),
    ])
    setSets(setsRes.data || [])
    setAllQuestions(qRes.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleDelete(set) {
    setDeleting(true)
    await supabase.from('questionnaire_set_questions').delete().eq('set_id', set.id)
    await supabase.from('questionnaire_sets').delete().eq('id', set.id)
    setConfirmDelete(null)
    setDeleting(false)
    load()
  }

  function afterSave() {
    setShowAdd(false)
    setEditingId(null)
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!showAdd && !editingId && (
          <Button size="sm" icon={<Plus size={15} />} onClick={() => setShowAdd(true)}>
            New Set
          </Button>
        )}
      </div>

      {showAdd && (
        <SetForm allQuestions={allQuestions} onSave={afterSave} onCancel={() => setShowAdd(false)} />
      )}

      {loading ? (
        <PageSpinner />
      ) : sets.length === 0 && !showAdd ? (
        <Card>
          <div className="py-12 text-center">
            <Layers size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">No question sets yet. Create one to reuse questions across deals.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {sets.map((set) => {
            const sortedSQ = [...(set.questionnaire_set_questions || [])].sort((a, b) => a.sort_order - b.sort_order)
            const qCount = sortedSQ.length
            const qNames = sortedSQ.map((sq) => sq.questionnaire_questions?.text).filter(Boolean)

            if (editingId === set.id) {
              return (
                <SetForm
                  key={set.id}
                  initial={set}
                  allQuestions={allQuestions}
                  onSave={afterSave}
                  onCancel={() => setEditingId(null)}
                />
              )
            }

            return (
              <Card key={set.id}>
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold text-navy-900">{set.name}</h4>
                      <Badge color="gray">{qCount} {qCount === 1 ? 'question' : 'questions'}</Badge>
                    </div>
                    {set.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{set.description}</p>
                    )}
                    {sortedSQ.length > 0 && (
                      <div className="mt-3">
                        <div className="rounded-lg border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                          {(expandedSets[set.id] ? sortedSQ : sortedSQ.slice(0, 5)).map((sq, i) => {
                            const q = sq.questionnaire_questions
                            if (!q) return null
                            const isLong = q.type === 'long'
                            return (
                              <div key={sq.id} className="flex items-start gap-3 px-3 py-2.5 bg-white">
                                <span className="text-xs text-gray-400 mt-0.5 w-5 text-right flex-shrink-0 font-medium">{i + 1}.</span>
                                <span className="text-sm text-gray-700 flex-1 leading-snug">{q.text}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${isLong ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                                  {isLong ? 'Long' : 'Short'}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                        {sortedSQ.length > 5 && (
                          <button
                            onClick={() => toggleExpanded(set.id)}
                            className="mt-1.5 text-xs text-primary-500 hover:text-primary-600 font-medium flex items-center gap-1"
                          >
                            {expandedSets[set.id]
                              ? <><ChevronUp size={12} /> Show less</>
                              : <><ChevronDown size={12} /> Show {sortedSQ.length - 5} more questions</>
                            }
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={<Pencil size={13} />}
                      onClick={() => { setEditingId(set.id); setShowAdd(false) }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={<Trash2 size={13} />}
                      onClick={() => setConfirmDelete(set)}
                      className="text-red-500 hover:bg-red-50"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => handleDelete(confirmDelete)}
        loading={deleting}
        title="Delete set?"
        message={confirmDelete ? `"${confirmDelete.name}" will be permanently deleted. This does not affect existing questionnaires.` : ''}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const TABS = [
  { key: 'questionnaires', label: 'Questionnaires', icon: ClipboardList },
  { key: 'library', label: 'Question Library', icon: BookOpen },
  { key: 'sets', label: 'Question Sets', icon: Layers },
]

// ---------------------------------------------------------------------------
// Default Intro Text settings card
// ---------------------------------------------------------------------------

function DefaultIntroCard() {
  const [introText, setIntroText] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('questionnaire_defaults')
      .select('intro_text')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        setIntroText(data?.intro_text || '')
        setLoading(false)
      })
  }, [])

  async function handleSave() {
    setSaving(true)
    await supabase
      .from('questionnaire_defaults')
      .upsert({ id: 1, intro_text: introText, updated_at: new Date().toISOString() })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <Card>
      <CardHeader
        title="Default Intro Text"
        subtitle="Shown at the top of every new questionnaire sent to customers"
        icon={<Settings2 size={16} className="text-gray-400" />}
      />
      <div className="space-y-3">
        {loading ? (
          <div className="h-32 rounded-lg bg-gray-50 border border-gray-100 animate-pulse" />
        ) : (
          <RichTextEditor
            value={introText}
            onChange={setIntroText}
            placeholder="Write the default intro message customers will see at the top of every questionnaire…"
          />
        )}
        <div className="flex justify-end">
          <Button onClick={handleSave} loading={saving} disabled={saving}>
            {saved ? 'Saved!' : 'Save'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default function Questionnaires() {
  const { isManager, loading: userLoading } = useUser()
  const [activeTab, setActiveTab] = useState('questionnaires')

  if (userLoading) return <PageSpinner />

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-navy-900">Questionnaires</h1>
        <p className="text-sm text-gray-500 mt-1">All customer questionnaires and question library</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-100">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={[
                'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                active
                  ? 'border-primary-400 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-navy-900 hover:border-gray-300',
              ].join(' ')}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'questionnaires' && (
        <>
          <QuestionnairesTab />
          <DefaultIntroCard />
        </>
      )}
      {activeTab === 'library' && <QuestionLibraryTab />}
      {activeTab === 'sets' && <QuestionSetsTab />}
    </div>
  )
}
