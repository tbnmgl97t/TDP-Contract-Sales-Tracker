import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [profile, setProfile] = useState(null)
  const [authUser, setAuthUser] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(user) {
    if (!user) { setProfile(null); setAuthUser(null); setLoading(false); return }
    setAuthUser(user)
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()
    // No profile = treat as manager so existing users aren't locked out
    setProfile(data || { user_id: user.id, role: 'manager', email: user.email, full_name: user.email, active: true })
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      loadProfile(session?.user || null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      loadProfile(session?.user || null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const role = profile?.role || 'manager'
  const isManager = role === 'manager'
  const isSales = role === 'sales'
  const isSupport = role === 'support'

  return (
    <UserContext.Provider value={{ profile, authUser, role, isManager, isSales, isSupport, loading, setProfile }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used within UserProvider')
  return ctx
}
