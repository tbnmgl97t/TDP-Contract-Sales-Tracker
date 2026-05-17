import { useState } from 'react'
import { pdf } from '@react-pdf/renderer'
import { Download } from 'lucide-react'
import Modal from './ui/Modal'
import Button from './ui/Button'
import Input from './ui/Input'
import ExecReportPDF from './ExecReportPDF'
import { logActivity } from '../lib/logActivity'

/**
 * Reconstruct which products were active on a given date using amendment history.
 * - Excludes products added by an amendment AFTER asOfDate
 * - Re-activates products cancelled by an amendment AFTER asOfDate (cancellation hadn't happened yet)
 */
function filterProductsAsOf(dealProducts, amendments, asOfDate, contractMonths) {
  if (!asOfDate) return dealProducts

  const amendmentMap = {}
  amendments.forEach((a) => { amendmentMap[a.id] = a })

  return dealProducts
    .filter((dp) => {
      if (dp.amendment_id) {
        const amend = amendmentMap[dp.amendment_id]
        if (!amend || amend.effective_date > asOfDate) return false
      }
      return true
    })
    .map((dp) => {
      if (dp.status === 'cancelled' && dp.cancellation_amendment_id) {
        const cancelAmend = amendmentMap[dp.cancellation_amendment_id]
        if (cancelAmend && cancelAmend.effective_date > asOfDate) {
          return { ...dp, status: 'active', billing_months: contractMonths }
        }
      }
      return dp
    })
}

export default function ExecReportModal({ open, onClose, onLogged, deal, dealProducts, dealTeam, dealPartners, approval, quarterGroups, amendments = [] }) {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0])
  const [generating, setGenerating] = useState(false)

  const hasAmendments = amendments.length > 0
  const contractMonths = deal?.contract_months || 12

  // Earliest and latest valid dates for the picker
  const minDate = deal?.contract_start || undefined
  const maxDate = new Date().toISOString().split('T')[0]

  async function handleGenerate() {
    setGenerating(true)
    try {
      const filteredProducts = filterProductsAsOf(dealProducts, amendments, asOfDate || null, contractMonths)

      const doc = (
        <ExecReportPDF
          deal={deal}
          dealProducts={filteredProducts}
          dealTeam={dealTeam}
          dealPartners={dealPartners}
          approval={approval}
          quarterGroups={quarterGroups}
          asOfDate={asOfDate || null}
        />
      )
      const blob = await pdf(doc).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const safeName = (deal.name || 'deal').replace(/\s*-\s*/g, '-').replace(/[^a-z0-9-]/gi, '_').toLowerCase()
      const dateSuffix = asOfDate ? `_as_of_${asOfDate}` : ''
      a.download = `${safeName}${dateSuffix}_exec_report.pdf`
      a.click()
      URL.revokeObjectURL(url)

      await logActivity({
        dealId:      deal.id,
        description: asOfDate
          ? `Executive report downloaded (as of ${new Date(asOfDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })})`
          : 'Executive report downloaded',
        recordId:    deal.id,
      })
      onLogged?.()
    } finally {
      setGenerating(false)
      onClose()
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Generate Executive Report" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          A 2-page PDF covering deal financials, team commissions with justifications, and a full product breakdown.
        </p>

        {hasAmendments && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              As of date <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <Input
              type="date"
              value={asOfDate}
              min={minDate}
              max={maxDate}
              onChange={(e) => setAsOfDate(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">
              {asOfDate
                ? `Report will reflect the deal as it stood on ${new Date(asOfDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`
                : 'Leave blank to report on the current state of the deal.'}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleGenerate}
            disabled={generating}
            icon={<Download size={14} />}
          >
            {generating ? 'Generating…' : 'Download Report'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
