import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Edit2, KeyRound, UserX, UserCheck } from 'lucide-react'
import { supabase, adminClient } from '../lib/supabase'
import { useUser } from '../contexts/UserContext'
import Button from '../components/ui/Button'
import Input, { Select } from '../components/ui/Input'
import Card, { CardHeader } from '../components/ui/Card'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { PageSpinner } from '../components/ui/Spinner'

const ROLE_LABELS = { manager: 'Manager', sales: 'Sales', support: 'Support' }
const ROLE_COLORS = { manager: 'bg-primary-100 text-primary-700', sales: 'bg-blue-100 text-blue-700', support: 'bg-amber-100 text-amber-700' }

function UserModal({ user, onClose, onSave }) {
  const isNew = !user
  const [form, setForm] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    role: user?.role || 'sales',
    password: '',
    confirm_password: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setError('')
    if (!form.full_name.trim()) { setError('Name is required.'); return }
    if (!form.email.trim()) { setError('Email is required.'); return }
    if (isNew) {
      if (!form.password) { setError('Password is required.'); return }
      if (form.password !== form.confirm_password) { setError('Passwords do not match.'); return }
      if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return }
      if (!adminClient) { setError('VITE_SUPABASE_SERVICE_ROLE_KEY is not set in .env.local'); return }
    }
    setSaving(true)
    // Map user_profiles role → people table role
    const peopleRole = form.role === 'manager' ? 'management' : form.role

    if (isNew) {
      const { data, error } = await adminClient.auth.admin.createUser({
        email: form.email,
        password: form.password,
        email_confirm: true,
        user_metadata: { full_name: form.full_name },
      })
      if (error) { setError(error.message); setSaving(false); return }
      await adminClient.from('user_profiles').insert({
        user_id: data.user.id,
        role: form.role,
        email: form.email,
        full_name: form.full_name,
      })
      // Upsert into people so they show up in deal team dropdowns
      const { data: existing } = await supabase.from('people').select('id').eq('email', form.email).single()
      if (existing) {
        await supabase.from('people').update({ name: form.full_name, role: peopleRole, active: true }).eq('id', existing.id)
      } else {
        await supabase.from('people').insert({ name: form.full_name, email: form.email, role: peopleRole, active: true })
      }
    } else {
      await supabase.from('user_profiles').update({
        role: form.role,
        full_name: form.full_name,
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.user_id)
      // Sync to people table — upsert so existing users without a people row get one
      if (user.email) {
        const { data: existing } = await supabase.from('people').select('id').eq('email', user.email).single()
        if (existing) {
          await supabase.from('people').update({ role: peopleRole, name: form.full_name }).eq('id', existing.id)
        } else {
          await supabase.from('people').insert({ name: form.full_name, email: user.email, role: peopleRole, active: true })
        }
      }
    }
    onSave()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="text-base font-semibold text-navy-900">{isNew ? 'New User' : 'Edit User'}</h3>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Input
            label="Full Name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="e.g. Marcus Lopez"
          />
          {isNew ? (
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="user@trilogydigital.com"
            />
          ) : (
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500">Email</p>
              <p className="text-sm text-navy-900 bg-gray-50 rounded-lg px-3 py-2.5">{form.email}</p>
            </div>
          )}
          <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="manager">Manager</option>
            <option value="sales">Sales</option>
            <option value="support">Support</option>
          </Select>
          {isNew && (
            <>
              <Input
                label="Temporary Password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                hint="Min. 8 characters. User should change on first login."
              />
              <Input
                label="Confirm Password"
                type="password"
                value={form.confirm_password}
                onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
              />
            </>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>{isNew ? 'Create User' : 'Save Changes'}</Button>
        </div>
      </div>
    </div>
  )
}

function ResetPasswordModal({ user, onClose }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleReset() {
    setError('')
    if (!password) { setError('Password is required.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 8) { setError('Min. 8 characters.'); return }
    if (!adminClient) { setError('VITE_SUPABASE_SERVICE_ROLE_KEY is not set in .env.local'); return }
    setSaving(true)
    const { error } = await adminClient.auth.admin.updateUserById(user.user_id, { password })
    if (error) { setError(error.message); setSaving(false); return }
    setDone(true)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="text-base font-semibold text-navy-900">Reset Password</h3>
          <p className="text-sm text-gray-500 mt-0.5">{user.full_name || user.email}</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          {done ? (
            <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">Password updated successfully.</p>
          ) : (
            <>
              <Input label="New Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <Input label="Confirm Password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            </>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{done ? 'Close' : 'Cancel'}</Button>
          {!done && <Button onClick={handleReset} loading={saving}>Reset Password</Button>}
        </div>
      </div>
    </div>
  )
}

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
