import { useState } from 'react'
import { Plus } from 'lucide-react'
import Button from '../ui/Button'

export default function AddSectionPanel({ onAdd }) {
  const [showNewSection, setShowNewSection] = useState(false)
  const [newSectionText, setNewSectionText] = useState('')
  const [newSectionType, setNewSectionType] = useState('section')

  function handleAddSection() {
    if (!newSectionText.trim()) return
    onAdd({
      _key: `section-${Date.now()}-${Math.random()}`,
      question_id: null,
      source_set_id: null,
      source_set_name: '',
      question_text: newSectionText.trim(),
      question_type: newSectionType,
      question_help_text: '',
    })
    setNewSectionText('')
    setShowNewSection(false)
  }

  return (
    <div className="rounded-xl border border-gray-100 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-navy-900">Add a section header</p>
        {!showNewSection && (
          <button
            onClick={() => setShowNewSection(true)}
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
  )
}
