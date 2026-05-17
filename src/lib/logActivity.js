import { supabase } from './supabase'

/**
 * Log a manual event to the audit_log for a deal.
 * Uses table_name='event' + action='event' — handled by formatAuditEntry in auditLog.js.
 *
 * @param {object} opts
 * @param {string} opts.dealId       - deal UUID
 * @param {string} opts.description  - human-readable label shown in activity feed
 * @param {string} [opts.recordId]   - optional related record ID
 */
export async function logActivity({ dealId, description, recordId = 'manual' }) {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError) { console.error('[logActivity] auth error:', authError); return }

    const { error } = await supabase.from('audit_log').insert({
      deal_id:     dealId,
      table_name:  'event',
      record_id:   recordId,
      action:      'event',
      changed_by:  user?.email || null,
      description,
    })
    if (error) console.error('[logActivity] insert error:', error)
  } catch (e) {
    console.error('[logActivity] unexpected error:', e)
  }
}
