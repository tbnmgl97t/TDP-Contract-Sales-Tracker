/**
 * Proposal Slide Library — v2
 *
 * Defines all available slide types for the component-based proposal builder.
 * Each entry describes the type, its default field values, and display metadata.
 *
 * `fields` shapes:
 *   cover       → { title, subtitle, logo_url, bg_color }
 *   about       → { headline, body (Tiptap JSON), logo_url }
 *   problem     → { headline, points: [{ text }] }
 *   solution    → { headline, body (Tiptap JSON), image_url }
 *   pricing     → { note }  (all values computed live from deal data)
 *   case_study  → { company, result, body (Tiptap JSON), image_url }
 *   team        → { headline, members: [{ name, title, bio, photo_url }] }
 *   freeform    → { title, content (Tiptap JSON) }
 *   timeline    → { headline, steps: [{ date, label, description }] }
 *   closing     → { headline, cta, email, phone }
 */

export const SLIDE_LIBRARY = [
  {
    key: 'full_image',
    label: 'Full Image',
    description: 'Drop in any designed slide as a full-bleed image (PNG/JPG)',
    icon: 'image',
    defaultFields: {
      image_url: '',
      overlay_text: '',
    },
  },
  {
    key: 'cover',
    label: 'Cover',
    description: 'Title slide with deal name, subtitle and optional logo',
    icon: 'layout',
    defaultFields: {
      title: '',
      subtitle: '',
      logo_url: '',
      bg_color: '#17263A',
      bg_image_url: '',
      date: '',
      prepared_by: '',
      prepared_by_email: '',
    },
  },
  {
    key: 'about',
    label: 'About Us',
    description: 'Company overview with rich text and logo',
    icon: 'building',
    defaultFields: {
      headline: 'About Trilogy Digital',
      body: null,
      logo_url: '',
    },
  },
  {
    key: 'problem',
    label: 'The Problem',
    description: 'Pain points your solution addresses',
    icon: 'alert-circle',
    defaultFields: {
      headline: 'The Challenges You Face',
      points: [
        { text: '' },
        { text: '' },
        { text: '' },
      ],
    },
  },
  {
    key: 'solution',
    label: 'Our Solution',
    description: 'Value proposition with rich text and optional image',
    icon: 'zap',
    defaultFields: {
      headline: 'How We Solve It',
      body: null,
      image_url: '',
    },
  },
  {
    key: 'pricing',
    label: 'Pricing',
    description: 'Auto-generated pricing table from deal products',
    icon: 'dollar-sign',
    defaultFields: {
      note: '',
    },
  },
  {
    key: 'case_study',
    label: 'Case Study',
    description: 'Customer success story with result callout',
    icon: 'award',
    defaultFields: {
      company: '',
      result: '',
      body: null,
      image_url: '',
      image_aspect: 'standard',
    },
  },
  {
    key: 'team',
    label: 'Our Team',
    description: 'Team member grid with photos and bios',
    icon: 'users',
    defaultFields: {
      headline: 'Your Dedicated Team',
      members: [
        { name: '', title: '', bio: '', photo_url: '' },
      ],
    },
  },
  {
    key: 'freeform',
    label: 'Freeform',
    description: 'Open canvas with title and rich text content',
    icon: 'file-text',
    defaultFields: {
      title: '',
      subtitle: '',
      content: null,
    },
  },
  {
    key: 'timeline',
    label: 'Timeline',
    description: 'Project timeline or onboarding milestones',
    icon: 'clock',
    defaultFields: {
      headline: 'Implementation Timeline',
      subtitle: '',
      steps: [
        { date: 'Month 1', label: '', description: '' },
        { date: 'Month 2', label: '', description: '' },
        { date: 'Month 3', label: '', description: '' },
      ],
    },
  },
  {
    key: 'closing',
    label: 'Closing / CTA',
    description: 'Call-to-action with contact details',
    icon: 'send',
    defaultFields: {
      headline: "Let's Get Started",
      cta: 'Ready to move forward? Reach out today.',
      name: '',
      email: '',
      phone: '',
      bg_image_url: '',
    },
  },
]

/** Map of slide_key → definition for fast lookup */
export const SLIDE_MAP = Object.fromEntries(SLIDE_LIBRARY.map((s) => [s.key, s]))
