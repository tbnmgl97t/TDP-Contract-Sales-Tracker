import { useState } from 'react'
import { Activity } from 'lucide-react'
import { format } from 'date-fns'
import Card, { CardHeader } from '../ui/Card'
import { formatAuditEntry, groupEntriesByDate, auditTypeStyle } from '../../lib/auditLog'

const PAGE_SIZE = 15

export default function ActivityLogCard({ auditLog, dealTeam, dealProducts }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  if (!auditLog.length) return null

  const people = dealTeam.map((m) => ({ id: m.person_id, name: m.people?.name })).filter((p) => p.name)
  const groups = groupEntriesByDate(auditLog, { dealProducts, people })
  const hasVisible = groups.some((g) => g.entries.length > 0)
  if (!hasVisible) return null

  // Flatten all entries preserving their date group label
  const allEntries = groups.flatMap((g) => g.entries.map((e) => ({ ...e, groupLabel: g.label })))
  const visibleEntries = allEntries.slice(0, visibleCount)
  const hasMore = visibleCount < allEntries.length
  const remaining = allEntries.length - visibleCount

  // Re-group the visible slice
  const visibleGroups = []
  visibleEntries.forEach(({ groupLabel, entry, formatted }) => {
    let group = visibleGroups.find((g) => g.label === groupLabel)
    if (!group) { group = { label: groupLabel, entries: [] }; visibleGroups.push(group) }
    group.entries.push({ entry, formatted })
  })

  return (
    <Card>
      <CardHeader
        title="Activity"
        action={<Activity size={15} className="text-gray-400" />}
      />
      <div className="space-y-5">
        {visibleGroups.map((group) => (
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
      {hasMore && (
        <button
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="mt-4 w-full text-xs font-medium text-primary-500 hover:text-primary-600 py-2 rounded-lg hover:bg-primary-50 transition-colors"
        >
          Show {Math.min(PAGE_SIZE, remaining)} more · {remaining} remaining
        </button>
      )}
    </Card>
  )
}
