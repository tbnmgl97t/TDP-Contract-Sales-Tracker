import '../../lib/pdfFonts'
import { Page, Text, View } from '@react-pdf/renderer'

const W = 960
const H = 540
const FONT = 'Poppins'

// ─── PDF ────────────────────────────────────────────────────────────────────

export function TimelineSlidePDF({ fields = {} }) {
  const headline = fields.headline || 'Implementation Timeline'
  const subtitle = fields.subtitle || ''
  const steps    = (fields.steps || []).filter((s) => s.label || s.date)
  const count    = steps.length || 1
  const stepW    = Math.min(200, (W - 112) / count)

  return (
    <Page size={[W, H]} style={{ width: W, height: H, backgroundColor: '#f8fafc', padding: 56 }}>
      {/* Header */}
      <Text style={{ fontSize: 11, color: '#57BB95', fontFamily: FONT, fontWeight: 600, letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' }}>
        TIMELINE
      </Text>
      <Text style={{ fontSize: 30, color: '#17263A', fontFamily: FONT, fontWeight: 800, marginBottom: subtitle ? 8 : 120 }}>
        {headline}
      </Text>
      {subtitle ? (
        <Text style={{ fontSize: 13, color: '#64748b', fontFamily: FONT, fontWeight: 400, marginBottom: 120 }}>
          {subtitle}
        </Text>
      ) : null}

      {steps.length > 0 ? (
        <View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 0 }}>
          {steps.map((step, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              {/* Connector line + dot */}
              <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 16 }}>
                {/* Left line */}
                <View style={{ flex: 1, height: 2, backgroundColor: i === 0 ? 'transparent' : '#57BB95' }} />
                {/* Dot */}
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#57BB95', flexShrink: 0 }}>
                  <View style={{ position: 'absolute', top: 4, left: 4, width: 12, height: 12, borderRadius: 6, backgroundColor: '#ffffff' }} />
                </View>
                {/* Right line */}
                <View style={{ flex: 1, height: 2, backgroundColor: i === steps.length - 1 ? 'transparent' : '#57BB95' }} />
              </View>

              {/* Content */}
              <View style={{ paddingHorizontal: 8, alignItems: 'center' }}>
                {step.date && (
                  <Text style={{ fontSize: 10, color: '#57BB95', fontFamily: FONT, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5, textAlign: 'center' }}>
                    {step.date}
                  </Text>
                )}
                {step.label && (
                  <Text style={{ fontSize: 13, color: '#17263A', fontFamily: FONT, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>
                    {step.label}
                  </Text>
                )}
                {step.description && (
                  <Text style={{ fontSize: 11, color: '#64748b', fontFamily: FONT, fontWeight: 400, textAlign: 'center', lineHeight: 1.4 }}>
                    {step.description}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
        </View>
      ) : null}
    </Page>
  )
}

// ─── Form ────────────────────────────────────────────────────────────────────

export function TimelineSlideForm({ fields = {}, onChange }) {
  const set = (key, val) => onChange({ ...fields, [key]: val })
  const steps = fields.steps || [{ date: '', label: '', description: '' }]

  function setStep(i, key, val) {
    const updated = steps.map((s, idx) => idx === i ? { ...s, [key]: val } : s)
    set('steps', updated)
  }
  function addStep()     { set('steps', [...steps, { date: '', label: '', description: '' }]) }
  function removeStep(i) { set('steps', steps.filter((_, idx) => idx !== i)) }

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
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Subtitle <span className="font-normal text-gray-400">(optional)</span></label>
        <input
          type="text"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          placeholder="e.g. From kickoff to launch in 90 days"
          value={fields.subtitle || ''}
          onChange={(e) => set('subtitle', e.target.value)}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-2">Timeline Steps</label>
        <div className="space-y-3">
          {steps.map((step, i) => (
            <div key={i} className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">Step {i + 1}</span>
                {steps.length > 1 && (
                  <button type="button" onClick={() => removeStep(i)} className="text-xs text-gray-400 hover:text-red-500">Remove</button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date / Period</label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                    placeholder="e.g. Month 1"
                    value={step.date || ''}
                    onChange={(e) => setStep(i, 'date', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Milestone Label</label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                    placeholder="e.g. Kickoff"
                    value={step.label || ''}
                    onChange={(e) => setStep(i, 'label', e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <input
                  type="text"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                  placeholder="Brief description…"
                  value={step.description || ''}
                  onChange={(e) => setStep(i, 'description', e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
        {steps.length < 8 && (
          <button type="button" onClick={addStep} className="mt-2 text-xs text-primary-500 hover:text-primary-700 font-medium">
            + Add step
          </button>
        )}
      </div>
    </div>
  )
}
