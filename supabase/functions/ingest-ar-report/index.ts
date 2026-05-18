import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ArRow {
  transaction_number: string
  business_unit: string
  natural_account: string
  natural_account_name: string
  customer_name: string
  customer_account_number: string
  as_of_date: string
  invoice_amount: number | null
  bucket_current: number
  bucket_1_30: number
  bucket_31_60: number
  bucket_61_90: number
  bucket_91_120: number
  bucket_121_150: number
  bucket_151_plus: number
  invoice_due_date: string | null
  creation_date: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Security: verify secret via query param (?secret=xxx)
    const url = new URL(req.url)
    const ingestSecret = Deno.env.get('INGEST_SECRET')
    if (!ingestSecret || url.searchParams.get('secret') !== ingestSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()

    let base64Pdf: string

    if (body.pdf_base64) {
      // Direct upload mode — PDF sent as base64 from the SalesFlow UI
      base64Pdf = body.pdf_base64
    } else {
      // Resend inbound webhook: { type: "email.received", data: { email_id, attachments: [...] } }
      if (body.type !== 'email.received') {
        return new Response(JSON.stringify({ skipped: 'Not an email.received event' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const emailId: string = body.data?.email_id
      const attachments: Array<{ id: string; filename: string; content_type: string; content_disposition?: string }> =
        body.data?.attachments || []

      if (!emailId) {
        return new Response(JSON.stringify({ error: 'Missing email_id in payload' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const pdfAttachmentMeta = attachments.find(
        (a) => a.content_type === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf')
      )

      if (!pdfAttachmentMeta) {
        return new Response(JSON.stringify({ error: 'No PDF attachment found in email' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const resendApiKey = Deno.env.get('RESEND_API_KEY')!

      // List attachments to get signed download URLs
      const attachListRes = await fetch(
        `https://api.resend.com/emails/receiving/${emailId}/attachments`,
        { headers: { Authorization: `Bearer ${resendApiKey}` } }
      )
      if (!attachListRes.ok) {
        const err = await attachListRes.text()
        return new Response(JSON.stringify({ error: 'Failed to list attachments from Resend', detail: err }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const attachListData = await attachListRes.json()
      const receivingAttachments: Array<{ id: string; filename: string; content_type: string; download_url: string }> =
        attachListData.data || []

      const pdfAttachmentWithUrl = receivingAttachments.find(
        (a) => a.content_type === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf')
      )

      if (!pdfAttachmentWithUrl?.download_url) {
        return new Response(JSON.stringify({ error: 'No PDF download URL found', filename: pdfAttachmentMeta.filename }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const pdfRes = await fetch(pdfAttachmentWithUrl.download_url)
      if (!pdfRes.ok) {
        return new Response(JSON.stringify({ error: 'Failed to download PDF from Resend CDN' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const pdfBytes = await pdfRes.arrayBuffer()
      base64Pdf = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)))
    }

    // Step 4: Call Claude to extract the AR table as JSON
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf },
            } as any,
            {
              type: 'text',
              text: `Extract every data row from this AR aging report and return ONLY a valid JSON array — no markdown, no explanation.

Each object must have exactly these fields:
{
  "transaction_number": "string",
  "business_unit": "string or null",
  "natural_account": "string or null",
  "natural_account_name": "string or null",
  "customer_name": "string",
  "customer_account_number": "string or null",
  "as_of_date": "YYYY-MM-DD or null",
  "invoice_amount": number or null,
  "bucket_current": number,
  "bucket_1_30": number,
  "bucket_31_60": number,
  "bucket_61_90": number,
  "bucket_91_120": number,
  "bucket_121_150": number,
  "bucket_151_plus": number,
  "invoice_due_date": "YYYY-MM-DD or null",
  "creation_date": "YYYY-MM-DD or null"
}

Rules:
- All monetary values as plain numbers (e.g. 13333.33 not "$13,333.33").
- Dates in YYYY-MM-DD format.
- Empty/zero bucket cells → 0.
- Skip header rows, subtotals, and grand total rows.
- Return ONLY the JSON array starting with [ and ending with ].`,
            },
          ],
        },
      ],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    let rows: ArRow[]
    try {
      rows = JSON.parse(jsonText)
    } catch {
      return new Response(
        JSON.stringify({ error: 'Claude returned unparseable JSON', raw: jsonText.slice(0, 500) }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No rows extracted from PDF', raw: jsonText.slice(0, 200) }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 5: Match rows to companies and upsert
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: companies } = await supabase
      .from('companies')
      .select('id, name, customer_account_number')

    const companiesList: Array<{ id: string; name: string; customer_account_number: string | null }> =
      companies || []

    function matchCompany(row: ArRow): string | null {
      if (row.customer_account_number) {
        const byAccount = companiesList.find(
          (c) => c.customer_account_number?.trim() === row.customer_account_number.trim()
        )
        if (byAccount) return byAccount.id
      }
      const normalized = row.customer_name.trim().toLowerCase()
      return companiesList.find((c) => c.name?.trim().toLowerCase() === normalized)?.id ?? null
    }

    const records = rows.map((row) => ({
      transaction_number: row.transaction_number,
      as_of_date: row.as_of_date || null,
      business_unit: row.business_unit || null,
      natural_account: row.natural_account || null,
      natural_account_name: row.natural_account_name || null,
      customer_name: row.customer_name,
      customer_account_number: row.customer_account_number || null,
      company_id: matchCompany(row),
      invoice_amount: row.invoice_amount ?? null,
      bucket_current: row.bucket_current ?? 0,
      bucket_1_30: row.bucket_1_30 ?? 0,
      bucket_31_60: row.bucket_31_60 ?? 0,
      bucket_61_90: row.bucket_61_90 ?? 0,
      bucket_91_120: row.bucket_91_120 ?? 0,
      bucket_121_150: row.bucket_121_150 ?? 0,
      bucket_151_plus: row.bucket_151_plus ?? 0,
      invoice_due_date: row.invoice_due_date || null,
      creation_date: row.creation_date || null,
    }))

    const { error: upsertError } = await supabase
      .from('receivables')
      .upsert(records, { onConflict: 'transaction_number' })

    if (upsertError) {
      return new Response(
        JSON.stringify({ error: 'DB upsert failed', detail: upsertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const matched = records.filter((r) => r.company_id !== null).length
    const unmatched = [...new Set(records.filter((r) => !r.company_id).map((r) => r.customer_name))]

    return new Response(
      JSON.stringify({ imported: records.length, matched, unmatched }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
