import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Edit2, KeyRound, UserX, UserCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useUser } from '../contexts/UserContext'
import Button from '../components/ui/Button'
import Card, { CardHeader } from '../components/ui/Card'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { PageSpinner } from '../components/ui/Spinner'
import UserModal from '../components/UserModal'
import ResetPasswordModal from '../components/ResetPasswordModal'

const ROLE_LABELS = { manager: 'Manager', sales: 'Sales', support: 'Support' }
const ROLE_COLORS = { manager: 'bg-primary-100 text-primary-700', sales: 'bg-blue-100 text-blue-700', support: 'bg-amber-100 text-amber-700' }

export default function UserManagement() {
  const { isManager } = useUser()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [resetUser, setResetUser] = useState(null)
  const [toggleConfirm, setToggleConfirm] = useState(null)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    if (!isManager) navigate('/dashboard')
  }, [isManager])

  async function load() {
    const { data } = await supabase.from('user_profiles').select('*').order('created_at')
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleToggleActive() {
    setToggling(true)
    await supabase.from('user_profiles').update({
      active: !toggleConfirm.active,
      updated_at: new Date().toISOString(),
    }).eq('user_id', toggleConfirm.user_id)
    setToggleConfirm(null)
    setToggling(false)
    load()
  }

  if (loading) return <PageSpinner />

  const activeUsers = users.filter((u) => u.active)
  const inactiveUsers = users.filter((u) => !u.active)

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-navy-900">User Management</h2>
          <p className="text-sm text-gray-500 mt-0.5">{activeUsers.length} active user{activeUsers.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setShowNewModal(true)} icon={<Plus size={15} />}>New User</Button>
      </div>

      <Card>
        <CardHeader title="Active Users" />
        <div className="divide-y divide-gray-50">
          {activeUsers.length === 0 && (
            <p className="text-sm text-gray-400 py-6 text-center">No active users yet.</p>
          )}
          {activeUsers.map((u) => (
            <div key={u.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-semibold text-sm flex-shrink-0">
                  {(u.full_name || u.email || '?')[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-navy-900">{u.full_name || '—'}</p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_COLORS[u.role]}`}>
                  {ROLE_LABELS[u.role]}
                </span>
                <button onClick={() => setEditUser(u)} className="p-2 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors" title="Edit">
                  <Edit2 size={14} />
                </button>
                <button onClick={() => setResetUser(u)} className="p-2 text-gray-400 hover:text-navy-900 hover:bg-gray-100 rounded-lg transition-colors" title="Reset password">
                  <KeyRound size={14} />
                </button>
                <button onClick={() => setToggleConfirm(u)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Deactivate">
                  <UserX size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {inactiveUsers.length > 0 && (
        <Card>
          <CardHeader title="Inactive Users" />
          <div className="divide-y divide-gray-50">
            {inactiveUsers.map((u) => (
              <div key={u.id} className="flex items-center justify-between py-3 opacity-60">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-semibold text-sm flex-shrink-0">
                    {(u.full_name || u.email || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-navy-900">{u.full_name || '—'}</p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_COLORS[u.role]}`}>
                    {ROLE_LABELS[u.role]}
                  </span>
                  <button onClick={() => setToggleConfirm(u)} className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Reactivate">
                    <UserCheck size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {showNewModal && <UserModal onClose={() => setShowNewModal(false)} onSave={load} />}
      {editUser && <UserModal user={editUser} onClose={() => setEditUser(null)} onSave={load} />}
      {resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />}
      <ConfirmDialog
        open={!!toggleConfirm}
        onClose={() => setToggleConfirm(null)}
        onConfirm={handleToggleActive}
        loading={toggling}
        title={toggleConfirm?.active ? 'Deactivate User' : 'Reactivate User'}
        message={toggleConfirm?.active
          ? `${toggleConfirm?.full_name || toggleConfirm?.email} will lose access to SalesFlow.`
          : `${toggleConfirm?.full_name || toggleConfirm?.email} will regain access to SalesFlow.`}
      />
    </div>
  )
}
