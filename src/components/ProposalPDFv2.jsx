/**
 * ProposalPDFv2 — @react-pdf/renderer Document for the new component-based proposal system.
 *
 * Receives an ordered array of `slides` (from proposal_slides table) and renders
 * each one via the appropriate SlidePDF component.
 */
import '../lib/pdfFonts'
import { Document } from '@react-pdf/renderer'
import { FullImageSlidePDF }           from './slides/FullImageSlide'
import { TrilogyDigitalCoverSlidePDF } from './slides/TrilogyDigitalCoverSlide'
import { CoverSlidePDF }     from './slides/CoverSlide'
import { AboutSlidePDF }     from './slides/AboutSlide'
import { ProblemSlidePDF }   from './slides/ProblemSlide'
import { SolutionSlidePDF }  from './slides/SolutionSlide'
import { PricingSlidePDF }   from './slides/PricingSlide'
import { CaseStudySlidePDF } from './slides/CaseStudySlide'
import { TeamSlidePDF }      from './slides/TeamSlide'
import { FreeformSlidePDF }  from './slides/FreeformSlide'
import { TimelineSlidePDF }  from './slides/TimelineSlide'
import { ClosingSlidePDF }   from './slides/ClosingSlide'

const PDF_COMPONENTS = {
  full_image: FullImageSlidePDF,
  td_cover:   TrilogyDigitalCoverSlidePDF,
  cover:      CoverSlidePDF,
  about:      AboutSlidePDF,
  problem:    ProblemSlidePDF,
  solution:   SolutionSlidePDF,
  pricing:    PricingSlidePDF,
  case_study: CaseStudySlidePDF,
  team:       TeamSlidePDF,
  freeform:   FreeformSlidePDF,
  timeline:   TimelineSlidePDF,
  closing:    ClosingSlidePDF,
}

export default function ProposalPDFv2({ slides = [], deal, dealProducts = [], dealPartners = [] }) {
  return (
    <Document>
      {slides.map((slide) => {
        const Component = PDF_COMPONENTS[slide.slide_key]
        if (!Component) return null
        return (
          <Component
            key={slide.id}
            fields={slide.fields || {}}
            deal={deal}
            dealProducts={dealProducts}
            dealPartners={dealPartners}
          />
        )
      })}
    </Document>
  )
}
