import { useEffect, useRef, useState } from 'react'
import { Canvas, Rect, Text as FabricText, FabricImage } from 'fabric'
import Button from './ui/Button'
import Input from './ui/Input'
import { Select } from './ui/Input'
import { Trash2, Plus } from 'lucide-react'

// SLIDE_W / SLIDE_H = canvas display size (not PDF size)
// 16:9 landscape to match 1920×1080 slide designs
const CANVAS_W = 640
const CANVAS_H = 360

export default function SlideZoneEditor({ imageUrl, zones, onChange }) {
  const canvasRef = useRef(null)
  const fabricRef = useRef(null)
  const zonesRef = useRef(zones)
  const onChangeRef = useRef(onChange)
  const [selectedZoneId, setSelectedZoneId] = useState(null)
  // zones: array of { id, label, x_pct, y_pct, w_pct, h_pct, font_size, font_color, font_weight, text_align, default_text, sort_order }
  // onChange: (updatedZones) => void

  // Keep refs in sync
  useEffect(() => { zonesRef.current = zones }, [zones])
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  // Initialize Fabric canvas once
  useEffect(() => {
    const canvas = new Canvas(canvasRef.current, {
      width: CANVAS_W,
      height: CANVAS_H,
      selection: true,
    })
    fabricRef.current = canvas

    // Load background image (Fabric v7 async API)
    if (imageUrl) {
      FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' }).then((img) => {
        // Scale image to fit canvas maintaining aspect ratio
        const scale = Math.min(CANVAS_W / img.width, CANVAS_H / img.height)
        const scaledW = img.width * scale
        const scaledH = img.height * scale
        img.set({
          left: (CANVAS_W - scaledW) / 2,
          top: (CANVAS_H - scaledH) / 2,
          originX: 'left',
          originY: 'top',
          scaleX: scale,
          scaleY: scale,
          selectable: false,
          evented: false,
        })
        canvas.backgroundImage = img
        canvas.requestRenderAll()
      }).catch((err) => {
        console.warn('Background image load failed:', err)
      })
    }

    // When a rect is selected/deselected, sync selectedZoneId
    canvas.on('selection:created', (e) => {
      setSelectedZoneId(e.selected[0]?.zoneId || null)
    })
    canvas.on('selection:updated', (e) => {
      setSelectedZoneId(e.selected[0]?.zoneId || null)
    })
    canvas.on('selection:cleared', () => setSelectedZoneId(null))

    // When a rect is moved/resized, update zone data
    canvas.on('object:modified', (e) => {
      const rect = e.target
      if (!rect?.zoneId) return
      const scaleX = rect.scaleX || 1
      const scaleY = rect.scaleY || 1
      const updatedZones = zonesRef.current.map((z) =>
        z.id === rect.zoneId
          ? {
              ...z,
              x_pct: (rect.left / CANVAS_W) * 100,
              y_pct: (rect.top / CANVAS_H) * 100,
              w_pct: ((rect.width * scaleX) / CANVAS_W) * 100,
              h_pct: ((rect.height * scaleY) / CANVAS_H) * 100,
            }
          : z
      )
      onChangeRef.current(updatedZones)
    })

    return () => canvas.dispose()
  }, [imageUrl]) // intentionally only on mount / imageUrl change

  // Sync zones → fabric rects only when layout changes (position/size/label)
  // NOT when text content (default_text, font_size, etc.) changes — avoids focus stealing
  const layoutKey = zones.map((z) => `${z.id}|${z.x_pct}|${z.y_pct}|${z.w_pct}|${z.h_pct}|${z.label}`).join('||')
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    // Remove existing zone rects and text labels
    const toRemove = canvas.getObjects().filter((o) => o.zoneId)
    toRemove.forEach((o) => canvas.remove(o))

    // Redraw all zones
    zones.forEach((zone) => {
      const rect = new Rect({
        left: (zone.x_pct / 100) * CANVAS_W,
        top: (zone.y_pct / 100) * CANVAS_H,
        width: (zone.w_pct / 100) * CANVAS_W,
        height: (zone.h_pct / 100) * CANVAS_H,
        fill: 'rgba(87,187,149,0.15)',
        stroke: '#57BB95',
        strokeWidth: 2,
        strokeDashArray: [4, 4],
        cornerColor: '#57BB95',
        cornerSize: 8,
        transparentCorners: false,
      })
      rect.zoneId = zone.id
      const label = new FabricText(zone.label || 'Zone', {
        left: (zone.x_pct / 100) * CANVAS_W + 4,
        top: (zone.y_pct / 100) * CANVAS_H + 4,
        fontSize: 11,
        fill: '#57BB95',
        fontFamily: 'sans-serif',
        selectable: false,
        evented: false,
      })
      label.zoneId = `label-${zone.id}`
      canvas.add(rect)
      canvas.add(label)
    })
    canvas.renderAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey])

  function addZone() {
    const newZone = {
      id: `new-${Date.now()}`,
      label: `Zone ${zones.length + 1}`,
      x_pct: 10,
      y_pct: 10,
      w_pct: 40,
      h_pct: 15,
      font_size: 24,
      font_color: '#17263A',
      font_weight: 'normal',
      text_align: 'left',
      default_text: '',
      sort_order: zones.length,
    }
    onChange([...zones, newZone])
  }

  function updateZone(id, patch) {
    onChange(zones.map((z) => (z.id === id ? { ...z, ...patch } : z)))
  }

  function deleteZone(id) {
    onChange(zones.filter((z) => z.id !== id))
    setSelectedZoneId(null)
  }

  return (
    <div className="flex gap-4">
      {/* Canvas */}
      <div className="flex-shrink-0">
        <canvas ref={canvasRef} tabIndex={-1} style={{ border: '1px solid #e5e7eb', borderRadius: 8, display: 'block', outline: 'none' }} />
        <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={addZone} className="mt-2">
          Add Zone
        </Button>
      </div>

      {/* Zone list + selected zone editor */}
      <div className="flex-1 min-w-0 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Zones</p>
        {zones.length === 0 && (
          <p className="text-sm text-gray-400">No zones yet. Click &quot;Add Zone&quot; then drag to position.</p>
        )}
        {zones.map((zone) => (
          <div
            key={zone.id}
            className={`border rounded-lg p-3 cursor-pointer transition-colors ${selectedZoneId === zone.id ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}
            onClick={() => {
              setSelectedZoneId(zone.id)
              // Select matching rect on canvas
              const canvas = fabricRef.current
              const rect = canvas?.getObjects().find((r) => r.zoneId === zone.id && r.type === 'rect')
              if (rect) { canvas.setActiveObject(rect); canvas.renderAll() }
            }}
          >
            <div className="flex items-center justify-between">
              <Input
                value={zone.label}
                onChange={(e) => updateZone(zone.id, { label: e.target.value })}
                className="flex-1 mr-2"
                placeholder="Zone label"
                onClick={(e) => e.stopPropagation()}
              />
              <button onClick={(e) => { e.stopPropagation(); deleteZone(zone.id) }} className="p-1 text-gray-400 hover:text-red-500">
                <Trash2 size={14} />
              </button>
            </div>
            {selectedZoneId === zone.id && (
              <div className="mt-3 grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
                <Input label="Font size" type="number" value={zone.font_size} onChange={(e) => updateZone(zone.id, { font_size: parseInt(e.target.value) || 24 })} />
                <Input label="Font color" type="color" value={zone.font_color} onChange={(e) => updateZone(zone.id, { font_color: e.target.value })} />
                <Select label="Weight" value={zone.font_weight} onChange={(e) => updateZone(zone.id, { font_weight: e.target.value })}>
                  <option value="normal">Normal</option>
                  <option value="bold">Bold</option>
                </Select>
                <Select label="Align" value={zone.text_align} onChange={(e) => updateZone(zone.id, { text_align: e.target.value })}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </Select>
                <Input label="Default text" value={zone.default_text} onChange={(e) => updateZone(zone.id, { default_text: e.target.value })} className="col-span-2" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
