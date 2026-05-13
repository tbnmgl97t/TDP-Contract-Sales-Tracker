import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Edit, Trash2, Upload, FileText, Download, ChevronRight, DollarSign, Users, Package, FileCheck, AlertTriangle, ChevronDown, ChevronUp, Eye, Sparkles, Send, X, Loader, Copy, Check, LayoutTemplate, GitBranch, Pencil, Activity } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Card, { CardHeader } from '../components/ui/Card'
import { StageBadge, Badge } from '../components/ui/Badge'
import Button from '../components/ui/Button'
import { Select } from '../components/ui/Input'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { DEAL_STAGES } from '../lib/constants'
import { buildCommissionSchedule, fmt } from '../lib/commission'
import { formatAuditEntry, groupEntriesByDate, auditTypeStyle, mergeDeleteInsertPairs } from '../lib/auditLog'
import { computeDealTotals, calcTotalRevenue, calcTotalContractValue, calcIndividualCommission, groupScheduleByQuarter } from '../lib/deals'
import { effectiveCogs, productLineTotal, resolveMonthlyValue } from '../lib/products'
import { getMarginTier } from '../lib/margin'
import { PageSpinner } from '../components/ui/Spinner'
import { useUser } from '../contexts/UserContext'
import Modal from '../components/ui/Modal'
import DealOverviewModal from '../components/DealOverviewModal'
import AmendDealModal from '../components/AmendDealModal'
import EditAmendmentModal from '../components/EditAmendmentModal'
import ProposalBuilder from '../components/ProposalBuilder'
import QuestionnaireBuilder from '../components/QuestionnaireBuilder'
import QuestionnaireResponsesDrawer from '../components/QuestionnaireResponsesDrawer'
import { format } from 'date-fns'
import ReactMarkdown from 'react-markdown'

function CodeBlock({ children }) {
  const [copied, setCopied] = useState(false)
  const text = String(children).replace(/\n$/, '')
  function copy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="relative group my-2 rounded-lg overflow-hidden">
      <div className="bg-gray-900 px-3 pt-3 pb-3 font-mono text-[11px] leading-relaxed text-gray-100 overflow-x-auto whitespace-pre">
        {text}
      </div>
      <button
        onClick={copy}
        className="absolute top-2 right-2 p-1 rounded bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600 opacity-0 group-hover:opacity-100 transition-all"
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
      </button>
    </div>
  )
}

const aiMarkdownComponents = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-navy-900">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => <h1 className="text-sm font-bold text-navy-900 mt-3 mb-1.5 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xs font-bold text-navy-900 mt-3 mb-1 first:mt-0 uppercase tracking-wide">{children}</h2>,
  h3: ({ children }) => <h3 className="text-xs font-semibold text-navy-900 mt-2 mb-0.5 first:mt-0">{children}</h3>,
  ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-primary-300 pl-3 my-2 text-gray-500 italic">{children}</blockquote>
  ),
  hr: () => <hr className="border-gray-200 my-3" />,
  code: ({ node, inline, children, ...props }) =>
    inline
      ? <code className="bg-gray-100 text-pink-600 rounded px-1 py-0.5 font-mono text-[10px]" {...props}>{children}</code>
      : <CodeBlock>{children}</CodeBlock>,
  pre: ({ children }) => <>{children}</>,
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-[11px] border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-gray-200 px-2 py-1 bg-gray-50 font-semibold text-left text-navy-900">{children}</th>,
  td: ({ children }) => <td className="border border-gray-200 px-2 py-1 text-gray-700">{children}</td>,
}

function StageProgress({ current }) {
  const active = DEAL_STAGES.filter((s) => s.key !== 'closed_lost')
  const currentIdx = active.findIndex((s) => s.key === current)
  return (
    <div className="flex items-center gap-0">
      {active.map((stage, i) => (
        <div key={stage.key} className="flex items-center flex-1 last:flex-none">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-all ${i <= currentIdx ? 'bg-primary-400 text-white' : 'bg-gray-100 text-gray-400'}`}>
            {i + 1}
          </div>
          {i < active.length - 1 && (
            <div className={`h-0.5 flex-1 transition-all ${i < currentIdx ? 'bg-primary-400' : 'bg-gray-100'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

export default function DealDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isManager, isSales, profile } = useUser()
  const [deal, setDeal] = useState(null)
  const [dealProducts, setDealProducts] = useState([])
  const [dealTeam, setDealTeam] = useState([])
  const [dealPartners, setDealPartners] = useState([])
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteDlg, setDeleteDlg] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [stageChanging, setStageChanging] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [aiContract, setAiContract] = useState(null)
  const [aiExtracted, setAiExtracted] = useState(null)
  const [aiExtracting, setAiExtracting] = useState(false)
  const [aiChat, setAiChat] = useState([])
  const [aiInput, setAiInput] = useState('')
  const [aiThinking, setAiThinking] = useState(false)
  const [aiMinimized, setAiMinimized] = useState(true)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [deleteContractDlg, setDeleteContractDlg] = useState(null)
  const [auditLog, setAuditLog] = useState([])
  const [showOverview, setShowOverview] = useState(false)
  const [showProposal, setShowProposal] = useState(false)
  const [showAmend, setShowAmend] = useState(false)
  const [showQuestionnaireBuilder, setShowQuestionnaireBuilder] = useState(false)
  const [questionnaires, setQuestionnaires] = useState([])
  const [copyingQ, setCopyingQ] = useState(null)        // questionnaire being copied
  const [copyTargetId, setCopyTargetId] = useState('')  // target deal id
  const [copyDeals, setCopyDeals] = useState([])        // deals for picker
  const [copyingQSaving, setCopyingQSaving] = useState(false)
  const [editingQItems, setEditingQItems] = useState(null)   // { q, items: [{id, question_text, question_type}] }
  const [editingQSaving, setEditingQSaving] = useState(false)
  const [viewingResponses, setViewingResponses] = useState(null)  // questionnaire object
  const [deleteQDlg, setDeleteQDlg] = useState(null)              // questionnaire to delete
  const [copiedLinkId, setCopiedLinkId] = useState(null)          // questionnaire id whose link was just copied
  const [amendments, setAmendments] = useState([])
  const [allProducts, setAllProducts] = useState([])
  const [globalRate, setGlobalRate] = useState(0.07)
  const [editingAmendment, setEditingAmendment] = useState(null)   // { amendment, cancelledDp, addedDp }
  const [approval, setApproval] = useState(null)
  const [approving, setApproving] = useState(false)
  const chatEndRef = useRef(null)

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
      supabase.from('products').select('*, vendors(name)').eq('is_active', true).order('name'),
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

    // Count answers per questionnaire (nested PostgREST counts are unreliable)
    // questionnaire_responses has a unique FK so PostgREST returns it as a
    // singleton object, not an array — handle both cases defensively.
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
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function openCopyModal(q) {
    setCopyingQ(q)
    setCopyTargetId('')
    const { data } = await supabase
      .from('deals')
      .select('id, name, company_name, stage')
      .neq('id', id)
      .is('deleted_at', null)
      .order('name')
    setCopyDeals(data || [])
  }

  async function handleCopyQuestionnaire() {
    if (!copyTargetId || !copyingQ) return
    setCopyingQSaving(true)
    try {
      // Load the items from the source questionnaire
      const { data: sourceItems } = await supabase
        .from('questionnaire_items')
        .select('*')
        .eq('questionnaire_id', copyingQ.id)
        .order('sort_order')

      // Generate a fresh token
      const rawBytes = crypto.getRandomValues(new Uint8Array(24))
      const token = btoa(String.fromCharCode(...rawBytes))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 30)

      const { data: { user } } = await supabase.auth.getUser()

      const targetDeal = copyDeals.find((d) => d.id === copyTargetId)
      const targetName = targetDeal?.name || targetDeal?.company_name || ''
      const newTitle = targetName
        ? copyingQ.title.replace(/—\s*.+$/, `— ${targetName}`)
        : copyingQ.title

      const { data: newQ, error } = await supabase
        .from('questionnaires')
        .insert({
          deal_id: copyTargetId,
          title: newTitle,
          intro_text: copyingQ.intro_text || null,
          expires_at: expiresAt.toISOString(),
          reminder_days: copyingQ.reminder_days || 3,
          status: 'active',
          created_by: user?.id,
          token,
        })
        .select('id')
        .single()

      if (error) throw error

      if (sourceItems?.length > 0) {
        await supabase.from('questionnaire_items').insert(
          sourceItems.map((item, idx) => ({
            questionnaire_id: newQ.id,
            question_id: item.question_id,
            source_set_id: item.source_set_id,
            sort_order: idx,
            question_text: item.question_text,
            question_type: item.question_type,
            question_help_text: item.question_help_text,
          }))
        )
      }

      await supabase.from('questionnaire_responses').insert({ questionnaire_id: newQ.id })

      setCopyingQ(null)
      setCopyTargetId('')
      // Navigate to the target deal so the user can see it
      navigate(`/deals/${copyTargetId}`)
    } catch (e) {
      console.error(e)
    } finally {
      setCopyingQSaving(false)
    }
  }

  async function openEditItems(q) {
    const { data: items } = await supabase
      .from('questionnaire_items')
      .select('id, question_text, question_type, question_help_text, sort_order')
      .eq('questionnaire_id', q.id)
      .order('sort_order')
    setEditingQItems({ q, items: items || [] })
  }

  async function handleSaveEditedItems() {
    if (!editingQItems) return
    setEditingQSaving(true)
    try {
      await Promise.all(
        editingQItems.items.map((item) =>
          supabase.from('questionnaire_items').update({ question_type: item.question_type }).eq('id', item.id)
        )
      )
      setEditingQItems(null)
    } catch (e) {
      console.error(e)
    } finally {
      setEditingQSaving(false)
    }
  }

  useEffect(() => {
    async function loadChatHistory() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setCurrentUserId(session.user.id)
      loadAuditLog()
      const { data } = await supabase
        .from('deal_brain_messages')
        .select('role, content')
        .eq('deal_id', id)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(20)
      if (data?.length) setAiChat(data.reverse())
    }
    loadChatHistory()
  }, [id])

  async function handleStageChange(stage) {
    setStageChanging(true)

    if (stage === 'contracted') {
      // Fetch current global rate to lock in
      const { data: settings } = await supabase
        .from('commission_settings')
        .select('global_commission_rate')
        .eq('id', 1)
        .single()
      const lockedRate = settings?.global_commission_rate || globalRate

      // Recalculate commission_amount for every non-overridden, active product at the locked rate
      const toUpdate = dealProducts.filter(
        (dp) => dp.status !== 'cancelled' && !dp.products?.rate_overridden
      )
      if (toUpdate.length > 0) {
        await Promise.all(toUpdate.map((dp) => {
          const commission = dp.commission_metric === 'GM'
            ? Math.max(0, dp.net_revenue || 0) * lockedRate
            : (dp.annual_value || 0) * lockedRate
          return supabase.from('deal_products')
            .update({ base_rate: lockedRate, commission_amount: commission })
            .eq('id', dp.id)
        }))
      }

      // Update deal with stage + lock metadata
      await supabase.from('deals').update({
        stage,
        commission_locked_rate: lockedRate,
        commission_locked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', id)

      await logEvent(`Stage changed from ${deal.stage} to ${stage} · Commission rate locked at ${(lockedRate * 100).toFixed(2)}%`)

      // Reload so commission schedule reflects locked amounts
      await load()
    } else {
      await supabase.from('deals').update({ stage, updated_at: new Date().toISOString() }).eq('id', id)
      await logEvent(`Stage changed from ${deal.stage} to ${stage}`)
      setDeal((d) => ({ ...d, stage }))
    }

    setStageChanging(false)
  }

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('deals').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    navigate('/deals')
  }

  async function handleApprovalAction(newStatus) {
    setApproving(true)
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('deal_approvals').update({
      status: newStatus,
      reviewed_by: session?.user?.email || null,
      updated_at: new Date().toISOString(),
    }).eq('deal_id', id)
    await logEvent(`Deal ${newStatus} by ${session?.user?.email || 'manager'}`)
    setApproval((prev) => ({ ...prev, status: newStatus, reviewed_by: session?.user?.email }))
    setApproving(false)
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${id}/${Date.now()}_${safeName}`
    const { error } = await supabase.storage.from('contracts').upload(path, file)
    if (error) { console.error('Upload error:', JSON.stringify(error)); setUploading(false); return }
    if (!error) {
      const existingVersion = contracts.find((c) => c.file_name === file.name)
      const version = existingVersion ? (existingVersion.version || 1) + 1 : 1
      const { data: contractData } = await supabase.from('contracts').insert([{
        deal_id: id,
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        mime_type: file.type,
        version,
        previous_version_id: existingVersion?.id || null,
      }]).select().single()
      await load()
      await logEvent(`Contract uploaded: ${file.name}${version > 1 ? ` (v${version})` : ''}`)
      setUploading(false)
      if (file.type === 'application/pdf' && contractData) {
        openAiPanel(contractData)
      }
      return
    }
    setUploading(false)
  }

  async function handleView(contract) {
    const { data } = await supabase.storage.from('contracts').createSignedUrl(contract.file_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function handleDownload(contract) {
    const { data } = await supabase.storage.from('contracts').download(contract.file_path)
    if (data) {
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = contract.file_name
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  async function handleDeleteContract(contract) {
    await logEvent(`Contract deleted: ${contract.file_name}`)
    await supabase.storage.from('contracts').remove([contract.file_path])
    await supabase.from('contracts').delete().eq('id', contract.id)
    setDeleteContractDlg(null)
    load()
  }

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

  function buildDealContext() {
    if (!deal) return null
    const sched = buildCommissionSchedule(
      deal,
      dealProducts,
      dealTeam.map((m) => ({ ...m, person_name: m.people?.name }))
    )
    return {
      deal: {
        id: deal.id,
        name: deal.name,
        company: deal.company_name,
        stage: deal.stage,
        deal_type: deal.deal_type,
        is_tbn_property: deal.is_tbn_property,
        contract_start: deal.contract_start,
        contract_end: deal.contract_end,
        contract_months: deal.contract_months,
        notes: deal.notes,
        created_by: deal.created_by || null,
        created_at: deal.created_at ? new Date(deal.created_at).toLocaleString() : null,
        updated_at: deal.updated_at ? new Date(deal.updated_at).toLocaleString() : null,
      },
      products: dealProducts.map((dp) => ({
        name: dp.products?.name,
        metric: dp.commission_metric,
        annual_value: dp.annual_value,
        net_revenue: dp.net_revenue,
        cogs: dp.cogs_amount,
        commission: dp.commission_amount,
        base_rate: dp.base_rate,
        milestones: (dp.milestones || []).map((m) => ({ label: m.label, date: m.payment_date, amount: m.amount })),
      })),
      team: dealTeam.map((m) => ({
        name: m.people?.name,
        role: m.role,
        commission_percent: m.commission_percent,
        spif_amount: m.spif_amount,
      })),
      commission_schedule: sched,
      contracts: contracts.map((c) => ({
        file_name: c.file_name,
        uploaded_at: c.uploaded_at ? new Date(c.uploaded_at).toLocaleString() : null,
        ...(c.ai_analysis ? { analysis: c.ai_analysis } : {}),
      })),
      audit_log: auditLog,
    }
  }

  async function openAiPanel(contract, forceRefresh = false) {
    setAiContract(contract)
    setAiMinimized(false)

    // Use cached analysis if available and not forcing refresh
    if (contract.ai_analysis && !forceRefresh) {
      setAiExtracted(contract.ai_analysis)
      return
    }

    setAiExtracted(null)
    setAiExtracting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-contract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ file_path: contract.file_path, context: buildDealContext() }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const { result, error } = await res.json()
      if (error) throw new Error(error)
      let parsed
      try {
        const cleaned = result.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/g, '').trim()
        parsed = JSON.parse(cleaned)
      } catch {
        parsed = { summary: result }
      }
      setAiExtracted(parsed)
      await supabase.from('contracts').update({ ai_analysis: parsed }).eq('id', contract.id)
      setContracts((prev) => prev.map((c) => c.id === contract.id ? { ...c, ai_analysis: parsed } : c))
    } catch (err) {
      setAiExtracted({ error: err.message || 'Analysis failed. Please try again.' })
    } finally {
      setAiExtracting(false)
    }
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiChat])

  async function sendAiMessage() {
    if (!aiInput.trim() || aiThinking) return
    const userMsg = { role: 'user', content: aiInput.trim() }
    setAiChat((prev) => [...prev, userMsg])
    setAiInput('')
    setAiThinking(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-contract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          file_path: contracts.find((c) => c.mime_type === 'application/pdf')?.file_path,
          query: userMsg.content,
          history: aiChat.slice(-20),
          context: buildDealContext(),
        }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const { result, error } = await res.json()
      if (error) throw new Error(error)
      const assistantMsg = { role: 'assistant', content: result || 'No response.' }
      setAiChat((prev) => [...prev, assistantMsg])
      if (currentUserId) {
        await supabase.from('deal_brain_messages').insert([
          { deal_id: id, user_id: currentUserId, role: 'user', content: userMsg.content },
          { deal_id: id, user_id: currentUserId, role: 'assistant', content: assistantMsg.content },
        ])
      }
    } catch (err) {
      setAiChat((prev) => [...prev, { role: 'assistant', content: `⚠️ Something went wrong — ${err.message}. Please try again.` }])
    } finally {
      setAiThinking(false)
    }
  }

  if (loading) return <PageSpinner />
  if (!deal) return <div className="p-8 text-center text-gray-500">Deal not found.</div>

  // Active products only for ACV, margin, and display totals
  const activeProducts = dealProducts.filter((dp) => dp.status !== 'cancelled')
  const { productAcv: productACV, customerAcv, partnerMultiplier: _pm, partnerStack, totalCogs, totalCommission: _tc } = computeDealTotals(activeProducts, dealPartners)
  const totalCommission = deal.is_tbn_property ? 0 : _tc
  const totalRevenue = calcTotalRevenue(activeProducts)

  // Pass ALL products (including cancelled) — cancelled ones self-prorate via shortened billing_months
  const schedule = buildCommissionSchedule(
    deal,
    dealProducts,
    dealTeam.map((m) => ({ ...m, person_name: m.people?.name }))
  )

  const salesTeam = dealTeam.filter((m) => m.role === 'sales')
  const supportTeam = dealTeam.filter((m) => m.role === 'support')

  const quarterGroups = groupScheduleByQuarter(schedule)

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-32">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-bold text-navy-900">{deal.name}</h2>
            {deal.is_tbn_property && (
              <Badge color="orange">TBN Property</Badge>
            )}
          </div>
          <p className="text-sm text-gray-500">{deal.company_name}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowOverview(true)} icon={<LayoutTemplate size={14} />}>Overview</Button>
          <Button variant="secondary" size="sm" onClick={() => setShowProposal(true)} icon={<FileText size={14} />} disabled={['lead', 'qualified', 'discovery'].includes(deal.stage) || approval?.status === 'pending'}>Proposal</Button>
          {isManager && <Button variant="secondary" size="sm" onClick={() => setShowQuestionnaireBuilder(true)} icon={<FileText size={14} />}>Questionnaire</Button>}
          {isManager && deal.stage === 'contracted' && (
            <Button variant="secondary" size="sm" onClick={() => setShowAmend(true)} icon={<GitBranch size={14} />}>Amend</Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => navigate(`/deals/${id}/edit`)} icon={<Edit size={14} />}>Edit</Button>
          <Button variant="danger" size="sm" onClick={() => setDeleteDlg(true)} icon={<Trash2 size={14} />}>Delete</Button>
        </div>
      </div>

      {/* Stage bar */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <StageBadge stage={deal.stage} />
            <Select
              value={deal.stage}
              onChange={(e) => handleStageChange(e.target.value)}
              className="w-48"
            >
              {DEAL_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
          </div>
          {deal.stage !== 'closed_lost' && <StageProgress current={deal.stage} />}
        </div>
      </Card>

      {/* Stats row */}
      <div className={`grid gap-3 ${isManager ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`}>
        <Card className="!py-3">
          <p className="text-xs text-gray-500">ACV</p>
          <p className="text-lg font-bold text-navy-900 mt-0.5">
            {dealProducts.length > 0 ? fmt(customerAcv, 2) : fmt(deal.acv, 2)}
          </p>
          {dealProducts.length > 0 && dealPartners.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">Trilogy net: {fmt(productACV, 2)}</p>
          )}
          {dealProducts.length > 0 && dealPartners.length === 0 && deal.acv > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">Est. {fmt(deal.acv, 2)}</p>
          )}
        </Card>
        {[
          { label: 'Total Value', value: fmt(dealProducts.length > 0 ? calcTotalContractValue(customerAcv, deal.contract_months || 12) : (deal.total_contract_value || deal.acv), 2), show: true },
          { label: 'Contract Months', value: deal.contract_months || 12, show: true },
          { label: 'Commission', value: fmt(totalCommission, 2), show: isManager },
        ].filter((s) => s.show).map((stat) => (
          <Card key={stat.label} className="!py-3">
            <p className="text-xs text-gray-500">{stat.label}</p>
            <p className="text-lg font-bold text-navy-900 mt-0.5">{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Margin / Approval banner */}
      {approval && (() => {
        const tier = getMarginTier(productACV > 0 ? productACV : (deal.acv || 0), totalCogs)
        const bannerStyles = {
          green: 'bg-green-50 border-green-200 text-green-800',
          yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
          red: 'bg-red-50 border-red-200 text-red-800',
        }
        const tierLabel = { green: 'Healthy Margin', yellow: 'Low Margin — Review Required', red: 'Below Minimum Margin' }
        const dotColor = { green: 'bg-green-400', yellow: 'bg-yellow-400', red: 'bg-red-400' }
        const statusLabel = { auto_approved: 'Auto-approved', pending: 'Pending approval', approved: 'Approved', rejected: 'Rejected' }
        return (
          <div className={`border rounded-xl px-4 py-3 flex items-center justify-between gap-3 ${bannerStyles[tier] || 'bg-gray-50 border-gray-200 text-gray-700'}`}>
            <div className="flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor[tier] || 'bg-gray-400'}`} />
              <div>
                <span className="text-sm font-semibold">{tierLabel[tier] || 'Margin'}</span>
                {approval.margin_pct != null && (
                  <span className="ml-2 text-xs opacity-75">({(approval.margin_pct * 100).toFixed(1)}%)</span>
                )}
                <span className="ml-3 text-xs opacity-60">· {statusLabel[approval.status] || approval.status}</span>
                {approval.reviewed_by && <span className="ml-1.5 text-xs opacity-50">by {approval.reviewed_by}</span>}
              </div>
            </div>
            {isManager && (approval.status === 'pending' || approval.status === 'rejected') && (
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => handleApprovalAction('approved')}
                  disabled={approving}
                  className="px-3 py-1 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  Approve
                </button>
                {approval.status !== 'rejected' && (
                  <button
                    onClick={() => handleApprovalAction('rejected')}
                    disabled={approving}
                    className="px-3 py-1 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    Reject
                  </button>
                )}
              </div>
            )}
            {isManager && approval.status === 'approved' && (
              <button
                onClick={() => handleApprovalAction('rejected')}
                disabled={approving}
                className="px-3 py-1 text-xs font-medium border border-current rounded-lg opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30"
              >
                Revoke
              </button>
            )}
          </div>
        )
      })()}

      {/* Deal details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Deal Info" />
          <dl className="space-y-2.5">
            {[
              { label: 'Type', value: deal.deal_type === 'renewal' ? 'Renewal' : 'New Business' },
              { label: 'Contract Start', value: deal.contract_start ? format(new Date(deal.contract_start + 'T12:00:00'), 'MMM d, yyyy') : '—' },
              { label: 'Contract End', value: deal.contract_end ? format(new Date(deal.contract_end + 'T12:00:00'), 'MMM d, yyyy') : '—' },
              { label: 'TBN Property', value: deal.is_tbn_property ? 'Yes (no commission)' : 'No' },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-gray-500">{label}</span>
                <span className="font-medium text-navy-900">{value}</span>
              </div>
            ))}
            {deal.notes && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Notes</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{deal.notes}</p>
              </div>
            )}
          </dl>
        </Card>

        {/* Team */}
        {dealTeam.length > 0 && <Card>
          <CardHeader title="Team" />
          <div className="space-y-2">
            {salesTeam.map((m) => {
              const isOwnRow = m.people?.email === profile?.email
              return (
                <div key={m.id} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-semibold text-xs flex-shrink-0">
                      {m.people?.name?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-navy-900">{m.people?.name}</p>
                      <p className="text-xs text-gray-500">Sales</p>
                    </div>
                  </div>
                  {isManager && <Badge color="green">{m.commission_percent}% commission</Badge>}
                  {!isManager && isOwnRow && <Badge color="green">{fmt(calcIndividualCommission(totalCommission, m.commission_percent), 2)}</Badge>}
                </div>
              )
            })}
            {supportTeam.map((m) => {
              const isOwnRow = m.people?.email === profile?.email
              const showSpif = isManager || isSales || isOwnRow
              return (
                <div key={m.id} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-accent-100 flex items-center justify-center text-accent-700 font-semibold text-xs flex-shrink-0">
                      {m.people?.name?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-navy-900">{m.people?.name}</p>
                      <p className="text-xs text-gray-500">Support</p>
                    </div>
                  </div>
                  {showSpif && <Badge color="yellow">SPIF {fmt(m.spif_amount, 2)}</Badge>}
                </div>
              )
            })}
          </div>
        </Card>}
      </div>

      {/* Questionnaires */}
      {isManager && (
        <Card>
          <CardHeader
            title="Questionnaires"
            subtitle="Customer discovery forms"
            action={
              <Button variant="secondary" size="sm" onClick={() => setShowQuestionnaireBuilder(true)} icon={<FileText size={13} />}>
                New
              </Button>
            }
          />
          {questionnaires.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-gray-400">No questionnaires yet.</p>
              <button onClick={() => setShowQuestionnaireBuilder(true)} className="text-xs text-primary-500 hover:underline mt-1">Create one</button>
            </div>
          ) : (
            <div className="space-y-2">
              {questionnaires.map((q) => {
                const statusColor = { active: 'green', submitted: 'blue', expired: 'gray', deactivated: 'gray' }[q.status] || 'gray'
                const answerCount = q._answerCount || 0
                const itemCount = q.questionnaire_items?.[0]?.count ?? 0
                const questionCount = typeof itemCount === 'string' ? parseInt(itemCount, 10) : (itemCount || 0)
                const publicUrl = `${window.location.origin}/q/${q.token}`
                const hasActivity = answerCount > 0 || q.submitted_at != null || q.status === 'submitted'
                const canDelete = !hasActivity
                const isDeactivated = q.status === 'deactivated'
                return (
                  <div key={q.id} className={`flex items-center justify-between p-3 border rounded-xl hover:bg-gray-50 ${isDeactivated ? 'border-gray-100 opacity-60' : 'border-gray-100'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-medium truncate ${isDeactivated ? 'text-gray-400 line-through' : 'text-navy-900'}`}>{q.title}</p>
                        <Badge color={statusColor}>{q.status.charAt(0).toUpperCase() + q.status.slice(1)}</Badge>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {questionCount} question{questionCount !== 1 ? 's' : ''}
                        {answerCount > 0
                          ? <span className={answerCount >= questionCount ? ' · text-primary-500 font-medium' : ''}>
                              {` · ${answerCount} / ${questionCount} answered`}
                            </span>
                          : ' · No responses yet'
                        }
                        {q.status === 'active' && ` · Expires ${format(new Date(q.expires_at), 'MMM d, yyyy')}`}
                        {q.submitted_at && ` · Submitted ${format(new Date(q.submitted_at), 'MMM d, yyyy')}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      {/* View responses */}
                      {hasActivity && (
                        <button
                          onClick={() => setViewingResponses(q)}
                          className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors"
                          title="View responses"
                        >
                          <Eye size={14} />
                        </button>
                      )}
                      {/* Copy link */}
                      {q.status === 'active' && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(publicUrl)
                            setCopiedLinkId(q.id)
                            setTimeout(() => setCopiedLinkId(null), 2000)
                          }}
                          className={`p-1.5 rounded-lg transition-colors ${copiedLinkId === q.id ? 'text-primary-500 bg-primary-50' : 'text-gray-400 hover:text-primary-500 hover:bg-primary-50'}`}
                          title={copiedLinkId === q.id ? 'Copied!' : 'Copy shareable link'}
                        >
                          {copiedLinkId === q.id ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      )}
                      {/* Edit question types */}
                      <button
                        onClick={() => openEditItems(q)}
                        className="p-1.5 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Edit questions"
                      >
                        <Pencil size={14} />
                      </button>
                      {/* Copy to another deal */}
                      <button
                        onClick={() => openCopyModal(q)}
                        className="p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Copy to another deal"
                      >
                        <LayoutTemplate size={14} />
                      </button>
                      {/* Deactivate — kills the public link, preserves responses */}
                      {(q.status === 'active' || q.status === 'expired') && (
                        <button
                          onClick={async () => {
                            await supabase.from('questionnaires').update({ status: 'deactivated' }).eq('id', q.id)
                            setQuestionnaires(prev => prev.map(qi => qi.id === q.id ? { ...qi, status: 'deactivated' } : qi))
                          }}
                          className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Deactivate (disables public link, keeps responses)"
                        >
                          <AlertTriangle size={14} />
                        </button>
                      )}
                      {/* Delete — only when no responses exist */}
                      {canDelete && (
                        <button
                          onClick={() => setDeleteQDlg(q)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete (no responses — safe to remove)"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* Products */}
      <Card>
        <CardHeader title="Products & Services" />
        <div className="overflow-x-auto">
          {(() => {
            const partnerMultiplier = _pm
            const fmtRate = (val) => {
              if (val == null || val === '') return '—'
              const n = parseFloat(val)
              if (isNaN(n) || n === 0) return '—'
              return `$${(n * partnerMultiplier).toFixed(4)}`
            }
            const fmtRaw = (val) => {
              if (val == null || val === '') return '—'
              const n = parseFloat(val)
              if (isNaN(n) || n === 0) return '—'
              return `$${n.toFixed(4)}`
            }
            const fmtQty = (val) => {
              if (val == null || val === '') return '—'
              const n = parseFloat(val)
              if (isNaN(n) || n === 0) return '—'
              return n.toLocaleString()
            }
            return (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 font-medium text-gray-500 text-xs uppercase tracking-wide">Product</th>
                    <th className="text-left py-2 font-medium text-gray-400 text-xs uppercase tracking-wide hidden sm:table-cell italic">Unit</th>
                    <th className="text-right py-2 font-medium text-gray-500 text-xs uppercase tracking-wide hidden md:table-cell">Monthly</th>
                    <th className="text-right py-2 font-medium text-gray-500 text-xs uppercase tracking-wide hidden md:table-cell">Effective Rate</th>
                    <th className="text-right py-2 font-medium text-gray-500 text-xs uppercase tracking-wide hidden md:table-cell">Overage</th>
                    <th className="text-right py-2 font-medium text-gray-500 text-xs uppercase tracking-wide hidden md:table-cell">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {dealProducts.map((dp) => {
                    const milestones = dp.milestones || []
                    const hasMilestones = milestones.length > 1
                    const prod = dp.products
                    const isGM = dp.commission_metric === 'GM'
                    const isSupport = !!prod?.is_support_charge
                    const isCancelled = dp.status === 'cancelled'
                    const cancellationAmendment = isCancelled && dp.cancellation_amendment_id
                      ? amendments.find((a) => a.id === dp.cancellation_amendment_id)
                      : null
                    const lineTotal = productLineTotal(dp, partnerMultiplier)
                    const monthlyVal = resolveMonthlyValue(dp, partnerMultiplier)
                    const monthlyCell = isGM && !isSupport
                      ? fmtQty(dp.monthly_quantity || dp.quantity)
                      : monthlyVal != null ? fmt(monthlyVal, 2) : '—'

                    // For cancelled products: show what was actually billed during the active period
                    const contractMonths = deal.contract_months || 12
                    const activeMonths = isCancelled ? (dp.billing_months ?? contractMonths) : contractMonths
                    const paidAmount = isCancelled ? lineTotal * (activeMonths / contractMonths) : lineTotal

                    return (
                      <>
                        <tr key={dp.id} className={`${hasMilestones ? 'border-b-0' : ''} ${isCancelled ? 'opacity-60' : ''}`}>
                          <td className="py-3 font-medium text-navy-900">
                            <span className={isCancelled ? 'line-through text-gray-400' : ''}>{prod?.name}</span>
                            {isCancelled && (
                              <span className="ml-2 text-xs bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-normal not-italic">
                                Cancelled{cancellationAmendment?.effective_date ? ` ${format(new Date(cancellationAmendment.effective_date + 'T12:00:00'), 'MMM d, yyyy')}` : ''}
                              </span>
                            )}
                            {!isCancelled && dp.amendment_id && (() => {
                              const addAmendment = amendments.find((a) => a.id === dp.amendment_id)
                              return (
                                <span className="ml-2 text-xs bg-green-100 text-green-700 rounded px-1.5 py-0.5 font-normal">
                                  Added{addAmendment?.effective_date ? ` ${format(new Date(addAmendment.effective_date + 'T12:00:00'), 'MMM d, yyyy')}` : ''}
                                </span>
                              )
                            })()}
                          </td>
                          <td className="py-3 hidden sm:table-cell text-gray-400 italic text-xs">{isGM && !isSupport ? prod?.unit_label : ''}</td>
                          <td className="py-3 text-right hidden md:table-cell text-gray-700">{isCancelled ? '—' : monthlyCell}</td>
                          <td className="py-3 text-right hidden md:table-cell text-gray-700">{!isCancelled && isGM && !isSupport ? fmtRate(dp.unit_price_snapshot) : '—'}</td>
                          <td className="py-3 text-right hidden md:table-cell text-gray-700">{!isCancelled && isGM && !isSupport && dp.overage_rate && parseFloat(dp.overage_rate) > 0 ? fmtRaw(dp.overage_rate) : '—'}</td>
                          <td className="py-3 text-right hidden md:table-cell">
                            {isCancelled ? (
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="font-semibold text-amber-700">{fmt(paidAmount, 2)}</span>
                                <span className="text-[11px] text-gray-400">{activeMonths} of {contractMonths} mo · <span className="line-through">{fmt(lineTotal, 2)}</span></span>
                              </div>
                            ) : (
                              <span className="font-semibold text-navy-900">{fmt(lineTotal, 2)}</span>
                            )}
                          </td>
                        </tr>
                        {hasMilestones && milestones.map((m, i) => (
                          <tr key={`${dp.id}-m-${i}`} className={`bg-gray-50/60 ${isCancelled ? 'opacity-50' : ''}`}>
                            <td className="py-2 pl-6 text-xs text-gray-500" colSpan={1}>
                              <div className="flex items-center gap-1.5">
                                <ChevronRight size={11} className="text-gray-300 flex-shrink-0" />
                                <span className="font-medium text-gray-600">{m.label || `Payment ${i + 1}`}</span>
                              </div>
                            </td>
                            <td className="py-2 hidden sm:table-cell text-xs text-gray-400">
                              {m.payment_date ? format(new Date(m.payment_date + 'T12:00:00'), 'MMM d, yyyy') : '—'}
                            </td>
                            <td colSpan={3} className="py-2 hidden md:table-cell" />
                            <td className="py-2 text-right text-xs font-medium text-gray-600 hidden md:table-cell">{fmt(productLineTotal({ ...dp, total_revenue: parseFloat(m.amount) || 0 }, partnerMultiplier), 2)}</td>
                          </tr>
                        ))}
                      </>
                    )
                  })}
                  <tr className="border-t-2 border-gray-200">
                    <td colSpan={5} className="py-2 font-semibold text-navy-900 text-sm">Annual Investment</td>
                    <td className="py-2 text-right font-bold text-navy-900 hidden md:table-cell">{fmt(customerAcv, 2)}</td>
                  </tr>
                </tbody>
              </table>
            )
          })()}
          {dealProducts.length === 0 && (
            <p className="text-sm text-gray-400 py-6 text-center">No products added.</p>
          )}
        </div>
      </Card>

      {/* Amendment History */}
      {amendments.length > 0 && (
        <Card>
          <CardHeader
            title="Amendment History"
            action={isManager && deal.stage === 'contracted' && (
              <Button variant="secondary" size="sm" icon={<GitBranch size={13} />} onClick={() => setShowAmend(true)}>
                New Amendment
              </Button>
            )}
          />
          <div className="divide-y divide-gray-50">
            {amendments.map((amendment) => {
              const cancelledDp = dealProducts.find((dp) => dp.cancellation_amendment_id === amendment.id)
              const addedDp = dealProducts.find((dp) => dp.amendment_id === amendment.id)
              const isCancellation = !!cancelledDp
              const actionProduct = cancelledDp || addedDp
              return (
                <div key={amendment.id} className="flex items-center gap-4 py-3 text-sm">
                  {/* Type indicator */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isCancellation ? 'bg-amber-50 text-amber-500' : 'bg-green-50 text-green-500'}`}>
                    {isCancellation ? <X size={14} /> : <GitBranch size={14} />}
                  </div>

                  {/* Detail */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-navy-900">
                        {format(new Date(amendment.effective_date + 'T12:00:00'), 'MMM d, yyyy')}
                      </span>
                      <Badge color={isCancellation ? 'orange' : 'green'}>
                        {isCancellation ? 'Cancellation' : 'Addition'}
                      </Badge>
                      {actionProduct && (
                        <span className="text-gray-500">{actionProduct.products?.name}</span>
                      )}
                    </div>
                    {amendment.note && (
                      <p className="text-xs text-gray-400 mt-0.5 italic truncate">"{amendment.note}"</p>
                    )}
                  </div>

                  {/* Edit button — manager only */}
                  {isManager && (
                    <button
                      onClick={() => setEditingAmendment({ amendment, cancelledDp, addedDp })}
                      className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors flex-shrink-0"
                      title="View / edit amendment"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Edit / View Amendment Modal */}
      {editingAmendment && (
        <EditAmendmentModal
          amendment={editingAmendment.amendment}
          cancelledDp={editingAmendment.cancelledDp}
          addedDp={editingAmendment.addedDp}
          deal={deal}
          dealProducts={dealProducts}
          dealTeam={dealTeam}
          dealPartners={dealPartners}
          onSaved={() => load()}
          onClose={() => setEditingAmendment(null)}
        />
      )}

      {/* Commission Schedule */}
      {isManager && !deal.is_tbn_property && schedule.length > 0 && (
        <Card>
          <CardHeader title="Commission Schedule" subtitle="Quarterly payout breakdown" />
          {deal.is_tbn_property && (
            <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4 text-sm text-orange-700">
              <AlertTriangle size={16} />
              TBN properties are excluded from the commission plan.
            </div>
          )}
          <div className="space-y-4">
            {Object.values(quarterGroups).sort((a, b) => a.year !== b.year ? a.year - b.year : a.quarter - b.quarter).map((group) => {
              const total = group.entries.reduce((s, e) => s + (e.amount || 0), 0)
              return (
                <div key={group.key} className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="bg-navy-50 px-4 py-2.5 flex items-center justify-between">
                    <span className="text-sm font-semibold text-navy-900">{group.year} Q{group.quarter}</span>
                    <span className="text-sm font-bold text-primary-600">{fmt(total, 2)}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {group.entries.map((entry, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <div>
                          <span className="font-medium text-navy-900">{entry.person_name}</span>
                          <Badge color={entry.type === 'spif' ? 'yellow' : 'green'} className="ml-2 text-xs">
                            {entry.type === 'spif' ? 'SPIF' : `${entry.role} commission`}
                          </Badge>
                        </div>
                        <span className="font-semibold text-navy-900">{fmt(entry.amount, 2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Contracts */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files?.[0]
          if (file) handleFileUpload({ target: { files: [file] } })
        }}
        className={`rounded-2xl transition-all ${dragging ? 'ring-2 ring-primary-400 ring-offset-2' : ''}`}
      >
      <Card>
        <CardHeader
          title="Contracts"
          action={
            <label className="cursor-pointer">
              <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.doc,.docx,.png,.jpg" />
              <Button size="sm" variant="secondary" loading={uploading} icon={<Upload size={14} />} as="span">
                Upload
              </Button>
            </label>
          }
        />
        {contracts.length === 0 ? (
          <label className={`cursor-pointer flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 transition-colors ${dragging ? 'border-primary-400 bg-primary-50/60' : 'border-gray-200 hover:border-primary-300 hover:bg-primary-50/30'}`}>
            <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.doc,.docx,.png,.jpg" />
            <FileText size={32} className={dragging ? 'text-primary-400 mb-2' : 'text-gray-300 mb-2'} />
            <p className="text-sm font-medium text-gray-500">{dragging ? 'Drop to upload' : 'Drag & drop or click to upload'}</p>
            <p className="text-xs text-gray-400 mt-0.5">PDF, DOC, DOCX, PNG, JPG</p>
          </label>
        ) : (
          <>
          {dragging && (
            <div className="mb-3 flex items-center justify-center border-2 border-dashed border-primary-400 bg-primary-50/60 rounded-xl p-4">
              <p className="text-sm font-medium text-primary-600">Drop to upload</p>
            </div>
          )}
          <div className="space-y-2">
            {contracts.map((contract) => (
              <div key={contract.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50">
                <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                  <FileCheck size={18} className="text-primary-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-navy-900 truncate">{contract.file_name}</p>
                    {contract.version > 1 && (
                      <span className="text-xs bg-navy-100 text-navy-600 font-medium px-1.5 py-0.5 rounded flex-shrink-0">v{contract.version}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    {format(new Date(contract.uploaded_at), 'MMM d, yyyy')}
                    {contract.file_size && ` · ${(contract.file_size / 1024).toFixed(0)} KB`}
                  </p>
                </div>
                <div className="flex gap-1">
                  {contract.mime_type === 'application/pdf' && (
                    <button onClick={() => openAiPanel(contract)} disabled={aiExtracting && aiContract?.id === contract.id} className={`p-2 rounded-lg transition-colors ${aiContract?.id === contract.id ? 'bg-primary-100 text-primary-600' : 'text-gray-400 hover:text-primary-600 hover:bg-primary-50'}`} title="Analyze with AI">
                      {aiExtracting && aiContract?.id === contract.id
                        ? <Loader size={15} className="animate-spin" />
                        : <Sparkles size={15} />
                      }
                    </button>
                  )}
                  {contract.mime_type === 'application/pdf' && (
                    <button onClick={() => handleView(contract)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" title="View PDF">
                      <Eye size={15} />
                    </button>
                  )}
                  <button onClick={() => handleDownload(contract)} className="p-2 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors" title="Download">
                    <Download size={15} />
                  </button>
                  <button onClick={() => setDeleteContractDlg(contract)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </Card>
      </div>

      {/* Activity Log */}
      {auditLog.length > 0 && (() => {
        const people = dealTeam.map((m) => ({ id: m.person_id, name: m.people?.name })).filter((p) => p.name)
        const groups = groupEntriesByDate(auditLog, { dealProducts, people })
        const hasVisible = groups.some((g) => g.entries.length > 0)
        if (!hasVisible) return null
        return (
          <Card>
            <CardHeader
              title="Activity"
              action={<Activity size={15} className="text-gray-400" />}
            />
            <div className="space-y-5">
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{group.label}</p>
                  <div>
                    {group.entries.map(({ entry, formatted }) => {
                      const { label, subject, detail = [], type } = formatted
                      const { dot } = auditTypeStyle(type)
                      const time = format(new Date(entry.created_at), 'h:mm a')
                      const user = entry.changed_by ? entry.changed_by.split('@')[0] : null
                      return (
                        <div key={entry.id} className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
                          <div className="mt-1.5 flex-shrink-0">
                            <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-navy-900">{label}</p>
                            {subject && (
                              <p className="text-xs font-semibold text-navy-700 mt-0.5">{subject}</p>
                            )}
                            {detail.length > 0 && (
                              <table className="mt-1.5 text-[11px] border-separate border-spacing-y-0.5">
                                <tbody>
                                  {detail.map((d) => (
                                    <tr key={d.k}>
                                      <td className="pr-3 text-gray-400 font-medium whitespace-nowrap align-middle">{d.k}</td>
                                      {d.v != null ? (
                                        <td className="text-navy-800 font-semibold align-middle" colSpan={3}>{d.v}</td>
                                      ) : (
                                        <>
                                          <td className="text-gray-400 line-through pr-2 align-middle">{d.old}</td>
                                          <td className="text-gray-300 pr-2 align-middle">→</td>
                                          <td className="text-navy-800 font-semibold align-middle">{d.new}</td>
                                        </>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            <p className="text-xs text-gray-400 mt-1">
                              {user && <span className="font-medium text-gray-500">{user}</span>}
                              {user && ' · '}
                              {time}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )
      })()}

      {/* Contract Analysis Cards */}
      {contracts.filter((c) => c.ai_analysis).map((contract) => {
        const a = contract.ai_analysis
        const isAnalyzing = aiExtracting && aiContract?.id === contract.id
        return (
          <Card key={`analysis-${contract.id}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                  <Sparkles size={16} className="text-primary-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-navy-900">Contract Analysis</p>
                  <p className="text-xs text-gray-400">{contract.file_name}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => openAiPanel(contract, true)} loading={isAnalyzing}>
                  Re-analyze
                </Button>
                <Button size="sm" icon={<Sparkles size={13} />} onClick={() => setAiMinimized(false)}>
                  Ask questions
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {[
                { label: 'Client', value: a.client_name },
                { label: 'Vendor', value: a.vendor_name },
                { label: 'Contract Value', value: a.contract_value },
                { label: 'Payment Terms', value: a.payment_terms },
                { label: 'Start Date', value: a.start_date },
                { label: 'End Date', value: a.end_date },
                { label: 'Auto-Renewal', value: a.auto_renewal != null ? (a.auto_renewal ? 'Yes' : 'No') : null },
                { label: 'Termination Notice', value: a.termination_notice_days ? `${a.termination_notice_days} days` : null },
              ].filter((f) => f.value).map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="text-xs font-medium text-navy-900 mt-0.5">{value}</p>
                </div>
              ))}
            </div>

            {a.payment_schedule?.length > 0 && (
              <div className="bg-gray-50 rounded-lg px-3 py-2.5 mb-3">
                <p className="text-xs text-gray-400 mb-2">Payment Schedule</p>
                <div className="space-y-1">
                  {a.payment_schedule.map((p, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-gray-600">{p.label}{p.date ? ` · ${p.date}` : ''}</span>
                      <span className="font-medium text-navy-900">{p.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {a.summary && (
              <div className="bg-primary-50 border border-primary-100 rounded-lg px-3 py-2.5">
                <p className="text-xs text-primary-600 font-medium mb-1">Summary</p>
                <p className="text-sm text-navy-900 leading-relaxed">{a.summary}</p>
              </div>
            )}
          </Card>
        )
      })}

      {/* Deal Brain Chat Panel */}
      <div className="fixed bottom-6 right-6 z-50 w-96 shadow-2xl rounded-2xl overflow-hidden border border-gray-200 bg-white flex flex-col" style={{ maxHeight: aiMinimized ? 'auto' : '520px' }}>
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 bg-navy-900 cursor-pointer select-none"
            onClick={() => setAiMinimized((m) => !m)}
          >
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-primary-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-white">Deal Brain</span>
              <span className="text-xs text-gray-500">— ask me anything</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={async () => {
                  setAiChat([])
                  if (currentUserId) {
                    await supabase.from('deal_brain_messages')
                      .delete()
                      .eq('deal_id', id)
                      .eq('user_id', currentUserId)
                  }
                }}
                className="text-xs text-gray-500 hover:text-white px-2 py-1 rounded transition-colors"
              >
                Clear
              </button>
              <button onClick={() => setAiMinimized((m) => !m)} className="p-1 text-gray-400 hover:text-white rounded transition-colors">
                {aiMinimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
          </div>

          {!aiMinimized && (
            <div className="flex flex-col overflow-hidden" style={{ maxHeight: '476px' }}>
              {/* Chat */}
              <div className="flex flex-col flex-1 overflow-hidden px-4 pt-3 pb-4 gap-3">
                <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                  {aiExtracting && (
                    <div className="flex flex-col items-center justify-center py-10 gap-3">
                      <div className="relative">
                        <Sparkles size={26} className="text-primary-300" />
                        <Loader size={13} className="animate-spin text-primary-500 absolute -bottom-1 -right-1" />
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-medium text-navy-900">Analyzing contract…</p>
                        <p className="text-xs text-gray-400 mt-0.5">Claude is reading and extracting key terms</p>
                      </div>
                    </div>
                  )}
                  {aiChat.length === 0 && !aiExtracting && (
                    <p className="text-xs text-gray-400 text-center pt-4">Ask anything about this deal</p>
                  )}
                  {aiChat.map((msg, i) => (
                    <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'assistant' && (
                        <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Sparkles size={11} className="text-primary-500" />
                        </div>
                      )}
                      <div className={`max-w-[82%] rounded-2xl px-3 py-2.5 text-xs ${
                        msg.role === 'user'
                          ? 'bg-navy-900 text-white rounded-tr-sm'
                          : 'bg-white border border-gray-200 text-navy-900 rounded-tl-sm shadow-sm'
                      }`}>
                        {msg.role === 'assistant'
                          ? <ReactMarkdown components={aiMarkdownComponents}>{msg.content}</ReactMarkdown>
                          : msg.content}
                      </div>
                    </div>
                  ))}
                  {aiThinking && (
                    <div className="flex gap-2 justify-start">
                      <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                        <Sparkles size={11} className="text-primary-500" />
                      </div>
                      <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-3 py-2.5 shadow-sm flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendAiMessage()}
                    placeholder="Ask anything about this deal…"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
                    disabled={aiExtracting || aiThinking}
                  />
                  <button
                    onClick={sendAiMessage}
                    disabled={!aiInput.trim() || aiThinking || aiExtracting}
                    className="p-2 bg-primary-400 text-white rounded-lg hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send size={13} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

      {showOverview && (
        <DealOverviewModal
          deal={deal}
          dealProducts={dealProducts}
          dealTeam={dealTeam}
          dealPartners={dealPartners}
          approval={approval}
          amendments={amendments}
          onClose={() => setShowOverview(false)}
          isManager={isManager}
        />
      )}
      {showProposal && (
        <ProposalBuilder
          deal={deal}
          dealProducts={dealProducts}
          dealPartners={dealPartners}
          onClose={() => setShowProposal(false)}
        />
      )}
      {showAmend && (
        <AmendDealModal
          deal={deal}
          dealProducts={dealProducts}
          dealTeam={dealTeam}
          dealPartners={dealPartners}
          globalRate={deal.commission_locked_rate || globalRate}
          products={allProducts}
          onAmended={() => load()}
          onClose={() => setShowAmend(false)}
        />
      )}
      {showQuestionnaireBuilder && (
        <QuestionnaireBuilder
          deal={deal}
          onCreated={() => { setShowQuestionnaireBuilder(false); load() }}
          onClose={() => setShowQuestionnaireBuilder(false)}
        />
      )}

      {/* Questionnaire responses drawer */}
      {viewingResponses && (
        <QuestionnaireResponsesDrawer
          questionnaire={viewingResponses}
          onClose={() => setViewingResponses(null)}
          onReopened={() => {
            setViewingResponses(null)
            setQuestionnaires((prev) => prev.map((q) =>
              q.id === viewingResponses.id ? { ...q, status: 'active', submitted_at: null } : q
            ))
          }}
        />
      )}

      {/* Copy questionnaire to another deal */}
      <Modal
        open={!!copyingQ}
        onClose={() => { setCopyingQ(null); setCopyTargetId('') }}
        title="Copy questionnaire to another deal"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setCopyingQ(null); setCopyTargetId('') }}>
              Cancel
            </Button>
            <Button onClick={handleCopyQuestionnaire} loading={copyingQSaving} disabled={!copyTargetId || copyingQSaving}>
              Copy &amp; go to deal
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            A new questionnaire will be created on the target deal with the same questions and settings. Responses are not copied.
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-navy-900">Questionnaire</label>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
              {copyingQ?.title}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-navy-900">Target deal</label>
            <select
              value={copyTargetId}
              onChange={(e) => setCopyTargetId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent py-2.5 px-3"
            >
              <option value="">— Select a deal —</option>
              {copyDeals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.company_name && d.company_name !== d.name ? ` — ${d.company_name}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
      {/* Edit questionnaire items (toggle short/long) */}
      <Modal
        open={!!editingQItems}
        onClose={() => setEditingQItems(null)}
        title="Edit questions"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingQItems(null)}>Cancel</Button>
            <Button onClick={handleSaveEditedItems} loading={editingQSaving} disabled={editingQSaving}>Save changes</Button>
          </>
        }
      >
        {editingQItems && (
          <div className="space-y-1">
            <p className="text-xs text-gray-400 mb-3">Click the type badge on any question to toggle between Short and Long answer.</p>
            {editingQItems.items.map((item, idx) => {
              const isHeader = item.question_type === 'section' || item.question_type === 'subsection'
              return (
                <div key={item.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${isHeader ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
                  <span className="text-xs text-gray-400 w-4 text-right flex-shrink-0">{isHeader ? '§' : `${idx + 1}.`}</span>
                  <span className="text-sm text-gray-800 flex-1">{item.question_text}</span>
                  {!isHeader && (
                    <button
                      onClick={() => setEditingQItems((prev) => ({
                        ...prev,
                        items: prev.items.map((it, i) => i === idx
                          ? { ...it, question_type: it.question_type === 'short' ? 'long' : 'short' }
                          : it
                        ),
                      }))}
                      className="text-xs px-2 py-0.5 rounded border font-medium transition-colors flex-shrink-0"
                      style={item.question_type === 'long'
                        ? { color: '#7c3aed', background: '#f5f3ff', borderColor: '#ddd6fe' }
                        : { color: '#1d4ed8', background: '#eff6ff', borderColor: '#bfdbfe' }}
                    >
                      {item.question_type === 'long' ? 'Long' : 'Short'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteQDlg}
        onClose={() => setDeleteQDlg(null)}
        onConfirm={async () => {
          await supabase.from('questionnaires').delete().eq('id', deleteQDlg.id)
          setQuestionnaires(prev => prev.filter(qi => qi.id !== deleteQDlg.id))
          setDeleteQDlg(null)
        }}
        title="Delete Questionnaire"
        message={`"${deleteQDlg?.title}" has no responses and will be permanently deleted.`}
      />
      <ConfirmDialog
        open={deleteDlg}
        onClose={() => setDeleteDlg(false)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Deal"
        message={`"${deal.name}" will be moved to the trash. You can restore it from the Deals page.`}
      />
      <ConfirmDialog
        open={!!deleteContractDlg}
        onClose={() => setDeleteContractDlg(null)}
        onConfirm={() => handleDeleteContract(deleteContractDlg)}
        title="Delete Contract"
        message={`Are you sure you want to delete "${deleteContractDlg?.file_name}"? This cannot be undone.`}
      />
    </div>
  )
}
