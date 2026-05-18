import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { calcMilestoneTotal, calcMarginPctFromRate } from '../lib/products'
import { getMarginTier, getMarginPct } from '../lib/margin'

export function useNewDeal(editId) {
  const navigate = useNavigate()
  const isEdit = !!editId

  // Reference / lookup data
  const [products, setProducts] = useState([])
  const [people, setPeople] = useState([])
  const [companies, setCompanies] = useState([])
  const [pricingMap, setPricingMap] = useState({})
  const [spifTiers, setSpifTiers] = useState([])
  const [globalRate, setGlobalRate] = useState(0.07)
  const [partners, setPartners] = useState([])

  // Loading / saving
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)

  // Initial values for edit mode — component watches this to seed form state
  const [editDefaults, setEditDefaults] = useState(null)

  useEffect(() => {
    async function loadRefs() {
      const [
        { data: prods },
        { data: peeps },
        { data: pricing },
        { data: tiers },
        { data: comps },
        { data: settings },
        { data: pts },
      ] = await Promise.all([
        supabase.from('products').select('*, vendors(name)').eq('active', true).order('name'),
        supabase.from('people').select('*').eq('active', true).order('name'),
        supabase.from('product_pricing_params').select('*').order('effective_date', { ascending: false }),
        supabase.from('spif_tiers').select('*'),
        supabase.from('companies').select('id, name').order('name'),
        supabase.from('commission_settings').select('global_commission_rate').eq('id', 1).single(),
        supabase.from('partners').select('*').eq('active', true).order('name'),
      ])

      setProducts(prods || [])
      setPeople(peeps || [])
      setCompanies(comps || [])
      setSpifTiers(tiers || [])
      setPartners(pts || [])
      if (settings) setGlobalRate(parseFloat(settings.global_commission_rate) || 0.07)

      const pm = {}
      ;(pricing || []).forEach((p) => {
        if (!pm[p.product_id]) pm[p.product_id] = p
      })
      setPricingMap(pm)

      if (isEdit) {
        const { data: deal } = await supabase.from('deals').select('*').eq('id', editId).single()
        if (deal) {
          if (deal.stage === 'contracted' && deal.commission_locked_rate) {
            setGlobalRate(parseFloat(deal.commission_locked_rate))
          }

          const { data: dps } = await supabase
            .from('deal_products')
            .select('*, products(*)')
            .eq('deal_id', editId)

          let milestonesData = []
          if (dps && dps.length > 0) {
            const { data: ms } = await supabase
              .from('deal_product_milestones')
              .select('*')
              .in('deal_product_id', dps.map((dp) => dp.id))
              .order('sort_order')
            milestonesData = ms || []
          }

          const { data: team } = await supabase
            .from('deal_team').select('*, people(*)').eq('deal_id', editId)

          const { data: dPartners } = await supabase
            .from('deal_partners').select('*, partners(name)').eq('deal_id', editId).order('sort_order')

          const months = deal.contract_months || 12

          setEditDefaults({
            form: {
              name: deal.name || '',
              company_id: deal.company_id || (comps || []).find((c) => c.name.toLowerCase() === deal.company_name?.toLowerCase())?.id || (deal.company_name ? 'other' : ''),
              company_name: deal.company_name || '',
              stage: deal.stage || 'lead',
              deal_type: deal.deal_type || 'new',
              is_tbn_property: deal.is_tbn_property || false,
              contract_start: deal.contract_start || '',
              contract_end: deal.contract_end || '',
              contract_months: months,
              acv: deal.acv || '',
              notes: deal.notes || '',
              executive_summary: deal.executive_summary || '',
              notice_period_days: deal.notice_period_days != null ? String(deal.notice_period_days) : '',
              auto_renewal: deal.auto_renewal ?? null,
            },
            dealProducts: (dps || []).map((dp) => {
              const prod = (prods || []).find((p) => p.id === dp.product_id)
              const qty = parseInt(dp.quantity) || 0
              const isQtyBased = !!prod?.quantity_label
              return {
                ...dp,
                unit_price: dp.unit_price_snapshot ?? '',
                cogs_per_unit: dp.cogs_per_unit_snapshot ?? '',
                _vendor_id: prod?.vendor_id || '',
                _margin_type: prod?.default_margin_type === 'percent' ? 'percent' : 'fixed',
                _cogs_per_item: isQtyBased && qty > 0 ? (dp.cogs_amount || 0) / qty / months : (prod?.default_cogs || ''),
                _list_price_per_item: isQtyBased && qty > 0 ? (dp.list_price || 0) / qty / months : (prod?.default_list_price || ''),
                milestones: milestonesData.filter((m) => m.deal_product_id === dp.id),
                _milestone_total: calcMilestoneTotal(milestonesData.filter((m) => m.deal_product_id === dp.id)),
                billing_start_date: dp.billing_start_date || '',
                billing_months: dp.billing_months || '',
                billing_mode: dp.billing_mode || 'monthly',
                support_product_ids: dp.support_product_ids || [],
                _trilogy_margin_pct: (() => {
                  const u = parseFloat(dp.unit_price_snapshot) || 0
                  const c = parseFloat(dp.cogs_per_unit_snapshot) || 0
                  if (u > 0 && c > 0 && u >= c) return parseFloat(calcMarginPctFromRate(c, u).toFixed(2))
                  return ''
                })(),
              }
            }),
            teamMembers: (team || []).map((t) => ({ ...t, commission_justification: t.commission_justification || '' })),
            dealPartners: (dPartners || []).map((dp) => ({ ...dp, commission_pct: dp.commission_pct ?? '' })),
          })
        }
        setLoading(false)
      } else {
        setLoading(false)
      }
    }
    loadRefs()
  }, [editId])

  async function handleSave({ form, dealProducts, teamMembers, dealPartners, stackedPartners, productBaseAcv }) {
    setSaving(true)
    try {
      const months = parseInt(form.contract_months) || 12
      const acv = parseFloat(form.acv) || 0
      const dealData = {
        name: form.name,
        company_id: (form.company_id && form.company_id !== 'other') ? form.company_id : null,
        company_name: form.company_name,
        stage: form.stage,
        deal_type: form.deal_type,
        is_tbn_property: form.is_tbn_property,
        contract_start: form.contract_start || null,
        contract_end: form.contract_end || null,
        contract_months: months,
        acv: acv || null,
        total_contract_value: acv ? acv * months / 12 : null,
        notes: form.notes || null,
        executive_summary: form.executive_summary || null,
        notice_period_days: form.notice_period_days !== '' && form.notice_period_days != null ? parseInt(form.notice_period_days, 10) : null,
        auto_renewal: form.auto_renewal ?? null,
        updated_at: new Date().toISOString(),
      }

      let dealId = editId
      if (isEdit) {
        await supabase.from('deals').update(dealData).eq('id', editId)
        await supabase.from('deal_products').delete().eq('deal_id', editId).neq('status', 'cancelled')
        // Don't blanket-delete deal_team — diff instead to avoid false audit log entries
        await supabase.from('deal_partners').delete().eq('deal_id', editId)
      } else {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user?.email) dealData.created_by = session.user.email
        const { data, error } = await supabase.from('deals').insert([dealData]).select().single()
        if (error || !data) {
          console.error('Deal insert failed:', error)
          return
        }
        dealId = data.id
      }

      // Insert active products
      const dpToInsert = dealProducts.filter((dp) => dp.product_id && dp.status !== 'cancelled')
      const dpRows = dpToInsert.map(({ _id, _vendor_id, _margin_type, _margin_pct, _cogs_per_item, _list_price_per_item, _trilogy_margin_pct, id: _dbId, products: _, unit_price, cogs_per_unit, milestones: _milestones, _milestone_total, ...dp }) => {
        const row = { ...dp, deal_id: dealId, status: dp.status || 'active' }
        return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === '' ? null : v]))
      })
      if (dpRows.length) {
        const { data: insertedDPs, error: dpErr } = await supabase.from('deal_products').insert(dpRows).select()
        if (dpErr) console.error('deal_products insert failed:', JSON.stringify(dpErr))
        if (insertedDPs) {
          const milestoneRows = []
          insertedDPs.forEach((insertedDP, i) => {
            ;(dpToInsert[i].milestones || []).forEach((m, j) => {
              if ((parseFloat(m.amount) || 0) > 0) {
                milestoneRows.push({ deal_product_id: insertedDP.id, payment_date: m.payment_date || null, amount: parseFloat(m.amount), label: m.label || null, sort_order: j })
              }
            })
          })
          if (milestoneRows.length) await supabase.from('deal_product_milestones').insert(milestoneRows)
        }
      }

      // Diff team members — only insert/delete what actually changed
      const teamRows = teamMembers
        .filter((m) => m.person_id)
        .map(({ _id, id: _dbId, people: _, ...m }) => ({ ...m, deal_id: dealId }))

      if (isEdit) {
        const { data: existingTeam } = await supabase.from('deal_team').select('*').eq('deal_id', dealId)
        const existing = existingTeam || []
        const newPersonIds = new Set(teamRows.map((r) => r.person_id))
        const existingPersonIds = new Set(existing.map((m) => m.person_id))

        // Remove members no longer on the team
        const toRemove = existing.filter((m) => !newPersonIds.has(m.person_id))
        if (toRemove.length) {
          await supabase.from('deal_team').delete().eq('deal_id', dealId).in('person_id', toRemove.map((m) => m.person_id))
        }

        // Add genuinely new members
        const toAdd = teamRows.filter((r) => !existingPersonIds.has(r.person_id))
        if (toAdd.length) await supabase.from('deal_team').insert(toAdd)

        // Update members whose fields changed (role, commission_percent, spif_amount)
        for (const row of teamRows) {
          const prev = existing.find((m) => m.person_id === row.person_id)
          if (!prev) continue
          if (
            prev.role !== row.role ||
            prev.commission_percent !== row.commission_percent ||
            prev.spif_amount !== row.spif_amount
          ) {
            await supabase.from('deal_team').update({
              role: row.role,
              commission_percent: row.commission_percent,
              spif_amount: row.spif_amount,
            }).eq('deal_id', dealId).eq('person_id', row.person_id)
          }
        }
      } else {
        if (teamRows.length) await supabase.from('deal_team').insert(teamRows)
      }

      // Insert partners with stacked commission amounts
      const partnerRows = stackedPartners.map(({ _id, id: _dbId, partners: _, ...dp }, idx) => ({
        deal_id: dealId,
        partner_id: dp.partner_id,
        commission_pct: parseFloat(dp.commission_pct) || 0,
        commission_amount: dp.commission_amount || 0,
        sort_order: idx,
      }))
      if (partnerRows.length) await supabase.from('deal_partners').insert(partnerRows)

      // Upsert deal_approvals
      const savedTotalCogs = dealProducts.reduce((s, dp) => s + (parseFloat(dp.cogs_amount) || 0), 0)
      const savedAcv = productBaseAcv > 0 ? productBaseAcv : acv
      if (savedTotalCogs > 0 && savedAcv > 0) {
        const marginPct = getMarginPct(savedAcv, savedTotalCogs)
        const tier = getMarginTier(savedAcv, savedTotalCogs)
        const approvalStatus = tier === 'green' ? 'auto_approved' : 'pending'
        await supabase.from('deal_approvals').upsert({
          deal_id: dealId,
          status: approvalStatus,
          margin_pct: marginPct,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'deal_id' })
      }

      navigate(`/deals/${dealId}`)
    } finally {
      setSaving(false)
    }
  }

  return {
    products, people, companies, setCompanies,
    pricingMap, spifTiers, globalRate, partners,
    loading, saving,
    editDefaults,
    handleSave,
  }
}
