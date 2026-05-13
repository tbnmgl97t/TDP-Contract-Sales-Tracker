import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL    = Deno.env.get('FROM_EMAIL')    ?? 'noreply@notify.trilogydigital.com'
const APP_URL       = Deno.env.get('APP_URL')       ?? 'https://salesflow.trilogyapps.com'

// Events that go to deal team (in-app + email)
// reminder_sent is handled separately — goes to customer contact
const TEAM_EVENTS    = new Set(['activity_started', 'submitted'])
const NOTIFY_IN_APP  = new Set(['activity_started', 'submitted', 'reminder_sent'])

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

function btn(url: string, label: string, primary = true) {
  const bg = primary ? '#57BB95' : '#17263A'
  return `<a href="${url}" style="display:inline-block;background:${bg};color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin-right:10px;">${label}</a>`
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  })
  if (!res.ok) throw new Error(await res.text())
}

serve(async (req) => {
  try {
    const { questionnaire_id, event_type } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Load questionnaire + deal + company
    const { data: q } = await supabase
      .from('questionnaires')
      .select('*, deals(id, name, company_name, company_id)')
      .eq('id', questionnaire_id)
      .single()

    if (!q) return new Response('Not found', { status: 404 })

    const dealName = q.deals?.name || q.deals?.company_name || 'Unknown Deal'
    const dealId   = q.deals?.id
    const formUrl  = `${APP_URL}/q/${q.token}`
    const dealUrl  = `${APP_URL}/deals/${dealId}`

    type EventType = 'viewed' | 'activity_started' | 'submitted' | 'reminder_sent'
    const templates: Record<EventType, { subject: string; body: string }> = {
      viewed: {
        subject: `Questionnaire viewed — ${q.title}`,
        body: `
          <h2 style="margin:0 0 8px;color:#17263A;font-size:20px;">Questionnaire Viewed</h2>
          <p style="color:#6b7280;margin:0 0 20px;">Someone opened <strong style="color:#17263A;">"${q.title}"</strong> for <strong style="color:#17263A;">${dealName}</strong>. No answers entered yet.</p>
          ${btn(dealUrl, 'View Deal')}`,
      },
      activity_started: {
        subject: `Questionnaire in progress — ${q.title}`,
        body: `
          <h2 style="margin:0 0 8px;color:#17263A;font-size:20px;">Questionnaire In Progress</h2>
          <p style="color:#6b7280;margin:0 0 20px;">A respondent has started answering <strong style="color:#17263A;">"${q.title}"</strong> for <strong style="color:#17263A;">${dealName}</strong>.</p>
          ${btn(dealUrl, 'View Deal')}`,
      },
      submitted: {
        subject: `✅ Questionnaire submitted — ${q.title}`,
        body: `
          <h2 style="margin:0 0 8px;color:#17263A;font-size:20px;">Questionnaire Submitted</h2>
          <p style="color:#6b7280;margin:0 0 20px;">The questionnaire <strong style="color:#17263A;">"${q.title}"</strong> for <strong style="color:#17263A;">${dealName}</strong> has been completed and is ready to review.</p>
          ${btn(dealUrl, 'View Responses')}`,
      },
      reminder_sent: {
        subject: `Friendly reminder — ${q.title}`,
        body: `
          <h2 style="margin:0 0 8px;color:#17263A;font-size:20px;">Just a quick reminder</h2>
          <p style="color:#6b7280;margin:0 0 20px;">We sent you a questionnaire a little while ago and wanted to follow up. When you have a moment, we'd appreciate your responses for <strong style="color:#17263A;">${dealName}</strong>.</p>
          ${btn(formUrl, 'Complete Questionnaire')}`,
      },
    }

    const template = templates[event_type as EventType]
    if (!template) return new Response('Unknown event type', { status: 400 })

    // ── Get deal team members ────────────────────────────────────────────────
    const { data: team } = await supabase
      .from('deal_team')
      .select('people ( email, name )')
      .eq('deal_id', dealId)

    const teamMembers: { email: string; name: string }[] = (team ?? [])
      .map((t: { people: { email: string; name: string } | null }) => t.people)
      .filter(Boolean)
      .filter((p: { email: string }) => p.email)

    const errors: string[] = []
    let totalSent = 0

    // ── reminder_sent: send to customer contact ──────────────────────────────
    if (event_type === 'reminder_sent') {
      let contactEmail: string | null = null
      let contactName:  string | null = null

      if (q.deals?.company_id) {
        const { data: contacts } = await supabase
          .from('contacts')
          .select('email, name, is_primary')
          .eq('company_id', q.deals.company_id)
          .not('email', 'is', null)
          .order('is_primary', { ascending: false })
          .limit(5)

        const primary = (contacts ?? []).find((c: { is_primary: boolean }) => c.is_primary)
        const first   = contacts?.[0]
        const picked  = primary || first
        if (picked?.email) {
          contactEmail = picked.email
          contactName  = picked.name
        }
      }

      if (contactEmail) {
        // Send reminder to customer
        try {
          await sendEmail(contactEmail, template.subject, emailShell(template.body))
          totalSent++
        } catch (e) {
          errors.push(`Customer email failed: ${(e as Error).message}`)
        }

        // Notify team: reminder was sent
        const teamNotifTitle  = `⏰ Questionnaire reminder sent — ${q.title}`
        const teamNotifBody   = `Reminder sent to ${contactName || contactEmail} for ${dealName}`
        for (const m of teamMembers) {
          await supabase.from('notifications').insert({
            user_email: m.email,
            type:       'questionnaire_reminder_sent',
            title:      teamNotifTitle,
            body:       teamNotifBody,
            deal_id:    dealId,
          })
        }
      } else {
        // No contact email — notify team to send manually
        const noEmailTitle = `⚠️ No contact email — ${q.title}`
        const noEmailBody  = `No contact email found for ${dealName}. Copy the questionnaire link and send manually.`
        for (const m of teamMembers) {
          await supabase.from('notifications').insert({
            user_email: m.email,
            type:       'questionnaire_no_contact',
            title:      noEmailTitle,
            body:       `${noEmailBody}\n${formUrl}`,
            deal_id:    dealId,
          })
        }
      }

      return new Response(
        JSON.stringify({ sent: totalSent, contact: contactEmail, errors: errors.length ? errors : undefined }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }

    // ── All other events: send to deal team ──────────────────────────────────
    for (const member of teamMembers) {
      // viewed: email only, no in-app
      if (event_type !== 'viewed') {
        try {
          await sendEmail(member.email, template.subject, emailShell(template.body))
          totalSent++
        } catch (e) {
          errors.push(`Email failed for ${member.email}: ${(e as Error).message}`)
        }
      }

      if (NOTIFY_IN_APP.has(event_type) && dealId) {
        await supabase.from('notifications').insert({
          user_email: member.email,
          type:       `questionnaire_${event_type}`,
          title:      template.subject,
          body:       `${dealName} — ${q.title}`,
          deal_id:    dealId,
        })
      }
    }

    return new Response(
      JSON.stringify({ sent: totalSent, errors: errors.length ? errors : undefined }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 })
  }
})
