import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Sparkles, Clock, CheckCircle2, History, ChevronDown, ChevronUp, FileText, Pencil } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

const MD_COMPONENTS = {
  h2: ({ children }) => <h2 className="text-base font-semibold text-navy-900 mt-5 mb-2 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold text-navy-800 mt-4 mb-1.5">{children}</h3>,
  p:  ({ children }) => <p className="text-sm text-gray-700 leading-relaxed mb-2">{children}</p>,
  ul: ({ children }) => <ul className="space-y-1 mb-2 ml-1">{children}</ul>,
  li: ({ children }) => (
    <li className="flex items-start gap-2 text-sm text-gray-700">
      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-400 flex-shrink-0" />
      <span className="leading-relaxed">{children}</span>
    </li>
  ),
  strong: ({ children }) => <strong className="font-semibold text-navy-800">{children}</strong>,
  hr: () => <hr className="border-gray-100 my-4" />,
}

const MD_COMPONENTS_MUTED = {
  ...MD_COMPONENTS,
  h2: ({ children }) => <h2 className="text-sm font-semibold text-gray-600 mt-4 mb-1.5 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="text-xs font-semibold text-gray-500 mt-3 mb-1">{children}</h3>,
  p:  ({ children }) => <p className="text-sm text-gray-500 leading-relaxed mb-1.5">{children}</p>,
  li: ({ children }) => (
    <li className="flex items-start gap-2 text-sm text-gray-500">
      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
      <span className="leading-relaxed">{children}</span>
    </li>
  ),
  strong: ({ children }) => <strong className="font-semibold text-gray-600">{children}</strong>,
}
import { supabase } from '../lib/supabase'
import Card, { CardHeader } from '../components/ui/Card'
import Input from '../components/ui/Input'
import { Select } from '../components/ui/Input'
import Button from '../components/ui/Button'
import ProposalSlides from './ProposalSlides'

const INPUT_COST_PER_M = 3.0
const OUTPUT_COST_PER_M = 15.0

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

export default function Settings() {
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [newRate, setNewRate] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [scheduleNote, setScheduleNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(null)

  const [aiUsage, setAiUsage] = useState(null)
  const [showSlides, setShowSlides] = useState(true)

  // Rules state
  const [rules, setRules] = useState([])
  const [loadingRules, setLoadingRules] = useState(true)
  const [showRulesForm, setShowRulesForm] = useState(false)
  const [rulesContent, setRulesContent] = useState('')
  const [rulesEffectiveDate, setRulesEffectiveDate] = useState('')
  const [rulesNote, setRulesNote] = useState('')
  const [savingRules, setSavingRules] = useState(false)
  const [showRulesHistory, setShowRulesHistory] = useState(false)

  useEffect(() => {
    loadHistory()
    loadRules()

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    supabase.from('ai_usage_log').select('input_tokens, output_tokens, cost_usd, operation, created_at')
      .then(({ data }) => {
        if (!data) return
        const thisMonth = data.filter((r) => r.created_at >= monthStart)
        const sum = (arr, key) => arr.reduce((s, r) => s + (Number(r[key]) || 0), 0)
        setAiUsage({
          allTime: { calls: data.length, cost: sum(data, 'cost_usd'), inputTokens: sum(data, 'input_tokens'), outputTokens: sum(data, 'output_tokens') },
          thisMonth: { calls: thisMonth.length, cost: sum(thisMonth, 'cost_usd'), inputTokens: sum(thisMonth, 'input_tokens'), outputTokens: sum(thisMonth, 'output_tokens') },
          byOp: {
            extract: data.filter((r) => r.operation === 'extract').length,
            chat: data.filter((r) => r.operation === 'chat').length,
          },
        })
      })
  }, [])

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
      // Supersede current active rate
      await supabase.from('commission_rate_history')
        .update({ status: 'superseded' })
        .eq('status', 'active')

      // Insert new active row
      await supabase.from('commission_rate_history').insert({
        rate,
        effective_date: effectiveDate,
        status: 'active',
        note: scheduleNote || null,
        created_by: session?.user?.email || null,
        applied_at: new Date().toISOString(),
      })

      // Sync commission_settings
      await supabase.from('commission_settings')
        .upsert({ id: 1, global_commission_rate: rate, updated_at: new Date().toISOString() })

      // Audit log
      await supabase.from('audit_log').insert([{
        deal_id: null,
        table_name: 'commission_settings',
        record_id: 'global',
        action: 'update',
        changed_by: session?.user?.email || null,
        old_values: activeRate ? { rate: activeRate.rate } : null,
        new_values: { rate, effective_date: effectiveDate },
        description: `Commission rate changed from ${activeRate ? fmtRate(activeRate.rate) : '—'} to ${fmtRate(rate)}`,
      }])
    } else {
      // Insert scheduled row
      await supabase.from('commission_rate_history').insert({
        rate,
        effective_date: effectiveDate,
        status: 'scheduled',
        note: scheduleNote || null,
        created_by: session?.user?.email || null,
      })

      // Audit log
      await supabase.from('audit_log').insert([{
        deal_id: null,
        table_name: 'commission_settings',
        record_id: 'global',
        action: 'update',
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
    await supabase.from('commission_rate_history')
      .update({ status: 'superseded' })
      .eq('id', id)
    await supabase.from('audit_log').insert([{
      deal_id: null,
      table_name: 'commission_settings',
      record_id: 'global',
      action: 'update',
      changed_by: session?.user?.email || null,
      description: 'Scheduled commission rate change cancelled',
    }])
    await loadHistory()
    setCancelling(null)
  }

  async function loadRules() {
    setLoadingRules(true)
    const { data } = await supabase
      .from('commission_rules_history')
      .select('*')
      .order('effective_date', { ascending: false })
    setRules(data || [])
    setLoadingRules(false)
  }

  async function handleSaveRules() {
    if (!rulesContent.trim() || !rulesEffectiveDate) return
    setSavingRules(true)
    const { data: { session } } = await supabase.auth.getSession()

    await supabase.from('commission_rules_history')
      .update({ status: 'superseded' })
      .eq('status', 'active')

    await supabase.from('commission_rules_history').insert({
      content: rulesContent.trim(),
      effective_date: rulesEffectiveDate,
      status: 'active',
      note: rulesNote || null,
      created_by: session?.user?.email || null,
    })

    await supabase.from('audit_log').insert([{
      deal_id: null,
      table_name: 'event',
      action: 'event',
      changed_by: session?.user?.email || null,
      description: `Commission rules updated — effective ${format(new Date(rulesEffectiveDate + 'T12:00:00'), 'MMM d, yyyy')}${rulesNote ? ` · ${rulesNote}` : ''}`,
    }])

    await loadRules()
    setShowRulesForm(false)
    setRulesContent('')
    setRulesEffectiveDate('')
    setRulesNote('')
    setSavingRules(false)
  }

  const activeRate = history.find((h) => h.status === 'active')
  const scheduled = history.filter((h) => h.status === 'scheduled').sort((a, b) => a.effective_date.localeCompare(b.effective_date))
  const past = history.filter((h) => h.status === 'superseded')
  const today = todayStr()
  const isImmediate = effectiveDate && effectiveDate <= today
  const quarterPresets = nextQuarterPresets()

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-navy-900">Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">Commission plan rules and system reference.</p>
      </div>

      {/* Commission Rate */}
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
                  <Button
                    variant="danger"
                    size="sm"
                    loading={cancelling === h.id}
                    onClick={() => handleCancelScheduled(h.id)}
                  >
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
                type="number"
                step="0.01"
                min="0"
                max="100"
                suffix="%"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                className="w-36"
              />
              <div className="flex-1 min-w-[200px]">
                <p className="text-xs font-medium text-gray-700 mb-1.5">Effective Date</p>
                <Select
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="w-full"
                >
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
              <Button
                onClick={handleSchedule}
                loading={saving}
                disabled={!newRate || !effectiveDate}
              >
                {isImmediate ? 'Apply Now' : 'Schedule'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => { setShowForm(false); setNewRate(''); setEffectiveDate(''); setScheduleNote('') }}
              >
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

      {/* AI Usage */}
      <Card>
        <CardHeader
          title={<span className="flex items-center gap-2"><Sparkles size={15} className="text-primary-400" />Claude AI Usage</span>}
          subtitle="Cost tracking for Deal Brain — claude-sonnet-4-6"
        />
        {aiUsage ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'This Month', value: `$${aiUsage.thisMonth.cost.toFixed(4)}`, sub: `${aiUsage.thisMonth.calls} calls` },
                { label: 'All Time', value: `$${aiUsage.allTime.cost.toFixed(4)}`, sub: `${aiUsage.allTime.calls} total calls` },
                { label: 'Extractions', value: aiUsage.byOp.extract, sub: 'contract analyses' },
                { label: 'Chat Messages', value: aiUsage.byOp.chat, sub: 'Deal Brain messages' },
              ].map(({ label, value, sub }) => (
                <div key={label} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 font-medium">{label}</p>
                  <p className="text-lg font-bold text-navy-900 mt-0.5">{value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-2 text-xs text-gray-500">
              <div>
                <span className="font-medium">All-time tokens:</span>{' '}
                {aiUsage.allTime.inputTokens.toLocaleString()} in / {aiUsage.allTime.outputTokens.toLocaleString()} out
              </div>
              <div>
                <span className="font-medium">Pricing:</span>{' '}
                ${INPUT_COST_PER_M}/M input · ${OUTPUT_COST_PER_M}/M output
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 py-4 text-center">No AI usage recorded yet.</p>
        )}
      </Card>

      {/* Proposal Slides */}
      <Card>
        <CardHeader
          title="Proposal Slides"
          subtitle="Manage slide templates used in deal proposals."
          action={<Button variant="secondary" onClick={() => setShowSlides(!showSlides)}>{showSlides ? 'Hide' : 'Manage Slides'}</Button>}
        />
        {showSlides && <ProposalSlides />}
      </Card>

      {/* Commission Rules */}
      <Card>
        <CardHeader
          title={<span className="flex items-center gap-2"><FileText size={15} className="text-gray-400" />Commission Plan</span>}
          subtitle="Versioned rules document — full history preserved"
          action={
            !showRulesForm && (
              <Button
                variant="secondary"
                size="sm"
                icon={<Pencil size={13} />}
                onClick={() => {
                  const active = rules.find((r) => r.status === 'active')
                  setRulesContent(active?.content || '')
                  setRulesEffectiveDate(todayStr())
                  setRulesNote('')
                  setShowRulesForm(true)
                }}
              >
                Update
              </Button>
            )
          }
        />

        {/* Current active version */}
        {!loadingRules && (() => {
          const active = rules.find((r) => r.status === 'active')
          if (!active) return (
            <p className="text-sm text-gray-400 py-4 text-center">No rules document yet.</p>
          )
          return (
            <div>
              <p className="text-xs text-gray-400 mb-4">
                Effective {format(new Date(active.effective_date + 'T12:00:00'), 'MMM d, yyyy')}
                {active.created_by && ` · Updated by ${active.created_by.split('@')[0]}`}
                {active.note && ` · ${active.note}`}
              </p>
              <div>
                <ReactMarkdown components={MD_COMPONENTS}>{active.content}</ReactMarkdown>
              </div>
            </div>
          )
        })()}

        {/* Edit form */}
        {showRulesForm && (
          <div className="border border-gray-200 rounded-xl p-4 mt-4 space-y-3 bg-gray-50/50">
            <p className="text-sm font-semibold text-navy-900">Update Commission Plan</p>
            <div>
              <p className="text-xs font-medium text-gray-700 mb-1.5">Document (Markdown supported)</p>
              <textarea
                value={rulesContent}
                onChange={(e) => setRulesContent(e.target.value)}
                rows={20}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent resize-y bg-white"
                placeholder="Paste your commission plan here…"
              />
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <p className="text-xs font-medium text-gray-700 mb-1.5">Effective Date</p>
                <Select
                  value={rulesEffectiveDate}
                  onChange={(e) => setRulesEffectiveDate(e.target.value)}
                  className="w-full"
                >
                  <option value="">Select date…</option>
                  <option value={todayStr()}>Immediately (today)</option>
                  {quarterPresets.map((q) => (
                    <option key={q.value} value={q.value}>{q.label}</option>
                  ))}
                </Select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <Input
                  label="Approval note (optional)"
                  value={rulesNote}
                  onChange={(e) => setRulesNote(e.target.value)}
                  placeholder="e.g. Approved by exec team Q3 2026"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSaveRules}
                loading={savingRules}
                disabled={!rulesContent.trim() || !rulesEffectiveDate}
              >
                Save Version
              </Button>
              <Button variant="secondary" onClick={() => setShowRulesForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Version history */}
        {rules.filter((r) => r.status === 'superseded').length > 0 && (
          <div className="mt-5 border-t border-gray-100 pt-4">
            <button
              onClick={() => setShowRulesHistory((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-600 transition-colors"
            >
              <History size={12} />
              Previous Versions
              {showRulesHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showRulesHistory && (
              <div className="mt-3 space-y-3">
                {rules.filter((r) => r.status === 'superseded').map((r) => (
                  <details key={r.id} className="group border border-gray-100 rounded-xl overflow-hidden">
                    <summary className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-gray-50 list-none">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500">
                          {format(new Date(r.effective_date + 'T12:00:00'), 'MMM d, yyyy')}
                        </span>
                        {r.note && <span className="text-xs text-gray-400">— {r.note}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {r.created_by && <span className="text-xs text-gray-400">{r.created_by.split('@')[0]}</span>}
                        <ChevronDown size={13} className="text-gray-400 group-open:hidden" />
                        <ChevronUp size={13} className="text-gray-400 hidden group-open:block" />
                      </div>
                    </summary>
                    <div className="px-4 pb-4 pt-2 border-t border-gray-100">
                      <ReactMarkdown components={MD_COMPONENTS_MUTED}>{r.content}</ReactMarkdown>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
