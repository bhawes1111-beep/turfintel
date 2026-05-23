// Mail provider abstraction — Phase 5.
//
// One entry point: sendMail(env, { to, subject, text, html? }).
//
// Provider-neutral. The only currently-supported provider is Resend
// (https://resend.com), selected via env.MAIL_PROVIDER === 'resend'.
//
// Disabled / no-op mode:
//   When MAIL_PROVIDER is unset, sendMail() short-circuits and returns
//   { ok: true, status: 'disabled' } — never throws, never logs. Local
//   dev with no secrets continues to work; the caller falls back to the
//   copy-link UX without any code branch.
//
// Safety guarantees (smoke-asserted):
//   - never logs the message body (text/html)
//   - never logs the recipient address
//   - never logs the provider API key
//   - on provider error: returns { ok: false, status: 'error', error }
//     where `error` is a short, non-secret summary ("provider returned 4xx")
//     — never echoes the provider's body verbatim, which can include the
//     recipient or other inputs.
//
// Returned shape (locked):
//   { ok: true,  status: 'sent' }                    — accepted by provider
//   { ok: true,  status: 'disabled' }                — no provider configured
//   { ok: false, status: 'error', error: '...' }    — provider rejected / network failed
//
// Add a second provider later by adding one private postTo<X>() function
// and one case in the switch in sendMail(). No caller change needed.

const DEFAULT_FROM_NAME = 'TurfIntel'

/** True iff a provider is configured AND its required keys are present. */
export function mailConfigured(env) {
  if (!env) return false
  const provider = String(env.MAIL_PROVIDER || '').toLowerCase()
  if (provider === 'resend') {
    return !!(env.MAIL_API_KEY && env.MAIL_FROM)
  }
  return false
}

/**
 * sendMail — provider-neutral send. See file header for the returned shape
 * contract. Never throws.
 */
export async function sendMail(env, { to, subject, text, html } = {}) {
  if (!mailConfigured(env)) return { ok: true, status: 'disabled' }
  if (!to || !subject || (!text && !html)) {
    // Caller bug; treat as no-op so a missing body never blocks a user flow.
    return { ok: false, status: 'error', error: 'missing required fields' }
  }
  const provider = String(env.MAIL_PROVIDER || '').toLowerCase()
  const fromName = (env.MAIL_FROM_NAME || DEFAULT_FROM_NAME).trim()
  const fromAddr = env.MAIL_FROM
  const replyTo  = env.MAIL_REPLY_TO || null

  try {
    if (provider === 'resend') {
      return await postToResend(env, {
        to, fromAddr, fromName, replyTo, subject, text, html,
      })
    }
    return { ok: false, status: 'error', error: `unsupported provider "${provider}"` }
  } catch {
    // Network / fetch failure (TLS, DNS, etc.). Never leak details.
    return { ok: false, status: 'error', error: 'network error' }
  }
}

/**
 * Resend transport — single POST /emails.
 * https://resend.com/docs/api-reference/emails/send-email
 */
async function postToResend(env, { to, fromAddr, fromName, replyTo, subject, text, html }) {
  const from = fromName ? `${fromName} <${fromAddr}>` : fromAddr
  const payload = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    ...(text ? { text } : {}),
    ...(html ? { html } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
  }
  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      Authorization: `Bearer ${env.MAIL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (res.ok) return { ok: true, status: 'sent' }
  // Read+discard the body to free the stream; do NOT include it in the
  // returned error (it can contain `to` or other inputs).
  try { await res.text() } catch { /* ignore */ }
  return { ok: false, status: 'error', error: `provider returned ${res.status}` }
}

// ── Email body composers ────────────────────────────────────────────────────
//
// Plain-text only per the Phase-5 spec ("no full email template system").
// Compose-side helpers so the caller hands sendMail() a finished string and
// the provider transport stays content-agnostic. Tokens never appear in
// these helpers — only the full URL the caller constructed does.

/** ISO timestamp → "May 22, 2026, 11:59 PM UTC" (deterministic, no locale). */
function fmtExpiry(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  // YYYY-MM-DD HH:MM UTC — short, parseable, no locale variance.
  const pad = n => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
         `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

/** Build the invite-email plain-text body. */
export function inviteEmailBody({ inviteUrl, expiresAt }) {
  return [
    'You have been invited to TurfIntel.',
    '',
    'Open the link below to set your password and finish creating your account:',
    inviteUrl,
    '',
    `This link expires on ${fmtExpiry(expiresAt)} and can only be used once.`,
    '',
    'If you were not expecting this invitation, ignore this email — no account changes will occur until the link is opened.',
  ].join('\n')
}

/** Build the password-reset plain-text body. */
export function resetEmailBody({ resetUrl, expiresAt }) {
  return [
    'A password reset was requested for your TurfIntel account.',
    '',
    'Open the link below to set a new password:',
    resetUrl,
    '',
    `This link expires on ${fmtExpiry(expiresAt)} and can only be used once.`,
    '',
    'If you did not request a password reset, ignore this email — your password will remain unchanged.',
  ].join('\n')
}
