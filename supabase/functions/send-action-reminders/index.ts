/**
 * send-action-reminders
 *
 * Called daily by pg_cron (or manually via POST).
 * For each incomplete deal_action whose due_date falls within a configured
 * reminder window (e.g. 3 days, 1 day, day-of), this function:
 *   1. Checks action_reminders to skip already-sent reminders
 *   2. Resolves deal team member emails
 *   3. Sends an email via Resend to each team member
 *   4. Creates in-app notifications for each recipient
 *   5. Records the send in action_reminders
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL     = Deno.env.get('FROM_EMAIL')    ?? 'noreply@notify.trilogydigital.com'
const APP_URL        = Deno.env.get('APP_URL')       ?? 'https://salesflow.trilogydigital.com'

// ── Email shell (matches existing brand template) ────────────────────────────

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

function dueDateLabel(daysLeft: number): string {
  if (daysLeft === 0) return 'today'
  if (daysLeft === 1) return 'tomorrow'
  return `in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Load global reminder days config
    const { data: settings } = await supabase
      .from('reminder_settings')
      .select('reminder_days')
      .eq('id', 1)
      .single()

    const reminderDays: number[] = settings?.reminder_days ?? [3, 1, 0]

    // 2. Build the set of target dates (today + each offset)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const targetDates = reminderDays.map((d) => {
      const dt = new Date(today)
      dt.setDate(dt.getDate() + d)
      return { daysLeft: d, date: dt.toISOString().split('T')[0] }
    })

    // 3. Load all incomplete actions due on any target date
    const { data: actions } = await supabase
      .from('deal_actions')
      .select(`
        id, title, due_date, deal_id,
        deals ( name, company_name ),
        action_reminders ( days_before )
      `)
      .is('completed_at', null)
      .in('due_date', targetDates.map((t) => t.date))

    if (!actions || actions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No actions due.' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    let totalSent = 0
    const errors: string[] = []

    for (const action of actions) {
      const target = targetDates.find((t) => t.date === action.due_date)
      if (!target) continue

      // Skip if already sent for this days_before value
      const alreadySent = (action.action_reminders ?? []).some(
        (r: { days_before: number }) => r.days_before === target.daysLeft,
      )
      if (alreadySent) continue

      // 4. Get deal team emails
      const { data: team } = await supabase
        .from('deal_team')
        .select('people ( email, name )')
        .eq('deal_id', action.deal_id)

      const recipients: { email: string; name: string }[] = (team ?? [])
        .map((t: { people: { email: string; name: string } | null }) => t.people)
        .filter(Boolean)
        .filter((p: { email: string }) => p.email)

      if (recipients.length === 0) continue

      const dealName = (action.deals as { name?: string; company_name?: string } | null)?.name
        || (action.deals as { name?: string; company_name?: string } | null)?.company_name
        || 'Unknown Deal'

      const dealUrl    = `${APP_URL}/deals/${action.deal_id}`
      const daysLabel  = dueDateLabel(target.daysLeft)
      const dueFmt     = new Date(action.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

      const subject = target.daysLeft === 0
        ? `⏰ Action due today — ${action.title}`
        : `📅 Action due ${daysLabel} — ${action.title}`

      const emailBody = `
        <h2 style="margin:0 0 6px;color:#17263A;font-size:20px;">Action Reminder</h2>
        <p style="color:#6b7280;margin:0 0 4px;font-size:15px;">
          <strong style="color:#17263A;">${action.title}</strong> is due <strong style="color:#17263A;">${daysLabel}</strong> (${dueFmt}).
        </p>
        <p style="color:#9ca3af;margin:0 0 24px;font-size:13px;">Deal: ${dealName}</p>
        ${btn(dealUrl, 'View Deal')}
      `

      // 5. Send email to each team member
      for (const recipient of recipients) {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: FROM_EMAIL,
              to:   recipient.email,
              subject,
              html: emailShell(emailBody),
            }),
          })
          if (!res.ok) {
            const err = await res.text()
            errors.push(`Resend error for ${recipient.email}: ${err}`)
          } else {
            totalSent++
          }
        } catch (e) {
          errors.push(`Email send failed: ${(e as Error).message}`)
        }

        // 6. Write in-app notification
        await supabase.from('notifications').insert({
          user_email: recipient.email,
          type:       'action_reminder',
          title:      subject,
          body:       `"${action.title}" is due ${daysLabel} (${dueFmt}) — ${dealName}`,
          deal_id:    action.deal_id,
          action_id:  action.id,
        })
      }

      // 7. Record reminder as sent
      await supabase.from('action_reminders').insert({
        action_id:   action.id,
        days_before: target.daysLeft,
      })

      // 8. Log to activity feed
      await supabase.from('audit_log').insert({
        deal_id:    action.deal_id,
        table_name: 'event',
        record_id:  action.id,
        action:     'event',
        changed_by: 'system',
        description: `Action reminder sent to ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''}: "${action.title}" due ${daysLabel} (${dueFmt}) — ${dealName}`,
      })
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
