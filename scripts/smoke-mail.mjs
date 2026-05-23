// Mail abstraction smoke — Phase 5.
//
//   node scripts/smoke-mail.mjs
//
// Provider-neutral coverage for worker/lib/mail.js. Pure logic; no HTTP
// (we fake `fetch` for provider-call assertions).
//
// Locks:
//   - disabled mode: no MAIL_PROVIDER → { ok: true, status: 'disabled' }
//   - required-field guard: missing to/subject/body → { ok: false, status: 'error' }
//   - Resend provider: correct URL, JSON body shape (from/to/subject/text),
//     Bearer authorization header
//   - never logs body, recipient, or API key
//   - fail-open on provider 4xx/5xx: { ok: false, status: 'error', error: 'provider returned ...' } (no body echo)
//   - body composers (invite + reset) include the URL once + clear expiry
//     timestamp + safety note
//   - body composers never include the raw token (URL only)

import { readFileSync } from 'fs'
import {
  sendMail, mailConfigured, inviteEmailBody, resetEmailBody,
} from '../worker/lib/mail.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. mailConfigured ──────────────────────────────────────────────────────
{
  assert(mailConfigured({}) === false, 'mailConfigured: empty env → false')
  assert(mailConfigured(null) === false, 'mailConfigured: null env → false')
  assert(mailConfigured({ MAIL_PROVIDER: 'resend' }) === false, 'mailConfigured: provider w/o key → false')
  assert(mailConfigured({ MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'k' }) === false, 'mailConfigured: missing MAIL_FROM → false')
  assert(mailConfigured({ MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'k', MAIL_FROM: 'a@b' }) === true, 'mailConfigured: provider+key+from → true')
  assert(mailConfigured({ MAIL_PROVIDER: 'RESEND', MAIL_API_KEY: 'k', MAIL_FROM: 'a@b' }) === true, 'mailConfigured: case-insensitive provider')
  assert(mailConfigured({ MAIL_PROVIDER: 'unsupported', MAIL_API_KEY: 'k', MAIL_FROM: 'a@b' }) === false, 'mailConfigured: unsupported provider → false')
}

// ── 2. sendMail disabled mode ──────────────────────────────────────────────
{
  const r = await sendMail({}, { to: 'a@b.com', subject: 's', text: 't' })
  assert(r.ok === true && r.status === 'disabled', 'sendMail: no provider → { ok:true, status:disabled }', r)
}

// ── 3. required-field guard (even when configured) ─────────────────────────
{
  const env = { MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'k', MAIL_FROM: 'a@b' }
  assert((await sendMail(env, {})).status === 'error', 'sendMail: missing fields → error')
  assert((await sendMail(env, { to: 'a@b', subject: 's' })).status === 'error', 'sendMail: missing body → error')
}

// ── 4. Resend transport: URL + headers + payload shape ─────────────────────
{
  const captured = { calls: 0, url: null, init: null }
  const origFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    captured.calls++; captured.url = url; captured.init = init
    return { ok: true, status: 200, text: async () => '' }
  }
  try {
    const env = { MAIL_PROVIDER: 'resend', MAIL_API_KEY: 're_test_key',
      MAIL_FROM: 'sender@example.com', MAIL_FROM_NAME: 'TurfIntel' }
    const res = await sendMail(env, {
      to: 'invitee@example.com', subject: 'Test', text: 'Body line.',
    })
    assert(res.ok === true && res.status === 'sent', 'Resend success → { ok:true, status:sent }', res)
    assert(captured.calls === 1, 'Resend: fetch called exactly once', captured.calls)
    assert(captured.url === 'https://api.resend.com/emails', 'Resend: correct URL', captured.url)
    assert(captured.init?.method === 'POST', 'Resend: POST method')
    assert(captured.init?.headers?.Authorization === 'Bearer re_test_key', 'Resend: Bearer auth header')
    assert(captured.init?.headers?.['Content-Type'] === 'application/json', 'Resend: JSON content-type')
    const body = JSON.parse(captured.init.body)
    assert(body.from === 'TurfIntel <sender@example.com>', 'Resend: from line uses MAIL_FROM_NAME')
    assert(Array.isArray(body.to) && body.to[0] === 'invitee@example.com', 'Resend: to is array of recipient')
    assert(body.subject === 'Test', 'Resend: subject passed through')
    assert(body.text === 'Body line.', 'Resend: text body passed through')
    assert(!('html' in body), 'Resend: no html when not supplied (plain-text-only Phase 5)')
    assert(!('reply_to' in body), 'Resend: no reply_to when not configured')
  } finally {
    globalThis.fetch = origFetch
  }
}

// ── 5. Resend transport: MAIL_FROM without MAIL_FROM_NAME → defaults ───────
{
  const captured = { init: null }
  const origFetch = globalThis.fetch
  globalThis.fetch = async (_, init) => { captured.init = init; return { ok: true, status: 200, text: async () => '' } }
  try {
    const env = { MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'k', MAIL_FROM: 's@x.com' }
    await sendMail(env, { to: 'r@x.com', subject: 's', text: 't' })
    const body = JSON.parse(captured.init.body)
    assert(body.from === 'TurfIntel <s@x.com>', 'Resend: default MAIL_FROM_NAME = TurfIntel', body.from)
  } finally { globalThis.fetch = origFetch }
}

// ── 6. Resend MAIL_REPLY_TO when configured ────────────────────────────────
{
  const captured = { init: null }
  const origFetch = globalThis.fetch
  globalThis.fetch = async (_, init) => { captured.init = init; return { ok: true, status: 200, text: async () => '' } }
  try {
    const env = { MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'k', MAIL_FROM: 's@x.com', MAIL_REPLY_TO: 'reply@x.com' }
    await sendMail(env, { to: 'r@x.com', subject: 's', text: 't' })
    const body = JSON.parse(captured.init.body)
    assert(body.reply_to === 'reply@x.com', 'Resend: reply_to header passed through when configured')
  } finally { globalThis.fetch = origFetch }
}

// ── 7. Fail-open on provider 4xx/5xx ───────────────────────────────────────
{
  const origFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, status: 422, text: async () => '{"error":"invalid recipient"}' })
  try {
    const env = { MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'k', MAIL_FROM: 's@x.com' }
    const res = await sendMail(env, { to: 'r@x.com', subject: 's', text: 't' })
    assert(res.ok === false && res.status === 'error', 'provider 4xx → { ok:false, status:error }', res)
    assert(res.error === 'provider returned 422', 'error string includes status, never body', res.error)
    assert(!/invalid recipient/.test(res.error), 'error never echoes provider response body')
  } finally { globalThis.fetch = origFetch }
}

// ── 8. Fail-open on network error (fetch throws) ───────────────────────────
{
  const origFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('TLS handshake failed') }
  try {
    const env = { MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'k', MAIL_FROM: 's@x.com' }
    const res = await sendMail(env, { to: 'r@x.com', subject: 's', text: 't' })
    assert(res.ok === false && res.status === 'error' && res.error === 'network error',
      'network error → generic "network error"', res)
    assert(!/TLS|handshake/i.test(res.error), 'error never echoes the underlying exception message')
  } finally { globalThis.fetch = origFetch }
}

// ── 9. Unsupported provider value ──────────────────────────────────────────
{
  const env = { MAIL_PROVIDER: 'notarealprovider', MAIL_API_KEY: 'k', MAIL_FROM: 's@x.com' }
  // mailConfigured returns false for unknown providers, so sendMail returns
  // disabled — never errors.
  const res = await sendMail(env, { to: 'r@x.com', subject: 's', text: 't' })
  assert(res.status === 'disabled', 'unknown provider → disabled (not error)', res)
}

// ── 10. Source-level: no console.log of bodies/recipients/keys ─────────────
{
  const src = readFileSync('worker/lib/mail.js', 'utf8')
  // Strip comments before scanning so the inline guidance ("never logs the
  // recipient…") doesn't trip the check.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  // No console output at all in the module — keeps secrets/recipients out
  // of logs by construction.
  assert(!/\bconsole\.(log|info|warn|error)\(/.test(code),
    'mail.js: no console output anywhere (no token/body/recipient leak)')
  // No direct logging of well-known field names that could appear in calls.
  for (const needle of ['MAIL_API_KEY', 'Authorization', 'to:', 'reply_to:']) {
    // The literal token MUST appear (it's used in the code), but never inside
    // a console call. The previous assertion is enough; this one re-pins it
    // by checking for "console" + needle within 200 chars.
    assert(!new RegExp(`console\\.(log|info|warn|error)\\([^)]{0,200}${needle.replace(/[$.*+?^()[\]{}|\\]/g, '\\$&')}`).test(code),
      `mail.js: no console output near "${needle}"`)
  }
}

// ── 11. Body composers: invite ─────────────────────────────────────────────
{
  const url = 'https://turfintel.example/accept-invite?token=ABC123'
  const body = inviteEmailBody({ inviteUrl: url, expiresAt: '2026-05-23T18:07:20.803Z' })
  assert(body.includes(url), 'invite body: includes the URL')
  assert((body.match(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length === 1,
    'invite body: URL appears exactly once')
  assert(body.includes('TurfIntel'), 'invite body: mentions TurfIntel')
  assert(/expires on \d{4}-\d{2}-\d{2}/.test(body), 'invite body: shows expiry date')
  assert(/UTC/.test(body), 'invite body: expiry is UTC (deterministic)')
  assert(/once/.test(body), 'invite body: explicit "once"')
  assert(/ignore/i.test(body), 'invite body: includes "ignore if not expected" safety note')
  // Defense-in-depth: body must not include any token-like sequence besides
  // the URL itself.
  assert(!body.split(url).some(part => /[a-f0-9]{32,}/i.test(part)),
    'invite body: no raw token outside the URL')
}

// ── 12. Body composers: reset ──────────────────────────────────────────────
{
  const url = 'https://turfintel.example/reset-password?token=XYZ789'
  const body = resetEmailBody({ resetUrl: url, expiresAt: '2026-05-23T18:07:20.803Z' })
  assert(body.includes(url), 'reset body: includes the URL')
  assert((body.match(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length === 1,
    'reset body: URL appears exactly once')
  assert(body.includes('TurfIntel'), 'reset body: mentions TurfIntel')
  assert(/expires on \d{4}-\d{2}-\d{2}/.test(body), 'reset body: shows expiry date')
  assert(/once/.test(body), 'reset body: explicit "once"')
  assert(/did not request/i.test(body), 'reset body: includes "ignore if you did not request" safety note')
  assert(!body.split(url).some(part => /[a-f0-9]{32,}/i.test(part)),
    'reset body: no raw token outside the URL')
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
