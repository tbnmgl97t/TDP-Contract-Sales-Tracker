import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Edit, Trash2, Upload, FileText, Download, ChevronRight, DollarSign, Users, Package, FileCheck, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Card, { CardHeader } from '../components/ui/Card'
import { StageBadge, Badge } from '../components/ui/Badge'
import Button from '../components/ui/Button'
import { Select } from '../components/ui/Input'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { DEAL_STAGES } from '../lib/constants'
import { buildCommissionSchedule, fmt } from '../lib/commission'
import { PageSpinner } from '../components/ui/Spinner'
import { format } from 'date-fns'

function StageProgress({ current }) {
  const active = DEAL_STAGES.filter((s) => s.key !== 'closed_lost')
  const currentIdx = active.findIndex((s) => s.key === current)
  return (
    <div className="flex items-center gap-0">
      {active.map((stage, i) => (
        <div key={stage.key} className="flex items-center flex-1 last:flex-none">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-all ${i <= currentIdx ? 'bg-primary-400 text-white' : 'bg-gray-100 text-gray-400'}`}>
            {i + 1}
          </div>
          {i < active.length - 1 && (
            <div className={`h-0.5 flex-1 transition-all ${i < currentIdx ? 'bg-primary-400' : 'bg-gray-100'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

export default function DealDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [deal, setDeal] = useState(null)
  const [dealProducts, setDealProducts] = useState([])
  const [dealTeam, setDealTeam] = useState([])
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteDlg, setDeleteDlg] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [stageChanging, setStageChanging] = useState(false)

  async function load() {
    const [
      { data: d },
      { data: dps },
      { data: team },
      { data: conts },
    ] = await Promise.all([
      supabase.from('deals').select('*').eq('id', id).single(),
      supabase.from('deal_products').select('*, products(name, commission_metric, unit_label)').eq('deal_id', id),
      supabase.from('deal_team').select('*, people(name, role, email)').eq('deal_id', id),
      supabase.from('contracts').select('*').eq('deal_id', id).order('uploaded_at', { ascending: false }),
    ])
    setDeal(d)
    setDealProducts(dps || [])
    setDealTeam(team || [])
    setContracts(conts || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function handleStageChange(stage) {
    setStageChanging(true)
    await supabase.from('deals').update({ stage, updated_at: new Date().toISOString() }).eq('id', id)
    setDeal((d) => ({ ...d, stage }))
    setStageChanging(false)
  }

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('deals').delete().eq('id', id)
    navigate('/deals')
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const path = `contracts/${id}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('contracts').upload(path, file)
    if (!error) {
      const { data: urlData } = supabase.storage.from('contracts').getPublicUrl(path)
      await supabase.from('contracts').insert([{
        deal_id: id,
        file_name: file.name,
        file_path: path,
        file_url: urlData.publicUrl,
        file_size: file.size,
        mime_type: file.type,
      }])
      load()
    }
    setUploading(false)
  }

  async function handleDownload(contract) {
    const { data } = await supabase.storage.from('contracts').download(contract.file_path)
    if (data) {
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = contract.file_name
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  async function handleDeleteContract(contract) {
    await supabase.storage.from('contracts').remove([contract.file_path])
    await supabase.from('contracts').delete().eq('id', contract.id)
    load()
  }

  if (loading) return <PageSpinner />
  if (!deal) return <div className="p-8 text-center text-gray-500">Deal not found.</div>

  const totalCommission = dealProducts.reduce((s, p) => s + (p.commission_amount || 0), 0)
  const totalCogs = dealProducts.reduce((s, p) => s + (p.cogs_amount || 0), 0)
  const totalRevenue = dealProducts.reduce((s, p) => s + ((p.total_revenue || p.annual_value || 0)), 0)

  const schedule = buildCommissionSchedule(
    deal,
    dealProducts,
    dealTeam.map((m) => ({ ...m, person_name: m.people?.name }))
  )

  const salesTeam = dealTeam.filter((m) => m.role === 'sales')
  const supportTeam = dealTeam.filter((m) => m.role === 'support')

  const quarterGroups = schedule.reduce((acc, entry) => {
    const key = `${entry.year} Q${entry.quarter}`
    if (!acc[key]) acc[key] = { key, quarter: entry.quarter, year: entry.year, entries: [] }
    acc[key].entries.push(entry)
    return acc
  }, {})

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-bold text-navy-900">{deal.name}</h2>
            {deal.is_tbn_property && (
              <Badge color="orange">TBN Property</Badge>
            )}
          </div>
          <p className="text-sm text-gray-500">{deal.company_name}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => navigate(`/deals/${id}/edit`)} icon={<Edit size={14} />}>Edit</Button>
          <Button variant="danger" size="sm" onClick={() => setDeleteDlg(true)} icon={<Trash2 size={14} />}>Delete</Button>
        </div>
      </div>

      {/* Stage bar */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <StageBadge stage={deal.stage} />
            <Select
              value={deal.stage}
              onChange={(e) => handleStageChange(e.target.value)}
              className="w-48"
            >
              {DEAL_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
          </div>
          {deal.stage !== 'closed_lost' && <StageProgress current={deal.stage} />}
        </div>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'ACV', value: fmt(deal.acv) },
          { label: 'Total Value', value: fmt(deal.total_contract_value || deal.acv) },
          { label: 'Contract Months', value: deal.contract_months || 12 },
          { label: 'Commission', value: fmt(totalCommission) },
        ].map((stat) => (
          <Card key={stat.label} className="!py-3">
            <p className="text-xs text-gray-500">{stat.label}</p>
            <p className="text-lg font-bold text-navy-900 mt-0.5">{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Deal details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Deal Info" />
          <dl className="space-y-2.5">
            {[
              { label: 'Type', value: deal.deal_type === 'renewal' ? 'Renewal' : 'New Business' },
              { label: 'Contract Start', value: deal.contract_start ? format(new Date(deal.contract_start), 'MMM d, yyyy') : '—' },
              { label: 'Contract End', value: deal.contract_end ? format(new Date(deal.contract_end), 'MMM d, yyyy') : '—' },
              { label: 'TBN Property', value: deal.is_tbn_property ? 'Yes (no commission)' : 'No' },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-gray-500">{label}</span>
                <span className="font-medium text-navy-900">{value}</span>
              </div>
            ))}
            {deal.notes && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Notes</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{deal.notes}</p>
              </div>
            )}
          </dl>
        </Card>

        {/* Team */}
        <Card>
          <CardHeader title="Team" />
          <div className="space-y-2">
            {dealTeam.length === 0 && <p className="text-sm text-gray-400">No team members assigned.</p>}
            {salesTeam.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-semibold text-xs flex-shrink-0">
                    {m.people?.name?.[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-navy-900">{m.people?.name}</p>
                    <p className="text-xs text-gray-500">Sales</p>
                  </div>
                </div>
                <Badge color="green">{m.commission_percent}% commission</Badge>
              </div>
            ))}
            {supportTeam.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-accent-100 flex items-center justify-center text-accent-700 font-semibold text-xs flex-shrink-0">
                    {m.people?.name?.[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-navy-900">{m.people?.name}</p>
                    <p className="text-xs text-gray-500">Support</p>
                  </div>
                </div>
                <Badge color="yellow">SPIF {fmt(m.spif_amount)}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Products */}
      <Card>
        <CardHeader title="Products & Services" subtitle={`Total Commission: ${fmt(totalCommission)}`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 font-medium text-gray-500 text-xs uppercase tracking-wide">Product</th>
                <th className="text-left py-2 font-medium text-gray-500 text-xs uppercase tracking-wide hidden sm:table-cell">Metric</th>
                <th className="text-right py-2 font-medium text-gray-500 text-xs uppercase tracking-wide hidden md:table-cell">Revenue</th>
                <th className="text-right py-2 font-medium text-gray-500 text-xs uppercase tracking-wide hidden md:table-cell">COGS</th>
                <th className="text-right py-2 font-medium text-gray-500 text-xs uppercase tracking-wide">Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {dealProducts.map((dp) => (
                <tr key={dp.id}>
                  <td className="py-3 font-medium text-navy-900">{dp.products?.name}</td>
                  <td className="py-3 hidden sm:table-cell text-gray-500">{dp.commission_metric}</td>
                  <td className="py-3 text-right hidden md:table-cell text-gray-700">{fmt(dp.total_revenue || dp.annual_value)}</td>
                  <td className="py-3 text-right hidden md:table-cell text-gray-500">{dp.cogs_amount ? fmt(dp.cogs_amount) : '—'}</td>
                  <td className="py-3 text-right font-semibold text-primary-600">{fmt(dp.commission_amount)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-200">
                <td colSpan={4} className="py-2 font-semibold text-navy-900 text-sm">Total</td>
                <td className="py-2 text-right font-bold text-primary-600">{fmt(totalCommission)}</td>
              </tr>
            </tbody>
          </table>
          {dealProducts.length === 0 && (
            <p className="text-sm text-gray-400 py-6 text-center">No products added.</p>
          )}
        </div>
      </Card>

      {/* Commission Schedule */}
      {!deal.is_tbn_property && schedule.length > 0 && (
        <Card>
          <CardHeader title="Commission Schedule" subtitle="Quarterly payout breakdown" />
          {deal.is_tbn_property && (
            <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4 text-sm text-orange-700">
              <AlertTriangle size={16} />
              TBN properties are excluded from the commission plan.
            </div>
          )}
          <div className="space-y-4">
            {Object.values(quarterGroups).map((group) => {
              const total = group.entries.reduce((s, e) => s + (e.amount || 0), 0)
              return (
                <div key={group.key} className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="bg-navy-50 px-4 py-2.5 flex items-center justify-between">
                    <span className="text-sm font-semibold text-navy-900">{group.year} Q{group.quarter}</span>
                    <span className="text-sm font-bold text-primary-600">{fmt(total)}</span>
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
                        <span className="font-semibold text-navy-900">{fmt(entry.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Contracts */}
      <Card>
        <CardHeader
          title="Contracts"
          action={
            <label className="cursor-pointer">
              <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.doc,.docx,.png,.jpg" />
              <Button size="sm" variant="secondary" loading={uploading} icon={<Upload size={14} />} as="span">
                Upload
              </Button>
            </label>
          }
        />
        {contracts.length === 0 ? (
          <label className="cursor-pointer flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl p-8 hover:border-primary-300 hover:bg-primary-50/30 transition-colors">
            <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.doc,.docx,.png,.jpg" />
            <FileText size={32} className="text-gray-300 mb-2" />
            <p className="text-sm font-medium text-gray-500">Upload contract document</p>
            <p className="text-xs text-gray-400 mt-0.5">PDF, DOC, DOCX, PNG, JPG</p>
          </label>
        ) : (
          <div className="space-y-2">
            {contracts.map((contract) => (
              <div key={contract.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50">
                <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                  <FileCheck size={18} className="text-primary-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy-900 truncate">{contract.file_name}</p>
                  <p className="text-xs text-gray-400">
                    {format(new Date(contract.uploaded_at), 'MMM d, yyyy')}
                    {contract.file_size && ` · ${(contract.file_size / 1024).toFixed(0)} KB`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleDownload(contract)} className="p-2 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors">
                    <Download size={15} />
                  </button>
                  <button onClick={() => handleDeleteContract(contract)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={deleteDlg}
        onClose={() => setDeleteDlg(false)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Deal"
        message={`Are you sure you want to delete "${deal.name}"? This cannot be undone.`}
      />
    </div>
  )
}
