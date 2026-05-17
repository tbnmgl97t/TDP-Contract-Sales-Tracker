import '../../lib/pdfFonts'
import { Page, Text, View, Image } from '@react-pdf/renderer'
import { useEffect, useState } from 'react'
import ImagePickerField from '../ui/ImagePickerField'
import { supabase } from '../../lib/supabase'

const W = 960
const H = 540
const FONT = 'Poppins'

// ─── PDF ────────────────────────────────────────────────────────────────────

export function ClosingSlidePDF({ fields = {} }) {
  const headline = fields.headline || "Let's Get Started"
  const cta      = fields.cta      || 'Ready to move forward? Reach out today.'
  const name     = fields.name     || ''
  const email    = fields.email    || ''
  const phone    = fields.phone    || ''
  const hasBgImg = !!fields.bg_image_url

  return (
    <Page size={[W, H]} style={{ width: W, height: H, backgroundColor: '#17263A' }}>
      {/* Background image */}
      {hasBgImg && (
        <Image src={fields.bg_image_url} style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'cover' }} />
      )}

      {/* Centered content */}
      <View style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 70, paddingVertical: 70 }}>
        {/* Decorative accent */}
        <View style={{ width: 60, height: 5, backgroundColor: '#57BB95', borderRadius: 3, marginBottom: 32 }} />

        <Text style={{ fontSize: 42, color: '#ffffff', fontFamily: FONT, fontWeight: 800, textAlign: 'center', lineHeight: 1.2, marginBottom: 20 }}>
          {headline}
        </Text>

        {cta ? (
          <Text style={{ fontSize: 16, color: '#94a3b8', fontFamily: FONT, fontWeight: 400, textAlign: 'center', maxWidth: 560, lineHeight: 1.5, marginBottom: 40 }}>
            {cta}
          </Text>
        ) : null}

        {/* Contact block */}
        {(name || email || phone) ? (
          <View style={{ alignItems: 'center', gap: 6 }}>
            {name ? (
              <Text style={{ fontSize: 15, color: '#ffffff', fontFamily: FONT, fontWeight: 700 }}>{name}</Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 40, alignItems: 'center', marginTop: name ? 12 : 0 }}>
              {email ? (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, color: '#57BB95', fontFamily: FONT, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>EMAIL</Text>
                  <Text style={{ fontSize: 14, color: '#ffffff', fontFamily: FONT, fontWeight: 500 }}>{email}</Text>
                </View>
              ) : null}
              {email && phone ? (
                <View style={{ width: 1, height: 36, backgroundColor: '#334155' }} />
              ) : null}
              {phone ? (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, color: '#57BB95', fontFamily: FONT, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>PHONE</Text>
                  <Text style={{ fontSize: 14, color: '#ffffff', fontFamily: FONT, fontWeight: 500 }}>{phone}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </Page>
  )
}

// ─── Form ────────────────────────────────────────────────────────────────────

export function ClosingSlideForm({ fields = {}, onChange, onPickAsset, dealTeam = [] }) {
  const set = (key, val) => onChange({ ...fields, [key]: val })
  const [currentUser, setCurrentUser] = useState({ name: '', email: '' })

  useEffect(() => {
    async function fetchUser() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const email = session.user.email

      // Check deal team first
      let name = dealTeam.find(m => m.people?.email === email)?.people?.name
      // Fall back to people table
      if (!name) {
        const { data: person } = await supabase.from('people').select('name').eq('email', email).maybeSingle()
        name = person?.name
      }
      const displayName = name || email
      setCurrentUser({ name: displayName, email })

      // Auto-fill if empty
      const updates = {}
      if (!fields.name)  updates.name  = displayName
      if (!fields.email) updates.email = email
      if (Object.keys(updates).length > 0) onChange({ ...fields, ...updates })
    }
    fetchUser()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealTeam.length])

  // Build team picker options
  const teamOptions = dealTeam
    .filter(m => m.people?.name)
    .map(m => ({ name: m.people.name, email: m.people.email || '' }))

  const selfInTeam = teamOptions.some(o => o.name === currentUser.name)
  const allOptions = currentUser.name && !selfInTeam
    ? [{ name: currentUser.name, email: currentUser.email }, ...teamOptions]
    : teamOptions

  function handlePersonSelect(selectedName) {
    const option = allOptions.find(o => o.name === selectedName)
    onChange({ ...fields, name: selectedName, email: option?.email || fields.email })
  }

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
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Call to Action</label>
        <textarea
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-400"
          value={fields.cta || ''}
          onChange={(e) => set('cta', e.target.value)}
        />
      </div>

      <div className="border-t border-gray-100 pt-4">
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Contact Person</label>
        <select
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white mb-3"
          value={fields.name || ''}
          onChange={(e) => handlePersonSelect(e.target.value)}
        >
          <option value="">— Select person —</option>
          {allOptions.map((o) => (
            <option key={o.name} value={o.name}>
              {o.name}{o.name === currentUser.name ? ' (you)' : ''}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Name</label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              value={fields.name || ''}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email</label>
            <input
              type="email"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              value={fields.email || ''}
              onChange={(e) => set('email', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Phone</label>
        <input
          type="tel"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          placeholder="(555) 000-0000"
          value={fields.phone || ''}
          onChange={(e) => set('phone', e.target.value)}
        />
      </div>

      <div className="border-t border-gray-100 pt-4">
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Background Image <span className="font-normal text-gray-400">(optional)</span></label>
        <ImagePickerField
          url={fields.bg_image_url}
          onPick={() => onPickAsset('bg_image_url')}
          onRemove={() => set('bg_image_url', '')}
          type="image"
        />
      </div>
    </div>
  )
}
