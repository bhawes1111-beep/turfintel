// Phase 35 — Operations Authoring: routing tag picker.
//
// Reusable, controlled component for adding routing/mowing tags to an
// operation. Writes the canonical values from routingTags.js into a plain
// string array (event.tags[]) — no schema change, no tag table.
//
//   <TagPicker value={tags} onChange={setTags} />
//
// Quick-select toggle chips (P1) + preset groups (P3) + a live preview that
// reuses the SAME renderer the Display Board uses (P4), so what you see here
// is exactly what the crew sees.

import { useMemo } from 'react'
import {
  ROUTING_TAG_OPTIONS,
  ROUTING_PRESETS,
  routingChipsFromTags,
} from '../../utils/routing/routingTags'
import styles from './TagPicker.module.css'

export default function TagPicker({ value = [], onChange, label = 'Routing & Mowing' }) {
  const selected = useMemo(() => new Set(value), [value])

  function toggle(tagValue) {
    const next = selected.has(tagValue)
      ? value.filter(t => t !== tagValue)
      : [...value, tagValue]
    onChange(next)
  }

  // Presets are additive: applying one merges its tags into the current
  // selection (deduped). It never clears existing tags.
  function applyPreset(preset) {
    const merged = [...new Set([...value, ...preset.tags])]
    onChange(merged)
  }

  function clearAll() {
    if (value.length > 0) onChange([])
  }

  // Live preview — exact Display Board rendering.
  const { chips: previewChips, extra } = routingChipsFromTags(value)

  return (
    <div className={styles.wrap}>
      <div className={styles.headRow}>
        <span className={styles.label}>{label}</span>
        {value.length > 0 && (
          <button type="button" className={styles.clearBtn} onClick={clearAll}>
            Clear
          </button>
        )}
      </div>

      {/* Presets (P3) */}
      <div className={styles.presets}>
        {ROUTING_PRESETS.map(p => (
          <button
            key={p.key}
            type="button"
            className={styles.presetBtn}
            onClick={() => applyPreset(p)}
            title={`Apply: ${p.tags.join(', ')}`}
          >
            + {p.label}
          </button>
        ))}
      </div>

      {/* Quick-select toggle chips (P1) */}
      <div className={styles.options}>
        {ROUTING_TAG_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            className={styles.optionChip}
            data-tone={opt.tone}
            data-active={selected.has(opt.value) ? 'true' : 'false'}
            onClick={() => toggle(opt.value)}
            aria-pressed={selected.has(opt.value)}
          >
            <span className={styles.optionIcon} aria-hidden="true">{opt.icon}</span>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Preview (P4) — same renderer as the Display Board */}
      <div className={styles.previewRow}>
        <span className={styles.previewLabel}>Board preview</span>
        {previewChips.length === 0 ? (
          <span className={styles.previewEmpty}>No tags — card shows no routing chips</span>
        ) : (
          <span className={styles.previewChips}>
            {previewChips.map(c => (
              <span key={c.key} className={styles.previewChip} data-tone={c.tone}>
                <span aria-hidden="true">{c.icon}</span> {c.label}
              </span>
            ))}
            {extra > 0 && <span className={styles.previewMore}>+{extra}</span>}
          </span>
        )}
      </div>
    </div>
  )
}
