import { useState, useRef, useMemo, useEffect, useCallback, lazy, Suspense } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { differenceInDays, isSameDay, parseISO, subDays } from 'date-fns'
import { Edit, Trash2, FileText, AlertTriangle, GitBranch, RefreshCw, ArrowRight, ChevronDown, ChevronUp, Link, ExternalLink, Download, Eye, Paperclip } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Card, { CardHeader } from '../components/ui/Card'
import { StageBadge, Badge } from '../components/ui/Badge'
import Button from '../components/ui/Button'
import { Select } from '../components/ui/Input'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { DEAL_STAGES } from '../lib/constants'
import { buildCommissionSchedule, fmt } from '../lib/commission'
import { computeDealTotals, calcTotalRevenue, calcTotalContractValue, calcIndividualCommission, groupScheduleByQuarter } from '../lib/deals'
import { productLineTotal } from '../lib/products'
import { PageSpinner } from '../components/ui/Spinner'
import { useUser } from '../contexts/UserContext'
import Modal from '../components/ui/Modal'
import DealOverviewModal from '../components/DealOverviewModal'
import AmendDealModal from '../components/AmendDealModal'
import EditAmendmentModal from '../components/EditAmendmentModal'
const ProposalBuilder = lazy(() => import('../components/ProposalBuilder'))
import { format } from 'date-fns'
import { useDealDetail } from '../hooks/useDealDetail'
import MarginApprovalBanner from '../components/deal/MarginApprovalBanner'
import DealProductsTable from '../components/deal/DealProductsTable'
import DealQuestionnairesCard from '../components/deal/DealQuestionnairesCard'
import AmendmentHistoryCard from '../components/deal/AmendmentHistoryCard'
import CommissionScheduleCard from '../components/deal/CommissionScheduleCard'
import DealContractsCard from '../components/deal/DealContractsCard'
import DealReceivablesCard from '../components/deal/DealReceivablesCard'
import ActivityLogCard from '../components/deal/ActivityLogCard'
import DealNotesCard from '../components/deal/DealNotesCard'
import StartRenewalModal from '../components/deal/StartRenewalModal'
import AttachVendorContractModal from '../components/AttachVendorContractModal'
import ContractAnalysisCards from '../components/deal/ContractAnalysisCards'
import DealBrainPanel from '../components/deal/DealBrainPanel'
import ExecReportModal from '../components/ExecReportModal'

function DocsDropdown({ onProposal, onExecReport, onQuestionnaire, proposalDisabled, isManager }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function pick(fn) {
    setOpen(false)
    fn()
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <FileText size={14} />
        Documents
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
          <button
            onClick={() => pick(onProposal)}
            disabled={proposalDisabled}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Proposal
          </button>
          <button
            onClick={() => pick(onQuestionnaire)}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Questionnaire
          </button>
          {isManager && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={() => pick(onExecReport)}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Exec Report
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function StageProgress({ current }) {
  const active = DEAL_STAGES.filter((s) => !['closed_lost', 'closed_won'].includes(s.key))
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

function LinkedVendorContractCard({ vc, deal, onNavigate, onUnlink }) {
  const [expanded, setExpanded] = useState(false)
  const [docs, setDocs] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(false)

  const daysLeft = vc.end_date ? differenceInDays(parseISO(vc.end_date), new Date()) : null
  const notifyDate = vc.end_date && vc.notice_period_days ? subDays(parseISO(vc.end_date), vc.notice_period_days) : null
  const hasConflict = vc.notice_period_days && deal.notice_period_days && vc.notice_period_days > deal.notice_period_days
  const isExpired = daysLeft !== null && daysLeft < 0

  async function toggleExpand() {
    if (!expanded && docs.length === 0) {
      setLoadingDocs(true)
      const { data } = await supabase
        .from('vendor_contract_documents')
        .select('*')
        .eq('contract_id', vc.id)
        .order('uploaded_at', { ascending: false })
      setDocs(data || [])
      setLoadingDocs(false)
    }
    setExpanded((e) => !e)
  }

  async function handleView(doc) {
    const { data } = await supabase.storage.from('contracts').createSignedUrl(doc.file_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function handleDownload(doc) {
    const { data } = await supabase.storage.from('contracts').download(doc.file_path)
    if (data) {
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url; a.download = doc.file_name; a.click()
      URL.revokeObjectURL(url)
    }
  }

  const noticeOverdue = notifyDate !== null && differenceInDays(notifyDate, new Date()) <= 0 && !isExpired
  const noticeSoon    = notifyDate !== null && differenceInDays(notifyDate, new Date()) > 0 && differenceInDays(notifyDate, new Date()) <= 30
  const isRed    = !isExpired && (hasConflict || noticeOverdue || (daysLeft !== null && daysLeft <= 30))
  const isAmber  = !isExpired && !isRed && (noticeSoon || (daysLeft !== null && daysLeft <= 60))
  const dotColor = isExpired ? 'bg-gray-300' : isRed ? 'bg-red-400' : isAmber ? 'bg-amber-400' : 'bg-green-400'
  const badgeCls = isExpired ? 'bg-gray-100 text-gray-400' : isRed ? 'bg-red-50 text-red-600' : isAmber ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'

  return (
    <div className={`rounded-lg border transition-colors ${hasConflict ? 'border-amber-200' : 'border-gray-100'}`}>
      {/* Header row */}
      <button
        onClick={toggleExpand}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-lg transition-colors"
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-navy-900">{vc.vendors?.name}</span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-500 truncate">{vc.title}</span>
            {vc.renewal_intent && <span className="text-[11px] bg-green-100 text-green-700 rounded px-1.5 py-0.5 font-medium">Renewal planned</span>}
            {hasConflict && <span className="text-[11px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-medium flex items-center gap-1"><AlertTriangle size={10}/> Vendor notice conflict</span>}
            {!hasConflict && noticeOverdue && <span className="text-[11px] bg-red-100 text-red-600 rounded px-1.5 py-0.5 font-medium flex items-center gap-1"><AlertTriangle size={10}/> Notice period active</span>}
            {!hasConflict && !noticeOverdue && noticeSoon && <span className="text-[11px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-medium">Notice due in {differenceInDays(notifyDate, new Date())}d</span>}
          </div>
          {vc.end_date && (
            <p className={`text-xs mt-0.5 ${noticeOverdue ? 'text-red-500' : hasConflict || noticeSoon ? 'text-amber-600' : 'text-gray-400'}`}>
              {isExpired
                ? `Expired ${format(parseISO(vc.end_date), 'MMM d, yyyy')}`
                : hasConflict
                ? `Vendor requires ${vc.notice_period_days}d notice · customer is ${deal.notice_period_days}d · Ends ${format(parseISO(vc.end_date), 'MMM d, yyyy')}`
                : noticeOverdue
                ? `${vc.notice_period_days}d notice window is active · Ends ${format(parseISO(vc.end_date), 'MMM d, yyyy')}`
                : noticeSoon
                ? `Send notice by ${format(notifyDate, 'MMM d, yyyy')} · Ends ${format(parseISO(vc.end_date), 'MMM d, yyyy')}`
                : `Ends ${format(parseISO(vc.end_date), 'MMM d, yyyy')}${vc.notice_period_days ? ` · ${vc.notice_period_days}d notice` : ''}`}
            </p>
          )}
        </div>
        {daysLeft !== null && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${badgeCls}`}>
            {isExpired ? 'Expired' : daysLeft === 0 ? 'Today' : `${daysLeft}d`}
          </span>
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onNavigate() }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onNavigate() } }}
            className="p-1.5 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            title="Open in Vendors"
          >
            <ExternalLink size={13}/>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onUnlink(vc.id) }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onUnlink(vc.id) } }}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
            title="Remove from deal"
          >
            <Trash2 size={13}/>
          </div>
          <span className="p-1.5 text-gray-400">
            {expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
          </span>
        </div>
      </button>

      {/* Expanded documents */}
      {expanded && (
        <div className="border-t border-gray-100 px-3 pb-3 pt-2">
          {loadingDocs ? (
            <p className="text-xs text-gray-400 py-2">Loading documents…</p>
          ) : docs.length === 0 ? (
            <div className="text-xs text-gray-400 py-2 flex items-center gap-1.5">
              <Paperclip size={12}/> No documents uploaded. Go to <span role="button" tabIndex={0} onClick={onNavigate} onKeyDown={(e) => { if (e.key === 'Enter') onNavigate() }} className="text-primary-500 hover:underline cursor-pointer">Vendor page</span> to upload.
            </div>
          ) : (
            <div className="space-y-1.5 mt-1">
              {docs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50 group">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={13} className="text-gray-400 flex-shrink-0"/>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-navy-900 truncate">{doc.file_name}</p>
                      {doc.is_termination_doc && (
                        <span className="text-[10px] bg-red-50 text-red-600 rounded px-1 py-0.5">Termination</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleView(doc)}
                      className="p-1.5 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors"
                      title="View"
                    >
                      <Eye size={13}/>
                    </button>
                    <button
                      onClick={() => handleDownload(doc)}
                      className="p-1.5 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Download"
                    >
                      <Download size={13}/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function DealDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { isManager, isSales, profile } = useUser()

  const {
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
    linkedVendorContracts, setLinkedVendorContracts,
    load,
    loadAuditLog,
    logEvent,
    handleStageChange: _handleStageChange,
    handleDelete: _handleDelete,
    handleApprovalAction: _handleApprovalAction,
  } = useDealDetail(id)

  const [showAttachVendorModal, setShowAttachVendorModal] = useState(false)

  // UI-only state
  const [deleteDlg, setDeleteDlg] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [stageChanging, setStageChanging] = useState(false)
  const [approving, setApproving] = useState(false)
  const [showOverview, setShowOverview] = useState(false)
  const [showProposal, setShowProposal] = useState(false)
  const [showAmend, setShowAmend] = useState(false)
  const [showRenewal, setShowRenewal] = useState(false)
  // Auto-open renewal modal when navigated here from Dashboard "Start Renewal"
  useEffect(() => {
    if (location.state?.openRenewal) {
      setShowRenewal(true)
      // Clear the flag so a refresh doesn't re-open it
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state?.openRenewal])
  const [showQuestionnaireBuilder, setShowQuestionnaireBuilder] = useState(false)
  const [editingAmendment, setEditingAmendment] = useState(null)
  const [showExecReport, setShowExecReport] = useState(false)
  // AI coordination state (shared between DealBrainPanel & ContractAnalysisCards)
  const [aiExtracting, setAiExtracting] = useState(false)
  const [aiContract, setAiContract] = useState(null)
  const brainPanelRef = useRef(null)

  // Derived values — memoised so they only recompute when deps change
  const activeProducts = useMemo(
    () => dealProducts.filter((dp) => dp.status !== 'cancelled'),
    [dealProducts]
  )
  const { productAcv: productACV, customerAcv, partnerMultiplier, totalCogs, totalCommission: _tc } = useMemo(
    () => computeDealTotals(activeProducts, dealPartners),
    [activeProducts, dealPartners]
  )
  const totalCommission = deal?.is_tbn_property ? 0 : _tc
  const cancelledPaidTotal = useMemo(() => {
    const contractMonths = deal?.contract_months || 12
    return dealProducts
      .filter((dp) => dp.status === 'cancelled')
      .reduce((sum, dp) => {
        const lineTotal = productLineTotal(dp, partnerMultiplier)
        const activeMonths = dp.billing_months ?? contractMonths
        return sum + lineTotal * (activeMonths / contractMonths)
      }, 0)
  }, [dealProducts, deal, partnerMultiplier])
  const displayAcv = customerAcv + cancelledPaidTotal
  const schedule = useMemo(
    () => deal
      ? buildCommissionSchedule(deal, dealProducts, dealTeam.map((m) => ({ ...m, person_name: m.people?.name })))
      : [],
    [deal, dealProducts, dealTeam]
  )
  const quarterGroups = useMemo(() => groupScheduleByQuarter(schedule), [schedule])
  const salesTeam   = useMemo(() => dealTeam.filter((m) => m.role === 'sales'),   [dealTeam])
  const supportTeam = useMemo(() => dealTeam.filter((m) => m.role === 'support'), [dealTeam])
  const partnerTeam = useMemo(() => dealTeam.filter((m) => m.role === 'partner'), [dealTeam])

  function buildDealContext() {
    if (!deal) return null
    const ctx = {
      deal: {
        id: deal.id, name: deal.name, company: deal.company_name, stage: deal.stage,
        deal_type: deal.deal_type, is_tbn_property: deal.is_tbn_property,
        contract_start: deal.contract_start, contract_end: deal.contract_end,
        contract_months: deal.contract_months, notes: deal.notes,
        notice_period_days: deal.notice_period_days ?? null,
        created_by: deal.created_by || null,
        created_at: deal.created_at ? new Date(deal.created_at).toLocaleString() : null,
        updated_at: deal.updated_at ? new Date(deal.updated_at).toLocaleString() : null,
      },
      products: dealProducts.map((dp) => ({
        name: dp.products?.name, metric: dp.commission_metric,
        annual_value: dp.annual_value, net_revenue: dp.net_revenue,
        cogs: dp.cogs_amount, commission: dp.commission_amount,
        base_rate: dp.base_rate,
        milestones: (dp.milestones || []).map((m) => ({ label: m.label, date: m.payment_date, amount: m.amount })),
      })),
      team: dealTeam.map((m) => ({
        name: m.people?.name, role: m.role,
        commission_percent: m.commission_percent, spif_amount: m.spif_amount,
      })),
      commission_schedule: schedule,
      contracts: contracts.map((c) => ({
        file_name: c.file_name,
        uploaded_at: c.uploaded_at ? new Date(c.uploaded_at).toLocaleString() : null,
        ...(c.ai_analysis ? { analysis: c.ai_analysis } : {}),
      })),
      audit_log: auditLog,
      vendor_contracts: linkedVendorContracts.length > 0 ? linkedVendorContracts.map((vc) => {
        const conflict = vc.notice_period_days && deal.notice_period_days && vc.notice_period_days > deal.notice_period_days
        return {
          vendor: vc.vendors?.name,
          title: vc.title,
          end_date: vc.end_date || null,
          notice_period_days: vc.notice_period_days ?? null,
          renewal_intent: vc.renewal_intent || false,
          conflict: conflict || false,
        }
      }) : undefined,
    }
    return ctx
  }

  async function handleStageChange(stage) {
    setStageChanging(true)
    await _handleStageChange(stage, { dealProducts, globalRate })
    setStageChanging(false)
  }

  async function handleDelete() {
    setDeleting(true)
    await _handleDelete()
  }

  async function handleApprovalAction(newStatus) {
    setApproving(true)
    await _handleApprovalAction(newStatus)
    setApproving(false)
  }

  if (loading) return <PageSpinner />
  if (!deal) return <div className="p-8 text-center text-gray-500">Deal not found.</div>

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-32">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-bold text-navy-900">{deal.name}</h2>
            {deal.is_tbn_property && <Badge color="orange">TBN Property</Badge>}
          </div>
          <p className="text-sm text-gray-500">{deal.company_name}</p>
          {/* Predecessor / successor links */}
          {predecessor && (
            <button
              onClick={() => navigate(`/deals/${predecessor.id}`)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary-500 transition-colors mt-1"
            >
              <ArrowRight size={11} className="rotate-180" />
              Renewal of <span className="font-medium text-gray-600">{predecessor.name}</span>
            </button>
          )}
          {successors.length > 0 && successors.map((s) => (
            <button
              key={s.id}
              onClick={() => navigate(`/deals/${s.id}`)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary-500 transition-colors mt-1"
            >
              <ArrowRight size={11} />
              Renewal: <span className="font-medium text-gray-600">{s.name}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Button variant="secondary" size="sm" onClick={() => setShowOverview(true)}>Overview</Button>

          {/* Documents dropdown */}
          <DocsDropdown
            onProposal={() => setShowProposal(true)}
            onExecReport={() => setShowExecReport(true)}
            onQuestionnaire={() => setShowQuestionnaireBuilder(true)}
            proposalDisabled={['lead', 'qualified', 'discovery'].includes(deal.stage) || approval?.status === 'pending'}
            isManager={isManager}
          />

          {isManager && deal.stage === 'contracted' && (
            <Button variant="secondary" size="sm" onClick={() => setShowAmend(true)} icon={<GitBranch size={14} />}>Amend</Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => navigate(`/deals/${id}/edit`)} icon={<Edit size={14} />}>Edit</Button>
          <Button variant="danger" size="sm" onClick={() => setDeleteDlg(true)} icon={<Trash2 size={14} />}>Delete</Button>
        </div>
      </div>

      {/* Renewal banner — contracted deals expiring within 90 days */}
      {deal.stage === 'contracted' && deal.contract_end && (() => {
        const daysLeft = differenceInDays(parseISO(deal.contract_end), new Date())
        const expired  = daysLeft < 0
        const soon     = daysLeft <= 90
        const renewalInProgress = successors.length > 0
        if (!soon && !expired) return null
        const isRed = expired || daysLeft <= 30
        return (
          <div className={`flex items-center justify-between gap-4 rounded-2xl px-5 py-3.5 border ${
            isRed ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-center gap-3">
              <RefreshCw size={16} className={isRed ? 'text-red-500' : 'text-amber-500'} />
              <div>
                <p className={`text-sm font-semibold ${isRed ? 'text-red-700' : 'text-amber-700'}`}>
                  {daysLeft === 0 ? 'Contract expires today' : expired ? 'Contract has expired' : `Contract expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`}
                </p>
                <p className={`text-xs mt-0.5 ${isRed ? 'text-red-500' : 'text-amber-500'}`}>
                  {renewalInProgress
                    ? `Expires ${format(new Date(deal.contract_end + 'T12:00:00'), 'MMMM d, yyyy')} · Renewal deal is in progress.`
                    : `Expires ${format(new Date(deal.contract_end + 'T12:00:00'), 'MMMM d, yyyy')} · Start the renewal to keep this customer.`}
                </p>
              </div>
            </div>
            {renewalInProgress ? (
              <button
                onClick={() => navigate(`/deals/${successors[0].id}`)}
                className={`text-xs font-semibold flex-shrink-0 flex items-center gap-1 ${isRed ? 'text-red-600 hover:text-red-700' : 'text-amber-600 hover:text-amber-700'}`}
              >
                View Renewal <ArrowRight size={11}/>
              </button>
            ) : isManager ? (
              <Button
                size="sm"
                icon={<RefreshCw size={13} />}
                onClick={() => setShowRenewal(true)}
                className={`${isRed ? '!bg-red-500 hover:!bg-red-600' : '!bg-amber-500 hover:!bg-amber-600'} flex-shrink-0`}
              >
                Start Renewal
              </Button>
            ) : null}
          </div>
        )
      })()}

      {/* Vendor contract renewal awareness */}
      {deal.stage === 'contracted' && linkedVendorContracts.length > 0 && (() => {
        const today = new Date()
        const alerts = linkedVendorContracts
          .filter((vc) => vc.end_date)
          .map((vc) => {
            const daysLeft = differenceInDays(parseISO(vc.end_date), today)
            const notifyDate = vc.notice_period_days ? subDays(parseISO(vc.end_date), vc.notice_period_days) : null
            const daysUntilNotify = notifyDate ? differenceInDays(notifyDate, today) : null
            const hasConflict = vc.notice_period_days && deal.notice_period_days && vc.notice_period_days > deal.notice_period_days
            const needsAction = daysLeft <= 120
            return { ...vc, daysLeft, notifyDate, daysUntilNotify, hasConflict, needsAction }
          })
          .filter((vc) => vc.needsAction || vc.hasConflict)
          .sort((a, b) => a.daysLeft - b.daysLeft)

        if (alerts.length === 0) return null
        return (
          <div className="space-y-2">
            {alerts.map((vc) => {
              const noticeOverdue = vc.daysUntilNotify !== null && vc.daysUntilNotify <= 0
              const noticeSoon   = vc.daysUntilNotify !== null && vc.daysUntilNotify > 0 && vc.daysUntilNotify <= 30
              const isConflict   = vc.hasConflict
              const color = isConflict || noticeOverdue ? 'red' : noticeSoon ? 'amber' : 'amber'
              const bg    = color === 'red' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
              const icon  = color === 'red' ? 'text-red-500' : 'text-amber-500'
              const head  = color === 'red' ? 'text-red-700' : 'text-amber-700'
              const sub   = color === 'red' ? 'text-red-500' : 'text-amber-500'
              return (
                <div key={vc.id} className={`flex items-center justify-between gap-4 rounded-2xl px-5 py-3.5 border ${bg}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <AlertTriangle size={16} className={`${icon} flex-shrink-0`} />
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${head}`}>
                        {isConflict
                          ? `Vendor notice conflict — ${vc.vendors?.name}`
                          : noticeOverdue
                          ? `Notice period active — ${vc.vendors?.name}`
                          : `Notice due soon — ${vc.vendors?.name}`}
                      </p>
                      <p className={`text-xs mt-0.5 ${sub}`}>
                        {isConflict
                          ? `Vendor requires ${vc.notice_period_days}d notice but customer contract is ${deal.notice_period_days}d — renew vendor first.`
                          : noticeOverdue
                          ? `${vc.notice_period_days}d notice window is active. Contract ends ${format(parseISO(vc.end_date), 'MMM d, yyyy')} (${vc.daysLeft}d left).`
                          : `Must send notice by ${format(vc.notifyDate, 'MMM d, yyyy')} — ${vc.daysUntilNotify}d away. Contract ends ${format(parseISO(vc.end_date), 'MMM d, yyyy')}.`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/vendors/${vc.vendor_id}`)}
                    className={`text-xs font-semibold flex-shrink-0 flex items-center gap-1 ${color === 'red' ? 'text-red-600 hover:text-red-700' : 'text-amber-600 hover:text-amber-700'}`}
                  >
                    View Contract <ExternalLink size={11}/>
                  </button>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Stage bar */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <StageBadge stage={deal.stage} />
            <Select value={deal.stage} onChange={(e) => handleStageChange(e.target.value)} className="w-48">
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
            {dealProducts.length > 0 ? fmt(displayAcv, 2) : fmt(deal.acv, 2)}
          </p>
          {dealProducts.length > 0 && dealPartners.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">Trilogy net: {fmt(productACV, 2)}</p>
          )}
          {dealProducts.length > 0 && dealPartners.length === 0 && deal.acv > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">Est. {fmt(deal.acv, 2)}</p>
          )}
        </Card>
        {[
          { label: 'Total Value', value: fmt(dealProducts.length > 0 ? calcTotalContractValue(displayAcv, deal.contract_months || 12) : (deal.total_contract_value || deal.acv), 2), show: true },
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
      <MarginApprovalBanner
        approval={approval}
        productACV={productACV}
        totalCogs={totalCogs}
        isManager={isManager}
        approving={approving}
        onApprovalAction={handleApprovalAction}
      />

      {/* Deal Info + Team */}
      <div className={`grid grid-cols-1 gap-5 ${dealTeam.length > 0 ? 'lg:grid-cols-2' : ''}`}>
        <Card>
          <CardHeader title="Deal Info" />
          <dl className="space-y-2.5">
            {(() => {
              const pdfEndMismatch = deal.contract_end
                ? contracts.reduce((found, c) => {
                    if (found) return found
                    const pdfDate = c.ai_analysis?.end_date
                    if (!pdfDate) return null
                    try {
                      return !isSameDay(parseISO(pdfDate), parseISO(deal.contract_end))
                        ? { pdf: format(parseISO(pdfDate), 'MMM d, yyyy') }
                        : null
                    } catch { return null }
                  }, null)
                : null
              const pdfStartMismatch = deal.contract_start
                ? contracts.reduce((found, c) => {
                    if (found) return found
                    const pdfDate = c.ai_analysis?.start_date
                    if (!pdfDate) return null
                    try {
                      return !isSameDay(parseISO(pdfDate), parseISO(deal.contract_start))
                        ? { pdf: format(parseISO(pdfDate), 'MMM d, yyyy') }
                        : null
                    } catch { return null }
                  }, null)
                : null
              const notifyDate = deal.contract_end && deal.notice_period_days
                ? subDays(parseISO(deal.contract_end), deal.notice_period_days)
                : null
              const pdfNoticeMismatch = (() => {
                for (const c of contracts) {
                  const pdfDays = c.ai_analysis?.termination_notice_days
                  if (pdfDays == null) continue
                  if (deal.notice_period_days == null || pdfDays !== deal.notice_period_days)
                    return { pdf: `${pdfDays} days` }
                }
                return null
              })()
              const pdfAutoRenewalMismatch = (() => {
                for (const c of contracts) {
                  const pdfVal = c.ai_analysis?.auto_renewal
                  if (pdfVal == null) continue
                  if (deal.auto_renewal == null || pdfVal !== deal.auto_renewal)
                    return { pdf: pdfVal ? 'Yes' : 'No' }
                }
                return null
              })()
              const dealTotalValue = dealProducts.length > 0
                ? calcTotalContractValue(displayAcv, deal.contract_months || 12)
                : (deal.total_contract_value || deal.acv || 0)
              const pdfValueMismatch = (() => {
                for (const c of contracts) {
                  const calc = c.ai_analysis?.calculated_value
                  if (calc == null) continue
                  const parsed = parseFloat(calc)
                  if (isNaN(parsed)) continue
                  const threshold = Math.max(1, dealTotalValue * 0.001)
                  if (Math.abs(parsed - dealTotalValue) > threshold)
                    return { pdf: `$${parsed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
                }
                return null
              })()
              return [
                { label: 'Type', value: deal.deal_type === 'renewal' ? 'Renewal' : 'New Business' },
                { label: 'Contract Start', value: deal.contract_start ? format(new Date(deal.contract_start + 'T12:00:00'), 'MMM d, yyyy') : '—', mismatch: pdfStartMismatch },
                { label: 'Contract End', value: deal.contract_end ? format(new Date(deal.contract_end + 'T12:00:00'), 'MMM d, yyyy') : '—', mismatch: pdfEndMismatch },
                { label: 'Notice Period', value: deal.notice_period_days ? `${deal.notice_period_days} days` : '—', mismatch: pdfNoticeMismatch, sub: notifyDate ? `Notify by ${format(notifyDate, 'MMM d, yyyy')}` : null },
                { label: 'Auto-Renewal', value: deal.auto_renewal == null ? '—' : deal.auto_renewal ? 'Yes' : 'No', mismatch: pdfAutoRenewalMismatch },
                { label: 'Contract Value', value: dealTotalValue ? `$${dealTotalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—', mismatch: pdfValueMismatch },
                { label: 'TBN Property', value: deal.is_tbn_property ? 'Yes (no commission)' : 'No' },
              ].map(({ label, value, mismatch, sub }) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-gray-500">{label}</span>
                  <div className="text-right">
                    <span className={`font-medium ${mismatch ? 'text-amber-600' : 'text-navy-900'}`}>{value}</span>
                    {mismatch && (
                      <p className="text-xs text-amber-500 mt-0.5 flex items-center justify-end gap-1">
                        <AlertTriangle size={10} />
                        Contract shows {mismatch.pdf}
                      </p>
                    )}
                    {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
                  </div>
                </div>
              ))
            })()}
            {deal.notes && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Notes</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{deal.notes}</p>
              </div>
            )}
          </dl>
        </Card>

        {dealTeam.length > 0 && (
          <Card>
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
                    {!deal.is_tbn_property && isManager && <Badge color="green">{m.commission_percent}% commission</Badge>}
                    {!deal.is_tbn_property && !isManager && isOwnRow && <Badge color="green">{m.commission_percent}% commission</Badge>}
                  </div>
                )
              })}
              {supportTeam.map((m) => {
                const isOwnRow = m.people?.email === profile?.email
                const showSpif = isManager || isOwnRow
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
              {partnerTeam.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-semibold text-xs flex-shrink-0">
                      {m.people?.name?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-navy-900">{m.people?.name}</p>
                      <p className="text-xs text-gray-500">Partner</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Notes & Actions */}
      <DealNotesCard dealId={id} />

      {/* Questionnaires */}
      <DealQuestionnairesCard
        questionnaires={questionnaires}
        setQuestionnaires={setQuestionnaires}
        deal={deal}
        showBuilder={showQuestionnaireBuilder}
        onCloseBuilder={() => setShowQuestionnaireBuilder(false)}
        onLogged={loadAuditLog}
        onCreated={(openBuilder) => {
          if (openBuilder) { setShowQuestionnaireBuilder(true); return }
          setShowQuestionnaireBuilder(false)
          load()
        }}
      />

      {/* Products */}
      <Card>
        <CardHeader title="Products & Services" />
        <DealProductsTable
          dealProducts={dealProducts}
          amendments={amendments}
          deal={deal}
          customerAcv={customerAcv}
          partnerMultiplier={partnerMultiplier}
          currentPricing={currentPricing}
        />
      </Card>

      {/* Vendor Contracts */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-navy-900">Vendor Contracts</h3>
            <p className="text-xs text-gray-400">Backend contracts supporting this deal</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setShowAttachVendorModal(true)} icon={<Link size={14}/>}>Attach Contract</Button>
        </div>
        {linkedVendorContracts.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No vendor contracts linked. Click "Attach Contract" to link one.</p>
        ) : (
          <div className="space-y-2">
            {linkedVendorContracts.map((vc) => (
              <LinkedVendorContractCard
                key={vc.id}
                vc={vc}
                deal={deal}
                onNavigate={() => navigate(`/vendors/${vc.vendor_id}`)}
                onUnlink={async (vcId) => {
                  await supabase.from('vendor_contracts').update({ deal_id: null }).eq('id', vcId)
                  await logEvent(`Vendor contract unlinked: "${vc.title}" (${vc.vendors?.name || 'Unknown vendor'})`)
                  setLinkedVendorContracts((prev) => prev.filter((v) => v.id !== vcId))
                }}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Amendment History */}
      <AmendmentHistoryCard
        amendments={amendments}
        dealProducts={dealProducts}
        isManager={isManager && deal.stage === 'contracted'}
        onAmend={() => setShowAmend(true)}
        onEditAmendment={setEditingAmendment}
      />

      {/* Commission Schedule */}
      {isManager && !deal.is_tbn_property && (
        <CommissionScheduleCard schedule={schedule} quarterGroups={quarterGroups} deal={deal} />
      )}

      {/* Contracts */}
      <DealContractsCard
        contracts={contracts}
        predecessorContracts={predecessorContracts}
        predecessorName={predecessor?.name}
        dealId={id}
        deal={deal}
        load={load}
        logEvent={logEvent}
        onAnalyzePdf={(contract) => brainPanelRef.current?.openPanel(contract)}
      />

      {/* Receivables */}
      {deal.company_id && (
        <DealReceivablesCard companyId={deal.company_id} companyName={deal.company_name} />
      )}

      {/* Activity Log */}
      <ActivityLogCard auditLog={auditLog} dealTeam={dealTeam} dealProducts={dealProducts} />

      {/* Contract Analysis Cards */}
      <ContractAnalysisCards
        contracts={contracts}
        aiExtracting={aiExtracting}
        aiContract={aiContract}
        onReanalyze={(contract) => brainPanelRef.current?.openPanel(contract, true)}
        onOpenChat={() => brainPanelRef.current?.openChat()}
      />

      {/* Modals */}
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
          profile={profile}
        />
      )}
      {showProposal && (
        <Suspense fallback={null}>
          <ProposalBuilder
            deal={deal}
            dealProducts={dealProducts}
            dealPartners={dealPartners}
            dealTeam={dealTeam}
            onClose={() => setShowProposal(false)}
            onLogged={loadAuditLog}
          />
        </Suspense>
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
      {showRenewal && (
        <StartRenewalModal
          deal={deal}
          dealProducts={dealProducts}
          dealTeam={dealTeam}
          onClose={() => setShowRenewal(false)}
          onCreated={(newId) => { setShowRenewal(false); navigate(`/deals/${newId}`) }}
        />
      )}
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

      <ConfirmDialog
        open={deleteDlg}
        onClose={() => setDeleteDlg(false)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Deal"
        message={`"${deal.name}" will be moved to the trash. You can restore it from the Deals page.`}
      />

      {showExecReport && (
        <ExecReportModal
          open={showExecReport}
          onClose={() => setShowExecReport(false)}
          onLogged={loadAuditLog}
          deal={deal}
          dealProducts={dealProducts}
          dealTeam={dealTeam}
          dealPartners={dealPartners}
          approval={approval}
          quarterGroups={quarterGroups}
          amendments={amendments}
        />
      )}

      {showAttachVendorModal && (
        <AttachVendorContractModal
          dealId={id}
          onClose={() => setShowAttachVendorModal(false)}
          onAttached={async (vc) => {
            setShowAttachVendorModal(false)
            if (vc) await logEvent(`Vendor contract linked: "${vc.title}" (${vc.vendors?.name || 'Unknown vendor'})`)
            load()
          }}
        />
      )}

      {/* Deal Brain floating panel */}
      <DealBrainPanel
        ref={brainPanelRef}
        dealId={id}
        contracts={contracts}
        buildDealContext={buildDealContext}
        currentUserId={currentUserId}
        aiExtracting={aiExtracting}
        setAiExtracting={setAiExtracting}
        aiContract={aiContract}
        setAiContract={setAiContract}
      />
    </div>
  )
}
