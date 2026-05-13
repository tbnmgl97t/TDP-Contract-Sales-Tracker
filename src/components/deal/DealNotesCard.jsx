import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { MessageSquare, Phone, Mail, Users, Plus, CheckCircle2, Circle, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useUser } from '../../contexts/UserContext'
import Card, { CardHeader } from '../ui/Card'
import Button from '../ui/Button'

const NOTE_TYPES = [
  { key: 'note',    label: 'Note',    icon: MessageSquare, color: 'text-blue-500',   bg: 'bg-blue-50'   },
  { key: 'call',    label: 'Call',    icon: Phone,         color: 'text-green-500',  bg: 'bg-green-50'  },
  { key: 'email',   label: 'Email',   icon: Mail,          color: 'text-purple-500', bg: 'bg-purple-50' },
  { key: 'meeting', label: 'Meeting', icon: Users,         color: 'text-amber-500',  bg: 'bg-amber-50'  },
]

function NoteTypeIcon({ type, size = 13 }) {
  const t = NOTE_TYPES.find((n) => n.key === type) || NOTE_TYPES[0]
  const Icon = t.icon
  return (
    <div className={`w-7 h-7 rounded-full ${t.bg} flex items-center justify-center flex-shrink-0`}>
      <Icon size={size} className={t.color} />
    </div>
  )
}

export default function DealNotesCard({ dealId }) {
  const { profile } = useUser()
  const [notes, setNotes]         = useState([])
  const [actions, setActions]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [showForm, setShowForm]   = useState(false)

  // Form state
  const [content, setContent]       = useState('')
  const [noteType, setNoteType]     = useState('note')
  const [addAction, setAddAction]   = useState(false)
  const [actionTitle, setActionTitle] = useState('')
  const [dueDate, setDueDate]       = useState('')

  async function load() {
    const [{ data: n }, { data: a }] = await Promise.all([
      supabase.from('deal_notes').select('*').eq('deal_id', dealId).order('created_at', { ascending: false }),
      supabase.from('deal_actions').select('*').eq('deal_id', dealId).order('due_date'),
    ])
    setNotes(n || [])
    setActions(a || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [dealId])

  async function handleSave() {
    if (!content.trim()) return
    setSaving(true)
    try {
      const { data: note } = await supabase.from('deal_notes').insert({
        deal_id:    dealId,
        content:    content.trim(),
        note_type:  noteType,
        created_by: profile?.email || null,
      }).select().single()

      if (note && addAction && actionTitle.trim() && dueDate) {
        await supabase.from('deal_actions').insert({
          deal_id:    dealId,
          note_id:    note.id,
          title:      actionTitle.trim(),
          due_date:   dueDate,
          created_by: profile?.email || null,
        })
      }

      setContent('')
      setNoteType('note')
      setAddAction(false)
      setActionTitle('')
      setDueDate('')
      setShowForm(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function toggleComplete(action) {
    const now = action.completed_at ? null : new Date().toISOString()
    await supabase.from('deal_actions').update({
      completed_at: now,
      completed_by: now ? (profile?.email || null) : null,
    }).eq('id', action.id)
    load()
  }

  const openActions   = actions.filter((a) => !a.completed_at)
  const closedActions = actions.filter((a) => a.completed_at)

  return (
    <Card>
      <CardHeader
        title="Notes & Actions"
        action={
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-primary-500 hover:text-primary-600 transition-colors"
          >
            <Plus size={14} />
            Add Note
          </button>
        }
      />

      {/* Add note form */}
      {showForm && (
        <div className="mb-5 p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
          {/* Type selector */}
          <div className="flex gap-2">
            {NOTE_TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() => setNoteType(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  noteType === t.key ? `${t.bg} ${t.color}` : 'bg-white text-gray-400 hover:bg-gray-100'
                }`}
              >
                <t.icon size={12} />
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What happened? What did you discuss?"
            rows={3}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
          />

          {/* Action toggle */}
          <button
            onClick={() => setAddAction((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-navy-900 transition-colors"
          >
            {addAction ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {addAction ? 'Remove follow-up action' : 'Add a follow-up action'}
          </button>

          {addAction && (
            <div className="flex gap-2">
              <input
                type="text"
                value={actionTitle}
                onChange={(e) => setActionTitle(e.target.value)}
                placeholder="Action description…"
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
              />
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setShowForm(false); setContent(''); setAddAction(false) }}>
              Cancel
            </Button>
            <Button size="sm" loading={saving} onClick={handleSave} disabled={!content.trim()}>
              Save
            </Button>
          </div>
        </div>
      )}

      {/* Open actions */}
      {openActions.length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Open Actions</p>
          <div className="space-y-1.5">
            {openActions.map((a) => {
              const overdue = new Date(a.due_date) < new Date() && !a.completed_at
              return (
                <div key={a.id} className={`flex items-center gap-2.5 p-2.5 rounded-lg ${overdue ? 'bg-red-50' : 'bg-gray-50'}`}>
                  <button onClick={() => toggleComplete(a)} className="flex-shrink-0 text-gray-300 hover:text-primary-400 transition-colors">
                    <Circle size={16} />
                  </button>
                  <span className="flex-1 text-sm text-navy-900">{a.title}</span>
                  <span className={`text-xs font-medium flex-shrink-0 ${overdue ? 'text-red-500' : 'text-gray-400'}`}>
                    {overdue ? 'Overdue · ' : ''}{format(new Date(a.due_date + 'T00:00:00'), 'MMM d')}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Notes timeline */}
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-6">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">No notes yet. Log a call, email, or meeting above.</p>
      ) : (
        <div className="space-y-0">
          {notes.map((note, i) => {
            const linkedAction = actions.find((a) => a.note_id === note.id)
            return (
              <div key={note.id} className={`flex gap-3 py-3 ${i < notes.length - 1 ? 'border-b border-gray-50' : ''}`}>
                <NoteTypeIcon type={note.note_type} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-navy-900 whitespace-pre-wrap">{note.content}</p>
                  {linkedAction && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <button
                        onClick={() => toggleComplete(linkedAction)}
                        className={`transition-colors flex-shrink-0 ${linkedAction.completed_at ? 'text-primary-400' : 'text-gray-300 hover:text-primary-400'}`}
                      >
                        {linkedAction.completed_at ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                      </button>
                      <span className={`text-xs ${linkedAction.completed_at ? 'line-through text-gray-400' : 'text-gray-600'}`}>
                        {linkedAction.title}
                      </span>
                      <span className="text-xs text-gray-400">· {format(new Date(linkedAction.due_date + 'T00:00:00'), 'MMM d')}</span>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {note.created_by ? <span className="font-medium text-gray-500">{note.created_by.split('@')[0]}</span> : null}
                    {note.created_by ? ' · ' : ''}
                    {format(new Date(note.created_at), 'MMM d, yyyy · h:mm a')}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Completed actions (collapsed) */}
      {closedActions.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">
            {closedActions.length} completed action{closedActions.length !== 1 ? 's' : ''}
          </summary>
          <div className="mt-2 space-y-1.5">
            {closedActions.map((a) => (
              <div key={a.id} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-gray-50 opacity-60">
                <button onClick={() => toggleComplete(a)} className="flex-shrink-0 text-primary-400">
                  <CheckCircle2 size={16} />
                </button>
                <span className="flex-1 text-sm text-gray-400 line-through">{a.title}</span>
                <span className="text-xs text-gray-400 flex-shrink-0">{format(new Date(a.due_date + 'T00:00:00'), 'MMM d')}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </Card>
  )
}
