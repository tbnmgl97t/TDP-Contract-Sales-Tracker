import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'

const PRESETS = {
  photo: {
    hint: 'Best at 800×800px or larger for sharp print quality.',
    minW: 800, minH: 800,
    warn: 'This photo may look soft when printed. 800×800px or larger is recommended.',
  },
  image: {
    hint: 'Best at 1600×900px or larger for sharp print quality.',
    minW: 1200, minH: 700,
    warn: 'This image may look soft when printed. 1600×900px or larger is recommended.',
  },
  logo: {
    hint: 'PNG with transparent background recommended.',
    minW: 400, minH: 150,
    warn: 'This logo may look soft when printed. A higher-res PNG is recommended.',
  },
}

/**
 * Reusable image picker with resolution hint + print-quality warning.
 *
 * Props:
 *   url          — current image URL
 *   onPick()     — open asset library
 *   onRemove()   — clear the field
 *   type         — 'photo' | 'image' | 'logo'  (controls hint + min dims)
 *   previewClass — extra classes for the preview <img>
 */
export default function ImagePickerField({ url, onPick, onRemove, type = 'image', previewClass = '' }) {
  const [tooSmall, setTooSmall] = useState(false)
  const preset = PRESETS[type] || PRESETS.image

  function handleLoad(e) {
    const { naturalWidth, naturalHeight } = e.target
    setTooSmall(naturalWidth < preset.minW || naturalHeight < preset.minH)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {url && (
          <img
            src={url}
            alt=""
            onLoad={handleLoad}
            className={`h-12 w-auto rounded border border-gray-200 object-cover ${previewClass}`}
          />
        )}
        <button
          type="button"
          onClick={onPick}
          className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
        >
          {url ? 'Change' : 'Choose Image'}
        </button>
        {url && (
          <button type="button" onClick={onRemove} className="text-xs text-gray-400 hover:text-red-500">
            Remove
          </button>
        )}
      </div>

      {/* Resolution warning */}
      {url && tooSmall && (
        <div className="flex items-start gap-1.5 text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span className="text-xs">{preset.warn}</span>
        </div>
      )}

      {/* Hint */}
      <p className="text-xs text-gray-400">{preset.hint}</p>
    </div>
  )
}
