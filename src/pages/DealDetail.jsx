import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Edit, Trash2, Upload, FileText, Download, ChevronRight, DollarSign, Users, Package, FileCheck, AlertTriangle, ChevronDown, ChevronUp, Eye, Sparkles, Send, X, Loader, Copy, Check, LayoutTemplate } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Card, { CardHeader } from '../components/ui/Card'
import { StageBadge, Badge } from '../components/ui/Badge'
import Button from '../components/ui/Button'
import { Select } from '../components/ui/Input'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { DEAL_STAGES } from '../lib/constants'
import { buildCommissionSchedule, fmt, getMarginTier } from '../lib/commission'
import { PageSpinner } from '../components/ui/Spinner'
import { useUser } from '../contexts/UserContext'
import DealOverviewModal from '../components/DealOverviewModal'
import ProposalModal from '../components/ProposalModal'
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
    ] = await Promise.all([
      supabase.from('deals').select('*').eq('id', id).single(),
      supabase.from('deal_products').select('*, products(name, commission_metric, unit_label, is_support_charge)').eq('deal_id', id),
      supabase.from('deal_team').select('*, people(name, role, email)').eq('deal_id', id),
      supabase.from('contracts').select('*, ai_analysis').eq('deal_id', id).order('uploaded_at', { ascending: false }),
      supabase.from('deal_partners').select('*, partners(name)').eq('deal_id', id).order('sort_order'),
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
    setDeal(d)
    setDealProducts((dps || []).map((dp) => ({
      ...dp,
      milestones: milestonesData.filter((m) => m.deal_product_id === dp.id),
    })))
    setDealTeam(team || [])
    setDealPartners(dPartners || [])
    setContracts(conts || [])
    setApproval(appr || null)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

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
    await supabase.from('deals').update({ stage, updated_at: new Date().toISOString() }).eq('id', id)
    await logEvent(`Stage changed from ${deal.stage} to ${stage}`)
    setDeal((d) => ({ ...d, stage }))
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
    const { data } = await supabase
      .from('audit_log')
      .select('id, table_name, action, changed_by, old_values, new_values, description, created_at')
      .or(`deal_id.eq.${id},table_name.eq.commission_settings`)
      .order('created_at', { ascending: false })
      .limit(20)
    setAuditLog(data || [])
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

  // For support charges saved before COGS tracking, derive from support_cogs_pct
  function effectiveCogs(dp) {
    if (dp.cogs_amount) return dp.cogs_amount
    if (dp.products?.is_support_charge && dp.support_cogs_pct != null) {
      return (dp.annual_value || 0) * dp.support_cogs_pct / 100
    }
    return 0
  }

  const totalCommission = deal.is_tbn_property ? 0 : dealProducts.reduce((s, p) => s + (p.commission_amount || 0), 0)
  const totalCogs = dealProducts.reduce((s, p) => s + effectiveCogs(p), 0)
  const totalRevenue = dealProducts.reduce((s, p) => s + ((p.total_revenue || p.annual_value || p.yearly_cost || 0)), 0)

  // ACV calculated from actual products
  const productACV = dealProducts.reduce((s, p) => {
    if (p.commission_metric === 'GM') {
      if (p.monthly_cost != null && p.monthly_cost > 0) return s + p.monthly_cost * 12
      return s + (p.yearly_cost || (p.net_revenue || 0) + (p.cogs_amount || 0))
    }
    return s + (p.annual_value || 0)
  }, 0)

  // Partner stacked pricing
  let _cv = productACV > 0 ? productACV : (deal.acv || 0)
  const partnerStack = dealPartners.map((dp) => {
    const pct = parseFloat(dp.commission_pct) / 100
    const prev = _cv
    _cv = pct > 0 && pct < 1 ? prev / (1 - pct) : prev
    return { ...dp, commission_amount: _cv - prev }
  })
  const customerAcv = _cv

  const schedule = buildCommissionSchedule(
    deal,
    dealProducts,
    dealTeam.map((m) => ({ ...m, person_name: m.people?.name }))
  )

  const salesTeam = dealTeam.filter((m) => m.role === 'sales')
  const supportTeam = dealTeam.filter((m) => m.role === 'support')

  const quarterGroups = schedule.reduce((acc, entry) => {
    const key = `${entry.year} Q${entry.quarter}`
    if (!acc[key]) acc[key] = { key, quarter: entry.quarter, year: entry.year, entries: [] }
    acc[key].entries.push(entry)
    return acc
  }, {})

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
          <Button variant="secondary" size="sm" onClick={() => setShowProposal(true)} icon={<FileText size={14} />}>Proposal</Button>
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
          { label: 'Total Value', value: fmt(dealProducts.length > 0 ? customerAcv * (deal.contract_months || 12) / 12 : (deal.total_contract_value || deal.acv), 2), show: true },
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
              const myCommission = totalCommission * ((m.commission_percent || 0) / 100)
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
                  {!isManager && isOwnRow && <Badge color="green">{fmt(myCommission, 2)}</Badge>}
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

      {/* Products */}
      <Card>
        <CardHeader title="Products & Services" subtitle={isManager && !deal.is_tbn_property ? `Total Commission: ${fmt(totalCommission, 2)}` : undefined} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 font-medium text-gray-500 text-xs uppercase tracking-wide">Product</th>
                <th className="text-left py-2 font-medium text-gray-500 text-xs uppercase tracking-wide hidden sm:table-cell">Metric</th>
                <th className="text-right py-2 font-medium text-gray-500 text-xs uppercase tracking-wide hidden md:table-cell">Trilogy Revenue</th>
                <th className="text-right py-2 font-medium text-gray-500 text-xs uppercase tracking-wide hidden md:table-cell">COGS</th>
                {isManager && !deal.is_tbn_property && <th className="text-right py-2 font-medium text-gray-500 text-xs uppercase tracking-wide">Commission</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {dealProducts.map((dp) => {
                const milestones = dp.milestones || []
                const hasMilestones = milestones.length > 1
                return (
                  <>
                    <tr key={dp.id} className={hasMilestones ? 'border-b-0' : ''}>
                      <td className="py-3 font-medium text-navy-900">
                        {dp.products?.name}
                        {dp.overage_rate && parseFloat(dp.overage_rate) > 0 && (
                          <p className="text-xs text-gray-400 font-normal mt-0.5">
                            Overage: ${parseFloat(dp.overage_rate).toFixed(4)}/{dp.products?.unit_label || 'unit'}
                          </p>
                        )}
                      </td>
                      <td className="py-3 hidden sm:table-cell text-gray-500">{dp.commission_metric}</td>
                      <td className="py-3 text-right hidden md:table-cell text-gray-700">{fmt(dp.total_revenue || dp.annual_value || dp.yearly_cost, 2)}</td>
                      <td className="py-3 text-right hidden md:table-cell text-gray-500">{effectiveCogs(dp) > 0 ? fmt(effectiveCogs(dp), 2) : '—'}</td>
                      {isManager && !deal.is_tbn_property && <td className="py-3 text-right font-semibold text-primary-600">{fmt(dp.commission_amount, 2)}</td>}
                    </tr>
                    {hasMilestones && milestones.map((m, i) => (
                      <tr key={`${dp.id}-m-${i}`} className="bg-gray-50/60">
                        <td className="py-2 pl-6 text-xs text-gray-500" colSpan={1}>
                          <div className="flex items-center gap-1.5">
                            <ChevronRight size={11} className="text-gray-300 flex-shrink-0" />
                            <span className="font-medium text-gray-600">{m.label || `Payment ${i + 1}`}</span>
                          </div>
                        </td>
                        <td className="py-2 hidden sm:table-cell text-xs text-gray-400">
                          {m.payment_date ? format(new Date(m.payment_date + 'T12:00:00'), 'MMM d, yyyy') : '—'}
                        </td>
                        <td className="py-2 text-right text-xs font-medium text-gray-600 hidden md:table-cell">{fmt(parseFloat(m.amount), 2)}</td>
                        <td className="py-2 hidden md:table-cell" />
                        {isManager && !deal.is_tbn_property && (
                          <td className="py-2 text-right text-xs text-gray-400">
                            {fmt(parseFloat(m.amount) * (dp.base_rate || 0.07), 2)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </>
                )
              })}
              <tr className="border-t-2 border-gray-200">
                <td colSpan={2} className="py-2 font-semibold text-navy-900 text-sm">Total</td>
                <td className="py-2 text-right hidden md:table-cell">
                  <span className="font-bold text-navy-900">{fmt(totalRevenue, 2)}</span>
                  {dealPartners.length > 0 && (
                    <p className="text-xs text-purple-600 font-medium mt-0.5">Customer: {fmt(customerAcv, 2)}</p>
                  )}
                </td>
                <td className="py-2 text-right font-bold text-navy-900 hidden md:table-cell">{fmt(totalCogs, 2)}</td>
                {isManager && !deal.is_tbn_property && <td className="py-2 text-right font-bold text-primary-600">{fmt(totalCommission, 2)}</td>}
              </tr>
            </tbody>
          </table>
          {dealProducts.length === 0 && (
            <p className="text-sm text-gray-400 py-6 text-center">No products added.</p>
          )}
        </div>
      </Card>

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
          onClose={() => setShowOverview(false)}
          isManager={isManager}
        />
      )}
      {showProposal && (
        <ProposalModal
          deal={deal}
          dealProducts={dealProducts}
          dealTeam={dealTeam}
          dealPartners={dealPartners}
          onClose={() => setShowProposal(false)}
        />
      )}
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
