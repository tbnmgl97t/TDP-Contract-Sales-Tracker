/**
 * Shared Poppins font registration for @react-pdf/renderer.
 * Import this file (side-effect only) in any component that renders PDF pages.
 */
import { Font } from '@react-pdf/renderer'

Font.register({
  family: 'Poppins',
  fonts: [
    { src: '/fonts/Poppins-Regular.ttf',   fontWeight: 400 },
    { src: '/fonts/Poppins-Medium.ttf',    fontWeight: 500 },
    { src: '/fonts/Poppins-SemiBold.ttf',  fontWeight: 600 },
    { src: '/fonts/Poppins-Bold.ttf',      fontWeight: 700 },
    { src: '/fonts/Poppins-ExtraBold.ttf', fontWeight: 800 },
    { src: '/fonts/Poppins-Italic.ttf',    fontWeight: 400, fontStyle: 'italic' },
  ],
})

// Disable automatic word hyphenation across all PDF slides
Font.registerHyphenationCallback(word => [word])
