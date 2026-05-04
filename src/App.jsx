import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { UserProvider, useUser } from './contexts/UserContext'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Deals from './pages/Deals'
import NewDeal from './pages/NewDeal'
import DealDetail from './pages/DealDetail'
import Products from './pages/Products'
import Vendors from './pages/Vendors'
import Categories from './pages/Categories'
import People from './pages/People'
import Companies from './pages/Companies'
import Commission from './pages/Commission'
import Analytics from './pages/Analytics'
import Partners from './pages/Partners'
import Settings from './pages/Settings'
import UserManagement from './pages/UserManagement'
import ResetPassword from './pages/ResetPassword'
import { PageSpinner } from './components/ui/Spinner'

function ProtectedRoute({ children, session }) {
  if (!session) return <Navigate to="/login" replace />
  return children
}

function ManagerOnly({ children }) {
  const { isManager, loading } = useUser()
  if (loading) return null
  if (!isManager) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <PageSpinner />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <UserProvider>
        <Routes>
          <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/"
            element={
              <ProtectedRoute session={session}>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="deals" element={<Deals />} />
            <Route path="deals/new" element={<NewDeal />} />
            <Route path="deals/:id" element={<DealDetail />} />
            <Route path="deals/:id/edit" element={<NewDeal />} />
            <Route path="commission" element={<ManagerOnly><Commission /></ManagerOnly>} />
            <Route path="analytics" element={<ManagerOnly><Analytics /></ManagerOnly>} />
            <Route path="products" element={<ManagerOnly><Products /></ManagerOnly>} />
            <Route path="vendors" element={<ManagerOnly><Vendors /></ManagerOnly>} />
            <Route path="partners" element={<ManagerOnly><Partners /></ManagerOnly>} />
            <Route path="categories" element={<ManagerOnly><Categories /></ManagerOnly>} />
            <Route path="people" element={<ManagerOnly><People /></ManagerOnly>} />
            <Route path="customers" element={<ManagerOnly><Companies /></ManagerOnly>} />
            <Route path="companies" element={<Navigate to="/customers" replace />} />
            <Route path="settings" element={<ManagerOnly><Settings /></ManagerOnly>} />
            <Route path="users" element={<ManagerOnly><UserManagement /></ManagerOnly>} />
          </Route>
        </Routes>
      </UserProvider>
    </BrowserRouter>
  )
}
