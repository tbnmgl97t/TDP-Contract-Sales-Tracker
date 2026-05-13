import { useState, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Edit, Trash2, FileText, AlertTriangle, GitBranch } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Card, { CardHeader } from '../components/ui/Card'
import { StageBadge, Badge } from '../components/ui/Badge'
import Button from '../components/ui/Button'
import { Select } from '../components/ui/Input'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { DEAL_STAGES } from '../lib/constants'
import { buildCommissionSchedule, fmt } from '../lib/commission'
import { computeDealTotals, calcTotalRevenue, calcTotalContractValue, calcIndividualCommission, groupScheduleByQuarter } from '../lib/deals'
import { PageSpinner } from '../components/ui/Spinner'
import { useUser } from '../contexts/UserContext'
import Modal from '../components/ui/Modal'
import DealOverviewModal from '../components/DealOverviewModal'
import AmendDealModal from '../components/AmendDealModal'
import EditAmendmentModal from '../components/EditAmendmentModal'
import ProposalBuilder from '../components/ProposalBuilder'
import { format } from 'date-fns'
import { useDealDetail } from '../hooks/useDealDetail'
import MarginApprovalBanner from '../components/deal/MarginApprovalBanner'
import DealProductsTable from '../components/deal/DealProductsTable'
import DealQuestionnairesCard from '../components/deal/DealQuestionnairesCard'
import AmendmentHistoryCard from '../components/deal/AmendmentHistoryCard'
import CommissionScheduleCard from '../components/deal/CommissionScheduleCard'
import DealContractsCard from '../components/deal/DealContractsCard'
import ActivityLogCard from '../components/deal/ActivityLogCard'
import ContractAnalysisCards from '../components/deal/ContractAnalysisCards'
import DealBrainPanel from '../components/deal/DealBrainPanel'

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
    loading,
    currentUserId,
    load,
    logEvent,
    handleStageChange: _handleStageChange,
    handleDelete: _handleDelete,
    handleApprovalAction: _handleApprovalAction,
  } = useDealDetail(id)

  // UI-only state
  const [deleteDlg, setDeleteDlg] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [stageChanging, setStageChanging] = useState(false)
  const [approving, setApproving] = useState(false)
  const [showOverview, setShowOverview] = useState(false)
  const [showProposal, setShowProposal] = useState(false)
  const [showAmend, setShowAmend] = useState(false)
  const [showQuestionnaireBuilder, setShowQuestionnaireBuilder] = useState(false)
  const [editingAmendment, setEditingAmendment] = useState(null)
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
  const schedule = useMemo(
    () => deal
      ? buildCommissionSchedule(deal, dealProducts, dealTeam.map((m) => ({ ...m, person_name: m.people?.name })))
      : [],
    [deal, dealProducts, dealTeam]
  )
  const quarterGroups = useMemo(() => groupScheduleByQuarter(schedule), [schedule])
  const salesTeam = useMemo(() => dealTeam.filter((m) => m.role === 'sales'), [dealTeam])
  const supportTeam = useMemo(() => dealTeam.filter((m) => m.role === 'support'), [dealTeam])

  function buildDealContext() {
    if (!deal) return null
    return {
      deal: {
        id: deal.id, name: deal.name, company: deal.company_name, stage: deal.stage,
        deal_type: deal.deal_type, is_tbn_property: deal.is_tbn_property,
        contract_start: deal.contract_start, contract_end: deal.contract_end,
        contract_months: deal.contract_months, notes: deal.notes,
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
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => setShowOverview(true)}>Overview</Button>
          <Button
            variant="secondary" size="sm"
            onClick={() => setShowProposal(true)}
            icon={<FileText size={14} />}
            disabled={['lead', 'qualified', 'discovery'].includes(deal.stage) || approval?.status === 'pending'}
          >
            Proposal
          </Button>
          {isManager && (
            <Button variant="secondary" size="sm" onClick={() => setShowQuestionnaireBuilder(true)} icon={<FileText size={14} />}>
              Questionnaire
            </Button>
          )}
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
      <MarginApprovalBanner
        approval={approval}
        productACV={productACV}
        totalCogs={totalCogs}
        isManager={isManager}
        approving={approving}
        onApprovalAction={handleApprovalAction}
      />

      {/* Deal Info + Team */}
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
          </Card>
        )}
      </div>

      {/* Questionnaires */}
      {isManager && (
        <DealQuestionnairesCard
          questionnaires={questionnaires}
          setQuestionnaires={setQuestionnaires}
          deal={deal}
          showBuilder={showQuestionnaireBuilder}
          onCloseBuilder={() => setShowQuestionnaireBuilder(false)}
          onCreated={(openBuilder) => {
            if (openBuilder) { setShowQuestionnaireBuilder(true); return }
            setShowQuestionnaireBuilder(false)
            load()
          }}
        />
      )}

      {/* Products */}
      <Card>
        <CardHeader title="Products & Services" />
        <DealProductsTable
          dealProducts={dealProducts}
          amendments={amendments}
          deal={deal}
          customerAcv={customerAcv}
          partnerMultiplier={partnerMultiplier}
        />
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
