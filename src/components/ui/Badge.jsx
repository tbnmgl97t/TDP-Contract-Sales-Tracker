import { clsx } from 'clsx'
import { DEAL_STAGES } from '../../lib/constants'

export function StageBadge({ stage }) {
  const stageInfo = DEAL_STAGES.find((s) => s.key === stage)
  if (!stageInfo) return null
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', stageInfo.color)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', stageInfo.dot)} />
      {stageInfo.label}
    </span>
  )
}

export function Badge({ children, color = 'gray', className }) {
  const colors = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-primary-100 text-primary-700',
    blue: 'bg-blue-100 text-blue-700',
    yellow: 'bg-accent-100 text-accent-700',
    red: 'bg-red-100 text-red-700',
    navy: 'bg-navy-100 text-navy-700',
    purple: 'bg-purple-100 text-purple-700',
    orange: 'bg-orange-100 text-orange-700',
  }
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', colors[color], className)}>
      {children}
    </span>
  )
}
