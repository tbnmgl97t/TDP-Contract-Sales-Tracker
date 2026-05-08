import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import Card, { CardHeader } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import SlideZoneEditor from '../components/SlideZoneEditor'
import Spinner from '../components/ui/Spinner'
import { Plus, Pencil, Trash2, GripVertical, Eye, EyeOff } from 'lucide-react'

export default function ProposalSlides() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [editModal, setEditModal] = useState(null)  // { template, zones } or null
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef(null)

  async function load() {
    setLoading(true)
    const { data: tmplData } = await supabase
      .from('proposal_slide_templates')
      .select('*')
      .order('sort_order')
    const { data: zoneData } = await supabase
      .from('proposal_slide_zones')
      .select('*')
      .order('sort_order')
    const templatesWithZones = (tmplData || []).map((t) => ({
      ...t,
      zones: (zoneData || []).filter((z) => z.template_id === t.id),
    }))
    setTemplates(templatesWithZones)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function uploadTemplate(file) {
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `templates/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('proposal-slides').upload(path, file, { upsert: false })
    if (uploadError) { alert('Upload failed: ' + uploadError.message); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('proposal-slides').getPublicUrl(path)
    const { data: tmpl, error: insertError } = await supabase
      .from('proposal_slide_templates')
      .insert({ name: file.name.replace(/\.[^.]+$/, ''), image_url: publicUrl, image_path: path, sort_order: templates.length })
      .select()
      .single()
    if (insertError) { alert('Failed to save template: ' + insertError.message); setUploading(false); return }
    setUploading(false)
    setEditModal({ template: tmpl, zones: [] })
    load()
  }

  async function saveZones(template, zones) {
    setSaving(true)
    // Delete all existing zones for this template, then re-insert
    await supabase.from('proposal_slide_zones').delete().eq('template_id', template.id)
    if (zones.length > 0) {
      const rows = zones.map((z, i) => ({
        template_id: template.id,
        label: z.label,
        x_pct: z.x_pct,
        y_pct: z.y_pct,
        w_pct: z.w_pct,
        h_pct: z.h_pct,
        font_size: z.font_size,
        font_color: z.font_color,
        font_weight: z.font_weight,
        text_align: z.text_align,
        default_text: z.default_text || '',
        sort_order: i,
      }))
      const { error } = await supabase.from('proposal_slide_zones').insert(rows)
      if (error) { alert('Failed to save zones: ' + error.message); setSaving(false); return }
    }
    // Save updated template name
    await supabase.from('proposal_slide_templates').update({ name: editModal.template.name, updated_at: new Date().toISOString() }).eq('id', template.id)
    setSaving(false)
    setEditModal(null)
    load()
  }

  async function toggleActive(template) {
    await supabase.from('proposal_slide_templates').update({ is_active: !template.is_active }).eq('id', template.id)
    load()
  }

  async function deleteTemplate(template) {
    if (!confirm(`Delete "${template.name}"? This cannot be undone.`)) return
    await supabase.from('proposal_slide_templates').delete().eq('id', template.id)
    await supabase.storage.from('proposal-slides').remove([template.image_path])
    load()
  }

  async function moveTemplate(index, dir) {
    const updated = [...templates]
    const target = index + dir
    if (target < 0 || target >= updated.length) return
    ;[updated[index], updated[target]] = [updated[target], updated[index]]
    setTemplates(updated)
    await Promise.all(updated.map((t, i) =>
      supabase.from('proposal_slide_templates').update({ sort_order: i }).eq('id', t.id)
    ))
  }

  if (loading) return <div className="flex justify-center p-12"><Spinner /></div>

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Proposal Slide Templates"
          subtitle="Upload slide backgrounds, define editable text zones, and manage the slide library."
          action={
            <>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" className="hidden"
                onChange={(e) => { if (e.target.files[0]) uploadTemplate(e.target.files[0]); e.target.value = '' }} />
              <Button icon={<Plus size={14} />} loading={uploading} onClick={() => fileInputRef.current?.click()}>
                Upload Template
              </Button>
            </>
          }
        />

        {templates.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            No templates yet. Upload a PNG or JPG to get started.
          </div>
        )}

        <div className="space-y-3">
          {templates.map((template, i) => (
            <div key={template.id} className={`flex items-center gap-3 p-3 rounded-xl border ${template.is_active ? 'border-gray-200' : 'border-gray-100 opacity-50'}`}>
              <button className="text-gray-300 cursor-grab" title="Drag to reorder" onClick={() => {}}>
                <GripVertical size={16} />
              </button>
              <img src={template.image_url} alt={template.name} className="w-20 h-14 object-cover rounded-lg border border-gray-100 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-navy-900 text-sm truncate">{template.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{template.zones?.length || 0} zone{(template.zones?.length || 0) !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleActive(template)} className="p-1.5 text-gray-400 hover:text-navy-900 rounded-lg hover:bg-gray-100 transition-colors" title={template.is_active ? 'Deactivate' : 'Activate'}>
                  {template.is_active ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
                <button onClick={() => setEditModal({ template, zones: template.zones || [] })} className="p-1.5 text-gray-400 hover:text-navy-900 rounded-lg hover:bg-gray-100 transition-colors" title="Edit zones">
                  <Pencil size={15} />
                </button>
                <button onClick={() => deleteTemplate(template)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors" title="Delete">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Zone Editor Modal */}
      {editModal && (
        <Modal
          open={true}
          onClose={() => setEditModal(null)}
          title={`Edit Template: ${editModal.template.name}`}
          size="full"
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditModal(null)}>Cancel</Button>
              <Button loading={saving} onClick={() => saveZones(editModal.template, editModal.zones)}>Save Zones</Button>
            </>
          }
        >
          <div className="mb-4">
            <Input
              label="Template Name"
              value={editModal.template.name}
              onChange={(e) => setEditModal((prev) => ({ ...prev, template: { ...prev.template, name: e.target.value } }))}
            />
          </div>
          <SlideZoneEditor
            imageUrl={editModal.template.image_url}
            zones={editModal.zones}
            onChange={(zones) => setEditModal((prev) => ({ ...prev, zones }))}
          />
        </Modal>
      )}
    </div>
  )
}
