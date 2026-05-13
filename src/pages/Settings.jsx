import { useState, useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Card, { CardHeader } from '../components/ui/Card'
import Button from '../components/ui/Button'
import CommissionRateCard from '../components/settings/CommissionRateCard'
import CommissionRulesCard from '../components/settings/CommissionRulesCard'
import ProposalSlides from './ProposalSlides'

const INPUT_COST_PER_M = 3.0
const OUTPUT_COST_PER_M = 15.0

export default function Settings() {
  const [aiUsage, setAiUsage] = useState(null)
  const [showSlides, setShowSlides] = useState(true)

  useEffect(() => {
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

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-navy-900">Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">Commission plan rules and system reference.</p>
      </div>

      <CommissionRateCard />

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

      <CommissionRulesCard />
    </div>
  )
}
