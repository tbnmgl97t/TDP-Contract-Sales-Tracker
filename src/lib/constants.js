export const DEAL_STAGES = [
  { key: 'lead', label: 'Lead', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  { key: 'qualified', label: 'Qualified', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  { key: 'discovery', label: 'Discovery', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  { key: 'proposal', label: 'Proposal', color: 'bg-accent-100 text-accent-700', dot: 'bg-accent-400' },
  { key: 'negotiation', label: 'Negotiation', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  { key: 'contracted', label: 'Contracted', color: 'bg-primary-100 text-primary-700', dot: 'bg-primary-400' },
  { key: 'closed_lost', label: 'Closed Lost', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
]

export const DEAL_STAGE_ORDER = ['lead', 'qualified', 'discovery', 'proposal', 'negotiation', 'contracted', 'closed_lost']

export const COMMISSION_METRICS = [
  { value: 'NAVC/RAV', label: 'NAVC/RAV — Annual Contract Value' },
  { value: 'GM', label: 'GM — Gross Margin' },
]

export const PERSON_ROLES = [
  { value: 'sales', label: 'Sales (Commission eligible)' },
  { value: 'support', label: 'Support (SPIF eligible)' },
  { value: 'management', label: 'Management' },
]

export const DEAL_TYPES = [
  { value: 'new', label: 'New Business' },
  { value: 'renewal', label: 'Renewal' },
]

export const QUARTERS = [
  { value: 1, label: 'Q1' },
  { value: 2, label: 'Q2' },
  { value: 3, label: 'Q3' },
  { value: 4, label: 'Q4' },
]

export const COLORS = {
  primary: '#57BB95',
  navy: '#17263A',
  accent: '#CBDD56',
}
