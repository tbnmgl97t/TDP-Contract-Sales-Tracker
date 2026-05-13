import { Menu, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Button from '../ui/Button'
import NotificationBell from './NotificationBell'

export default function Header({ onMenuClick, title }) {
  const navigate = useNavigate()
  return (
    <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <Menu size={20} />
        </button>
        {title && (
          <h1 className="text-base font-semibold text-navy-900 hidden sm:block">{title}</h1>
        )}
      </div>
      <div className="flex items-center gap-2">
        <NotificationBell />
        <Button
          size="sm"
          onClick={() => navigate('/deals/new')}
          icon={<Plus size={15} />}
        >
          New Deal
        </Button>
      </div>
    </header>
  )
}
