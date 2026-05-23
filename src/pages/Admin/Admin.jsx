// Admin — Users + Permissions.
//
// Gated by RequireAuth permission="canManageUsers" at the route. The page
// itself only offers role options the actor may actually assign (strictly
// below their own role), mirroring the server-side canManageRole rule.

import { useMemo, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import PageShell from '../../components/layout/PageShell'
import { useAuth } from '../../context/AuthContext'
import { useUsers, inviteUser, updateUser } from '../../utils/auth/usersStore'
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

// InviteModal — Phase 4 Step 3.4. Two-phase modal:
//   FORM  → collect email/role/overrides; submit calls POST /api/users/invite
//   LINK  → display inviteUrl + Copy button (no auto-clipboard); Close clears state.
//
// Security constraints (Step 3.4 audit):
//   - the raw inviteUrl is held in component state ONLY while the modal is
//     open; closing the modal clears it. Not persisted to the store, not
//     written to localStorage/sessionStorage, never console.logged.
//   - clipboard write happens only on the user's explicit click of the
//     Copy button (no navigator.clipboard.writeText on render).
function InviteModal({ actor, onClose }) {
  const roles = assignableRoles(actor)
  const [phase, setPhase] = useState('FORM')   // 'FORM' | 'LINK'
  const [form, setForm] = useState({
    email: '', displayName: '',
    role: roles[roles.length - 1] || 'crew',
    viewPrivateNotes: false, sendCrewNotes: false,
  })
  // inviteResult holds { inviteUrl, expiresAt, user } while phase==='LINK'.
  // Cleared in closeAndReset() so the URL never lingers in component state.
  const [inviteResult, setInviteResult] = useState(null)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const toast = useToast()
  const ref = useRef(null)

  function closeAndReset() {
    // Defensive: explicitly wipe sensitive fields before unmount.
    setInviteResult(null)
    setForm({ email: '', displayName: '', role: roles[roles.length - 1] || 'crew', viewPrivateNotes: false, sendCrewNotes: false })
    setCopied(false)
    onClose()
  }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') closeAndReset() }
    document.addEventListener('keydown', onKey); ref.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleInvite() {
    if (!form.email.trim() || !form.email.includes('@')) { setError('Valid email required'); return }
    setSaving(true); setError(null)
    try {
      const res = await inviteUser({
        email: form.email.trim(),
        displayName: form.displayName.trim() || null,
        role: form.role,
        viewPrivateNotes: form.viewPrivateNotes,
        sendCrewNotes: form.sendCrewNotes,
      })
      toast?.success?.('Invite created')
      setInviteResult({
        inviteUrl: res.inviteUrl,
        expiresAt: res.expiresAt,
        userEmail: res.user?.email,
        emailSent: res.emailSent === true,   // Phase 5 — provider may not be configured
      })
      setPhase('LINK')
    } catch (err) {
      setError(err.message || 'Invite failed')
      setSaving(false)
    }
  }

  async function handleCopy() {
    if (!inviteResult?.inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteResult.inviteUrl)
      setCopied(true)
      toast?.success?.('Invite link copied')
    } catch {
      // Fallback: select the text so user can Cmd/Ctrl-C manually.
      const el = document.getElementById('invite-url-display')
      if (el) { el.focus(); el.select() }
      toast?.info?.('Copy from the field manually')
    }
  }

  return createPortal(
    <div className={styles.backdrop} onClick={closeAndReset} role="dialog" aria-modal="true" aria-label="Invite user">
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.mHeader}>
          <span className={styles.mTitle}>{phase === 'FORM' ? 'Invite User' : 'Invite Link Ready'}</span>
          <button className={styles.closeBtn} onClick={closeAndReset} aria-label="Close">✕</button>
        </div>

        {phase === 'FORM' && (
          <>
            <div className={styles.mBody}>
              <p className={styles.lbl}>Email</p>
              <input ref={ref} type="email" className={styles.input} value={form.email} onChange={e => set('email', e.target.value)} placeholder="name@course.com" autoComplete="off" />
              <p className={styles.lbl}>Display name <span className={styles.optional}>(optional)</span></p>
              <input className={styles.input} value={form.displayName} onChange={e => set('displayName', e.target.value)} />
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
              <p className={styles.optional} style={{ marginTop: 12, fontSize: 12 }}>
                The user will receive a one-time link to set their own password.
              </p>
              {error && <p className={styles.error}>{error}</p>}
            </div>
            <div className={styles.mFooter}>
              <button className={styles.cancelBtn} onClick={closeAndReset} disabled={saving}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleInvite} disabled={saving}>{saving ? 'Sending…' : 'Create invite'}</button>
            </div>
          </>
        )}

        {phase === 'LINK' && inviteResult && (
          <>
            <div className={styles.mBody}>
              <p className={styles.lbl}>Invite link for <strong>{inviteResult.userEmail}</strong></p>
              {/* Phase 5 — email-status line. Tells the admin whether the
                  invitee already received the link, or whether copy-fallback
                  is the only delivery path. */}
              <p className={styles.optional} style={{ marginTop: 0, marginBottom: 6, fontSize: 12 }} role="status">
                {inviteResult.emailSent
                  ? '✓ Email sent. Share the link below as a backup if needed.'
                  : 'Email not configured — share the link below manually.'}
              </p>
              <input
                id="invite-url-display"
                className={styles.input}
                value={inviteResult.inviteUrl}
                readOnly
                onFocus={e => e.target.select()}
                aria-label="Invite link"
              />
              <p className={styles.optional} style={{ marginTop: 8, fontSize: 12 }}>
                One-time use. Expires {new Date(inviteResult.expiresAt).toLocaleString()}.
                Share securely (it grants the user account access).
              </p>
            </div>
            <div className={styles.mFooter}>
              <button className={styles.cancelBtn} onClick={closeAndReset}>Close</button>
              <button className={styles.saveBtn} onClick={handleCopy}>
                {copied ? 'Copied ✓' : 'Copy Invite Link'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default function Admin() {
  const { user: actor } = useAuth()
  const { users, loading, error } = useUsers()
  const [inviteOpen, setInviteOpen] = useState(false)
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
          <button type="button" className={styles.addBtn} onClick={() => setInviteOpen(true)}>+ Invite User</button>
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

        {inviteOpen && <InviteModal actor={actor} onClose={() => setInviteOpen(false)} />}
      </div>
    </PageShell>
  )
}
