import { useState } from 'react'
import { createPortal } from 'react-dom'
import { adminClient } from '../lib/supabase'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

export default function ResetPasswordModal({ user, onClose }) {
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

  return createPortal(
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
    </div>,
    document.body
  )
}
