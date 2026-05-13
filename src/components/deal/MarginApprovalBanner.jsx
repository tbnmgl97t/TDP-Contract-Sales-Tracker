import { getMarginTier } from '../../lib/margin'

const BANNER_STYLES = {
  green: 'bg-green-50 border-green-200 text-green-800',
  yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  red: 'bg-red-50 border-red-200 text-red-800',
}
const TIER_LABEL = { green: 'Healthy Margin', yellow: 'Low Margin — Review Required', red: 'Below Minimum Margin' }
const DOT_COLOR = { green: 'bg-green-400', yellow: 'bg-yellow-400', red: 'bg-red-400' }
const STATUS_LABEL = { auto_approved: 'Auto-approved', pending: 'Pending approval', approved: 'Approved', rejected: 'Rejected' }

export default function MarginApprovalBanner({ approval, productACV, totalCogs, isManager, approving, onApprovalAction }) {
  if (!approval) return null

  const tier = getMarginTier(productACV > 0 ? productACV : 0, totalCogs)

  return (
    <div className={`border rounded-xl px-4 py-3 flex items-center justify-between gap-3 ${BANNER_STYLES[tier] || 'bg-gray-50 border-gray-200 text-gray-700'}`}>
      <div className="flex items-center gap-2.5">
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${DOT_COLOR[tier] || 'bg-gray-400'}`} />
        <div>
          <span className="text-sm font-semibold">{TIER_LABEL[tier] || 'Margin'}</span>
          {approval.margin_pct != null && (
            <span className="ml-2 text-xs opacity-75">({(approval.margin_pct * 100).toFixed(1)}%)</span>
          )}
          <span className="ml-3 text-xs opacity-60">· {STATUS_LABEL[approval.status] || approval.status}</span>
          {approval.reviewed_by && <span className="ml-1.5 text-xs opacity-50">by {approval.reviewed_by}</span>}
        </div>
      </div>
      {isManager && (approval.status === 'pending' || approval.status === 'rejected') && (
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => onApprovalAction('approved')}
            disabled={approving}
            className="px-3 py-1 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            Approve
          </button>
          {approval.status !== 'rejected' && (
            <button
              onClick={() => onApprovalAction('rejected')}
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
          onClick={() => onApprovalAction('rejected')}
          disabled={approving}
          className="px-3 py-1 text-xs font-medium border border-current rounded-lg opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30"
        >
          Revoke
        </button>
      )}
    </div>
  )
}
