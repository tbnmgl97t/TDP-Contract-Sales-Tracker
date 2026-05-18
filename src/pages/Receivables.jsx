import { useState, useEffect, useMemo, useRef } from 'react'
import { format, parseISO } from 'date-fns'
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
    </div>
  )
}
