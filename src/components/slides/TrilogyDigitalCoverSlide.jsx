import '../../lib/pdfFonts'
import { Page, Text, View, Image, Svg, Path, Polygon, Rect } from '@react-pdf/renderer'

const W = 960
const H = 540
const FONT = 'Poppins'

// Brand colors
const BG           = '#0d1b2a'
const BG_RIGHT     = '#0a2520'
const TEAL_STROKE  = '#2dd4bf'
const YELLOW       = '#c8e64a'
const GREEN_TRI    = '#4ade80'

/**
 * Rounded-corner right-pointing play triangle SVG path.
 *
 * Vertices in a 440×420 viewport:
 *   A = top-left    (20, 10)
 *   B = right-mid  (420, 210)
 *   C = bottom-left (20, 410)
 * Corner radius = 60 — computed with quadratic bezier tangent points.
 */
const PLAY_PATH = 'M 20,70 Q 20,10 74,37 L 366,183 Q 420,210 366,237 L 74,383 Q 20,410 20,350 Z'

// ─── PDF ────────────────────────────────────────────────────────────────────

export function TrilogyDigitalCoverSlidePDF({ fields = {}, deal }) {
  const subtitle = fields.subtitle || ''

  return (
    <Page size={[W, H]} style={{ overflow: 'hidden', backgroundColor: BG }}>

      {/* Background gradient — dark left / teal-tinted right */}
      <Svg width={W} height={H} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Rect x={0} y={0} width={W} height={H} fill={BG} />
        {/* Teal tint fading in from right */}
        <Rect x={400} y={0} width={560} height={H} fill={BG_RIGHT} />
        {/* Additional dark vignette corners */}
        <Rect x={0} y={0} width={200} height={H} fill="#080f18" />
      </Svg>

      {/* Large outlined rounded-triangle play button (bleeds off right edge) */}
      <Svg
        viewBox="0 0 440 420"
        width={520}
        height={520}
        style={{ position: 'absolute', top: 10, right: -70 }}
      >
        <Path
          d={PLAY_PATH}
          fill="none"
          stroke={TEAL_STROKE}
          strokeWidth={3}
        />
      </Svg>

      {/* Small yellow play triangle — top right */}
      <Svg width={76} height={66} style={{ position: 'absolute', top: 48, right: 108 }}>
        <Polygon points="4,4 72,33 4,62" fill={YELLOW} />
      </Svg>

      {/* Small green play triangle — bottom right */}
      <Svg width={96} height={86} style={{ position: 'absolute', bottom: 44, right: 36 }}>
        <Polygon points="4,4 92,43 4,82" fill={GREEN_TRI} />
      </Svg>

      {/* Top-left badge logo */}
      {fields.badge_url ? (
        <Image
          src={fields.badge_url}
          style={{ position: 'absolute', top: 28, left: 36, width: 148, height: 44, objectFit: 'contain' }}
        />
      ) : (
        <View style={{ position: 'absolute', top: 28, left: 36, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 28, height: 28, backgroundColor: '#4ade80', borderRadius: 4 }} />
          <View>
            <Text style={{ fontSize: 9, color: '#ffffff', fontFamily: FONT, fontWeight: 700, letterSpacing: 1 }}>TRILOGY</Text>
            <Text style={{ fontSize: 9, color: '#ffffff', fontFamily: FONT, fontWeight: 700, letterSpacing: 1 }}>DIGITAL</Text>
          </View>
        </View>
      )}

      {/* Main center logo */}
      {fields.logo_url ? (
        <Image
          src={fields.logo_url}
          style={{ position: 'absolute', left: 90, top: H / 2 - 130, width: 620, height: 260, objectFit: 'contain', objectPosition: 'left center' }}
        />
      ) : (
        /* Text fallback when no logo image is set */
        <View style={{ position: 'absolute', left: 90, top: H / 2 - 120, flexDirection: 'row', alignItems: 'center', gap: 28 }}>
          {/* Icon placeholder */}
          <View style={{ width: 160, height: 160, backgroundColor: '#22c55e', borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={80} height={80} viewBox="0 0 80 80">
              <Polygon points="15,10 65,40 15,70" fill="#ffffff" />
            </Svg>
          </View>
          {/* Wordmark */}
          <View style={{ flexDirection: 'column' }}>
            <Text style={{ fontSize: 68, color: '#ffffff', fontFamily: FONT, fontWeight: 800, lineHeight: 1, letterSpacing: -1 }}>TRILOGY</Text>
            <Text style={{ fontSize: 68, color: '#ffffff', fontFamily: FONT, fontWeight: 800, lineHeight: 1, letterSpacing: -1 }}>DIGITAL</Text>
          </View>
        </View>
      )}

      {/* Optional subtitle / prepared-for line */}
      {subtitle ? (
        <Text style={{
          position: 'absolute',
          bottom: 36,
          left: 90,
          fontSize: 14,
          color: '#94a3b8',
          fontFamily: FONT,
          fontWeight: 400,
          letterSpacing: 0.5,
        }}>
          {subtitle}
        </Text>
      ) : null}

    </Page>
  )
}

// ─── Form ────────────────────────────────────────────────────────────────────

export function TrilogyDigitalCoverSlideForm({ fields = {}, onChange, onPickAsset }) {
  const set = (key, val) => onChange({ ...fields, [key]: val })

  return (
    <div className="space-y-5">
      <div className="bg-navy-900/5 border border-navy-100 rounded-xl p-4">
        <p className="text-xs font-semibold text-navy-700 mb-1">Branded title slide</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          Upload your Trilogy Digital logos to the asset library once, then select them here.
          The decorative shapes and background are fixed to match your brand.
        </p>
      </div>

      {/* Main center logo */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          Main Logo <span className="font-normal text-gray-400">(center — icon + wordmark)</span>
        </label>
        <div className="flex items-center gap-2">
          {fields.logo_url && (
            <div className="h-12 w-32 rounded border border-gray-200 bg-navy-900 flex items-center justify-center overflow-hidden p-1">
              <img src={fields.logo_url} alt="logo" className="h-full w-full object-contain" />
            </div>
          )}
          <button
            type="button"
            onClick={() => onPickAsset('logo_url')}
            className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
          >
            {fields.logo_url ? 'Change' : 'Choose Image'}
          </button>
          {fields.logo_url && (
            <button type="button" onClick={() => set('logo_url', '')} className="text-xs text-gray-400 hover:text-red-500">Remove</button>
          )}
        </div>
        {!fields.logo_url && (
          <p className="text-[11px] text-gray-400 mt-1.5">A text fallback will render until you add a logo image.</p>
        )}
      </div>

      {/* Badge / top-left logo */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          Badge Logo <span className="font-normal text-gray-400">(top-left corner)</span>
        </label>
        <div className="flex items-center gap-2">
          {fields.badge_url && (
            <div className="h-10 w-28 rounded border border-gray-200 bg-navy-900 flex items-center justify-center overflow-hidden p-1">
              <img src={fields.badge_url} alt="badge" className="h-full w-full object-contain" />
            </div>
          )}
          <button
            type="button"
            onClick={() => onPickAsset('badge_url')}
            className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
          >
            {fields.badge_url ? 'Change' : 'Choose Image'}
          </button>
          {fields.badge_url && (
            <button type="button" onClick={() => set('badge_url', '')} className="text-xs text-gray-400 hover:text-red-500">Remove</button>
          )}
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">Can be the same as main logo, or a smaller horizontal lockup.</p>
      </div>

      {/* Subtitle */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          Subtitle <span className="font-normal text-gray-400">(bottom-left, optional)</span>
        </label>
        <input
          type="text"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          placeholder="e.g. Prepared for Acme Corp · May 2026"
          value={fields.subtitle || ''}
          onChange={(e) => set('subtitle', e.target.value)}
        />
      </div>
    </div>
  )
}
