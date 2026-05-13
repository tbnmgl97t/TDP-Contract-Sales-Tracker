import Card, { CardHeader } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { AlertTriangle } from 'lucide-react'
import { fmt } from '../../lib/commission'

export default function CommissionScheduleCard({ schedule, quarterGroups, deal }) {
  if (!schedule.length) return null

  return (
    <Card>
      <CardHeader title="Commission Schedule" subtitle="Quarterly payout breakdown" />
      {deal.is_tbn_property && (
        <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4 text-sm text-orange-700">
          <AlertTriangle size={16} />
          TBN properties are excluded from the commission plan.
        </div>
      )}
      <div className="space-y-4">
        {Object.values(quarterGroups)
          .sort((a, b) => a.year !== b.year ? a.year - b.year : a.quarter - b.quarter)
          .map((group) => {
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
  )
}
