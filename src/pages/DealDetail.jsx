import { useState, useRef, useMemo, useEffect, useCallback, lazy, Suspense } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { differenceInDays, parseISO, subDays } from 'date-fns'
import { Edit, Trash2, FileText, AlertTriangle, GitBranch, RefreshCw, ArrowRight, ChevronDown, Link, ExternalLink } from 'lucide-react'
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
    load,
    loadAuditLog,
    logEvent,
    handleStageChange: _handleStageChange,
    handleDelete: _handleDelete,
    handleApprovalAction: _handleApprovalAction,
  } = useDealDetail(id)

  // Vendor contracts linked to this deal
  const [linkedVendorContracts, setLinkedVendorContracts] = useState([])
  const [showAttachVendorModal, setShowAttachVendorModal] = useState(false)

  useEffect(() => {
    if (!id) return
    supabase
      .from('vendor_contracts')
      .select('*, vendors(name)')
      .eq('deal_id', id)
      .order('end_date')
      .then(({ data }) => setLinkedVendorContracts(data || []))
  }, [id])

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
    return {
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

      {/* Renewal banner — contracted deals with no renewal started yet */}
      {isManager && deal.stage === 'contracted' && successors.length === 0 && deal.contract_end && (() => {
        const daysLeft = differenceInDays(parseISO(deal.contract_end), new Date())
        const expired = daysLeft < 0
        const soon    = daysLeft <= 90
        if (!soon && !expired) return null
        return (
          <div className={`flex items-center justify-between gap-4 rounded-2xl px-5 py-3.5 border ${
            expired ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-center gap-3">
              <RefreshCw size={16} className={expired ? 'text-red-500' : 'text-amber-500'} />
              <div>
                <p className={`text-sm font-semibold ${expired ? 'text-red-700' : 'text-amber-700'}`}>
                  {daysLeft === 0 ? 'Contract expires today' : expired ? 'Contract has expired' : `Contract renews in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`}
                </p>
                <p className={`text-xs mt-0.5 ${expired ? 'text-red-500' : 'text-amber-500'}`}>
                  Expires {format(new Date(deal.contract_end + 'T12:00:00'), 'MMMM d, yyyy')} · Start the renewal to keep this customer.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              icon={<RefreshCw size={13} />}
              onClick={() => setShowRenewal(true)}
              className={expired ? '!bg-red-500 hover:!bg-red-600 flex-shrink-0' : '!bg-amber-500 hover:!bg-amber-600 flex-shrink-0'}
            >
              Start Renewal
            </Button>
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
            {linkedVendorContracts.map((vc) => {
              const daysLeft = vc.end_date ? differenceInDays(parseISO(vc.end_date), new Date()) : null
              const notifyDate = vc.end_date && vc.notice_period_days ? subDays(parseISO(vc.end_date), vc.notice_period_days) : null
              const hasConflict = vc.notice_period_days && deal.notice_period_days && vc.notice_period_days > deal.notice_period_days
              const isExpired = daysLeft !== null && daysLeft < 0
              return (
                <div key={vc.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-navy-900">{vc.vendors?.name}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-500 truncate">{vc.title}</span>
                      {vc.renewal_intent && <span className="text-[11px] bg-green-100 text-green-700 rounded px-1.5 py-0.5 font-medium">Renewal planned</span>}
                      {hasConflict && <span className="text-[11px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-medium flex items-center gap-1"><AlertTriangle size={10}/> Notice conflict</span>}
                    </div>
                    {hasConflict && notifyDate && (
                      <p className="text-xs text-amber-600 mt-0.5">
                        Vendor requires {vc.notice_period_days}d notice (customer: {deal.notice_period_days}d) — talks must start by {format(notifyDate, 'MMM d, yyyy')}
                      </p>
                    )}
                    {vc.end_date && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {isExpired ? 'Expired' : 'Expires'} {format(parseISO(vc.end_date), 'MMM d, yyyy')}
                        {!isExpired && daysLeft !== null && ` · ${daysLeft}d left`}
                        {vc.notice_period_days && ` · ${vc.notice_period_days}d notice`}
                      </p>
                    )}
                  </div>
                  <button onClick={() => navigate(`/vendors/${vc.vendor_id}`)} className="ml-3 p-1.5 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors">
                    <ExternalLink size={13}/>
                  </button>
                </div>
              )
            })}
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
        load={load}
        logEvent={logEvent}
        onAnalyzePdf={(contract) => brainPanelRef.current?.openPanel(contract)}
      />

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
          onAttached={() => {
            setShowAttachVendorModal(false)
            supabase.from('vendor_contracts').select('*, vendors(name)').eq('deal_id', id).order('end_date').then(({ data }) => setLinkedVendorContracts(data || []))
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
