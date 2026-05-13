import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { FileText, Pencil, History, ChevronDown, ChevronUp } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { supabase } from '../../lib/supabase'
import Card, { CardHeader } from '../ui/Card'
import { Select } from '../ui/Input'
import Input from '../ui/Input'
import Button from '../ui/Button'

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

export default function CommissionRulesCard() {
  const [rules, setRules] = useState([])
  const [loadingRules, setLoadingRules] = useState(true)
  const [showRulesForm, setShowRulesForm] = useState(false)
  const [rulesContent, setRulesContent] = useState('')
  const [rulesEffectiveDate, setRulesEffectiveDate] = useState('')
  const [rulesNote, setRulesNote] = useState('')
  const [savingRules, setSavingRules] = useState(false)
  const [showRulesHistory, setShowRulesHistory] = useState(false)

  useEffect(() => { loadRules() }, [])

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

    await supabase.from('commission_rules_history').update({ status: 'superseded' }).eq('status', 'active')
    await supabase.from('commission_rules_history').insert({
      content: rulesContent.trim(),
      effective_date: rulesEffectiveDate,
      status: 'active',
      note: rulesNote || null,
      created_by: session?.user?.email || null,
    })
    await supabase.from('audit_log').insert([{
      deal_id: null, table_name: 'event', action: 'event',
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

  const quarterPresets = nextQuarterPresets()
  const active = rules.find((r) => r.status === 'active')
  const pastRules = rules.filter((r) => r.status === 'superseded')

  return (
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
      {!loadingRules && (
        !active ? (
          <p className="text-sm text-gray-400 py-4 text-center">No rules document yet.</p>
        ) : (
          <div>
            <p className="text-xs text-gray-400 mb-4">
              Effective {format(new Date(active.effective_date + 'T12:00:00'), 'MMM d, yyyy')}
              {active.created_by && ` · Updated by ${active.created_by.split('@')[0]}`}
              {active.note && ` · ${active.note}`}
            </p>
            <ReactMarkdown components={MD_COMPONENTS}>{active.content}</ReactMarkdown>
          </div>
        )
      )}

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
              <Select value={rulesEffectiveDate} onChange={(e) => setRulesEffectiveDate(e.target.value)} className="w-full">
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
            <Button onClick={handleSaveRules} loading={savingRules} disabled={!rulesContent.trim() || !rulesEffectiveDate}>
              Save Version
            </Button>
            <Button variant="secondary" onClick={() => setShowRulesForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Version history */}
      {pastRules.length > 0 && (
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
              {pastRules.map((r) => (
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
  )
}
