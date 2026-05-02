export default function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center mb-4 text-primary-400">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-navy-900 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-500 max-w-xs mb-4">{description}</p>}
      {action && <div>{action}</div>}
    </div>
  )
}
