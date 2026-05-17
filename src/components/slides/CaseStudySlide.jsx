import '../../lib/pdfFonts'
import { Page, Text, View, Image } from '@react-pdf/renderer'
import { tiptapToPdf } from '../../lib/tiptapToPdf'
import RichTextEditor from '../ui/RichTextEditor'
import ImagePickerField from '../ui/ImagePickerField'

const W = 960
const H = 540
const FONT = 'Poppins'

// ─── PDF ────────────────────────────────────────────────────────────────────

const ASPECT_CONFIGS = {
  landscape: { label: 'Landscape (16:9)', imgW: 380, imgH: 214, panelW: 420 },
  standard:  { label: 'Standard (4:3)',   imgW: 360, imgH: 270, panelW: 400 },
  square:    { label: 'Square (1:1)',      imgW: 330, imgH: 330, panelW: 380 },
  portrait:  { label: 'Portrait (3:4)',   imgW: 280, imgH: 373, panelW: 340 },
}

export function CaseStudySlidePDF({ fields = {} }) {
  const company  = fields.company || 'Case Study'
  const result   = fields.result  || ''
  const hasImage = !!fields.image_url
  const aspect   = ASPECT_CONFIGS[fields.image_aspect] || ASPECT_CONFIGS.standard

  return (
    <Page size={[W, H]} style={{ width: W, height: H, backgroundColor: '#ffffff', flexDirection: 'column' }}>
      {/* Top navy bar */}
      <View style={{ backgroundColor: '#17263A', paddingHorizontal: 56, paddingVertical: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontSize: 10, color: '#57BB95', fontFamily: FONT, fontWeight: 600, letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase' }}>
            CLIENT SUCCESS
          </Text>
          <Text style={{ fontSize: 26, color: '#ffffff', fontFamily: FONT, fontWeight: 800 }}>
            {company}
          </Text>
        </View>
        {result ? (
          <View style={{ backgroundColor: '#57BB95', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12, maxWidth: 260 }}>
            <Text style={{ fontSize: 11, color: '#17263A', fontFamily: FONT, fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              RESULT
            </Text>
            <Text style={{ fontSize: 16, color: '#17263A', fontFamily: FONT, fontWeight: 800, textAlign: 'center', lineHeight: 1.3 }}>
              {result}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Body */}
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ flex: 1, padding: 40, justifyContent: 'center' }}>
          {fields.body ? (
            tiptapToPdf(fields.body, { fontSize: 13, color: '#374151', fontFamily: FONT })
          ) : (
            <Text style={{ fontSize: 13, color: '#94a3b8', fontFamily: FONT, fontStyle: 'italic' }}>No content added yet.</Text>
          )}
        </View>

        {hasImage && (
          <View style={{ width: aspect.panelW, flexShrink: 0, alignItems: 'center', justifyContent: 'center', paddingRight: 40 }}>
            <Image src={fields.image_url} style={{ width: aspect.imgW, height: aspect.imgH, objectFit: 'contain', borderRadius: 8 }} />
          </View>
        )}
      </View>
    </Page>
  )
}

// ─── Form ────────────────────────────────────────────────────────────────────

export function CaseStudySlideForm({ fields = {}, onChange, onPickAsset }) {
  const set = (key, val) => onChange({ ...fields, [key]: val })

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Client / Company Name</label>
        <input
          type="text"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          placeholder="e.g. Acme Corp"
          value={fields.company || ''}
          onChange={(e) => set('company', e.target.value)}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Key Result (callout box)</label>
        <input
          type="text"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          placeholder="e.g. 40% increase in leads"
          value={fields.result || ''}
          onChange={(e) => set('result', e.target.value)}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Story / Details</label>
        <RichTextEditor expandable
          jsonMode
          value={fields.body}
          onChange={(val) => set('body', val)}
          placeholder="Describe the challenge, approach, and outcome…"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Supporting Image</label>
        <ImagePickerField
          url={fields.image_url}
          onPick={() => onPickAsset('image_url')}
          onRemove={() => set('image_url', '')}
          type="image"
        />
        {fields.image_url && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Aspect Ratio</label>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(ASPECT_CONFIGS).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => set('image_aspect', key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    (fields.image_aspect || 'standard') === key
                      ? 'bg-navy-900 text-white border-navy-900'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
