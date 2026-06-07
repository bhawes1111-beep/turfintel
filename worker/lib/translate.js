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
        try {
          const response = await env.AI.run(model, {
            messages: [
              { role: 'system', content: TURF_SYSTEM_PROMPT },
              { role: 'user',   content: trimmed },
            ],
            // Translation is deterministic-ish; low temperature avoids
            // creative rewording.
            temperature: 0.2,
            max_tokens:  400,
          })
          // Workers AI returns { response: string } for the llama family.
          const raw = (response?.response ?? response?.choices?.[0]?.message?.content ?? '').trim()
          if (raw.length === 0) return null
          // Strip stray surrounding quotes the model sometimes adds.
          return raw.replace(/^["'\s]+|["'\s]+$/g, '').trim() || null
        } catch (err) {
          console.warn(`[translate] cf-ai failure on "${trimmed.slice(0, 40)}…": ${err?.message ?? err}`)
          return null
        }
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
