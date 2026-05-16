import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { mergeDeleteInsertPairs } from '../lib/auditLog'

export function useDealDetail(id) {
  const navigate = useNavigate()
  const [deal, setDeal] = useState(null)
  const [dealProducts, setDealProducts] = useState([])
  const [dealTeam, setDealTeam] = useState([])
  const [dealPartners, setDealPartners] = useState([])
  const [contracts, setContracts] = useState([])
  const [amendments, setAmendments] = useState([])
  const [allProducts, setAllProducts] = useState([])
  const [questionnaires, setQuestionnaires] = useState([])
  const [auditLog, setAuditLog] = useState([])
  const [approval, setApproval] = useState(null)
  const [globalRate, setGlobalRate] = useState(0.07)
  const [predecessor, setPredecessor] = useState(null)
  const [predecessorContracts, setPredecessorContracts] = useState([])
  const [successors, setSuccessors] = useState([])
  const [currentPricing, setCurrentPricing] = useState({})
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState(null)

  async function load() {
    const [
      { data: d },
      { data: dps },
      { data: team },
      { data: conts },
      { data: dPartners },
      { data: amends },
      { data: prods },
      { data: commSettings },
    ] = await Promise.all([
      supabase.from('deals').select('*').eq('id', id).single(),
      supabase.from('deal_products').select('*, products(name, commission_metric, unit_label, is_support_charge, billing_frequency, rate_overridden)').eq('deal_id', id),
      supabase.from('deal_team').select('*, people(name, role, email)').eq('deal_id', id),
      supabase.from('contracts').select('*, ai_analysis').eq('deal_id', id).order('uploaded_at', { ascending: false }),
      supabase.from('deal_partners').select('*, partners(name)').eq('deal_id', id).order('sort_order'),
      supabase.from('deal_amendments').select('*').eq('deal_id', id).order('effective_date'),
      supabase.from('products').select('*, vendors(name)').eq('active', true).order('name'),
      supabase.from('commission_settings').select('global_commission_rate').maybeSingle(),
    ])

    let milestonesData = []
    if (dps && dps.length > 0) {
      const { data: ms } = await supabase
        .from('deal_product_milestones')
        .select('*')
        .in('deal_product_id', dps.map((dp) => dp.id))
        .order('sort_order')
      milestonesData = ms || []
    }

    const { data: appr } = await supabase.from('deal_approvals').select('*').eq('deal_id', id).maybeSingle()
    const { data: qs } = await supabase
      .from('questionnaires')
      .select('*, questionnaire_items(count), questionnaire_responses(id)')
      .eq('deal_id', id)
      .order('created_at', { ascending: false })

    let qsWithCounts = qs || []
    if (qsWithCounts.length > 0) {
      const responseIds = qsWithCounts
        .map(q => {
          const r = q.questionnaire_responses
          if (!r) return null
          return Array.isArray(r) ? r[0]?.id : r.id
        })
        .filter(Boolean)
      if (responseIds.length > 0) {
        const { data: answers } = await supabase
          .from('questionnaire_answers')
          .select('response_id')
          .in('response_id', responseIds)
          .not('answer', 'is', null)
          .neq('answer', '')
        const countMap = {}
        for (const a of answers || []) {
          countMap[a.response_id] = (countMap[a.response_id] || 0) + 1
        }
        qsWithCounts = qsWithCounts.map(q => {
          const r = q.questionnaire_responses
          const rid = r ? (Array.isArray(r) ? r[0]?.id : r.id) : null
          return { ...q, _answerCount: rid ? (countMap[rid] || 0) : 0 }
        })
      }
    }

    // Load current pricing params (for renewal price-change indicator)
    let pricingMap = {}
    if (d?.deal_type === 'renewal') {
      const { data: pp } = await supabase
        .from('product_pricing_params')
        .select('product_id, unit_price, cogs_per_unit, effective_date')
        .order('effective_date', { ascending: false })
      // Keep only the most-recent row per product
      for (const row of (pp || [])) {
        if (!pricingMap[row.product_id]) pricingMap[row.product_id] = row
      }
    }

    // Load predecessor + successors after we have the deal
    let pred = null
    let predContracts = []
    let succs = []
    if (d?.predecessor_deal_id) {
      const [{ data: p }, { data: pc }] = await Promise.all([
        supabase.from('deals').select('id, name, company_name, stage, contract_end').eq('id', d.predecessor_deal_id).single(),
        supabase.from('contracts').select('*').eq('deal_id', d.predecessor_deal_id).order('uploaded_at', { ascending: false }),
      ])
      pred = p || null
      predContracts = pc || []
    }
    const { data: succData } = await supabase.from('deals').select('id, name, stage, deal_type, renewal_type').eq('predecessor_deal_id', id).is('deleted_at', null)
    succs = succData || []

    setDeal(d)
    setDealProducts((dps || []).map((dp) => ({
      ...dp,
      milestones: milestonesData.filter((m) => m.deal_product_id === dp.id),
    })))
    setDealTeam(team || [])
    setDealPartners(dPartners || [])
    setContracts(conts || [])
    setAmendments(amends || [])
    setAllProducts(prods || [])
    if (commSettings?.global_commission_rate) setGlobalRate(commSettings.global_commission_rate)
    setApproval(appr || null)
    setQuestionnaires(qsWithCounts)
    setPredecessor(pred)
    setPredecessorContracts(predContracts)
    setSuccessors(succs)
    setCurrentPricing(pricingMap)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setCurrentUserId(session.user.id)
      loadAuditLog()
    }
    init()
  }, [id])

  async function loadAuditLog() {
    const { data, error } = await supabase
      .from('audit_log')
      .select('id, table_name, action, changed_by, old_values, new_values, description, created_at')
      .eq('deal_id', id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) console.error('loadAuditLog error:', error)
    setAuditLog(mergeDeleteInsertPairs(data || []))
  }

  async function logEvent(description) {
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('audit_log').insert([{
      deal_id: id,
      table_name: 'event',
      record_id: id,
      action: 'event',
      changed_by: session?.user?.email || null,
      description,
    }])
    loadAuditLog()
  }

  async function handleStageChange(stage, { dealProducts: dp, globalRate: gr } = {}) {
    if (stage === 'contracted') {
      const { data: settings } = await supabase
        .from('commission_settings')
        .select('global_commission_rate')
        .eq('id', 1)
        .single()
      const lockedRate = settings?.global_commission_rate || gr || globalRate

      const toUpdate = (dp || dealProducts).filter(
        (p) => p.status !== 'cancelled' && !p.products?.rate_overridden
      )
      if (toUpdate.length > 0) {
        await Promise.all(toUpdate.map((p) => {
          const commission = p.commission_metric === 'GM'
            ? Math.max(0, p.net_revenue || 0) * lockedRate
            : (p.annual_value || 0) * lockedRate
          return supabase.from('deal_products')
            .update({ base_rate: lockedRate, commission_amount: commission })
            .eq('id', p.id)
        }))
      }

      await supabase.from('deals').update({
        stage,
        commission_locked_rate: lockedRate,
        commission_locked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', id)

      await logEvent(`Stage changed from ${deal.stage} to ${stage} · Commission rate locked at ${(lockedRate * 100).toFixed(2)}%`)
      await load()
    } else {
      await supabase.from('deals').update({ stage, updated_at: new Date().toISOString() }).eq('id', id)
      await logEvent(`Stage changed from ${deal.stage} to ${stage}`)
      setDeal((d) => ({ ...d, stage }))
    }
  }

  async function handleDelete() {
    await supabase.from('deals').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    navigate('/deals')
  }

  async function handleApprovalAction(newStatus) {
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('deal_approvals').update({
      status: newStatus,
      reviewed_by: session?.user?.email || null,
      updated_at: new Date().toISOString(),
    }).eq('deal_id', id)
    await logEvent(`Deal ${newStatus} by ${session?.user?.email || 'manager'}`)
    setApproval((prev) => ({ ...prev, status: newStatus, reviewed_by: session?.user?.email }))
  }

  return {
    deal, setDeal,
    dealProducts, setDealProducts,
    dealTeam,
    dealPartners,
    contracts, setContracts,
    amendments,
    allProducts,
    questionnaires, setQuestionnaires,
    auditLog,
    approval, setApproval,
    globalRate,
    predecessor,
    predecessorContracts,
    successors,
    currentPricing,
    loading,
    currentUserId,
    load,
    logEvent,
    handleStageChange,
    handleDelete,
    handleApprovalAction,
  }
}
