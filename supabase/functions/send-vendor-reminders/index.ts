/**
 * send-vendor-reminders
 *
 * Called daily by pg_cron (or manually via POST).
 * For each active vendor contract whose notification date (end_date - notice_period_days)
 * falls exactly 60, 30, or 7 days from today, sends an email to all manager/sales users
 * and records the send in vendor_reminder_log to prevent duplicates.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL     = Deno.env.get('FROM_EMAIL')    ?? 'noreply@trilogydigital.com'
const APP_URL        = Deno.env.get('APP_URL')       ?? 'https://salesflow.trilogydigital.com'

const REMINDER_DAYS_BEFORE = [60, 30, 7]

// ── Email helpers (matching existing brand template) ─────────────────────────

function emailShell(body: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 20px;">
    <tr><td>
      <table width="600" align="center" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td style="background:#17263A;padding:20px 28px;">
            <span style="color:#57BB95;font-size:18px;font-weight:700;">SalesFlow</span>
            <span style="color:#94a3b8;font-size:13px;margin-left:10px;">Trilogy Digital</span>
          </td>
        </tr>
        <tr><td style="padding:28px;">${body}</td></tr>
        <tr>
          <td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">SalesFlow &middot; Trilogy Digital &middot; <a href="${APP_URL}" style="color:#57BB95;">${APP_URL}</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function btn(url: string, label: string) {
  return `<a href="${url}" style="display:inline-block;background:#57BB95;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${label}</a>`
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Build map of daysBefore -> target notification date string
    const targets = REMINDER_DAYS_BEFORE.map((daysBefore) => {
      const dt = new Date(today)
      dt.setDate(dt.getDate() + daysBefore)
      return { daysBefore, notifyOnDate: dt.toISOString().split('T')[0] }
    })

    // Load all active contracts with notice_period_days set
    const { data: contracts, error: contractsErr } = await supabase
      .from('vendor_contracts')
      .select(`
        id, title, end_date, notice_period_days,
        vendor_reminder_log ( days_before ),
        vendors ( id, name )
      `)
      .not('end_date', 'is', null)
      .not('notice_period_days', 'is', null)
      .gt('end_date', today.toISOString().split('T')[0])

    if (contractsErr) throw new Error(`Contracts query failed: ${contractsErr.message}`)

    if (!contracts || contracts.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No contracts to check.' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Load recipient users — all manager/sales roles via auth.users service role access
    // Try profiles table first; fall back to auth admin list
    let recipients: { email: string }[] = []

    const { data: profiles } = await supabase
      .from('profiles')
      .select('email, role')
      .in('role', ['manager', 'sales'])

    if (profiles && profiles.length > 0) {
      recipients = profiles.filter((p: { email: string }) => p.email)
    } else {
      // Fall back to auth.users with service role
      const { data: authData } = await supabase.auth.admin.listUsers()
      if (authData?.users) {
        recipients = authData.users
          .filter((u) => {
            const role = u.raw_user_meta_data?.role as string | undefined
            return role === 'manager' || role === 'sales'
          })
          .map((u) => ({ email: u.email! }))
          .filter((u) => u.email)
      }
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No recipients found.' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    let totalSent = 0
    const errors: string[] = []

    for (const contract of contracts) {
      const vendor = contract.vendors as { id: string; name: string } | null
      const vendorName = vendor?.name ?? 'Unknown Vendor'
      const vendorId = vendor?.id ?? ''

      // Compute this contract's notification date
      const endDt = new Date(contract.end_date + 'T12:00:00')
      const notifyDt = new Date(endDt)
      notifyDt.setDate(notifyDt.getDate() - (contract.notice_period_days as number))
      const notifyDateStr = notifyDt.toISOString().split('T')[0]

      // Check each reminder threshold
      for (const { daysBefore, notifyOnDate } of targets) {
        if (notifyDateStr !== notifyOnDate) continue

        // Skip if already sent
        const alreadySent = ((contract.vendor_reminder_log ?? []) as { days_before: number }[])
          .some((r) => r.days_before === daysBefore)
        if (alreadySent) continue

        const vendorUrl = `${APP_URL}/vendors/${vendorId}`
        const subject   = `⚠ Vendor Contract Notice: ${vendorName} — ${contract.title}`

        const emailBody = `
          <h2 style="margin:0 0 6px;color:#17263A;font-size:20px;">Vendor Contract Notice Reminder</h2>
          <p style="color:#6b7280;margin:0 0 16px;font-size:15px;">
            The termination notice window for the following vendor contract is approaching.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
            <tr>
              <td style="padding:8px 0;color:#9ca3af;font-size:13px;width:40%;">Vendor</td>
              <td style="padding:8px 0;color:#17263A;font-size:13px;font-weight:600;">${vendorName}</td>
            </tr>
            <tr style="background:#f9fafb;">
              <td style="padding:8px 0 8px 6px;color:#9ca3af;font-size:13px;">Contract</td>
              <td style="padding:8px 0 8px 6px;color:#17263A;font-size:13px;font-weight:600;">${contract.title}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#9ca3af;font-size:13px;">Notice Period</td>
              <td style="padding:8px 0;color:#17263A;font-size:13px;">${contract.notice_period_days} days</td>
            </tr>
            <tr style="background:#f9fafb;">
              <td style="padding:8px 0 8px 6px;color:#9ca3af;font-size:13px;">Notify By</td>
              <td style="padding:8px 0 8px 6px;color:#d97706;font-size:13px;font-weight:600;">${fmtDate(notifyDateStr)} (${daysBefore} days from now)</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#9ca3af;font-size:13px;">Contract End Date</td>
              <td style="padding:8px 0;color:#17263A;font-size:13px;">${fmtDate(contract.end_date)}</td>
            </tr>
          </table>
          ${btn(vendorUrl, 'View Vendor')}
        `

        // Send to all recipients
        for (const recipient of recipients) {
          try {
            const res = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`,
              },
              body: JSON.stringify({
                from:    FROM_EMAIL,
                to:      recipient.email,
                subject,
                html:    emailShell(emailBody),
              }),
            })
            if (!res.ok) {
              const errText = await res.text()
              errors.push(`Resend error for ${recipient.email}: ${errText}`)
            } else {
              totalSent++
            }
          } catch (e) {
            errors.push(`Email send failed for ${recipient.email}: ${(e as Error).message}`)
          }
        }

        // Record reminder sent (upsert handles the unique constraint gracefully)
        await supabase.from('vendor_reminder_log').upsert(
          { contract_id: contract.id, days_before: daysBefore },
          { onConflict: 'contract_id,days_before', ignoreDuplicates: true },
        )
      }
    }

    return new Response(
      JSON.stringify({ sent: totalSent, errors: errors.length ? errors : undefined }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
