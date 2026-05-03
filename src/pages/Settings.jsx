import { useState, useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Card, { CardHeader } from '../components/ui/Card'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'

const INPUT_COST_PER_M = 3.0
const OUTPUT_COST_PER_M = 15.0

export default function Settings() {
  const [rate, setRate] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedRate, setSavedRate] = useState('')
  const [aiUsage, setAiUsage] = useState(null)

  useEffect(() => {
    supabase.from('commission_settings').select('global_commission_rate').eq('id', 1).single()
      .then(({ data }) => {
        if (data) {
          setRate((parseFloat(data.global_commission_rate) * 100).toFixed(2))
          setSavedRate((parseFloat(data.global_commission_rate) * 100).toFixed(2))
        }
      })

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

  async function handleSave() {
    setSaving(true)
    const newRate = parseFloat(rate) / 100

    await supabase.from('commission_settings')
      .upsert({ id: 1, global_commission_rate: newRate, updated_at: new Date().toISOString() })

    // Recalculate all deal products that don't have a product-level override
    const { data: dps } = await supabase
      .from('deal_products')
      .select('id, commission_metric, annual_value, net_revenue, products(rate_overridden)')

    const toUpdate = (dps || []).filter((dp) => !dp.products?.rate_overridden)

    if (toUpdate.length > 0) {
      const updates = toUpdate.map((dp) => {
        const commission = dp.commission_metric === 'GM'
          ? Math.max(0, dp.net_revenue || 0) * newRate
          : (dp.annual_value || 0) * newRate
        return supabase.from('deal_products')
          .update({ base_rate: newRate, commission_amount: commission })
          .eq('id', dp.id)
      })
      await Promise.all(updates)
    }

    setSaving(false)
    setSaved(true)
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('audit_log').insert([{
      deal_id: null,
      table_name: 'event',
      record_id: 'global',
      action: 'event',
      changed_by: session?.user?.email || null,
      description: `Global commission rate updated from ${savedRate}% to ${parseFloat(rate).toFixed(2)}%`,
    }])
    setSavedRate(parseFloat(rate).toFixed(2))
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-navy-900">Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">Commission plan rules and system reference.</p>
      </div>

      <Card>
        <CardHeader title="Global Commission Rate" subtitle="Applied to all products unless overridden per product" />
        <div className="flex items-end gap-3">
          <Input
            label="Default Rate"
            type="number"
            step="0.01"
            min="0"
            max="100"
            suffix="%"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="w-40"
          />
          <Button onClick={handleSave} loading={saving}>
            {saved ? 'Saved!' : 'Save Rate'}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Products with a custom rate override will ignore this setting. Saving will retroactively update all existing deal products to the new rate.
        </p>
      </Card>

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

      <Card>
        <CardHeader title="Commission Rules" subtitle="Per the Trilogy Digital Commission Plan (Jan 2026)" />
        <div className="space-y-3 text-sm">
          {[
            'Core SaaS & Professional Services are calculated on NAVC/RAV at the global commission rate.',
            'Resold Technology commissions are based on Gross Margin (GM) at the global commission rate.',
            'Commission is paid only on collected revenue per quarter.',
            'SPIF payments are paid in the quarter following contract execution.',
            'SPIFs are subtracted from the total commission pool before distribution.',
            'TBN properties are excluded from all commission calculations.',
            'Customers commission % allocations are set per deal by Marcus Lopez.',
            'Any commission payable to Marcus Lopez requires approval by Emanuel Eddyson.',
            'The commission plan can be revised per quarter.',
            'All commissions are subject to finance and executive approval.',
          ].map((rule, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-primary-400 flex-shrink-0 mt-1.5" />
              <p className="text-gray-700 leading-relaxed">{rule}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
