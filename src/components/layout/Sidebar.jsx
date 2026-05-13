import { NavLink, useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  LayoutDashboard,
  Handshake,
  Package,
  Store,
  Tag,
  Users,
  Building2,
  DollarSign,
  BarChart2,
  Settings,
  LogOut,
  ChevronRight,
  X,
  Network,
  UserCog,
  Activity,
  ClipboardList,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useUser } from '../../contexts/UserContext'

const MANAGER_NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/deals', icon: Handshake, label: 'Deals' },
  { to: '/commission', icon: DollarSign, label: 'Commission' },
  { to: '/analytics', icon: BarChart2, label: 'Analytics' },
  { to: '/activity', icon: Activity, label: 'Activity' },
  { divider: true },
  { to: '/products', icon: Package, label: 'Products' },
  { to: '/vendors', icon: Store, label: 'Vendors' },
  { to: '/partners', icon: Network, label: 'Partners' },
  { to: '/categories', icon: Tag, label: 'Categories' },
  { to: '/people', icon: Users, label: 'People' },
  { to: '/customers', icon: Building2, label: 'Customers' },
  { to: '/questionnaires', icon: ClipboardList, label: 'Questionnaires' },
  { divider: true },
  { to: '/users', icon: UserCog, label: 'Users' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

const SALES_NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/deals', icon: Handshake, label: 'Deals' },
  { to: '/analytics', icon: BarChart2, label: 'Analytics' },
  { to: '/questionnaires', icon: ClipboardList, label: 'Questionnaires' },
  { divider: true },
  { to: '/products', icon: Package, label: 'Products' },
  { to: '/vendors', icon: Store, label: 'Vendors' },
  { to: '/partners', icon: Network, label: 'Partners' },
  { to: '/categories', icon: Tag, label: 'Categories' },
  { to: '/customers', icon: Building2, label: 'Customers' },
]

const SUPPORT_NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/deals', icon: Handshake, label: 'Deals' },
  { to: '/analytics', icon: BarChart2, label: 'Analytics' },
  { to: '/questionnaires', icon: ClipboardList, label: 'Questionnaires' },
  { divider: true },
  { to: '/products', icon: Package, label: 'Products' },
  { to: '/vendors', icon: Store, label: 'Vendors' },
  { to: '/partners', icon: Network, label: 'Partners' },
  { to: '/categories', icon: Tag, label: 'Categories' },
  { to: '/customers', icon: Building2, label: 'Customers' },
]

export default function Sidebar({ open, onClose }) {
  const navigate = useNavigate()
  const { isManager, isSales } = useUser()

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed top-0 left-0 h-full w-64 bg-navy-900 flex flex-col z-40 transition-transform duration-300',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-navy-700">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-tdp-gradient flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">SF</span>
            </div>
            <div>
              <div className="text-white font-semibold text-sm leading-tight">SalesFlow</div>
              <div className="text-navy-300 text-xs">Trilogy Digital</div>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-navy-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
          {(isManager ? MANAGER_NAV : isSales ? SALES_NAV : SUPPORT_NAV).map((item, i) => {
            if (item.divider) {
              return <div key={i} className="my-3 border-t border-navy-700" />
            }
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group',
                    isActive
                      ? 'bg-primary-400/20 text-primary-300'
                      : 'text-navy-300 hover:bg-navy-800 hover:text-white'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={17} className={isActive ? 'text-primary-400' : 'text-navy-400 group-hover:text-white'} />
                    <span className="flex-1">{item.label}</span>
                    {isActive && <ChevronRight size={14} className="text-primary-400" />}
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 pb-4 border-t border-navy-700 pt-3">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-navy-300 hover:bg-navy-800 hover:text-white transition-colors"
          >
            <LogOut size={17} className="text-navy-400" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  )
}
