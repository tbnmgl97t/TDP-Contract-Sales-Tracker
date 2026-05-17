import '../../lib/pdfFonts'
import { Page, Text, View, Image } from '@react-pdf/renderer'
import { useEffect, useState } from 'react'
import ImagePickerField from '../ui/ImagePickerField'
import { supabase } from '../../lib/supabase'

const W = 960
const H = 540
const FONT = 'Poppins'

// ─── PDF ────────────────────────────────────────────────────────────────────

export function CoverSlidePDF({ fields = {}, deal }) {
  const bg       = fields.bg_color || '#17263A'
  const hasBgImg = !!fields.bg_image_url
  const title    = fields.title || deal?.name || 'Proposal'
  const subtitle = fields.subtitle || deal?.company_name || deal?.customers?.name || ''
  const today    = fields.date
    ? new Date(fields.date + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <Page size={[W, H]} style={{ width: W, height: H, backgroundColor: bg }}>
      {/* Background image — rendered first so everything else paints on top */}
      {hasBgImg && (
        <Image src={fields.bg_image_url} style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'cover' }} />
      )}


      {/* Accent bar */}
      <View style={{ position: 'absolute', left: 0, top: 230, width: 6, height: 80, backgroundColor: '#57BB95' }} />

      {/* Logo top-right */}
      {fields.logo_url && (
        <Image src={fields.logo_url} style={{ position: 'absolute', top: 36, right: 50, width: 180, height: 60, objectFit: 'contain' }} />
      )}

      {/* Main content */}
      <View style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, paddingHorizontal: 70, paddingVertical: 70, justifyContent: 'center' }}>
        <View style={{ maxWidth: 680 }}>
          <Text style={{ fontSize: 10, color: '#57BB95', fontFamily: FONT, fontWeight: 600, letterSpacing: 2, marginBottom: 16, textTransform: 'uppercase' }}>
            PROPOSAL · {today}
          </Text>
          <Text style={{ fontSize: 46, color: '#ffffff', fontFamily: FONT, fontWeight: 800, lineHeight: 1.15, marginBottom: 16 }}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ fontSize: 20, color: '#94a3b8', fontFamily: FONT, fontWeight: 400 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Bottom-left: prepared by */}
      {fields.prepared_by ? (
        <View style={{ position: 'absolute', bottom: 28, left: 70 }}>
          <Text style={{ fontSize: 10, color: '#94a3b8', fontFamily: FONT, fontWeight: 600, marginBottom: 2 }}>
            Prepared by {fields.prepared_by}
          </Text>
          {fields.prepared_by_email && fields.prepared_by_email !== fields.prepared_by ? (
            <Text style={{ fontSize: 9, color: '#64748b', fontFamily: FONT, fontWeight: 400 }}>
              {fields.prepared_by_email}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Bottom-right: contract months */}
      {deal?.contract_months ? (
        <View style={{ position: 'absolute', bottom: 36, right: 50 }}>
          <Text style={{ fontSize: 11, color: '#64748b', fontFamily: FONT, fontWeight: 400 }}>
            {deal.contract_months}-Month Contract
          </Text>
        </View>
      ) : null}
    </Page>
  )
}

// ─── Form ────────────────────────────────────────────────────────────────────

export function CoverSlideForm({ fields = {}, onChange, onPickAsset, deal, dealTeam = [] }) {
  const set = (key, val) => onChange({ ...fields, [key]: val })
  const [currentUserName, setCurrentUserName] = useState('')

  // Pre-fill title + subtitle from deal on first load
  useEffect(() => {
    const updates = {}
    if (!fields.title && deal?.name)                                          updates.title    = deal.name
    if (!fields.subtitle && (deal?.company_name || deal?.customers?.name))    updates.subtitle = deal.company_name || deal.customers.name
    if (Object.keys(updates).length > 0) onChange({ ...fields, ...updates })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal?.id])

  useEffect(() => {
    async function fetchUser() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const email = session.user.email

      // 1. Check deal team first
      let name = dealTeam.find(m => m.people?.email === email)?.people?.name

      // 2. Fall back to people table lookup
      if (!name) {
        const { data: person } = await supabase.from('people').select('name').eq('email', email).maybeSingle()
        name = person?.name
      }

      // 3. Last resort: use email as display name
      const displayName = name || email
      setCurrentUserName(displayName)
      if (!fields.prepared_by) {
        onChange({ ...fields, prepared_by: displayName, prepared_by_email: email })
      }
    }
    fetchUser()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealTeam.length])

  // Build options: { value: name, email, label }
  const teamOptions = dealTeam
    .filter(m => m.people?.name)
    .map(m => ({ value: m.people.name, email: m.people.email || '', label: m.people.name }))

  const selfInTeam = teamOptions.some(o => o.value === currentUserName)
  const allOptions = currentUserName && !selfInTeam
    ? [{ value: currentUserName, email: fields.prepared_by_email || '', label: `${currentUserName} (you)` }, ...teamOptions]
    : teamOptions.map(o =>
        o.value === currentUserName ? { ...o, label: `${o.label} (you)` } : o
      )

  function handlePreparedByChange(name) {
    const option = allOptions.find(o => o.value === name)
    onChange({ ...fields, prepared_by: name, prepared_by_email: option?.email || '' })
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Date <span className="font-normal text-gray-400">(leave blank to use today)</span></label>
        <input
          type="date"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          value={fields.date || ''}
          onChange={(e) => set('date', e.target.value)}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Slide Title</label>
        <input
          type="text"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          placeholder="Proposal title"
          value={fields.title || ''}
          onChange={(e) => set('title', e.target.value)}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Subtitle</label>
        <input
          type="text"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          placeholder="Client or company name"
          value={fields.subtitle || ''}
          onChange={(e) => set('subtitle', e.target.value)}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Background Image <span className="font-normal text-gray-400">(optional — overlays on bg color)</span></label>
        <ImagePickerField
          url={fields.bg_image_url}
          onPick={() => onPickAsset('bg_image_url')}
          onRemove={() => set('bg_image_url', '')}
          type="image"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Background Color</label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            className="w-10 h-9 rounded border border-gray-200 cursor-pointer p-0.5"
            value={fields.bg_color || '#17263A'}
            onChange={(e) => set('bg_color', e.target.value)}
          />
          <input
            type="text"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 font-mono"
            value={fields.bg_color || '#17263A'}
            onChange={(e) => set('bg_color', e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Prepared By</label>
        <select
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
          value={fields.prepared_by || ''}
          onChange={(e) => handlePreparedByChange(e.target.value)}
        >
          <option value="">— None —</option>
          {allOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Client Logo (top-right)</label>
        <div className="flex items-center gap-2">
          {fields.logo_url && (
            <img src={fields.logo_url} alt="logo" className="h-10 w-auto rounded border border-gray-200 object-contain bg-gray-50 p-1" />
          )}
          <button
            type="button"
            onClick={() => onPickAsset('logo_url')}
            className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
          >
            {fields.logo_url ? 'Change Image' : 'Choose Image'}
          </button>
          {fields.logo_url && (
            <button type="button" onClick={() => set('logo_url', '')} className="text-xs text-gray-400 hover:text-red-500">Remove</button>
          )}
        </div>
      </div>
    </div>
  )
}
