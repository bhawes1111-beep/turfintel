// Phase 9C.11 — Task Library modal.
//
// Manages the reusable task_templates that back the Daily Assignment
// Board dropdown. Before 9C.11 this modal authored per-day calendar
// events (every "Mow Greens" on a new date was a fresh row) AND the
// Crosswinds DAB branch read its dropdown from a hardcoded
// CROSSWINDS_TASK_LIST JS constant. Both are now retired in favor of
// task_templates — supervisors rename / archive / add templates here,
// and the DAB dropdown reads active rows from the same table.
//
// Selecting a template in the DAB still creates a calendar_event for
// selectedDate via the existing pickOrCreateEventForTask path (now keyed
// off task-template:<templateId>:<date> for server-side dedupe), so the
// downstream crew_assignment / equipment_reservation flows are
// unchanged.
//
// Phase 9C.14 — Search + category filter + richer row metadata so the
// supervisor can manage a growing list without flipping every row open
// to edit it.

import { useEffect, useMemo, useState } from 'react'
import {
  useTaskTemplatesData,
  refreshTaskTemplatesData,
  createTaskTemplate,
  patchTaskTemplate,
  archiveTaskTemplate,
  unarchiveTaskTemplate,
} from '../../../utils/tasks/taskTemplateStore'
import { useToast } from '../../../utils/feedback/toastContext'
// Phase 9C.8 — Auto-translate after task add/edit. The sweep is
// debounced + race-safe; safe to call on every save even when no
// translatable content changed. Gated on canSystemSettings so non-admin
// authors don't fire a 403'd request.
import { scheduleTranslationSweep } from '../../../utils/translate/translateClient'
import { useAuth } from '../../../context/AuthContext'
import styles from './DailyAssignmentBoard.module.css'

const CATEGORY_OPTS = [
  { value: '',            label: '— Category —' },
  { value: 'crew',        label: 'Crew' },
  { value: 'spray',       label: 'Spray' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'agronomy',    label: 'Agronomy' },
  { value: 'irrigation',  label: 'Irrigation' },
]

// Phase 9C.14 — Filter dropdown. Mirrors the DAB's TASK_CATEGORY_LABELS
// vocabulary (Phase 9C.13) so this modal and the assignment dropdown
// speak the same category language. "all" is the default; "other" is
// the catch-all for blank / null / unknown categories; "archived" only
// appears when showArchived is on (it's a status filter, not a true
// category, but it's the same picker UI).
const CATEGORY_FILTER_OPTS = [
  { value: 'all',         label: 'All categories' },
  { value: 'crew',        label: 'Crew' },
  { value: 'irrigation',  label: 'Irrigation' },
  { value: 'spray',       label: 'Spray' },
  { value: 'agronomy',    label: 'Agronomy' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'other',       label: 'Other' },
]
const CATEGORY_LABELS = {
  crew:        'Crew',
  irrigation:  'Irrigation',
  spray:       'Spray',
  agronomy:    'Agronomy',
  maintenance: 'Maintenance',
}

function blankDraft() {
  return {
    id:                null,
    name:              '',
    category:          '',
    defaultStartTime:  '',
    defaultLocation:   '',
    defaultNotes:      '',
    sortOrder:         0,
  }
}

function normalizeCategory(category) {
  const raw = (category ?? '').trim().toLowerCase()
  return CATEGORY_LABELS[raw] ? raw : 'other'
}

function categoryLabel(category) {
  const key = normalizeCategory(category)
  return CATEGORY_LABELS[key] ?? 'Other'
}

function templateMatchesSearch(t, query) {
  if (!query) return true
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [
    t.name,
    categoryLabel(t.category),
    t.defaultLocation,
    t.defaultNotes,
  ]
    .filter(Boolean)
    .join('  ')
    .toLowerCase()
  return haystack.includes(q)
}

export default function TasksManagerModal({ onClose }) {
  const toast        = useToast()
  const { can }      = useAuth()
  const canTranslate = can('canSystemSettings')

  const { templates, includeArchived } = useTaskTemplatesData()

  const [draft, setDraft]     = useState(() => blankDraft())
  const [editing, setEditing] = useState(false)
  const [busy, setBusy]       = useState(false)
  const [showArchived, setShowArchived] = useState(includeArchived)

  // Phase 9C.14 — Search + category filter local state. Reset on close
  // is intentional: each modal session is a focused management
  // activity, not a persistent view.
  const [searchText, setSearchText]       = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Refresh server-side when toggling archive visibility so the list
  // reflects ?status=all instead of just status=active.
  useEffect(() => {
    if (showArchived !== includeArchived) {
      refreshTaskTemplatesData({ includeArchived: showArchived })
    }
  }, [showArchived, includeArchived])

  function setField(k, v) { setDraft(prev => ({ ...prev, [k]: v })) }

  function startNew() {
    setDraft(blankDraft())
    setEditing(true)
  }

  function startEdit(t) {
    setDraft({
      id:                t.id,
      name:              t.name ?? '',
      category:          t.category ?? '',
      defaultStartTime:  t.defaultStartTime ?? '',
      defaultLocation:   t.defaultLocation ?? '',
      defaultNotes:      t.defaultNotes ?? '',
      sortOrder:         t.sortOrder ?? 0,
    })
    setEditing(true)
  }

  function cancelEdit() {
    setDraft(blankDraft())
    setEditing(false)
  }

  async function handleSave(e) {
    e?.preventDefault?.()
    if (!draft.name.trim()) {
      toast.info('Task name is required.')
      return
    }
    setBusy(true)
    try {
      const payload = {
        name:              draft.name.trim(),
        category:          draft.category || null,
        defaultStartTime:  draft.defaultStartTime || null,
        defaultLocation:   draft.defaultLocation.trim() || null,
        defaultNotes:      draft.defaultNotes.trim() || null,
        sortOrder:         Number.isFinite(Number(draft.sortOrder)) ? Number(draft.sortOrder) : 0,
      }
      if (draft.id) {
        await patchTaskTemplate(draft.id, payload)
        toast.success('Task updated')
      } else {
        await createTaskTemplate(payload)
        toast.success('Task added')
      }
      // Phase 9C.8 — schedule a translation sweep after task add/edit.
      // Renaming a template doesn't directly create translatable English
      // content, but downstream crew_assignments inherit the new title
      // when selected on the DAB; the sweep picks those up at the next
      // tick if they're cached blank. Safe no-op when nothing changed.
      if (canTranslate) scheduleTranslationSweep()
      cancelEdit()
    } catch (err) {
      toast.error(`Save failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleArchive(t) {
    if (!confirm(
      `Archive "${t.name}"? It will no longer appear in the task dropdown. ` +
      `Existing assignments that use this task name will still display, ` +
      `and you can reactivate the template at any time from "Show archived".`,
    )) return
    setBusy(true)
    try {
      await archiveTaskTemplate(t.id)
      toast.success(`Archived "${t.name}"`)
    } catch (err) {
      toast.error(`Archive failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleUnarchive(t) {
    setBusy(true)
    try {
      await unarchiveTaskTemplate(t.id)
      toast.success(`Reactivated "${t.name}"`)
    } catch (err) {
      toast.error(`Reactivate failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  // Phase 9C.14 — Combined filter pipeline. Order matters:
  //   1. showArchived gates whether archived rows are eligible at all
  //   2. categoryFilter narrows by normalized category (or status)
  //   3. searchText is the final free-text pass
  //   4. sort: active before archived (when both visible), then
  //      sortOrder ASC, then name ASC
  const filteredTemplates = useMemo(() => {
    return [...templates]
      .filter(t => showArchived ? true : t.status === 'active')
      .filter(t => {
        if (categoryFilter === 'all') return true
        if (categoryFilter === 'archived') return t.status === 'archived'
        return normalizeCategory(t.category) === categoryFilter
      })
      .filter(t => templateMatchesSearch(t, searchText))
      .sort((a, b) => {
        if (showArchived && a.status !== b.status) {
          return a.status === 'active' ? -1 : 1
        }
        const sa = a.sortOrder ?? 0
        const sb = b.sortOrder ?? 0
        if (sa !== sb) return sa - sb
        return (a.name ?? '').localeCompare(b.name ?? '')
      })
  }, [templates, showArchived, categoryFilter, searchText])

  const totalCount   = templates.length
  const activeCount  = templates.filter(t => t.status === 'active').length
  const visibleCount = filteredTemplates.length
  const isFiltering  = searchText.trim() !== '' || categoryFilter !== 'all'

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="dialog">
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        <header className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>Task Library</h2>
            <p className={styles.modalSub}>
              {activeCount} active task{activeCount !== 1 ? 's' : ''}
              {' · '}reusable across all dates
              {isFiltering && (
                <>
                  {' · '}
                  <span>showing {visibleCount} of {totalCount}</span>
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="Close"
          >×</button>
        </header>

        {!editing && (
          <div className={styles.tasksToolbar}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={startNew}
            >
              + New Task
            </button>
            <input
              type="search"
              className={styles.taskSearchInput}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Search tasks..."
              aria-label="Search tasks"
            />
            <select
              className={styles.taskFilterSelect}
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              aria-label="Filter by category"
            >
              {CATEGORY_FILTER_OPTS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
              {showArchived && (
                <option value="archived">Archived only</option>
              )}
            </select>
            <label className={styles.taskFormLabel} style={{ marginLeft: 'auto', gap: 4 }}>
              <input
                type="checkbox"
                checked={showArchived}
                onChange={e => {
                  const next = e.target.checked
                  setShowArchived(next)
                  // Reset the archived-only category filter when the
                  // visibility toggle is turned off; otherwise the list
                  // would silently empty and the supervisor would have
                  // no obvious recovery path.
                  if (!next && categoryFilter === 'archived') {
                    setCategoryFilter('all')
                  }
                }}
              />
              <span>Show archived</span>
            </label>
          </div>
        )}

        {editing && (
          <form className={styles.taskForm} onSubmit={handleSave}>
            <div className={styles.taskFormGrid}>
              <label className={styles.taskFormLabelWide}>
                <span>Name *</span>
                <input
                  type="text"
                  className={styles.modalSearchInput}
                  value={draft.name}
                  onChange={e => setField('name', e.target.value)}
                  placeholder="e.g. Mow Greens, Hand Water, Course Setup"
                  autoFocus
                />
              </label>

              <label className={styles.taskFormLabel}>
                <span>Category</span>
                <select
                  className={styles.modalSearchInput}
                  value={draft.category}
                  onChange={e => setField('category', e.target.value)}
                >
                  {CATEGORY_OPTS.map(o => (
                    <option key={o.value || 'none'} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>

              <label className={styles.taskFormLabel}>
                <span>Default start time</span>
                <input
                  type="time"
                  className={styles.modalSearchInput}
                  value={draft.defaultStartTime}
                  onChange={e => setField('defaultStartTime', e.target.value)}
                />
              </label>

              <label className={styles.taskFormLabel}>
                <span>Sort order</span>
                <input
                  type="number"
                  className={styles.modalSearchInput}
                  value={draft.sortOrder}
                  onChange={e => setField('sortOrder', e.target.value)}
                  step={10}
                />
              </label>

              <label className={styles.taskFormLabelWide}>
                <span>Default location</span>
                <input
                  type="text"
                  className={styles.modalSearchInput}
                  value={draft.defaultLocation}
                  onChange={e => setField('defaultLocation', e.target.value)}
                  placeholder="e.g. Front 9, Greens 7-12 (optional)"
                />
              </label>

              <label className={styles.taskFormLabelWide}>
                <span>Default notes</span>
                <textarea
                  className={styles.modalSearchInput}
                  rows={2}
                  value={draft.defaultNotes}
                  onChange={e => setField('defaultNotes', e.target.value)}
                  placeholder="Crew-visible default notes used as a starter when this task is assigned (optional)"
                  style={{ resize: 'vertical', minHeight: 50, fontFamily: 'inherit' }}
                />
              </label>
            </div>

            <div className={styles.taskFormActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={cancelEdit}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={busy}
              >
                {busy ? 'Saving…' : (draft.id ? 'Save changes' : 'Add task')}
              </button>
            </div>
          </form>
        )}

        <ul className={styles.equipmentList}>
          {totalCount === 0 ? (
            <li className={styles.equipmentEmpty}>
              No task templates yet. Click <strong>+ New Task</strong> to add one.
            </li>
          ) : filteredTemplates.length === 0 ? (
            <li className={styles.equipmentEmpty}>
              No tasks match that search/filter.
            </li>
          ) : filteredTemplates.map(t => {
            const isArchived  = t.status === 'archived'
            const notesPrev   = (t.defaultNotes ?? '').trim()
            const metaPieces  = [
              categoryLabel(t.category),
              `sort ${t.sortOrder ?? 0}`,
              t.defaultStartTime || null,
              t.defaultLocation  || null,
            ].filter(Boolean)
            return (
              <li
                key={t.id}
                className={`${styles.equipmentRow}${isArchived ? ' ' + styles.taskArchivedRow : ''}`}
                data-status={t.status}
              >
                <div className={styles.equipmentMain}>
                  <span className={styles.equipmentName}>{t.name}</span>
                  <span className={styles.taskMetaLine}>
                    {metaPieces.join(' · ')}
                  </span>
                  {notesPrev && (
                    <span className={styles.taskNotesPreview} title={notesPrev}>
                      Notes: {notesPrev}
                    </span>
                  )}
                </div>

                <div className={styles.equipmentStatusCol}>
                  <span
                    className={styles.statusPill}
                    data-status={isArchived ? 'maintenance' : 'available'}
                  >
                    {t.status}
                  </span>
                </div>

                <div className={styles.equipmentAction}>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => startEdit(t)}
                    disabled={busy}
                  >
                    Edit
                  </button>
                  {!isArchived ? (
                    <button
                      type="button"
                      className={styles.btnDanger}
                      onClick={() => handleArchive(t)}
                      disabled={busy}
                      title="Hide from the task dropdown. Existing assignments keep their label."
                    >
                      Archive
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={() => handleUnarchive(t)}
                      disabled={busy}
                      title="Reactivate this template so it appears in the dropdown again."
                    >
                      Reactivate
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        <footer className={styles.modalFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>
            Done
          </button>
        </footer>

      </div>
    </div>
  )
}
