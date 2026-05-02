import { Search, X } from 'lucide-react'
import { clsx } from 'clsx'

export default function SearchBar({ value, onChange, placeholder = 'Search...', className }) {
  return (
    <div className={clsx('relative flex items-center', className)}>
      <Search size={16} className="absolute left-3 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-8 py-2.5 border border-gray-200 rounded-lg text-sm text-navy-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2.5 text-gray-400 hover:text-gray-600"
        >
          <X size={15} />
        </button>
      )}
    </div>
  )
}
