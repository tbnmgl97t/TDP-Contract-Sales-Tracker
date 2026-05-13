import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Button from '../ui/Button'
import TypeBadge from './TypeBadge'

export default function AddFromSetPanel({ sets, onAdd }) {
  const [selectedSetId, setSelectedSetId] = useState('')
  const [setPreview, setSetPreview] = useState([])
  const [setAdded, setSetAdded] = useState(false)

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
    onAdd([sectionHeader, ...newItems])
    setSetAdded(true)
    setTimeout(() => setSetAdded(false), 2000)
  }

  return (
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
                <span className="text-xs text-gray-400 mt-0.5 flex-shrink-0 w-4 text-right">{i + 1}.</span>
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
  )
}
