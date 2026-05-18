import { useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import Button from '../components/ui/Button'
import Input, { Select } from '../components/ui/Input'

export default function UserModal({ user, onClose, onSave }) {
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
    }
    setSaving(true)
    // Map user_profiles role → people table role
    const peopleRole = form.role === 'manager' ? 'management' : form.role

    if (isNew) {
      // Use edge function — admin API cannot be called from the browser
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            email: form.email,
            password: form.password,
            full_name: form.full_name,
            role: form.role,
          }),
        }
      )
      const result = await res.json()
      if (!res.ok || result.error) { setError(result.error || 'Failed to create user'); setSaving(false); return }
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

  return createPortal(
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
    </div>,
    document.body
  )
}
