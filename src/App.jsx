import { lazy, Suspense, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { UserProvider, useUser } from './contexts/UserContext'
import Layout from './components/layout/Layout'
import { PageSpinner } from './components/ui/Spinner'

// Route-level code splitting — each page loads only when first visited
const Login              = lazy(() => import('./pages/Login'))
const ResetPassword      = lazy(() => import('./pages/ResetPassword'))
const QuestionnairePublic = lazy(() => import('./pages/QuestionnairePublic'))
const Dashboard          = lazy(() => import('./pages/Dashboard'))
const Deals              = lazy(() => import('./pages/Deals'))
const NewDeal            = lazy(() => import('./pages/NewDeal'))
const DealDetail         = lazy(() => import('./pages/DealDetail'))
const Products           = lazy(() => import('./pages/Products'))
const Vendors            = lazy(() => import('./pages/Vendors'))
const VendorDetail       = lazy(() => import('./pages/VendorDetail'))
const Categories         = lazy(() => import('./pages/Categories'))
const People             = lazy(() => import('./pages/People'))
const Companies          = lazy(() => import('./pages/Companies'))
const Commission         = lazy(() => import('./pages/Commission'))
const Analytics          = lazy(() => import('./pages/Analytics'))
const Partners           = lazy(() => import('./pages/Partners'))
const Settings           = lazy(() => import('./pages/Settings'))
const UserManagement     = lazy(() => import('./pages/UserManagement'))
const Activity           = lazy(() => import('./pages/Activity'))
const Questionnaires     = lazy(() => import('./pages/Questionnaires'))
const SlideDebug         = lazy(() => import('./pages/SlideDebug'))

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
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><PageSpinner /></div>}>
          <Routes>
            <Route path="/slide-lab" element={<SlideDebug />} />
            <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/q/:token" element={<QuestionnairePublic />} />
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
              <Route path="analytics" element={<Analytics />} />
              <Route path="products" element={<Products />} />
              <Route path="vendors" element={<Vendors />} />
              <Route path="vendors/:id" element={<VendorDetail />} />
              <Route path="partners" element={<Partners />} />
              <Route path="categories" element={<Categories />} />
              <Route path="people" element={<ManagerOnly><People /></ManagerOnly>} />
              <Route path="customers" element={<Companies />} />
              <Route path="companies" element={<Navigate to="/customers" replace />} />
              <Route path="activity" element={<ManagerOnly><Activity /></ManagerOnly>} />
              <Route path="settings" element={<ManagerOnly><Settings /></ManagerOnly>} />
              <Route path="users" element={<ManagerOnly><UserManagement /></ManagerOnly>} />
              <Route path="questionnaires" element={<Questionnaires />} />
            </Route>
          </Routes>
        </Suspense>
      </UserProvider>
    </BrowserRouter>
  )
}
