import { useState } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Button from '../ui/Button'

export default function AddNewQuestionPanel({ onAdd }) {
  const [showNewQ, setShowNewQ] = useState(false)
  const [newQText, setNewQText] = useState('')
  const [newQType, setNewQType] = useState('short')
  const [newQHelp, setNewQHelp] = useState('')
  const [savingNewQ, setSavingNewQ] = useState(false)

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

      onAdd(
        {
          _key: `${data.id}-new-${Date.now()}`,
          question_id: data.id,
          source_set_id: null,
          source_set_name: '',
          question_text: data.text,
          question_type: data.type,
          question_help_text: data.help_text || '',
        },
        data,
      )

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

  return (
    <div className="rounded-xl border border-gray-100 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-navy-900">New question</p>
        {!showNewQ && (
          <button
            onClick={() => setShowNewQ(true)}
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
              onClick={() => { setShowNewQ(false); setNewQText(''); setNewQType('short'); setNewQHelp('') }}
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
  )
}
