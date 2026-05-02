import { clsx } from 'clsx'

export default function Card({ children, className, padding = true }) {
  return (
    <div className={clsx('bg-white rounded-xl border border-gray-100 shadow-sm', padding && 'p-5', className)}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action, className }) {
  return (
    <div className={clsx('flex items-start justify-between mb-4', className)}>
      <div>
        <h3 className="text-base font-semibold text-navy-900">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="ml-4 flex-shrink-0">{action}</div>}
    </div>
  )
}
