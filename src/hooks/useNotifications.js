import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useUser } from '../contexts/UserContext'

const POLL_INTERVAL_MS = 30_000

export function useNotifications() {
  const { profile } = useUser()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount]     = useState(0)

  const load = useCallback(async () => {
    if (!profile?.email) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_email', profile.email)
      .order('created_at', { ascending: false })
      .limit(30)
    if (data) {
      setNotifications(data)
      setUnreadCount(data.filter((n) => !n.read_at).length)
    }
  }, [profile?.email])

  useEffect(() => {
    load()
    const interval = setInterval(load, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [load])

  async function markRead(id) {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    setUnreadCount((c) => Math.max(0, c - 1))
  }

  async function markAllRead() {
    if (!profile?.email) return
    await supabase.from('notifications').update({ read_at: new Date().toISOString() })
      .eq('user_email', profile.email).is('read_at', null)
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
    setUnreadCount(0)
  }

  return { notifications, unreadCount, markRead, markAllRead, reload: load }
}
