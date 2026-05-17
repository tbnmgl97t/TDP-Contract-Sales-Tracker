import { useState, useEffect } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../../lib/supabase'
import { SLIDE_LIBRARY, SLIDE_MAP } from '../../lib/slideLibrary'
import Card, { CardHeader } from '../ui/Card'
import Button from '../ui/Button'
import Spinner from '../ui/Spinner'
import { GripVertical, Trash2, Plus, X } from 'lucide-react'

function SortableRow({ item, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  const def = SLIDE_MAP[item.slide_key]

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 py-2.5 px-3 bg-white border border-gray-200 rounded-xl">
      <div {...attributes} {...listeners} className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing flex-shrink-0">
        <GripVertical size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-navy-900">{item.label || def?.label || item.slide_key}</p>
        <p className="text-xs text-gray-400 truncate">
          {item.label ? def?.label : (def?.description || item.slide_key)}
          {Object.keys(item.fields).some(k => item.fields[k]) && (
            <span className="ml-1.5 text-primary-500 font-medium">· configured</span>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="p-1.5 text-gray-300 hover:text-red-500 flex-shrink-0 rounded transition-colors"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}

export default function ProposalDefaultsCard() {
  const [defaults, setDefaults]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [dirty, setDirty]         = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('proposal_default_slides')
      .select('*')
      .order('position')
    setDefaults(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    setDefaults((prev) => {
      const oldIdx = prev.findIndex(r => r.id === active.id)
      const newIdx = prev.findIndex(r => r.id === over.id)
      return arrayMove(prev, oldIdx, newIdx)
    })
    setDirty(true)
  }

  async function addSlideType(slideKey) {
    const def = SLIDE_MAP[slideKey]
    if (!def) return
    const position = defaults.length
    const { data, error } = await supabase
      .from('proposal_default_slides')
      .insert({ slide_key: slideKey, position, fields: { ...def.defaultFields } })
      .select()
      .single()
    if (!error && data) {
      setDefaults(prev => [...prev, data])
    }
    setShowPicker(false)
  }

  async function removeSlide(id) {
    await supabase.from('proposal_default_slides').delete().eq('id', id)
    setDefaults(prev => prev.filter(r => r.id !== id))
    setDirty(true)
  }

  async function saveOrder() {
    setSaving(true)
    await Promise.all(
      defaults.map((row, i) =>
        supabase.from('proposal_default_slides').update({ position: i }).eq('id', row.id)
      )
    )
    setSaving(false)
    setSaved(true)
    setDirty(false)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Card>
      <CardHeader
        title="Default Proposal Template"
        subtitle="These slides auto-populate every new proposal. Drag to reorder."
        action={
          <button
            type="button"
            onClick={() => setShowPicker(o => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
          >
            {showPicker ? <X size={12} /> : <Plus size={12} />}
            {showPicker ? 'Cancel' : 'Add Slide'}
          </button>
        }
      />

      {/* Slide type picker */}
      {showPicker && (
        <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Choose a slide type to add</p>
          <div className="grid grid-cols-2 gap-1.5">
            {SLIDE_LIBRARY.map((def) => (
              <button
                key={def.key}
                type="button"
                onClick={() => addSlideType(def.key)}
                className="text-left px-3 py-2 rounded-lg hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200 transition-all"
              >
                <p className="text-xs font-semibold text-navy-900">{def.label}</p>
                <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{def.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Slide list */}
      {loading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : defaults.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-gray-400">No defaults set. Click "Add Slide" to build your template.</p>
          <p className="text-xs text-gray-400 mt-1">
            You can also configure a slide in any proposal and click "Save as Default" to add it here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={defaults.map(r => r.id)} strategy={verticalListSortingStrategy}>
              {defaults.map(item => (
                <SortableRow key={item.id} item={item} onRemove={removeSlide} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Save order */}
      {dirty && (
        <div className="mt-4 flex items-center gap-3">
          <Button size="sm" loading={saving} onClick={saveOrder}>Save Order</Button>
          {saved && <span className="text-xs text-primary-500 font-medium">Saved ✓</span>}
        </div>
      )}

      {defaults.length > 0 && (
        <p className="text-xs text-gray-400 mt-4">
          To update a slide's content, configure it in any proposal and click "Save as Default".
        </p>
      )}
    </Card>
  )
}
