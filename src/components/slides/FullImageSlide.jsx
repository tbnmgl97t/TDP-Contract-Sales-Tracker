import '../../lib/pdfFonts'
import { Page, Text, View, Image } from '@react-pdf/renderer'

const W = 960
const H = 540
const FONT = 'Poppins'

// ─── PDF ────────────────────────────────────────────────────────────────────

export function FullImageSlidePDF({ fields = {} }) {
  return (
    <Page size={[W, H]} style={{ backgroundColor: '#0d1b2a' }}>
      {fields.image_url ? (
        <Image
          src={fields.image_url}
          style={{ position: 'absolute', top: 0, left: 0, width: W, height: H }}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 14, color: '#64748b', fontFamily: FONT, fontWeight: 400 }}>
            No image selected
          </Text>
        </View>
      )}

      {/* Optional text overlay at bottom */}
      {fields.overlay_text ? (
        <View style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 50,
          paddingVertical: 24,
          backgroundColor: 'rgba(0,0,0,0.55)',
        }}>
          <Text style={{ fontSize: 15, color: '#ffffff', fontFamily: FONT, fontWeight: 500 }}>
            {fields.overlay_text}
          </Text>
        </View>
      ) : null}
    </Page>
  )
}

// ─── Form ────────────────────────────────────────────────────────────────────

export function FullImageSlideForm({ fields = {}, onChange, onPickAsset }) {
  const set = (key, val) => onChange({ ...fields, [key]: val })

  return (
    <div className="space-y-5">
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-700 mb-1">Full-bleed image slide</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          Upload your designed slide as a PNG or JPG. It renders at exactly 960×540pt —
          the native slide canvas size. Best for professionally designed slides you want to use as-is.
        </p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Slide Image</label>
        {fields.image_url && (
          <div className="mb-3 rounded-xl overflow-hidden border border-gray-200 shadow-sm">
            <img src={fields.image_url} alt="slide preview" className="w-full aspect-video object-cover" />
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPickAsset('image_url')}
            className="px-4 py-2 text-sm font-medium bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            {fields.image_url ? 'Change Image' : 'Choose Image'}
          </button>
          {fields.image_url && (
            <button type="button" onClick={() => set('image_url', '')} className="text-xs text-gray-400 hover:text-red-500">
              Remove
            </button>
          )}
        </div>
        <p className="text-[11px] text-gray-400 mt-2">PNG or JPG · recommended 1920×1080px or 960×540px</p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          Text Overlay <span className="font-normal text-gray-400">(optional — bottom bar)</span>
        </label>
        <input
          type="text"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          placeholder="e.g. Prepared for Acme Corp · May 2026"
          value={fields.overlay_text || ''}
          onChange={(e) => set('overlay_text', e.target.value)}
        />
      </div>
    </div>
  )
}
