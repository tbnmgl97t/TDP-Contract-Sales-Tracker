import { useState, useEffect, useMemo, useRef } from 'react'
import { format, parseISO, startOfMonth, endOfMonth, startOfYear, subMonths } from 'date-fns'
import { AlertTriangle, Upload, ChevronDown, CheckCircle2, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Card, { CardHeader } from '../components/ui/Card'
import Button from '../components/ui/Button'

function fmt(amount) {
  if (amount == null || amount === 0) return '$0.00'
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}

function agingBucket(row) {
  if (row.bucket_151_plus > 0) return { label: '151+ days', bucket: 'critical', color: 'red' }
  if (row.bucket_121_150 > 0) return { label: '121-150 days', bucket: 'critical', color: 'red' }
  if (row.bucket_91_120 > 0) return { label: '91-120 days', bucket: 'critical', color: 'red' }
  if (row.bucket_61_90 > 0) return { label: '61-90 days', bucket: 'critical', color: 'red' }
  if (row.bucket_31_60 > 0) return { label: '31-60 days', bucket: 'overdue', color: 'orange' }
  if (row.bucket_1_30 > 0) return { label: '1-30 days', bucket: 'overdue', color: 'amber' }
  return { label: 'Current', bucket: 'current', color: 'green' }
}

function daysOutstanding(row) {
  if (row.bucket_151_plus > 0) return '151+'
  if (row.bucket_121_150 > 0) return '121-150'
  if (row.bucket_91_120 > 0) return '91-120'
  if (row.bucket_61_90 > 0) return '61-90'
  if (row.bucket_31_60 > 0) return '31-60'
  if (row.bucket_1_30 > 0) return '1-30'
  return 'Current'
}

function agingSortKey(row) {
  if (row.bucket_151_plus > 0) return 7
  if (row.bucket_121_150 > 0) return 6
  if (row.bucket_91_120 > 0) return 5
  if (row.bucket_61_90 > 0) return 4
  if (row.bucket_31_60 > 0) return 3
  if (row.bucket_1_30 > 0) return 2
  return 1
}

const PILL_CLASSES = {
  green: 'bg-green-50 text-green-700',
  amber: 'bg-amber-50 text-amber-700',
  orange: 'bg-orange-50 text-orange-700',
  red: 'bg-red-50 text-red-700',
}

const STAT_COLORS = {
  total: 'text-navy-900',
  current: 'text-green-600',
  amber: 'text-amber-600',
  orange: 'text-orange-600',
  red: 'text-red-600',
}

export default function Receivables() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [customerFilter, setCustomerFilter] = useState('all')
  const [tab, setTab] = useState('all') // 'all' | 'overdue' | 'critical'
  const [uploading, setUploading] = useState(false)
  const [importResult, setImportResult] = useState(null) // { imported, matched, unmatched } | { error }
  const fileInputRef = useRef(null)

  // Collections state
  const [mainView, setMainView] = useState('aging') // 'aging' | 'collections'
  const [paymentEvents, setPaymentEvents] = useState([])
  const [collectionsLoading, setCollectionsLoading] = useState(false)
  const collectionsLoaded = useRef(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      // Get the global latest as_of_date across all receivables
      const { data: latestRow } = await supabase
        .from('receivables')
        .select('as_of_date')
        .order('as_of_date', { ascending: false })
        .limit(1)
        .single()

      if (!latestRow) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('receivables')
        .select('*')
        .eq('as_of_date', latestRow.as_of_date)
        .order('customer_name', { ascending: true })

      setRows(data || [])
      setLoading(false)
    }
    load()
  }, [])

  async function loadCollections() {
    if (collectionsLoaded.current) return
    setCollectionsLoading(true)
    const { data } = await supabase
      .from('receivables_payment_events')
      .select('*')
      .order('period_end', { ascending: false })
    setPaymentEvents(data || [])
    collectionsLoaded.current = true
    setCollectionsLoading(false)
  }

  function handleMainViewChange(view) {
    setMainView(view)
    if (view === 'collections') {
      loadCollections()
    }
  }

  const lastImportDate = useMemo(() => {
    if (rows.length === 0) return null
    const dates = rows.map((r) => r.imported_at).filter(Boolean)
    if (dates.length === 0) return null
    return new Date(Math.max(...dates.map((d) => new Date(d).getTime())))
  }, [rows])

  const asOfDate = rows[0]?.as_of_date ?? null

  const customers = useMemo(() => {
    const names = [...new Set(rows.map((r) => r.customer_name))].sort()
    return names
  }, [rows])

  // Apply filters
  const filteredRows = useMemo(() => {
    let result = rows
    if (customerFilter !== 'all') {
      result = result.filter((r) => r.customer_name === customerFilter)
    }
    if (tab === 'overdue') {
      result = result.filter(
        (r) => r.bucket_1_30 > 0 || r.bucket_31_60 > 0 || r.bucket_61_90 > 0 || r.bucket_91_120 > 0 || r.bucket_121_150 > 0 || r.bucket_151_plus > 0
      )
    }
    if (tab === 'critical') {
      result = result.filter(
        (r) => r.bucket_61_90 > 0 || r.bucket_91_120 > 0 || r.bucket_121_150 > 0 || r.bucket_151_plus > 0
      )
    }
    // Sort by aging bucket descending (most overdue first)
    return [...result].sort((a, b) => agingSortKey(b) - agingSortKey(a))
  }, [rows, customerFilter, tab])

  // Summary stats
  const stats = useMemo(() => {
    const total = rows.reduce((s, r) => s + (r.invoice_amount || 0), 0)
    const current = rows.reduce((s, r) => s + (r.bucket_current || 0), 0)
    const days1_30 = rows.reduce((s, r) => s + (r.bucket_1_30 || 0), 0)
    const days31_60 = rows.reduce((s, r) => s + (r.bucket_31_60 || 0), 0)
    const days61plus =
      rows.reduce((s, r) => s + (r.bucket_61_90 || 0) + (r.bucket_91_120 || 0) + (r.bucket_121_150 || 0) + (r.bucket_151_plus || 0), 0)
    return { total, current, days1_30, days31_60, days61plus }
  }, [rows])

  // Group filtered rows by customer
  const grouped = useMemo(() => {
    const map = new Map()
    for (const row of filteredRows) {
      const key = row.customer_name
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(row)
    }
    return map
  }, [filteredRows])

  // Collections computed stats
  const collectionStats = useMemo(() => {
    const now = new Date()
    const yearStart = startOfYear(now)
    const monthStart = startOfMonth(now)
    const monthEnd = endOfMonth(now)
    const lastMonthStart = startOfMonth(subMonths(now, 1))
    const lastMonthEnd = endOfMonth(subMonths(now, 1))

    let ytd = 0
    let thisMonth = 0
    let lastMonth = 0

    for (const evt of paymentEvents) {
      const d = parseISO(evt.period_end)
      if (d >= yearStart) ytd += Number(evt.amount_paid)
      if (d >= monthStart && d <= monthEnd) thisMonth += Number(evt.amount_paid)
      if (d >= lastMonthStart && d <= lastMonthEnd) lastMonth += Number(evt.amount_paid)
    }

    return { ytd, thisMonth, lastMonth }
  }, [paymentEvents])

  // Collections: group by week (period_end)
  const weeklyCollections = useMemo(() => {
    const map = new Map()
    for (const evt of paymentEvents) {
      const key = evt.period_end
      if (!map.has(key)) map.set(key, { periodEnd: key, collected: 0, invoices: 0, customers: new Set() })
      const entry = map.get(key)
      entry.collected += Number(evt.amount_paid)
      entry.invoices += 1
      entry.customers.add(evt.customer_name)
    }
    return Array.from(map.values())
      .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
  }, [paymentEvents])

  // Collections: group by customer
  const byCustomer = useMemo(() => {
    const map = new Map()
    for (const evt of paymentEvents) {
      const key = evt.customer_name
      if (!map.has(key)) map.set(key, { customer: key, totalCollected: 0, invoices: 0, lastPayment: null })
      const entry = map.get(key)
      entry.totalCollected += Number(evt.amount_paid)
      entry.invoices += 1
      if (!entry.lastPayment || evt.period_end > entry.lastPayment) {
        entry.lastPayment = evt.period_end
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalCollected - a.totalCollected)
  }, [paymentEvents])

  // Collections: group payment events by customer for detail list
  const paymentsByCustomer = useMemo(() => {
    const map = new Map()
    for (const evt of paymentEvents) {
      const key = evt.customer_name
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(evt)
    }
    // Sort customers by total collected desc
    return new Map(
      Array.from(map.entries()).sort((a, b) => {
        const sumA = a[1].reduce((s, e) => s + Number(e.amount_paid), 0)
        const sumB = b[1].reduce((s, e) => s + Number(e.amount_paid), 0)
        return sumB - sumA
      })
    )
  }, [paymentEvents])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    setImportResult(null)
    try {
      // Read PDF as base64
      const arrayBuffer = await file.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
      }
      const pdf_base64 = btoa(binary)

      const { data: { session } } = await supabase.auth.getSession()
      const INGEST_SECRET = import.meta.env.VITE_INGEST_SECRET || 'ar-ingest-tdi'
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/ingest-ar-report?secret=${INGEST_SECRET}&apikey=${ANON_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ pdf_base64 }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        setImportResult({ error: data.error || 'Import failed' })
      } else {
        setImportResult(data) // { imported, matched, unmatched }
        // Reload the table
        const { data: latestRow } = await supabase
          .from('receivables')
          .select('as_of_date')
          .order('as_of_date', { ascending: false })
          .limit(1)
          .single()
        if (latestRow) {
          const { data: fresh } = await supabase
            .from('receivables')
            .select('*')
            .eq('as_of_date', latestRow.as_of_date)
            .order('customer_name', { ascending: true })
          setRows(fresh || [])
        }
        // Invalidate collections cache so it reloads on next view
        collectionsLoaded.current = false
        setPaymentEvents([])
      }
    } catch (err) {
      setImportResult({ error: err.message })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy-900">Receivables</h1>
          {lastImportDate && (
            <p className="text-sm text-gray-500 mt-0.5">
              Last import {format(lastImportDate, 'MMM d, yyyy')}
              {asOfDate && ` · As of ${format(parseISO(asOfDate), 'MMM d, yyyy')}`}
            </p>
          )}
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.csv"
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            variant="secondary"
            size="sm"
            icon={<Upload size={14} />}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading…' : 'Upload Report'}
          </Button>
        </div>
      </div>

      {/* Main view toggle: AR Aging | Collections */}
      <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden w-fit">
        {[
          { key: 'aging', label: 'AR Aging' },
          { key: 'collections', label: 'Collections' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleMainViewChange(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              mainView === key
                ? 'bg-primary-500 text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Import result banner */}
      {importResult && (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${importResult.error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-800'}`}>
          {importResult.error
            ? <XCircle size={16} className="flex-shrink-0 mt-0.5" />
            : <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5 text-green-600" />
          }
          <div className="flex-1">
            {importResult.error ? (
              <p className="font-medium">Import failed: {importResult.error}</p>
            ) : (
              <>
                <p className="font-medium">
                  Imported {importResult.imported} invoice{importResult.imported !== 1 ? 's' : ''} · {importResult.matched} matched to companies
                </p>
                {importResult.unmatched?.length > 0 && (
                  <p className="text-xs mt-0.5 text-green-700">
                    Unmatched customers: {importResult.unmatched.join(', ')}
                  </p>
                )}
              </>
            )}
          </div>
          <button onClick={() => setImportResult(null)} className="text-current opacity-50 hover:opacity-100 flex-shrink-0">✕</button>
        </div>
      )}

      {/* ── AR AGING VIEW ── */}
      {mainView === 'aging' && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Total Outstanding', value: stats.total, colorKey: 'total' },
              { label: 'Current', value: stats.current, colorKey: 'current' },
              { label: '1-30 Days', value: stats.days1_30, colorKey: 'amber' },
              { label: '31-60 Days', value: stats.days31_60, colorKey: 'orange' },
              { label: '61+ Days', value: stats.days61plus, colorKey: 'red' },
            ].map((stat) => (
              <Card key={stat.label} className="!py-3">
                <p className="text-xs text-gray-500">{stat.label}</p>
                <p className={`text-base font-bold mt-0.5 ${STAT_COLORS[stat.colorKey]}`}>
                  {fmt(stat.value)}
                </p>
              </Card>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Customer dropdown */}
            <div className="relative">
              <select
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
                className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-primary-300 cursor-pointer"
              >
                <option value="all">All Customers</option>
                {customers.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {/* Aging tabs */}
            <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden">
              {[
                { key: 'all', label: 'All' },
                { key: 'overdue', label: 'Overdue' },
                { key: 'critical', label: 'Critical (61+)' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    tab === key
                      ? 'bg-primary-500 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <Card>
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
              </div>
            </Card>
          ) : rows.length === 0 ? (
            <Card>
              <div className="text-center py-12">
                <p className="text-sm font-medium text-gray-500">No receivables data imported yet.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Upload an AR aging PDF using the button above, or forward the report email to your Resend inbound address.
                </p>
              </div>
            </Card>
          ) : filteredRows.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-500 text-center py-8">No invoices match the current filter.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {Array.from(grouped.entries()).map(([customer, customerRows]) => {
                const subtotal = customerRows.reduce((s, r) => s + (r.invoice_amount || 0), 0)
                const hasOverdue = customerRows.some(
                  (r) => r.bucket_61_90 > 0 || r.bucket_91_120 > 0 || r.bucket_121_150 > 0 || r.bucket_151_plus > 0
                )
                return (
                  <Card key={customer} padding={false}>
                    {/* Customer group header */}
                    <div className={`flex items-center justify-between px-5 py-3 border-b border-gray-100 ${hasOverdue ? 'bg-red-50/40' : 'bg-gray-50/60'}`}>
                      <div className="flex items-center gap-2">
                        {hasOverdue && <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />}
                        <span className="text-sm font-semibold text-navy-900">{customer}</span>
                        <span className="text-xs text-gray-400">{customerRows.length} invoice{customerRows.length !== 1 ? 's' : ''}</span>
                      </div>
                      <span className="text-sm font-bold text-navy-900">{fmt(subtotal)}</span>
                    </div>

                    {/* Invoice rows */}
                    <div className="divide-y divide-gray-50">
                      {customerRows.map((row) => {
                        const bucket = agingBucket(row)
                        const days = daysOutstanding(row)
                        return (
                          <div key={row.id} className="flex items-center gap-4 px-5 py-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-navy-900 truncate">{row.transaction_number}</p>
                              {row.invoice_due_date && (
                                <p className="text-xs text-gray-400 mt-0.5">
                                  Due {format(parseISO(row.invoice_due_date), 'MMM d, yyyy')}
                                </p>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-semibold text-navy-900">{fmt(row.invoice_amount)}</p>
                            </div>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${PILL_CLASSES[bucket.color]}`}>
                              {bucket.label}
                            </span>
                            <div className="text-right w-20 flex-shrink-0">
                              <p className="text-xs text-gray-500">{days}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── COLLECTIONS VIEW ── */}
      {mainView === 'collections' && (
        <>
          {collectionsLoading ? (
            <Card>
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
              </div>
            </Card>
          ) : paymentEvents.length === 0 && !collectionsLoading ? (
            <Card>
              <div className="text-center py-12">
                <p className="text-sm font-medium text-gray-500">No payment events detected yet.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Payment events are detected by comparing consecutive weekly AR snapshots. Import at least two weekly reports to see collections data.
                </p>
              </div>
            </Card>
          ) : (
            <div className="space-y-5">
              {/* Summary stats row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: 'YTD Collected', value: collectionStats.ytd, colorKey: 'current' },
                  { label: 'This Month', value: collectionStats.thisMonth, colorKey: 'total' },
                  { label: 'Last Month', value: collectionStats.lastMonth, colorKey: 'total' },
                ].map((stat) => (
                  <Card key={stat.label} className="!py-3">
                    <p className="text-xs text-gray-500">{stat.label}</p>
                    <p className={`text-lg font-bold mt-0.5 ${STAT_COLORS[stat.colorKey]}`}>
                      {fmt(stat.value)}
                    </p>
                  </Card>
                ))}
              </div>

              {/* Weekly collections table */}
              <Card padding={false}>
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="text-base font-semibold text-navy-900">Collections by Week</h3>
                </div>
                <div>
                  {/* Header row */}
                  <div className="grid grid-cols-4 gap-4 px-5 py-2 border-b border-gray-100">
                    <span className="text-xs uppercase tracking-wide text-gray-400">Week ending</span>
                    <span className="text-xs uppercase tracking-wide text-gray-400 text-right">Collected</span>
                    <span className="text-xs uppercase tracking-wide text-gray-400 text-right">Invoices paid</span>
                    <span className="text-xs uppercase tracking-wide text-gray-400 text-right">Customers</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {weeklyCollections.map((week) => (
                      <div key={week.periodEnd} className="grid grid-cols-4 gap-4 px-5 py-3 hover:bg-gray-50/50 transition-colors">
                        <span className="text-sm text-navy-900">
                          {format(parseISO(week.periodEnd), 'MMM d, yyyy')}
                        </span>
                        <span className="text-sm font-semibold text-navy-900 text-right">
                          {fmt(week.collected)}
                        </span>
                        <span className="text-sm text-gray-600 text-right">{week.invoices}</span>
                        <span className="text-sm text-gray-600 text-right">{week.customers.size}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* By customer table */}
              <Card padding={false}>
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="text-base font-semibold text-navy-900">By Customer</h3>
                </div>
                <div>
                  {/* Header row */}
                  <div className="grid grid-cols-4 gap-4 px-5 py-2 border-b border-gray-100">
                    <span className="text-xs uppercase tracking-wide text-gray-400 col-span-2">Customer</span>
                    <span className="text-xs uppercase tracking-wide text-gray-400 text-right">Total Collected</span>
                    <span className="text-xs uppercase tracking-wide text-gray-400 text-right">Last Payment</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {byCustomer.map((cust) => (
                      <div key={cust.customer} className="grid grid-cols-4 gap-4 px-5 py-3 hover:bg-gray-50/50 transition-colors">
                        <div className="col-span-2 min-w-0">
                          <p className="text-sm font-medium text-navy-900 truncate">{cust.customer}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{cust.invoices} invoice{cust.invoices !== 1 ? 's' : ''}</p>
                        </div>
                        <span className="text-sm font-semibold text-navy-900 text-right self-center">
                          {fmt(cust.totalCollected)}
                        </span>
                        <span className="text-sm text-gray-500 text-right self-center">
                          {cust.lastPayment ? format(parseISO(cust.lastPayment), 'MMM d, yyyy') : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Payment history grouped by customer */}
              <div>
                <h3 className="text-base font-semibold text-navy-900 mb-3">Payment History</h3>
                <div className="space-y-4">
                  {Array.from(paymentsByCustomer.entries()).map(([customer, events]) => {
                    const customerTotal = events.reduce((s, e) => s + Number(e.amount_paid), 0)
                    return (
                      <Card key={customer} padding={false}>
                        {/* Customer group header */}
                        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/60">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-navy-900">{customer}</span>
                            <span className="text-xs text-gray-400">{events.length} payment{events.length !== 1 ? 's' : ''}</span>
                          </div>
                          <span className="text-sm font-bold text-green-600">{fmt(customerTotal)}</span>
                        </div>

                        {/* Payment event rows */}
                        <div className="divide-y divide-gray-50">
                          {events.map((evt, idx) => (
                            <div key={`${evt.transaction_number}-${evt.period_end}-${idx}`} className="flex items-center gap-4 px-5 py-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-navy-900 truncate">{evt.transaction_number}</p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {format(parseISO(evt.period_start), 'MMM d')} → {format(parseISO(evt.period_end), 'MMM d, yyyy')}
                                </p>
                              </div>
                              <span className="text-sm font-semibold text-navy-900 flex-shrink-0">
                                {fmt(Number(evt.amount_paid))}
                              </span>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                                evt.payment_type === 'paid_in_full'
                                  ? 'bg-green-50 text-green-700'
                                  : 'bg-blue-50 text-blue-700'
                              }`}>
                                {evt.payment_type === 'paid_in_full' ? 'Paid in full' : 'Partial'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
