import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { AlertTriangle, CheckCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Card, { CardHeader } from '../ui/Card'

function agingBucket(row) {
  if (row.bucket_151_plus > 0) return { label: '151+ days', color: 'red' }
  if (row.bucket_121_150 > 0) return { label: '121-150 days', color: 'red' }
  if (row.bucket_91_120 > 0) return { label: '91-120 days', color: 'red' }
  if (row.bucket_61_90 > 0) return { label: '61-90 days', color: 'red' }
  if (row.bucket_31_60 > 0) return { label: '31-60 days', color: 'orange' }
  if (row.bucket_1_30 > 0) return { label: '1-30 days', color: 'amber' }
  return { label: 'Current', color: 'green' }
}

const PILL_CLASSES = {
  green: 'bg-green-50 text-green-700',
  amber: 'bg-amber-50 text-amber-700',
  orange: 'bg-orange-50 text-orange-700',
  red: 'bg-red-50 text-red-700',
}

function fmt(amount) {
  if (amount == null) return '—'
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}

export default function DealReceivablesCard({ companyId, companyName }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [asOfDate, setAsOfDate] = useState(null)

  useEffect(() => {
    if (!companyId) { setLoading(false); return }
    async function load() {
      setLoading(true)
      // Get the latest as_of_date for this company
      const { data: latest } = await supabase
        .from('receivables')
        .select('as_of_date')
        .eq('company_id', companyId)
        .order('as_of_date', { ascending: false })
        .limit(1)
        .single()

      if (!latest) { setLoading(false); return }

      const latestDate = latest.as_of_date
      setAsOfDate(latestDate)

      const { data } = await supabase
        .from('receivables')
        .select('*')
        .eq('company_id', companyId)
        .eq('as_of_date', latestDate)
        .order('invoice_due_date', { ascending: true })

      setRows(data || [])
      setLoading(false)
    }
    load()
  }, [companyId])

  if (loading) {
    return (
      <Card>
        <CardHeader title="Receivables" />
        <div className="flex items-center justify-center py-6">
          <div className="w-5 h-5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </Card>
    )
  }

  const overdueRows = rows.filter(
    (r) => r.bucket_61_90 > 0 || r.bucket_91_120 > 0 || r.bucket_121_150 > 0 || r.bucket_151_plus > 0
  )
  const attentionRows = rows.filter((r) => r.bucket_31_60 > 0)
  const totalOutstanding = rows.reduce((sum, r) => sum + (r.invoice_amount || 0), 0)

  const subtitle = asOfDate
    ? `As of ${format(parseISO(asOfDate), 'MMM d, yyyy')}`
    : undefined

  return (
    <Card>
      <CardHeader title="Receivables" subtitle={subtitle} />

      {/* Alert banners */}
      {overdueRows.length > 0 && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 mb-4">
          <AlertTriangle size={15} className="text-red-500 flex-shrink-0" />
          <p className="text-sm font-medium text-red-700">
            Overdue invoices — {overdueRows.length} invoice{overdueRows.length !== 1 ? 's' : ''} past 60 days
          </p>
        </div>
      )}
      {overdueRows.length === 0 && attentionRows.length > 0 && (
        <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-4">
          <AlertTriangle size={15} className="text-amber-500 flex-shrink-0" />
          <p className="text-sm font-medium text-amber-700">
            Payment attention needed — {attentionRows.length} invoice{attentionRows.length !== 1 ? 's' : ''} 31-60 days
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex items-center gap-2 text-green-600 py-3">
          <CheckCircle size={16} />
          <p className="text-sm font-medium">No outstanding invoices</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {rows.map((row) => {
              const bucket = agingBucket(row)
              return (
                <div
                  key={row.id}
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-navy-900 truncate">{row.transaction_number}</p>
                    {row.invoice_due_date && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Due {format(parseISO(row.invoice_due_date), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                    <span className="text-sm font-semibold text-navy-900">{fmt(row.invoice_amount)}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PILL_CLASSES[bucket.color]}`}>
                      {bucket.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between pt-3 mt-1 border-t border-gray-100">
            <p className="text-sm text-gray-500 font-medium">Total Outstanding</p>
            <p className="text-sm font-bold text-navy-900">{fmt(totalOutstanding)}</p>
          </div>
        </>
      )}
    </Card>
  )
}
