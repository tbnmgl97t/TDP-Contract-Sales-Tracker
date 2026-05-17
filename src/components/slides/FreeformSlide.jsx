import '../../lib/pdfFonts'
import { Page, Text, View } from '@react-pdf/renderer'
import { tiptapToPdf } from '../../lib/tiptapToPdf'
import RichTextEditor from '../ui/RichTextEditor'

const W = 960
const H = 540
const FONT = 'Poppins'

// ─── PDF ────────────────────────────────────────────────────────────────────

export function FreeformSlidePDF({ fields = {} }) {
  const title    = fields.title || ''
  const subtitle = fields.subtitle || ''
  const content  = fields.content

  return (
    <Page size={[W, H]} style={{ width: W, height: H, backgroundColor: '#ffffff', flexDirection: 'row' }}>
      {/* Left accent */}
      <View style={{ width: 6, backgroundColor: '#57BB95', flexShrink: 0 }} />

      <View style={{ flex: 1, paddingHorizontal: 56, paddingVertical: 52, flexDirection: 'column', justifyContent: 'flex-start' }}>
        {title ? (
          <Text style={{ fontSize: 30, color: '#17263A', fontFamily: FONT, fontWeight: 800, marginBottom: subtitle ? 6 : 24, lineHeight: 1.2 }}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text style={{ fontSize: 13, color: '#64748b', fontFamily: FONT, fontWeight: 400, marginBottom: 24 }}>
            {subtitle}
          </Text>
        ) : null}

        {content ? (
          <View style={{ flex: 1 }}>
            {tiptapToPdf(content, { fontSize: 14, color: '#374151', fontFamily: FONT, lineHeight: 1.6 })}
          </View>
        ) : (
          <Text style={{ fontSize: 13, color: '#94a3b8', fontFamily: FONT, fontStyle: 'italic' }}>No content added yet.</Text>
        )}
      </View>
    </Page>
  )
}

// ─── Form ────────────────────────────────────────────────────────────────────

export function FreeformSlideForm({ fields = {}, onChange }) {
  const set = (key, val) => onChange({ ...fields, [key]: val })

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Title <span className="font-normal text-gray-400">(optional)</span></label>
        <input
          type="text"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          placeholder="Slide title…"
          value={fields.title || ''}
          onChange={(e) => set('title', e.target.value)}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Subtitle <span className="font-normal text-gray-400">(optional)</span></label>
        <input
          type="text"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          placeholder="Supporting line below the title…"
          value={fields.subtitle || ''}
          onChange={(e) => set('subtitle', e.target.value)}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Content</label>
        <RichTextEditor expandable
          jsonMode
          value={fields.content}
          onChange={(val) => set('content', val)}
          placeholder="Write anything — rich text, bullets, bold, italic…"
        />
      </div>
    </div>
  )
}
