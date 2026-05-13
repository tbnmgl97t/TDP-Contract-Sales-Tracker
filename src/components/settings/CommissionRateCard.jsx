import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Clock, CheckCircle2, History } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Card, { CardHeader } from '../ui/Card'
import Input from '../ui/Input'
import { Select } from '../ui/Input'
import Button from '../ui/Button'

function nextQuarterPresets() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const currentQ = Math.floor(month / 3)
  const presets = []
  for (let i = 1; i <= 4; i++) {
    const futureQ = (currentQ + i) % 4
    const futureYear = year + Math.floor((currentQ + i) / 4)
    const date = new Date(futureYear, futureQ * 3, 1)
    presets.push({
      label: `Q${futureQ + 1} ${futureYear} — ${format(date, 'MMM d')}`,
      value: format(date, 'yyyy-MM-dd'),
    })
  }
  return presets
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function fmtRate(rate) {
  return (parseFloat(rate) * 100).toFixed(2) + '%'
}

export default function CommissionRateCard() {
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newRate, setNewRate] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [scheduleNote, setScheduleNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(null)

  useEffect(() => { loadHistory() }, [])

  async function loadHistory() {
    setLoadingHistory(true)
    const { data } = await supabase
      .from('commission_rate_history')
      .select('*')
      .order('effective_date', { ascending: false })
    setHistory(data || [])
    setLoadingHistory(false)
  }

  async function handleSchedule() {
    if (!newRate || !effectiveDate) return
    setSaving(true)

    const { data: { session } } = await supabase.auth.getSession()
    const rate = parseFloat(newRate) / 100
    const isImmediate = effectiveDate <= todayStr()
    const activeRate = history.find((h) => h.status === 'active')

    if (isImmediate) {
      await supabase.from('commission_rate_history').update({ status: 'superseded' }).eq('status', 'active')
      await supabase.from('commission_rate_history').insert({
        rate, effective_date: effectiveDate, status: 'active',
        note: scheduleNote || null, created_by: session?.user?.email || null,
        applied_at: new Date().toISOString(),
      })
      await supabase.from('commission_settings').upsert({ id: 1, global_commission_rate: rate, updated_at: new Date().toISOString() })
      await supabase.from('audit_log').insert([{
        deal_id: null, table_name: 'commission_settings', record_id: 'global', action: 'update',
        changed_by: session?.user?.email || null,
        old_values: activeRate ? { rate: activeRate.rate } : null,
        new_values: { rate, effective_date: effectiveDate },
        description: `Commission rate changed from ${activeRate ? fmtRate(activeRate.rate) : '—'} to ${fmtRate(rate)}`,
      }])
    } else {
      await supabase.from('commission_rate_history').insert({
        rate, effective_date: effectiveDate, status: 'scheduled',
        note: scheduleNote || null, created_by: session?.user?.email || null,
      })
      await supabase.from('audit_log').insert([{
        deal_id: null, table_name: 'commission_settings', record_id: 'global', action: 'update',
        changed_by: session?.user?.email || null,
        new_values: { rate, effective_date: effectiveDate },
        description: `Commission rate change scheduled: ${fmtRate(rate)} effective ${format(new Date(effectiveDate + 'T12:00:00'), 'MMM d, yyyy')}`,
      }])
    }

    await loadHistory()
    setShowForm(false)
    setNewRate('')
    setEffectiveDate('')
    setScheduleNote('')
    setSaving(false)
  }

  async function handleCancelScheduled(id) {
    setCancelling(id)
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('commission_rate_history').update({ status: 'superseded' }).eq('id', id)
    await supabase.from('audit_log').insert([{
      deal_id: null, table_name: 'commission_settings', record_id: 'global', action: 'update',
      changed_by: session?.user?.email || null,
      description: 'Scheduled commission rate change cancelled',
    }])
    await loadHistory()
    setCancelling(null)
  }

  const activeRate = history.find((h) => h.status === 'active')
  const scheduled = history.filter((h) => h.status === 'scheduled').sort((a, b) => a.effective_date.localeCompare(b.effective_date))
  const past = history.filter((h) => h.status === 'superseded')
  const today = todayStr()
  const isImmediate = effectiveDate && effectiveDate <= today
  const quarterPresets = nextQuarterPresets()

  return (
    <Card>
      <CardHeader
        title="Global Commission Rate"
        subtitle="Applied to all products unless overridden per product. Locked in at deal contracting."
      />

      {/* Current active rate */}
      {!loadingHistory && activeRate ? (
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 size={18} className="text-primary-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-navy-900">{fmtRate(activeRate.rate)}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Effective {format(new Date(activeRate.effective_date + 'T12:00:00'), 'MMM d, yyyy')}
                {activeRate.created_by && ` · Set by ${activeRate.created_by.split('@')[0]}`}
                {activeRate.note && ` · ${activeRate.note}`}
              </p>
            </div>
          </div>
          {!showForm && (
            <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>
              Schedule Change
            </Button>
          )}
        </div>
      ) : !loadingHistory && !showForm && (
        <div className="flex items-center justify-between mb-5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm text-amber-700">No commission rate set yet.</p>
          <Button variant="secondary" size="sm" onClick={() => { setShowForm(true); setEffectiveDate(todayStr()) }}>
            Set Initial Rate
          </Button>
        </div>
      )}

      {/* Scheduled changes */}
      {scheduled.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Scheduled</p>
          <div className="space-y-2">
            {scheduled.map((h) => (
              <div key={h.id} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <Clock size={15} className="text-amber-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-navy-900">{fmtRate(h.rate)}</p>
                    <p className="text-xs text-gray-500">
                      {format(new Date(h.effective_date + 'T12:00:00'), 'MMM d, yyyy')}
                      {h.created_by && ` · Scheduled by ${h.created_by.split('@')[0]}`}
                      {h.note && ` · ${h.note}`}
                    </p>
                  </div>
                </div>
                <Button variant="danger" size="sm" loading={cancelling === h.id} onClick={() => handleCancelScheduled(h.id)}>
                  Cancel
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Schedule form */}
      {showForm && (
        <div className="border border-gray-200 rounded-xl p-4 mb-5 space-y-4 bg-gray-50/50">
          <p className="text-sm font-semibold text-navy-900">Schedule Rate Change</p>
          <div className="flex flex-wrap gap-3 items-end">
            <Input
              label="New Rate"
              type="number" step="0.01" min="0" max="100" suffix="%"
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
              className="w-36"
            />
            <div className="flex-1 min-w-[200px]">
              <p className="text-xs font-medium text-gray-700 mb-1.5">Effective Date</p>
              <Select value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="w-full">
                <option value="">Select date…</option>
                <option value={today}>Immediately (today)</option>
                {quarterPresets.map((q) => (
                  <option key={q.value} value={q.value}>{q.label}</option>
                ))}
              </Select>
            </div>
          </div>
          <Input
            label="Note (optional)"
            value={scheduleNote}
            onChange={(e) => setScheduleNote(e.target.value)}
            placeholder="e.g. Approved by leadership — Q3 review"
          />
          <div className="flex gap-2">
            <Button onClick={handleSchedule} loading={saving} disabled={!newRate || !effectiveDate}>
              {isImmediate ? 'Apply Now' : 'Schedule'}
            </Button>
            <Button variant="secondary" onClick={() => { setShowForm(false); setNewRate(''); setEffectiveDate(''); setScheduleNote('') }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Rate history */}
      {past.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <History size={12} />
            History
          </p>
          <div className="space-y-0">
            {past.slice(0, 8).map((h) => (
              <div key={h.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-400">{fmtRate(h.rate)}</span>
                  <span className="text-xs text-gray-300">·</span>
                  <span className="text-xs text-gray-400">
                    {format(new Date(h.effective_date + 'T12:00:00'), 'MMM d, yyyy')}
                    {h.note && ` — ${h.note}`}
                  </span>
                </div>
                {h.created_by && (
                  <span className="text-xs text-gray-400">{h.created_by.split('@')[0]}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
