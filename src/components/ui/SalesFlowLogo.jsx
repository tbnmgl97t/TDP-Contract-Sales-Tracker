/**
 * SalesFlowLogo — Concept 06 gradient wordmark (inline SVG)
 *
 * Uses inline SVG with viewBox so it scales to fill any container width.
 * Inherits the page's loaded web fonts (Poppins 900 / Space Grotesk 500).
 *
 * Props:
 *   variant      'light' | 'dark'  — gradient + subtitle color
 *   subtitle     boolean           — show "SALES PERFORMANCE PLATFORM" (default true)
 *   className    string            — applied to the <svg> element
 *   style        object            — applied to the <svg> element
 */
export default function SalesFlowLogo({
  variant = 'light',
  subtitle = true,
  className = '',
  style = {},
}) {
  const onDark     = variant === 'dark'
  const gradStart  = onDark ? '#6FD4AC' : '#57BB95'
  const gradEnd    = onDark ? '#DBED68' : '#CBDD56'
  const subColor   = onDark ? 'rgba(255,255,255,0.6)' : 'rgba(23,38,58,0.55)'
  const gradId     = onDark ? 'sf-grad-dark' : 'sf-grad-light'

  // viewBox height: 120 (wordmark baseline) + optional subtitle row
  const viewH = subtitle ? 168 : 126

  return (
    <svg
      viewBox={`0 0 640 ${viewH}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', width: '100%', ...style }}
      aria-label="SalesFlow"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={gradStart} />
          <stop offset="100%" stopColor={gradEnd} />
        </linearGradient>
      </defs>

      {/* Wordmark — Poppins 900, -0.04em tracking */}
      <text
        x="320"
        y="116"
        textAnchor="middle"
        fontFamily="Poppins, 'Helvetica Neue', Arial, sans-serif"
        fontWeight="900"
        fontSize="120"
        letterSpacing="-4.8"
        fill={`url(#${gradId})`}
      >
        SalesFlow
      </text>

      {/* Subtitle — Space Grotesk 500, 0.45em tracking */}
      {subtitle && (
        <text
          x="320"
          y="158"
          textAnchor="middle"
          fontFamily="'Space Grotesk', 'Helvetica Neue', Arial, sans-serif"
          fontWeight="500"
          fontSize="14"
          letterSpacing="6.5"
          fill={subColor}
        >
          SALES PERFORMANCE PLATFORM
        </text>
      )}
    </svg>
  )
}
