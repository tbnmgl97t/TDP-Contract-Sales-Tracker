import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function formatContext(ctx: any): string {
  if (!ctx) return ''
  const lines: string[] = []

  const d = ctx.deal
  if (d) {
    lines.push('── DEAL ──')
    lines.push(`Name: ${d.name}  |  Company: ${d.company}  |  Stage: ${d.stage}`)
    lines.push(`Type: ${d.deal_type === 'renewal' ? 'Renewal' : 'New Business'}  |  TBN Property: ${d.is_tbn_property ? 'Yes (excluded from commission)' : 'No'}`)
    if (d.contract_start) lines.push(`Contract Period: ${d.contract_start} → ${d.contract_end} (${d.contract_months || 12} months)`)
    if (d.notice_period_days != null) lines.push(`Customer Notice Period: ${d.notice_period_days} days`)
    if (d.created_at) lines.push(`Added to SalesFlow: ${d.created_at}${d.created_by ? `  by ${d.created_by}` : ''}`)
    if (d.updated_at) lines.push(`Last Updated: ${d.updated_at}`)
    if (d.notes) lines.push(`Notes: ${d.notes}`)
  }

  if (ctx.products?.length) {
    lines.push('\n── PRODUCTS & SERVICES ──')
    ctx.products.forEach((p: any) => {
      const rate = p.base_rate != null ? ` @ ${(p.base_rate * 100).toFixed(1)}%` : ''
      const rev = p.annual_value != null ? `  Annual: $${Number(p.annual_value).toLocaleString()}` : ''
      const comm = p.commission != null ? `  Commission: $${Number(p.commission).toFixed(2)}` : ''
      lines.push(`• ${p.name}  [${p.metric}]${rev}${comm}${rate}`)
      if (p.milestones?.length > 1) {
        p.milestones.forEach((m: any) => lines.push(`    ↳ ${m.label || 'Payment'}: $${m.amount}  ${m.date || ''}`))
      }
    })
  }

  if (ctx.team?.length) {
    lines.push('\n── DEAL TEAM ──')
    ctx.team.forEach((m: any) => {
      if (m.role === 'sales') lines.push(`• ${m.name} — Sales, ${m.commission_percent}% of commission pool`)
      else lines.push(`• ${m.name} — Support, SPIF: $${m.spif_amount}`)
    })
  }

  if (ctx.commission_schedule?.length) {
    lines.push('\n── COMMISSION SCHEDULE ──')
    const grouped: Record<string, number> = {}
    ctx.commission_schedule.forEach((e: any) => {
      const key = `${e.year} Q${e.quarter}`
      grouped[key] = (grouped[key] || 0) + e.amount
    })
    Object.entries(grouped).sort().forEach(([k, v]) => {
      lines.push(`• ${k}: $${Number(v).toFixed(2)}`)
    })
  }

  if (ctx.contracts?.length) {
    lines.push('\n── CONTRACTS ──')
    ctx.contracts.forEach((c: any) => {
      lines.push(`• ${c.file_name}${c.uploaded_at ? `  (uploaded ${c.uploaded_at})` : ''}`)
      const a = c.analysis
      if (a) {
        if (a.client_name) lines.push(`  Client: ${a.client_name}  |  Vendor: ${a.vendor_name}`)
        if (a.contract_value) lines.push(`  Value: ${a.contract_value}  |  Terms: ${a.payment_terms}`)
        if (a.start_date) lines.push(`  Period: ${a.start_date} → ${a.end_date}`)
        if (a.auto_renewal != null) lines.push(`  Auto-renewal: ${a.auto_renewal ? 'Yes' : 'No'}${a.termination_notice_days ? ` (${a.termination_notice_days} day notice)` : ''}`)
        if (a.summary) lines.push(`  Summary: ${a.summary}`)
      }
    })
  }

  if (ctx.vendor_contracts?.length) {
    lines.push('\n── VENDOR CONTRACTS (backend contracts supporting this deal) ──')
    ctx.vendor_contracts.forEach((vc: any) => {
      const conflictNote = vc.conflict ? ` ⚠️ CONFLICT: vendor notice (${vc.notice_period_days}d) exceeds customer notice (${ctx.deal?.notice_period_days}d)` : ''
      const renewalNote = vc.renewal_intent ? ' | Renewal planned' : ''
      lines.push(`• ${vc.vendor}: "${vc.title}" | End: ${vc.end_date || 'N/A'} | Notice: ${vc.notice_period_days ?? 'N/A'} days${conflictNote}${renewalNote}`)
    })
  }

  if (ctx.audit_log?.length) {
    lines.push('\n── RECENT ACTIVITY ──')
    ctx.audit_log.slice(0, 15).forEach((entry: any) => {
      const date = new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      const by = entry.changed_by ? ` (${entry.changed_by})` : ''
      if (entry.description) {
        lines.push(`• ${date} — ${entry.description}${by}`)
      } else {
        const action = entry.action === 'insert' ? 'added' : entry.action === 'delete' ? 'deleted' : 'updated'
        const table = entry.table_name.replace(/_/g, ' ')
        lines.push(`• ${date} — ${table} ${action}${by}`)
      }
    })
  }

  return lines.join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { file_path, query, history, context } = await req.json()

    const contextBlock = context ? `\n\nYou have access to the following live CRM data for this deal:\n\n${formatContext(context)}\n\nDraw on this data alongside any contract documents to give complete, accurate answers.` : ''

    const system = `You are Deal Brain — a sharp, knowledgeable AI assistant embedded in SalesFlow, a CRM for Trilogy Digital. You know everything about this deal: the products, team, commission structure, contract terms, and payment schedule. Help the sales team get answers fast. Be concise, direct, and use exact figures when available.${contextBlock}`

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

    let docBlock: any = null

    if (file_path) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )
      const { data: fileData, error } = await supabase.storage.from('contracts').download(file_path)
      if (error || !fileData) {
        return new Response(JSON.stringify({ error: 'Failed to download file' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const arrayBuffer = await fileData.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ''
      const chunkSize = 8192
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
      }
      docBlock = {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: btoa(binary) },
      }
    }

    let messages: Anthropic.MessageParam[]
    const prior = (history || []) as { role: string; content: string }[]

    if (!query) {
      // Extract mode — requires a PDF
      if (!docBlock) {
        return new Response(JSON.stringify({ error: 'file_path required for extraction' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      messages = [{
        role: 'user',
        content: [
          docBlock,
          {
            type: 'text',
            text: `Extract the following from this contract and return ONLY valid JSON, no other text:
{
  "client_name": "",
  "vendor_name": "",
  "contract_value": "",
  "contract_value_source": "",
  "currency": "USD",
  "start_date": "",
  "end_date": "",
  "payment_terms": "",
  "payment_schedule": [{ "label": "", "date": "", "amount": "" }],
  "key_milestones": [""],
  "auto_renewal": false,
  "termination_notice_days": null,
  "line_items": [{ "label": "", "unit_amount": null, "quantity": null, "period_months": null, "total": null }],
  "calculated_value": null,
  "value_discrepancy": false,
  "summary": ""
}

Instructions for financial fields:
- "line_items": Extract every distinct fee or charge. For recurring fees include unit_amount (e.g. 8333.33), quantity (e.g. units/month), and period_months (e.g. 12). For one-time fees set period_months to 1.
- "calculated_value": Compute this yourself by summing all line item totals (unit_amount * quantity * period_months for recurring, or the stated amount for one-time fees). Do the arithmetic — do not copy the stated total.
- "contract_value": The total value as literally stated in the contract document. If not explicitly stated, leave empty.
- "contract_value_source": Quote the exact sentence or clause in the contract where you found contract_value, including the section/page if visible. If you could not find an explicit total, set this to "Not explicitly stated — inferred".
- "value_discrepancy": Set to true if your calculated_value differs from contract_value by more than 1%.`,
          },
        ],
      }]
    } else if (docBlock) {
      // Chat with PDF
      messages = [
        { role: 'user', content: [docBlock, { type: 'text', text: 'This is the contract document.' }] },
        { role: 'assistant', content: "I've read the contract and I'm ready to answer questions about it and the deal." },
        ...prior.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: query },
      ]
    } else {
      // Chat without PDF — deal context only
      messages = [
        ...prior.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: query },
      ]
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system,
      messages,
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
    // Strip markdown code fences if the model wraps JSON despite instructions
    const text = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    // Log token usage — Sonnet 4.6: $3/M input, $15/M output
    try {
      const usage = response.usage
      const inputCost = (usage.input_tokens / 1_000_000) * 3.0
      const outputCost = (usage.output_tokens / 1_000_000) * 15.0
      const costUsd = inputCost + outputCost

      const authHeader = req.headers.get('authorization') || ''
      const token = authHeader.replace('Bearer ', '')
      const sb = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { global: { headers: { authorization: authHeader } } }
      )
      const { data: { user } } = await sb.auth.getUser(token)

      await createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      ).from('ai_usage_log').insert([{
        deal_id: context?.deal?.id || null,
        user_id: user?.id || null,
        operation: query ? 'chat' : 'extract',
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cost_usd: costUsd,
      }])
    } catch (_) { /* non-fatal */ }

    return new Response(JSON.stringify({ result: text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
