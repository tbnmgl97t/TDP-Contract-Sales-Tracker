import '../../lib/pdfFonts'
import { Page, Text, View, Image } from '@react-pdf/renderer'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect } from 'react'
import { GripVertical } from 'lucide-react'
import ImagePickerField from '../ui/ImagePickerField'

const W = 960
const H = 540
const FONT = 'Poppins'

// ─── PDF ────────────────────────────────────────────────────────────────────

function chunkArray(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

export function TeamSlidePDF({ fields = {} }) {
  const headline = fields.headline || 'Your Dedicated Team'
  const members  = (fields.members || []).filter((m) => m.name)
  const count    = members.length

  // Layout config based on member count
  const colsPerRow = count <= 3 ? count : 4
  const hasMultiRow = count > colsPerRow
  const GAP  = 16
  const PAD  = hasMultiRow ? 40 : 50
  const cardW = (W - PAD * 2 - GAP * (colsPerRow - 1)) / colsPerRow

  // Tighter card internals when two rows are needed
  const photoSize   = hasMultiRow ? 50 : 56
  const photoRadius = photoSize / 2
  const nameFSize   = hasMultiRow ? 12 : 13
  const titleFSize  = hasMultiRow ? 10 : 10
  const bioFSize    = hasMultiRow ? 10 : 10
  const cardPad     = hasMultiRow ? 14 : 16
  const photoMB     = hasMultiRow ? 8  : 10
  const headerMB    = hasMultiRow ? 20 : 28
  const rowGap      = hasMultiRow ? 14 : 20

  const rows = chunkArray(members, colsPerRow)

  return (
    <Page size={[W, H]} style={{ width: W, height: H, backgroundColor: '#ffffff', flexDirection: 'column', paddingHorizontal: PAD, paddingVertical: PAD }}>
      {/* Header */}
      <Text style={{ fontSize: 11, color: '#57BB95', fontFamily: FONT, fontWeight: 600, letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>
        OUR TEAM
      </Text>
      <Text style={{ fontSize: 28, color: '#17263A', fontFamily: FONT, fontWeight: 800, marginBottom: headerMB }}>
        {headline}
      </Text>

      {/* Member cards — explicit rows so @react-pdf never wraps to a new page */}
      {members.length > 0 ? (
        <View style={{ flex: 1, justifyContent: rows.length === 1 ? 'center' : 'flex-start', paddingBottom: rows.length === 1 ? 50 : 0 }}>
          {rows.map((row, ri) => (
            <View key={ri} wrap={false} style={{ flexDirection: 'row', gap: GAP, marginBottom: ri < rows.length - 1 ? rowGap : 0, justifyContent: row.length < colsPerRow ? 'center' : 'flex-start' }}>
              {row.map((m, i) => (
                <View key={i} style={{ width: cardW, backgroundColor: '#f8fafc', borderRadius: 10, padding: cardPad, alignItems: 'center' }}>
                  {m.photo_url ? (
                    <Image src={m.photo_url} style={{ width: photoSize, height: photoSize, borderRadius: photoRadius, objectFit: 'cover', marginBottom: photoMB }} />
                  ) : (
                    <View style={{ width: photoSize, height: photoSize, borderRadius: photoRadius, backgroundColor: '#17263A', marginBottom: photoMB, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: hasMultiRow ? 16 : 20, color: '#57BB95', fontFamily: FONT, fontWeight: 800 }}>
                        {(m.name || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={{ fontSize: nameFSize, color: '#17263A', fontFamily: FONT, fontWeight: 700, textAlign: 'center', marginBottom: 3 }}>
                    {m.name}
                  </Text>
                  {m.title && (
                    <Text style={{ fontSize: titleFSize, color: '#57BB95', fontFamily: FONT, fontWeight: 600, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
                      {m.title}
                    </Text>
                  )}
                  {m.bio && (
                    <Text style={{ fontSize: bioFSize, color: '#64748b', fontFamily: FONT, fontWeight: 400, textAlign: 'center', lineHeight: 1.4 }}>
                      {m.bio}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ fontSize: 13, color: '#94a3b8', fontFamily: FONT, fontStyle: 'italic' }}>No team members added yet.</Text>
      )}
    </Page>
  )
}

// ─── Sortable member card ─────────────────────────────────────────────────────

function SortableMemberCard({ member, index, totalCount, onSetMember, onRemove, onPickAsset, id }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
            tabIndex={-1}
          >
            <GripVertical size={14} />
          </button>
          <span className="text-xs font-semibold text-gray-500">Member {index + 1}</span>
        </div>
        {totalCount > 1 && (
          <button type="button" onClick={onRemove} className="text-xs text-gray-400 hover:text-red-500">Remove</button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Name</label>
          <input
            type="text"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            value={member.name || ''}
            onChange={(e) => onSetMember('name', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Title / Role</label>
          <input
            type="text"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            value={member.title || ''}
            onChange={(e) => onSetMember('title', e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Short Bio</label>
        <textarea
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-400"
          value={member.bio || ''}
          onChange={(e) => onSetMember('bio', e.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Photo</label>
        <ImagePickerField
          url={member.photo_url}
          onPick={() => onPickAsset(`members.${index}.photo_url`)}
          onRemove={() => onSetMember('photo_url', '')}
          type="photo"
          previewClass="rounded-full w-10 h-10"
        />
      </div>
    </div>
  )
}

// ─── Form ────────────────────────────────────────────────────────────────────

export function TeamSlideForm({ fields = {}, onChange, onPickAsset, dealTeam = [] }) {
  const set = (key, val) => onChange({ ...fields, [key]: val })
  const members = fields.members || [{ name: '', title: '', bio: '', photo_url: '' }]

  // Auto-load from deal team when slide opens with no filled members
  useEffect(() => {
    if (!dealTeam.length) return
    const hasRealMembers = (fields.members || []).some(m => m.name)
    if (hasRealMembers) return
    const loaded = dealTeam
      .filter(m => m.people?.name)
      .map(m => ({
        name:      m.people.name  || '',
        title:     m.people.title || '',
        bio:       m.people.bio   || '',
        photo_url: '',
        _id:       `member-deal-${m.id}`,
      }))
    if (loaded.length > 0) onChange({ ...fields, members: loaded })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealTeam.length])

  // Stable sortable IDs — attach a _id to each member on first render
  const membersWithIds = members.map((m, i) => ({
    ...m,
    _id: m._id || `member-${i}-${Date.now()}`,
  }))

  function setMember(i, key, val) {
    const updated = membersWithIds.map((m, idx) => idx === i ? { ...m, [key]: val } : m)
    set('members', updated)
  }
  function addMember() {
    set('members', [...membersWithIds, { name: '', title: '', bio: '', photo_url: '', _id: `member-new-${Date.now()}` }])
  }
  function removeMember(i) {
    set('members', membersWithIds.filter((_, idx) => idx !== i))
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = membersWithIds.findIndex(m => m._id === active.id)
    const newIndex = membersWithIds.findIndex(m => m._id === over.id)
    set('members', arrayMove(membersWithIds, oldIndex, newIndex))
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Section Headline</label>
        <input
          type="text"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          value={fields.headline || ''}
          onChange={(e) => set('headline', e.target.value)}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-semibold text-gray-600">Team Members</label>
          {dealTeam.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const loaded = dealTeam.map((m) => ({
                  name:      m.people?.name  || '',
                  title:     m.people?.title || m.people?.role || '',
                  bio:       m.people?.bio   || '',
                  photo_url: '',
                  _id:       `member-loaded-${m.id}`,
                }))
                onChange({ ...fields, members: loaded })
              }}
              className="text-xs font-medium text-teal-600 hover:text-teal-700 border border-teal-200 rounded-lg px-2.5 py-1 hover:bg-teal-50 transition-colors"
            >
              ↓ Load from deal ({dealTeam.length})
            </button>
          )}
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={membersWithIds.map(m => m._id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {membersWithIds.map((m, i) => (
                <SortableMemberCard
                  key={m._id}
                  id={m._id}
                  member={m}
                  index={i}
                  totalCount={membersWithIds.length}
                  onSetMember={(key, val) => setMember(i, key, val)}
                  onRemove={() => removeMember(i)}
                  onPickAsset={onPickAsset}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        {members.length < 8 && (
          <button type="button" onClick={addMember} className="mt-2 text-xs text-primary-500 hover:text-primary-700 font-medium">
            + Add team member
          </button>
        )}
      </div>
    </div>
  )
}
