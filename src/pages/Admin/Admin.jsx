// Admin — Users + Permissions.
//
// Gated by RequireAuth permission="canManageUsers" at the route. The page
// itself only offers role options the actor may actually assign (strictly
// below their own role), mirroring the server-side canManageRole rule.

import { useMemo, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import PageShell from '../../components/layout/PageShell'
import { useAuth } from '../../context/AuthContext'
import { useUsers, createUser, updateUser } from '../../utils/auth/usersStore'
import { ROLES, ROLE_LABELS, canManageRole } from '../../utils/auth/permissions'
import { useToast } from '../../utils/feedback/toastContext'
import styles from './Admin.module.css'

const fmtDate = iso => {
  if (!iso) return 'never'
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// Roles the actor may assign (strictly below their own authority).
function assignableRoles(actor) {
  return ROLES.filter(r => canManageRole(actor, r))
}

function CreateModal({ actor, onClose }) {
  const roles = assignableRoles(actor)
  const [form, setForm] = useState({
    email: '', displayName: '', password: '',
    role: roles[roles.length - 1] || 'crew',
    viewPrivateNotes: false, sendCrewNotes: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const toast = useToast()
  const ref = useRef(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey); ref.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    if (!form.email.trim() || !form.email.includes('@')) { setError('Valid email required'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setSaving(true); setError(null)
    try {
      await createUser({
        email: form.email.trim(), displayName: form.displayName.trim() || null,
        password: form.password, role: form.role,
        viewPrivateNotes: form.viewPrivateNotes, sendCrewNotes: form.sendCrewNotes,
      })
      toast?.success?.('User created')
      onClose()
    } catch (err) { setError(err.message || 'Create failed'); setSaving(false) }
  }

  return createPortal(
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label="Create user">
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.mHeader}><span className={styles.mTitle}>Create User</span><button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button></div>
        <div className={styles.mBody}>
          <p className={styles.lbl}>Email</p>
          <input ref={ref} type="email" className={styles.input} value={form.email} onChange={e => set('email', e.target.value)} placeholder="name@course.com" autoComplete="off" />
          <p className={styles.lbl}>Display name <span className={styles.optional}>(optional)</span></p>
          <input className={styles.input} value={form.displayName} onChange={e => set('displayName', e.target.value)} />
          <p className={styles.lbl}>Temporary password</p>
          <input type="password" className={styles.input} value={form.password} onChange={e => set('password', e.target.value)} placeholder="min 8 characters" autoComplete="new-password" />
          <p className={styles.lbl}>Role</p>
          <select className={styles.input} value={form.role} onChange={e => set('role', e.target.value)}>
            {roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          <label className={styles.checkRow}>
            <input type="checkbox" checked={form.viewPrivateNotes} onChange={e => set('viewPrivateNotes', e.target.checked)} />
            Allow viewing private superintendent notes
          </label>
          <label className={styles.checkRow}>
            <input type="checkbox" checked={form.sendCrewNotes} onChange={e => set('sendCrewNotes', e.target.checked)} />
            Allow sending crew notes
          </label>
          {error && <p className={styles.error}>{error}</p>}
        </div>
        <div className={styles.mFooter}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={saving}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Create'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function Admin() {
  const { user: actor } = useAuth()
  const { users, loading, error } = useUsers()
  const [createOpen, setCreateOpen] = useState(false)
  const toast = useToast()

  const roleOptions = useMemo(() => assignableRoles(actor), [actor])

  function changeRole(u, role) {
    if (role === u.role) return
    updateUser(u.id, { role }).then(() => toast?.success?.('Role updated')).catch(e => toast?.error?.(e.message))
  }
  function toggleStatus(u) {
    const status = u.status === 'active' ? 'disabled' : 'active'
    updateUser(u.id, { status }).then(() => toast?.success?.(`User ${status}`)).catch(e => toast?.error?.(e.message))
  }

  // Can the actor manage THIS user's current role? (gates the row controls)
  const canManage = (u) => actor && u.id !== actor.id && canManageRole(actor, u.role)

  return (
    <PageShell title="Admin" description="Users & permissions">
      <div className={styles.wrap}>
        <div className={styles.headRow}>
          <span className={styles.headTitle}>Users</span>
          <button type="button" className={styles.addBtn} onClick={() => setCreateOpen(true)}>+ Create User</button>
        </div>

        {actor && (
          <p className={styles.meCard}>
            Signed in as <strong>{actor.displayName || actor.email}</strong> · {ROLE_LABELS[actor.role] || actor.role}
            {' · '}session active
          </p>
        )}

        {error && <p className={styles.error}>{error}</p>}

        {loading && users.length === 0 ? (
          <p className={styles.empty}>Loading users…</p>
        ) : users.length === 0 ? (
          <p className={styles.empty}>No users yet.</p>
        ) : (
          <ul className={styles.list}>
            {users.map(u => (
              <li key={u.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowTop}>
                    <span className={styles.rowName}>{u.displayName || u.email}</span>
                    <span className={styles.roleBadge} data-role={u.role}>{ROLE_LABELS[u.role] || u.role}</span>
                    <span className={styles.statusBadge} data-status={u.status}>{u.status}</span>
                    {u.id === actor?.id && <span className={styles.rowMeta}>(you)</span>}
                  </span>
                  <span className={styles.rowEmail}>{u.email}</span>
                  <span className={styles.rowMeta}>Last login: {fmtDate(u.lastLoginAt)}</span>
                </div>
                <div className={styles.rowActions}>
                  <select
                    className={styles.roleSelect}
                    value={u.role}
                    disabled={!canManage(u)}
                    onChange={e => changeRole(u, e.target.value)}
                    aria-label="Change role"
                  >
                    {/* Always show the current role; offer assignable ones. */}
                    {[...new Set([u.role, ...roleOptions])].map(r => (
                      <option key={r} value={r} disabled={r !== u.role && !roleOptions.includes(r)}>
                        {ROLE_LABELS[r] || r}
                      </option>
                    ))}
                  </select>
                  <button type="button" className={styles.miniBtn} disabled={!canManage(u)} onClick={() => toggleStatus(u)}>
                    {u.status === 'active' ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {createOpen && <CreateModal actor={actor} onClose={() => setCreateOpen(false)} />}
      </div>
    </PageShell>
  )
}
