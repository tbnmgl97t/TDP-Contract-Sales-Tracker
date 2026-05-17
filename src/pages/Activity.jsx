import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, isToday, isYesterday, subDays, startOfDay } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useUser } from '../contexts/UserContext'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import { Select } from '../components/ui/Input'
import { PageSpinner } from '../components/ui/Spinner'
import { formatAuditEntry, auditTypeStyle, mergeDeleteInsertPairs } from '../lib/auditLog'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 15
const FETCH_LIMIT = 1000 // fetch a large batch; filter/merge client-side for accurate pagination

const TABLE_TYPE_MAP = {
  deals: 'deals',
  deal_products: 'products',
  deal_team: 'team',
  contracts: 'contracts',
  commission_settings: 'commission',
  event: 'events',
}

function username(email) {
  if (!email) return '—'
  const at = email.indexOf('@')
  return at > -1 ? email.slice(0, at) : email
}

export default function Activity() {
  const navigate = useNavigate()
  const { isManager, loading: authLoading } = useUser()

  const [entries, setEntries] = useState([])
  const [productMap, setProductMap] = useState({})
  const [personMap, setPersonMap] = useState({})
  const [uniqueUsers, setUniqueUsers] = useState([])
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)

  // Filters
  const [typeFilter, setTypeFilter] = useState('all')
  const [userFilter, setUserFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')

  // Reset to page 0 when filters change
  useEffect(() => { setPage(0) }, [typeFilter, userFilter, dateFilter])

  // Load unique users once
  useEffect(() => {
    if (authLoading || !isManager) return
    supabase
      .from('audit_log')
      .select('changed_by')
      .neq('table_name', 'commission_settings')
      .not('changed_by', 'is', null)
      .then(({ data }) => {
        if (data) {
          const seen = new Set(data.map((r) => r.changed_by))
          setUniqueUsers([...seen].sort())
        }
      })
  }, [authLoading, isManager])

  const loadEntries = useCallback(async () => {
    if (!isManager) return
    setLoading(true)

    let query = supabase
      .from('audit_log')
      .select('id, table_name, action, changed_by, old_values, new_values, description, created_at, deal_id')
      .neq('table_name', 'commission_settings')
      .order('created_at', { ascending: false })
      .limit(FETCH_LIMIT)

    // Type filter
    if (typeFilter !== 'all') {
      const tableForType = Object.entries(TABLE_TYPE_MAP).find(([, v]) => v === typeFilter)?.[0]
      if (tableForType) query = query.eq('table_name', tableForType)
    }

    // User filter
    if (userFilter !== 'all') query = query.eq('changed_by', userFilter)

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date()
      const cutoff = dateFilter === 'today'
        ? startOfDay(now).toISOString()
        : dateFilter === '7d'
          ? subDays(now, 7).toISOString()
          : subDays(now, 30).toISOString()
      query = query.gte('created_at', cutoff)
    }

    const { data, error } = await query

    if (!error && data) {
      // Fetch deal names
      const dealIds = [...new Set(data.map((e) => e.deal_id).filter(Boolean))]
      let dealMap = {}
      if (dealIds.length > 0) {
        const { data: deals } = await supabase.from('deals').select('id, name, company_name').in('id', dealIds)
        if (deals) deals.forEach((d) => { dealMap[d.id] = d.name || d.company_name || null })
      }

      // Fetch product names
      const productIds = [...new Set(
        data
          .filter((e) => e.table_name === 'deal_products')
          .flatMap((e) => [e.new_values?.product_id, e.old_values?.product_id])
          .filter(Boolean)
      )]
      const newProductMap = {}
      if (productIds.length > 0) {
        const { data: prods } = await supabase.from('products').select('id, name').in('id', productIds)
        if (prods) prods.forEach((p) => { newProductMap[p.id] = p.name })
      }
      setProductMap((prev) => ({ ...prev, ...newProductMap }))

      // Fetch person names for deal_team entries
      const personIds = [...new Set(
        data
          .filter((e) => e.table_name === 'deal_team')
          .flatMap((e) => [e.new_values?.person_id, e.old_values?.person_id])
          .filter(Boolean)
      )]
      const newPersonMap = {}
      if (personIds.length > 0) {
        const { data: people } = await supabase.from('people').select('id, name').in('id', personIds)
        if (people) people.forEach((p) => { newPersonMap[p.id] = p.name })
      }
      setPersonMap((prev) => ({ ...prev, ...newPersonMap }))

      const merged = mergeDeleteInsertPairs(data)
      setEntries(merged.map((e) => ({ ...e, _dealName: e.deal_id ? dealMap[e.deal_id] : null })))
    } else if (error) {
      console.error('Activity load error:', error)
    }

    setLoading(false)
  }, [isManager, typeFilter, userFilter, dateFilter])

  useEffect(() => {
    if (authLoading || !isManager) return
    loadEntries()
  }, [authLoading, loadEntries])

  const products = useMemo(
    () => Object.entries(productMap).map(([id, name]) => ({ id, name })),
    [productMap]
  )

  const people = useMemo(
    () => Object.entries(personMap).map(([id, name]) => ({ id, name })),
    [personMap]
  )

  // Build ALL visible (non-skipped) entries first, then paginate them client-side
  const allVisible = useMemo(() => {
    const opts = { products, people }
    return entries.flatMap((entry) => {
      const formatted = formatAuditEntry(entry, opts)
      return formatted.skip ? [] : [{ entry, formatted }]
    })
  }, [entries, products, people])

  const total = allVisible.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min((page + 1) * PAGE_SIZE, total)

  // Slice the visible entries for the current page, then group by date
  const groups = useMemo(() => {
    const pageEntries = allVisible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    const result = []
    let currentLabel = null
    for (const { entry, formatted } of pageEntries) {
      const d = new Date(entry.created_at)
      const label = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'MMM d, yyyy')
      if (label !== currentLabel) {
        currentLabel = label
        result.push({ label, entries: [] })
      }
      result[result.length - 1].entries.push({ entry, formatted })
    }
    return result
  }, [allVisible, page])

  if (!authLoading && !isManager) {
    return (
      <div className="p-8 text-center text-gray-500">
        You don't have permission to view this page.
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy-900">Activity</h1>
        <p className="text-sm text-gray-500 mt-1">All changes across deals</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-40">
          <option value="all">All types</option>
          <option value="deals">Deals</option>
          <option value="products">Products</option>
          <option value="team">Team</option>
          <option value="contracts">Contracts</option>
          <option value="events">Events</option>
        </Select>

        <Select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="w-48">
          <option value="all">All users</option>
          {uniqueUsers.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </Select>

        <Select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-40">
          <option value="all">All time</option>
          <option value="today">Today</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <PageSpinner />
      ) : groups.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <p className="text-gray-400 text-sm">No activity found for the selected filters.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                {group.label}
              </p>
              <Card padding={false}>
                <ul className="divide-y divide-gray-50">
                  {group.entries.map(({ entry, formatted }) => {
                    const { label, detail = [], type } = formatted
                    const style = auditTypeStyle(type)
                    const dealName = entry._dealName
                    const time = format(new Date(entry.created_at), 'h:mm a')

                    return (
                      <li key={entry.id} className="flex items-start gap-3 px-5 py-4">
                        <span className={`mt-1.5 flex-shrink-0 w-2.5 h-2.5 rounded-full ${style.dot}`} />

                        <div className="flex-1 min-w-0">
                          {/* Header: action · deal name */}
                          <p className="text-sm text-navy-900 leading-snug">
                            {label}
                            {dealName && entry.deal_id && (
                              <>
                                <span className="text-gray-300 mx-1.5">·</span>
                                <button
                                  onClick={() => navigate(`/deals/${entry.deal_id}`)}
                                  className="text-primary-500 hover:text-primary-600 hover:underline"
                                >
                                  {dealName}
                                </button>
                              </>
                            )}
                          </p>

                          {/* Subject: product / person name */}
                          {formatted.subject && (
                            <p className="text-xs font-semibold text-navy-700 mt-0.5">{formatted.subject}</p>
                          )}

                          {/* Detail table */}
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
                        </div>

                        <div className="flex-shrink-0 text-right">
                          <p className="text-xs text-gray-500">{username(entry.changed_by)}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{time}</p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-gray-500">
                Showing <span className="font-medium text-gray-700">{from}–{to}</span> of{' '}
                <span className="font-medium text-gray-700">{total}</span> entries
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page === 0}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i)
                  .filter((i) => totalPages <= 7 || Math.abs(i - page) <= 2 || i === 0 || i === totalPages - 1)
                  .reduce((acc, i, idx, arr) => {
                    if (idx > 0 && i - arr[idx - 1] > 1) acc.push('...')
                    acc.push(i)
                    return acc
                  }, [])
                  .map((i, idx) =>
                    i === '...' ? (
                      <span key={`ellipsis-${idx}`} className="w-8 text-center text-gray-400 text-sm">…</span>
                    ) : (
                      <button
                        key={i}
                        onClick={() => setPage(i)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                          i === page
                            ? 'bg-primary-500 text-white'
                            : 'text-gray-500 hover:bg-gray-100'
                        }`}
                      >
                        {i + 1}
                      </button>
                    )
                  )}
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
