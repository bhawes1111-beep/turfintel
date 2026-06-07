// Phase 9C.5c3 — Translation provider abstraction.
//
// Single entry point for server-side translation. The active provider
// is selected by env.TRANSLATE_PROVIDER so the integration can be
// swapped (or fully disabled) without touching callsites.
//
// Providers:
//   'cf-ai' — Cloudflare Workers AI, model env.TRANSLATE_MODEL
//             (default: @cf/meta/llama-3-8b-instruct). The active model
//             gets a domain-aware prompt that preserves common turf /
//             golf-course terminology when appropriate.
//   'none'  — no-op kill switch. Returns null for every translate call;
//             callers leave *_es NULL and the kiosk renders English.
//             Useful for cost emergencies / provider outages /
//             feature flag rollback.
//
// Failure semantics: translation calls NEVER throw. Provider errors
// (rate limits, 500s, network) return null. The caller is responsible
// for skipping rows whose translation came back null — those rows stay
// at *_es IS NULL and the kiosk falls back to English-only display.
// Manual *_es values authored via Phase 9C.5b2 are never touched here;
// the caller's UPDATE clause enforces that contract.

// Domain prompt — tells the LLM to preserve groundskeeping vocabulary
// the way crew leads actually use it (greens, fairway, REI, etc.).
// Spanish output is requested without explanation or markdown so the
// raw response can be written straight into the *_es column.
const TURF_SYSTEM_PROMPT =
  'You translate short English golf course operations notes into Spanish ' +
  'for a crew display board. Preserve turf / golf terms when the Spanish-' +
  'speaking groundskeeping crew would expect them in English: greens, ' +
  'fairway, tee, bunker, rough, REI, cart path, irrigation, hand water, ' +
  'mow, roll, blow. Return ONLY the translated Spanish text. Do not add ' +
  'explanations, prefixes, quotes, or markdown.'

/**
 * extractAiText — pulls the translated string out of whatever shape
 * Workers AI returns. The llama family normally responds with
 * `{ response: '...' }`, but the runtime has shipped variants where
 * the payload lives under `result`, `text`, `output`, or the
 * OpenAI-style `choices[0].message.content`. Some routes (especially
 * when streaming is implicit) return the string directly.
 *
 * Phase 9C.5c3c — Phase 9C.5c3 originally checked only `response` and
 * `choices[0].message.content`, which silently dropped translations
 * whenever the runtime returned anything else. The kiosk fell back to
 * English-only display, and `assignments.translated` came back 0 even
 * when the sweep found rows.
 *
 * Priority order walks the most-common shapes first. Each branch
 * recurses through `extractAiText` so nested wrappers (e.g.
 * `{ result: { response: '...' } }`) resolve uniformly. Returns the
 * trimmed string (with stray quotes/markdown stripped) or null when
 * no usable text is found. NEVER throws.
 */
export function extractAiText(result) {
  if (result == null) return null
  // Primitive string response (some routes hand it back unwrapped).
  if (typeof result === 'string') {
    const trimmed = result.trim()
    if (trimmed.length === 0) return null
    return stripStrayMarkdown(trimmed) || null
  }
  if (typeof result !== 'object') return null
  // Walk the known field names in priority order. Each recurses so
  // wrapped shapes like { result: { response: '...' } } resolve too.
  // `choices` is OpenAI-style (and some Workers AI runtimes mirror it).
  const candidates = [
    result.response,
    result.text,
    result.result,
    result.output,
    result.output_text,
    result.choices?.[0]?.message?.content,
    result.choices?.[0]?.text,
    result.message?.content,
    result.data,
  ]
  for (const c of candidates) {
    if (c == null) continue
    const out = extractAiText(c)
    if (out) return out
  }
  return null
}

// Strip surrounding quotes, leading/trailing whitespace, and markdown
// fences the model sometimes wraps the answer in. Returns the cleaned
// string or '' when nothing usable remains; callers convert '' to null.
function stripStrayMarkdown(s) {
  if (!s) return ''
  let out = s.trim()
  // Strip triple-backtick code fences with optional language tag.
  out = out.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '')
  // Strip surrounding single/double/backtick quotes and whitespace.
  out = out.replace(/^["'`\s]+|["'`\s]+$/g, '')
  return out.trim()
}

// Phase 9C.5c3d — Run a single env.AI.run attempt with a specific
// payload, parse the response via extractAiText, record the outcome
// into the per-call `attempts` buffer for ?debug=1 visibility, and
// return the translated string OR null. Never throws — any provider
// error is caught and logged, and the attempt is recorded as ok:false
// with the safe error message string.
async function runAiCall(env, model, mode, payload, sourcePrefix, attempts) {
  const entry = { mode, ok: false, shape: null, error: null }
  try {
    const response = await env.AI.run(model, payload)
    entry.shape = describeAiShape(response)
    const out = extractAiText(response)
    if (out) {
      entry.ok = true
      attempts.push(entry)
      return out
    }
    // Parsed to no usable text — keep attempt as ok:false with the
    // shape recorded so the diagnostic endpoint and the failure log
    // can both surface what came back.
    console.warn(`[translate] cf-ai ${mode} returned no usable text — shape=${entry.shape}, model=${model}`)
    attempts.push(entry)
    return null
  } catch (err) {
    // Cap the error message at 200 chars so a verbose stack doesn't
    // bloat the log. The source-text prefix (40 chars) is included
    // ONLY in the warning, not in the attempt entry, to keep ?debug=1
    // responses content-free.
    const errMsg = String(err?.message ?? err).slice(0, 200)
    entry.error = errMsg
    attempts.push(entry)
    console.warn(`[translate] cf-ai ${mode} threw on "${(sourcePrefix ?? '').slice(0, 40)}…": ${errMsg}`)
    return null
  }
}

/**
 * getLastTranslateAttempts — privacy-safe diagnostic accessor for the
 * most recent translate() call within the same request context.
 * Returns an array of { mode, ok, shape, error } entries — one per
 * payload variant attempted (e.g. messages then prompt). Each entry
 * holds ONLY the response shape (top-level keys + value types) and
 * any caught error message; NEVER the source text, the translated
 * text, or any database field.
 *
 * Used by POST /api/admin/translate/run?debug=1 to surface why a
 * translation came back null when the cron summary says
 * `assignments.scanned >= 1, assignments.translated == 0`.
 */
export function getLastTranslateAttempts(env) {
  return Array.isArray(env?.__lastTranslateAttempts)
    ? env.__lastTranslateAttempts
    : []
}

// Privacy-safe diagnostic — describe a Workers AI response's TOP-LEVEL
// keys and value types so a cron log can show why parsing failed,
// without leaking translated content (which is crew-visible but capped
// anyway) or any private field. Returns a short string like
// `{response:string(72),choices:array(1)}` or `string(243)` etc.
function describeAiShape(result) {
  if (result == null) return 'null'
  if (typeof result === 'string') return `string(${result.length})`
  if (typeof result !== 'object') return typeof result
  if (Array.isArray(result)) return `array(${result.length})`
  const parts = []
  for (const k of Object.keys(result).slice(0, 8)) {
    const v = result[k]
    let t
    if (v == null) t = 'null'
    else if (typeof v === 'string') t = `string(${v.length})`
    else if (Array.isArray(v)) t = `array(${v.length})`
    else t = typeof v
    parts.push(`${k}:${t}`)
  }
  return `{${parts.join(',')}}`
}

/**
 * getTranslateProvider — resolves the active provider from env.
 * Returns an object with `{ name, translate(text, opts) }` shape.
 *   provider.translate(text, opts) → Promise<string | null>
 *     - non-null string  → translated text, ready to write into *_es
 *     - null             → translation skipped (provider off, AI binding
 *                          missing, or failure during the call)
 */
export function getTranslateProvider(env) {
  const name = (env?.TRANSLATE_PROVIDER ?? 'none').toLowerCase()

  // Kill switch — set TRANSLATE_PROVIDER='none' to disable auto-translate
  // without any code change. The cron sweep still runs but ends up a no-op.
  if (name === 'none') {
    return {
      name: 'none',
      async translate() { return null },
    }
  }

  if (name === 'cf-ai') {
    // Graceful no-op when the AI binding isn't configured on the account
    // — keeps local dev and CI working without a paid Workers AI plan.
    if (!env?.AI || typeof env.AI.run !== 'function') {
      console.warn('[translate] cf-ai provider selected but env.AI binding is missing — falling back to no-op')
      return {
        name: 'cf-ai-disabled',
        async translate() { return null },
      }
    }
    const model = env.TRANSLATE_MODEL || '@cf/meta/llama-3-8b-instruct'
    return {
      name: 'cf-ai',
      async translate(text, opts = {}) {
        if (!text || typeof text !== 'string') return null
        const trimmed = text.trim()
        if (trimmed.length === 0) return null
        const from = opts.from ?? 'en'
        const to   = opts.to   ?? 'es'
        // Only EN→ES is wired today. Other pairs return null until a
        // future phase adds prompt variants.
        if (from !== 'en' || to !== 'es') return null

        // Phase 9C.5c3d — Two-payload retry. Some Workers AI llama
        // runtimes accept the OpenAI-style `messages` array; others
        // (especially the older `@cf/meta/llama-3-8b-instruct` build)
        // expect a single composed `prompt` string and return errors
        // for the messages variant. Try messages first, then prompt
        // on failure. Each attempt's shape / error is recorded so the
        // ?debug=1 admin endpoint can surface what the runtime
        // actually returned without leaking source or translated text.
        //
        // The attempts buffer is hung off env.__lastTranslateAttempts
        // (per-request scope; cleared at the start of every call) so
        // the admin route handler can pick it up without changing the
        // existing translateText / translateBatch return contract.
        const attempts = []
        if (env) env.__lastTranslateAttempts = attempts

        // Attempt 1 — messages payload (newer OpenAI-style runtime).
        const messagesResult = await runAiCall(env, model, 'messages', {
          messages: [
            { role: 'system', content: TURF_SYSTEM_PROMPT },
            { role: 'user',   content: trimmed },
          ],
          temperature: 0.2,
          max_tokens:  400,
        }, trimmed, attempts)
        if (messagesResult) return messagesResult

        // Attempt 2 — prompt payload (older llama-instruct runtime).
        // Compose system + user into one string with a clear separator.
        const composed = `${TURF_SYSTEM_PROMPT}\n\nEnglish text:\n${trimmed}\n\nSpanish translation:`
        const promptResult = await runAiCall(env, model, 'prompt', {
          prompt:      composed,
          temperature: 0.2,
          max_tokens:  400,
        }, trimmed, attempts)
        if (promptResult) return promptResult

        // Both attempts produced no usable text. The diagnostic log
        // covers both attempts so future runtime changes are visible
        // from a single cron log line.
        console.warn(
          `[translate] cf-ai exhausted both payloads — ` +
          `attempts=${JSON.stringify(attempts.map(a => ({ mode: a.mode, ok: a.ok, shape: a.shape, error: a.error })))}, ` +
          `model=${model}`,
        )
        return null
      },
    }
  }

  // Unknown provider name — treat as kill switch.
  console.warn(`[translate] unknown TRANSLATE_PROVIDER='${name}', falling back to no-op`)
  return {
    name: 'unknown-disabled',
    async translate() { return null },
  }
}

/**
 * translateText — convenience for translating a single string. Returns
 * the translated string or null. Never throws.
 */
export async function translateText(env, text, opts = {}) {
  const provider = getTranslateProvider(env)
  return provider.translate(text, opts)
}

/**
 * translateBatch — translate an array of { id, text } items sequentially.
 * Workers AI is per-account-rate-limited, so a sequential loop avoids
 * burst throttles for the cron sweep. Returns an array of { id, translation }
 * where translation is null for any item that failed or returned blank.
 */
export async function translateBatch(env, items, opts = {}) {
  const provider = getTranslateProvider(env)
  const out = []
  for (const item of items) {
    const text = typeof item === 'string' ? item : item?.text
    const id   = typeof item === 'string' ? null   : item?.id
    const translation = await provider.translate(text, opts)
    out.push({ id, translation })
  }
  return out
}
