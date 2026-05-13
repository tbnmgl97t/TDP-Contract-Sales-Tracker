import { X, GitBranch, Pencil } from 'lucide-react'
import { format } from 'date-fns'
import Card, { CardHeader } from '../ui/Card'
import { Badge } from '../ui/Badge'
import Button from '../ui/Button'

export default function AmendmentHistoryCard({ amendments, dealProducts, isManager, onAmend, onEditAmendment }) {
  if (!amendments.length) return null

  return (
    <Card>
      <CardHeader
        title="Amendment History"
        action={isManager && (
          <Button variant="secondary" size="sm" icon={<GitBranch size={13} />} onClick={onAmend}>
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
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isCancellation ? 'bg-amber-50 text-amber-500' : 'bg-green-50 text-green-500'}`}>
                {isCancellation ? <X size={14} /> : <GitBranch size={14} />}
              </div>
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
              {isManager && (
                <button
                  onClick={() => onEditAmendment({ amendment, cancelledDp, addedDp })}
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
  )
}
