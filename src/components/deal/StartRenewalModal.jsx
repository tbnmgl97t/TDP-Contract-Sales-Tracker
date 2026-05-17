import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useUser } from '../../contexts/UserContext'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input, { Select } from '../ui/Input'
import RichTextEditor from '../ui/RichTextEditor'
import { calcMonthsBetweenDates } from '../../lib/deals'
import { fmt } from '../../lib/commission'

const RENEWAL_TYPES = [
  { value: 'flat',        label: 'Flat Renewal',  desc: 'Same products and pricing'         },
  { value: 'expansion',   label: 'Expansion',      desc: 'Adding products or increasing ACV' },
  { value: 'contraction', label: 'Contraction',    desc: 'Reducing products or lowering ACV' },
  { value: 'churn',       label: 'Not Renewing',   desc: 'Customer is churning'              },
]

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setMonth(d.getMonth() + months)
  d.setDate(d.getDate() - 1)          // end of last day
  return d.toISOString().split('T')[0]
}

export default function StartRenewalModal({ deal, dealProducts, dealTeam, onClose, onCreated }) {
  const { profile } = useUser()

  const defaultStart = deal.contract_end ? addDays(deal.contract_end, 1) : ''
  const defaultEnd   = defaultStart
    ? addMonths(defaultStart, deal.contract_months || 12)
    : ''

  const [renewalType,    setRenewalType]    = useState('flat')
  const [dealName,       setDealName]       = useState(`${deal.name} — Renewal`)
  const [contractStart,  setContractStart]  = useState(defaultStart)
  const [contractEnd,    setContractEnd]    = useState(defaultEnd)
  const [note,           setNote]           = useState('')
  const [checkedIds,     setCheckedIds]     = useState(new Set())
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState(null)

  // Active products only (not cancelled)
  const activeProducts = dealProducts.filter((dp) => dp.status !== 'cancelled')

  useEffect(() => {
    setCheckedIds(new Set(activeProducts.map((dp) => dp.id)))
  }, [dealProducts])

  function toggleProduct(id) {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const contractMonths = contractStart && contractEnd
    ? (calcMonthsBetweenDates(new Date(contractStart), new Date(contractEnd)) || deal.contract_months || 12)
    : (deal.contract_months || 12)

  async function handleCreate() {
    setSaving(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const createdBy = session?.user?.email || profile?.email || null

      // 1. Insert deal with core columns (avoids PostgREST schema-cache issues
      //    on newly-added columns — predecessor_deal_id & renewal_type are patched below)

      // Derive ACV from the selected products being carried over
      const productsToCopy = activeProducts.filter((dp) => checkedIds.has(dp.id))
      const inheritedAcv = productsToCopy.reduce((sum, dp) =>
        sum + (dp.total_revenue || dp.annual_value || dp.yearly_cost || 0), 0)

      const { data: newDeal, error: dealErr } = await supabase.from('deals').insert({
        name:            dealName.trim() || `${deal.name} — Renewal`,
        company_id:      deal.company_id || null,
        company_name:    deal.company_name,
        stage:           'qualified',
        deal_type:       'renewal',
        is_tbn_property: deal.is_tbn_property,
        contract_start:  contractStart || null,
        contract_end:    contractEnd   || null,
        contract_months: contractMonths,
        acv:             inheritedAcv || null,
        created_by:      createdBy,
        updated_at:      new Date().toISOString(),
      }).select().single()

      if (dealErr || !newDeal) {
        console.error('Renewal deal insert failed:', dealErr)
        setError(dealErr?.message || 'Failed to create renewal deal.')
        return
      }

      // 1b. Patch the new columns separately (safe even if schema cache is stale)
      await supabase.from('deals').update({
        predecessor_deal_id: deal.id,
        renewal_type:        renewalType,
      }).eq('id', newDeal.id)

      // 2. Copy selected products — carry over all pricing fields
      if (productsToCopy.length) {
        const dpRows = productsToCopy.map((dp) => ({
          deal_id:                newDeal.id,
          product_id:             dp.product_id,
          commission_metric:      dp.commission_metric,
          base_rate:              dp.base_rate,
          // NAVC/RAV fields
          monthly_value:          dp.monthly_value          ?? null,
          annual_value:           dp.annual_value           ?? null,
          yearly_cost:            dp.yearly_cost            ?? null,
          // GM / usage-based fields (snapshot from original contract)
          monthly_quantity:       dp.monthly_quantity       ?? null,
          unit_price_snapshot:    dp.unit_price_snapshot    ?? null,
          cogs_per_unit_snapshot: dp.cogs_per_unit_snapshot ?? null,
          monthly_cost:           dp.monthly_cost           ?? null,
          total_revenue:          dp.total_revenue          ?? null,
          overage_rate:           dp.overage_rate           ?? null,
          // GM fixed-pricing fields
          list_price:             dp.list_price             ?? null,
          discount_pct:           dp.discount_pct           ?? null,
          quantity:               dp.quantity               ?? null,
          markup_pct:             dp.markup_pct             ?? null,
          billing_mode:           dp.billing_mode           || 'monthly',
          // Totals
          cogs_amount:            dp.cogs_amount            ?? null,
          net_revenue:            dp.net_revenue            ?? null,
          commission_amount:      dp.commission_amount      ?? null,
          // Renewal contract period
          billing_start_date:     contractStart || null,
          billing_months:         contractMonths,
          status:                 'active',
        }))
        const { error: dpErr } = await supabase.from('deal_products').insert(dpRows)
        if (dpErr) console.error('deal_products copy failed:', dpErr)
      }

      // 3. Copy team members
      const teamRows = dealTeam
        .filter((m) => m.person_id)
        .map((m) => ({
          deal_id:            newDeal.id,
          person_id:          m.person_id,
          role:               m.role,
          commission_percent: m.commission_percent,
          spif_amount:        m.spif_amount || null,
        }))
      if (teamRows.length) await supabase.from('deal_team').insert(teamRows)

      // 4. Save note as a deal_notes entry so it appears in the timeline
      const strippedNote = note.replace(/<[^>]*>/g, '').trim()
      if (strippedNote) {
        await supabase.from('deal_notes').insert({
          deal_id:    newDeal.id,
          content:    note.trim(),
          note_type:  'note',
          created_by: createdBy,
        })
      }

      onCreated(newDeal.id)
    } finally {
      setSaving(false)
    }
  }

  const isChurn = renewalType === 'churn'

  return (
    <Modal open={true} title="Start Renewal" onClose={onClose} size="md">
      <div className="space-y-5">

        {/* Renewal type */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Renewal Type</p>
          <div className="grid grid-cols-2 gap-2">
            {RENEWAL_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setRenewalType(t.value)}
                className={`text-left p-3 rounded-xl border-2 transition-all ${
                  renewalType === t.value
                    ? t.value === 'churn'
                      ? 'border-red-400 bg-red-50'
                      : 'border-primary-400 bg-primary-50'
                    : 'border-gray-100 hover:border-gray-200 bg-white'
                }`}
              >
                <p className={`text-sm font-semibold ${renewalType === t.value && t.value === 'churn' ? 'text-red-700' : renewalType === t.value ? 'text-primary-700' : 'text-navy-900'}`}>
                  {t.label}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Deal name */}
        <Input
          label="Deal Name"
          value={dealName}
          onChange={(e) => setDealName(e.target.value)}
        />

        {/* Contract dates */}
        {!isChurn && (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="New Contract Start"
              type="date"
              value={contractStart}
              onChange={(e) => setContractStart(e.target.value)}
            />
            <Input
              label="New Contract End"
              type="date"
              value={contractEnd}
              onChange={(e) => setContractEnd(e.target.value)}
            />
          </div>
        )}
        {!isChurn && contractMonths > 0 && (
          <p className="text-xs text-gray-400 -mt-2">{contractMonths} month contract</p>
        )}

        {/* Products to carry over */}
        {!isChurn && activeProducts.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Carry Over Products
            </p>
            <div className="space-y-1.5">
              {activeProducts.map((dp) => (
                <label key={dp.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={checkedIds.has(dp.id)}
                    onChange={() => toggleProduct(dp.id)}
                    className="w-4 h-4 rounded accent-primary-500"
                  />
                  <span className="flex-1 text-sm text-navy-900">{dp.products?.name || 'Product'}</span>
                  <span className="text-xs text-gray-400 font-medium">{fmt(dp.total_revenue || dp.annual_value || dp.yearly_cost || 0, 2)}/yr</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Note */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Note <span className="text-gray-400 font-normal">(optional)</span></label>
          <RichTextEditor
            value={note}
            onChange={setNote}
            placeholder={isChurn ? 'Reason for churn…' : 'Renewal context, price changes, etc.'}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            icon={<RefreshCw size={14} />}
            loading={saving}
            onClick={handleCreate}
            className={isChurn ? '!bg-red-500 hover:!bg-red-600' : ''}
          >
            {isChurn ? 'Record as Churned' : 'Create Renewal Deal'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
