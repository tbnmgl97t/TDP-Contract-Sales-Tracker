import '../../lib/pdfFonts'
import { Page, Text, View } from '@react-pdf/renderer'

const W = 960
const H = 540
const FONT = 'Poppins'

// ─── PDF ────────────────────────────────────────────────────────────────────

export function ProblemSlidePDF({ fields = {} }) {
  const headline = fields.headline || 'The Challenges You Face'
  const points = (fields.points || []).filter((p) => p.text)

  // Lay out up to 4 points in a 2-column grid if many, otherwise single column
  const useGrid = points.length > 2
  const cols    = useGrid ? 2 : 1

  return (
    <Page size={[W, H]} style={{ width: W, height: H, backgroundColor: '#f8fafc', flexDirection: 'column', padding: 56 }}>
      {/* Header */}
      <Text style={{ fontSize: 11, color: '#57BB95', fontFamily: FONT, fontWeight: 600, letterSpacing: 2, marginBottom: 12, textTransform: 'uppercase' }}>
        THE PROBLEM
      </Text>
      <Text style={{ fontSize: 30, color: '#17263A', fontFamily: FONT, fontWeight: 800, marginBottom: 32, lineHeight: 1.2 }}>
        {headline}
      </Text>

      {/* Points grid */}
      {points.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          {points.map((p, i) => (
            <View key={i} style={{
              width: cols === 2 ? (W - 112 - 16) / 2 : W - 112,
              backgroundColor: '#ffffff',
              borderRadius: 8,
              paddingTop: 28,
              paddingBottom: 20,
              paddingHorizontal: 20,
              borderLeftWidth: 4,
              borderLeftColor: '#57BB95',
              borderLeftStyle: 'solid',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* Big decorative number */}
              <Text style={{
                position: 'absolute',
                top: -10,
                right: 12,
                fontSize: 80,
                fontFamily: FONT,
                fontWeight: 800,
                color: '#17263A',
                opacity: 0.06,
                lineHeight: 1,
              }}>
                {String(i + 1).padStart(2, '0')}
              </Text>
              <Text style={{ fontSize: 13, color: '#374151', fontFamily: FONT, fontWeight: 400, lineHeight: 1.5 }}>
                {p.text}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ fontSize: 13, color: '#94a3b8', fontFamily: FONT, fontStyle: 'italic' }}>No pain points added yet.</Text>
      )}
    </Page>
  )
}

// ─── Form ────────────────────────────────────────────────────────────────────

export function ProblemSlideForm({ fields = {}, onChange }) {
  const set = (key, val) => onChange({ ...fields, [key]: val })
  const points = fields.points || [{ text: '' }]

  function setPoint(i, val) {
    const updated = points.map((p, idx) => idx === i ? { ...p, text: val } : p)
    set('points', updated)
  }
  function addPoint()      { set('points', [...points, { text: '' }]) }
  function removePoint(i)  { set('points', points.filter((_, idx) => idx !== i)) }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Headline</label>
        <input
          type="text"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          value={fields.headline || ''}
          onChange={(e) => set('headline', e.target.value)}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-2">Pain Points</label>
        <div className="space-y-2">
          {points.map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              <textarea
                rows={2}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-400"
                placeholder={`Pain point ${i + 1}`}
                value={p.text || ''}
                onChange={(e) => setPoint(i, e.target.value)}
              />
              {points.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePoint(i)}
                  className="mt-2 text-xs text-gray-400 hover:text-red-500"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        {points.length < 6 && (
          <button
            type="button"
            onClick={addPoint}
            className="mt-2 text-xs text-primary-500 hover:text-primary-700 font-medium"
          >
            + Add point
          </button>
        )}
      </div>
    </div>
  )
}
