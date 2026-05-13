export default function TypeBadge({ type }) {
  if (type === 'section') return (
    <span className="bg-primary-50 text-primary-600 text-xs px-2 py-0.5 rounded font-medium">Section</span>
  )
  if (type === 'subsection') return (
    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded font-medium">Subsection</span>
  )
  if (type === 'short') return (
    <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-medium">Short</span>
  )
  return (
    <span className="bg-purple-50 text-purple-700 text-xs px-2 py-0.5 rounded font-medium">Long</span>
  )
}
