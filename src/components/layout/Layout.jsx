import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

const TITLES = {
  '/dashboard': 'Dashboard',
  '/deals': 'Deals',
  '/deals/new': 'New Deal',
  '/commission': 'Commission',
  '/analytics': 'Analytics',
  '/products': 'Products',
  '/vendors': 'Vendors',
  '/categories': 'Categories',
  '/people': 'People',
  '/settings': 'Settings',
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pathname } = useLocation()

  const title = TITLES[pathname] || (pathname.startsWith('/deals/') ? 'Deal Detail' : '')

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden lg:ml-64">
        <Header onMenuClick={() => setSidebarOpen(true)} title={title} />
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 lg:p-6 max-w-screen-xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
