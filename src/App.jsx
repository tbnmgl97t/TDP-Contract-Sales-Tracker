import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
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
import Commission from './pages/Commission'
import Settings from './pages/Settings'
import { PageSpinner } from './components/ui/Spinner'

function ProtectedRoute({ children, session }) {
  if (!session) return <Navigate to="/login" replace />
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
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <Login />} />
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
          <Route path="products" element={<Products />} />
          <Route path="vendors" element={<Vendors />} />
          <Route path="categories" element={<Categories />} />
          <Route path="people" element={<People />} />
          <Route path="commission" element={<Commission />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
