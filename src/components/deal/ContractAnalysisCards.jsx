import { Sparkles, Loader } from 'lucide-react'
import Card from '../ui/Card'
import Button from '../ui/Button'

export default function ContractAnalysisCards({ contracts, aiExtracting, aiContract, onReanalyze, onOpenChat }) {
  const analyzed = contracts.filter((c) => c.ai_analysis)
  if (!analyzed.length) return null

  return analyzed.map((contract) => {
    const a = contract.ai_analysis
    const isAnalyzing = aiExtracting && aiContract?.id === contract.id
    return (
      <Card key={`analysis-${contract.id}`}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
              <Sparkles size={16} className="text-primary-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-navy-900">Contract Analysis</p>
              <p className="text-xs text-gray-400">{contract.file_name}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => onReanalyze(contract)} loading={isAnalyzing}>
              Re-analyze
            </Button>
            <Button size="sm" icon={<Sparkles size={13} />} onClick={onOpenChat}>
              Ask questions
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {[
            { label: 'Client', value: a.client_name },
            { label: 'Vendor', value: a.vendor_name },
            { label: 'Contract Value', value: a.contract_value },
            { label: 'Payment Terms', value: a.payment_terms },
            { label: 'Start Date', value: a.start_date },
            { label: 'End Date', value: a.end_date },
            { label: 'Auto-Renewal', value: a.auto_renewal != null ? (a.auto_renewal ? 'Yes' : 'No') : null },
            { label: 'Termination Notice', value: a.termination_notice_days ? `${a.termination_notice_days} days` : null },
          ].filter((f) => f.value).map(({ label, value }) => (
            <div key={label} className="bg-gray-50 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-xs font-medium text-navy-900 mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {a.payment_schedule?.length > 0 && (
          <div className="bg-gray-50 rounded-lg px-3 py-2.5 mb-3">
            <p className="text-xs text-gray-400 mb-2">Payment Schedule</p>
            <div className="space-y-1">
              {a.payment_schedule.map((p, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-gray-600">{p.label}{p.date ? ` · ${p.date}` : ''}</span>
                  <span className="font-medium text-navy-900">{p.amount}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {a.summary && (
          <div className="bg-primary-50 border border-primary-100 rounded-lg px-3 py-2.5">
            <p className="text-xs text-primary-600 font-medium mb-1">Summary</p>
            <p className="text-sm text-navy-900 leading-relaxed">{a.summary}</p>
          </div>
        )}
      </Card>
    )
  })
}
