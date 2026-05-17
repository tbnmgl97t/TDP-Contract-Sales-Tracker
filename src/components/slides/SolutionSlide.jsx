import '../../lib/pdfFonts'
import { Page, Text, View, Image } from '@react-pdf/renderer'
import { tiptapToPdf } from '../../lib/tiptapToPdf'
import RichTextEditor from '../ui/RichTextEditor'
import ImagePickerField from '../ui/ImagePickerField'

const W = 960
const H = 540
const FONT = 'Poppins'

// ─── PDF ────────────────────────────────────────────────────────────────────

export function SolutionSlidePDF({ fields = {} }) {
  const headline = fields.headline || 'Our Solution'
  const hasImage = !!fields.image_url

  return (
    <Page size={[W, H]} style={{ width: W, height: H, backgroundColor: '#ffffff', flexDirection: 'row' }}>
      {/* Left accent bar */}
      <View style={{ width: 6, backgroundColor: '#17263A', flexShrink: 0 }} />

      {/* Content */}
      <View style={{ flex: 1, paddingLeft: 56, paddingRight: hasImage ? 24 : 56, paddingVertical: 52, justifyContent: 'center' }}>
        <Text style={{ fontSize: 11, color: '#17263A', fontFamily: FONT, fontWeight: 600, letterSpacing: 2, marginBottom: 14, textTransform: 'uppercase' }}>
          OUR SOLUTION
        </Text>
        <Text style={{ fontSize: 30, color: '#17263A', fontFamily: FONT, fontWeight: 800, marginBottom: 20, lineHeight: 1.2 }}>
          {headline}
        </Text>
        {fields.body ? (
          tiptapToPdf(fields.body, { fontSize: 13, color: '#374151', fontFamily: FONT })
        ) : (
          <Text style={{ fontSize: 13, color: '#94a3b8', fontFamily: FONT, fontStyle: 'italic' }}>No content added yet.</Text>
        )}
      </View>

      {/* Right: optional image */}
      {hasImage && (
        <View style={{ width: 340, flexShrink: 0, alignItems: 'center', justifyContent: 'center', paddingRight: 20 }}>
          <Image src={fields.image_url} style={{ width: 320, height: 420, objectFit: 'cover', borderRadius: 8 }} />
        </View>
      )}
    </Page>
  )
}

// ─── Form ────────────────────────────────────────────────────────────────────

export function SolutionSlideForm({ fields = {}, onChange, onPickAsset }) {
  const set = (key, val) => onChange({ ...fields, [key]: val })

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
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Body</label>
        <RichTextEditor expandable
          jsonMode
          value={fields.body}
          onChange={(val) => set('body', val)}
          placeholder="Describe your solution, approach, and key benefits…"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Supporting Image (right panel)</label>
        <ImagePickerField
          url={fields.image_url}
          onPick={() => onPickAsset('image_url')}
          onRemove={() => set('image_url', '')}
          type="image"
        />
      </div>
    </div>
  )
}
