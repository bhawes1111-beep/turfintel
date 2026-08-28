// Task Library modal.
//
// Manages reusable task templates for the Daily Assignment Board dropdown.
// Operations opens this same modal, so this is the single interface for
// adding, editing, archiving, and reactivating recurring course tasks.

import { useEffect, useMemo, useState } from 'react'
import {
  useTaskTemplatesData,
  refreshTaskTemplatesData,
  createTaskTemplate,
  patchTaskTemplate,
  archiveTaskTemplate,
  unarchiveTaskTemplate,
  deleteTaskTemplate,
} from '../../../utils/tasks/taskTemplateStore'
import {
  useTaskCategoriesData,
  createTaskCategory,
  patchTaskCategory,
  deleteTaskCategory,
  normalizeTaskCategorySlug,
  taskCategoryLabelFor,
} from '../../../utils/tasks/taskCategoryStore'
import { useToast } from '../../../utils/feedback/toastContext'
import { scheduleTranslationSweep } from '../../../utils/translate/translateClient'
import { useAuth } from '../../../context/AuthContext'
import styles from './DailyAssignmentBoard.module.css'

const CATEGORY_OPTS = [
  { value: '',            label: '- Area -' },
  { value: 'crew',        label: 'Crew' },
  { value: 'spray',       label: 'Spray' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'agronomy',    label: 'Agronomy' },
  { value: 'irrigation',  label: 'Irrigation' },
]

const CATEGORY_FILTER_OPTS = [
  { value: 'all',         label: 'All areas' },
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

function normalizeCategory(category, categories = []) {
  const raw = normalizeTaskCategorySlug(category)
  if (!raw) return 'other'
  const hasCloudCategory = (categories ?? []).some(c => normalizeTaskCategorySlug(c.slug ?? c.value) === raw)
  return hasCloudCategory ? raw : 'other'
}

function categoryLabel(category, categories = []) {
  const key = normalizeCategory(category, categories)
  if (key === 'other') return 'Other'
  const cloudLabel = taskCategoryLabelFor(categories, key)
  return cloudLabel === 'Other' ? CATEGORY_LABELS[key] ?? 'Other' : cloudLabel
}

function templateMatchesSearch(t, query, categories = []) {
  if (!query) return true
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [
    t.name,
    categoryLabel(t.category, categories),
    t.defaultLocation,
    t.defaultNotes,
  ]
    .filter(Boolean)
    .join('  ')
    .toLowerCase()
  return haystack.includes(q)
}

function statusLabel(status) {
  return status === 'archived' ? 'Archived' : 'Active'
}

export default function TasksManagerModal({ onClose }) {
  const toast        = useToast()
  const { can }      = useAuth()
  const canTranslate = can('canSystemSettings')

  const { templates, includeArchived } = useTaskTemplatesData()
  const { categories } = useTaskCategoriesData()

  const [draft, setDraft]       = useState(() => blankDraft())
  const [selectedId, setSelectedId] = useState(null)
  const [busy, setBusy]         = useState(false)
  const [showArchived, setShowArchived] = useState(includeArchived)

  const [searchText, setSearchText]         = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [newAreaName, setNewAreaName] = useState('')
  const [categoryOrderDrafts, setCategoryOrderDrafts] = useState({})

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (showArchived !== includeArchived) {
      refreshTaskTemplatesData({ includeArchived: showArchived })
    }
  }, [showArchived, includeArchived])

  const activeCategories = useMemo(() => {
    return [...(Array.isArray(categories) ? categories : [])]
      .filter(c => c?.slug)
      .sort((a, b) => {
        const sa = a.sortOrder ?? 0
        const sb = b.sortOrder ?? 0
        if (sa !== sb) return sa - sb
        return (a.name ?? '').localeCompare(b.name ?? '')
      })
  }, [categories])

  const categoryOptions = useMemo(() => ([
    CATEGORY_OPTS[0],
    ...activeCategories.map(c => ({ value: c.slug, label: c.name })),
  ]), [activeCategories])

  const categoryFilterOptions = useMemo(() => ([
    CATEGORY_FILTER_OPTS[0],
    ...activeCategories.map(c => ({ value: c.slug, label: c.name })),
    { value: 'other', label: 'Other' },
  ]), [activeCategories])

  const filteredTemplates = useMemo(() => {
    return [...(Array.isArray(templates) ? templates : [])]
      .filter(t => showArchived ? true : t.status === 'active')
      .filter(t => {
        if (categoryFilter === 'all') return true
        if (categoryFilter === 'archived') return t.status === 'archived'
        return normalizeCategory(t.category, activeCategories) === categoryFilter
      })
      .filter(t => templateMatchesSearch(t, searchText, activeCategories))
      .sort((a, b) => {
        if (showArchived && a.status !== b.status) {
          return a.status === 'active' ? -1 : 1
        }
        const sa = a.sortOrder ?? 0
        const sb = b.sortOrder ?? 0
        if (sa !== sb) return sa - sb
        return (a.name ?? '').localeCompare(b.name ?? '')
      })
  }, [templates, showArchived, categoryFilter, searchText, activeCategories])

  const totalCount   = Array.isArray(templates) ? templates.length : 0
  const activeCount  = (Array.isArray(templates) ? templates : []).filter(t => t.status === 'active').length
  const archivedCount = Math.max(0, totalCount - activeCount)
  const visibleCount = filteredTemplates.length
  const isFiltering  = searchText.trim() !== '' || categoryFilter !== 'all'
  const selectedTemplate = selectedId
    ? filteredTemplates.find(t => t.id === selectedId) ?? (Array.isArray(templates) ? templates : []).find(t => t.id === selectedId)
    : null

  const categoryCounts = useMemo(() => {
    const counts = { all: activeCount, other: 0 }
    for (const c of activeCategories) counts[c.slug] = 0
    for (const t of (Array.isArray(templates) ? templates : [])) {
      if (t.status !== 'active') continue
      const key = normalizeCategory(t.category, activeCategories)
      counts[key] = (counts[key] ?? 0) + 1
    }
    return counts
  }, [templates, activeCount, activeCategories])

  function setField(k, v) { setDraft(prev => ({ ...prev, [k]: v })) }

  function startNew() {
    setDraft(blankDraft())
    setSelectedId('__new__')
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
    setSelectedId(t.id)
  }

  function cancelEdit() {
    setDraft(blankDraft())
    setSelectedId(null)
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
      let saved
      if (draft.id) {
        saved = await patchTaskTemplate(draft.id, payload)
        toast.success('Task updated')
      } else {
        saved = await createTaskTemplate(payload)
        toast.success('Task added')
      }
      if (canTranslate) scheduleTranslationSweep()
      setDraft({
        id:                saved.id,
        name:              saved.name ?? '',
        category:          saved.category ?? '',
        defaultStartTime:  saved.defaultStartTime ?? '',
        defaultLocation:   saved.defaultLocation ?? '',
        defaultNotes:      saved.defaultNotes ?? '',
        sortOrder:         saved.sortOrder ?? 0,
      })
      setSelectedId(saved.id)
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
      if (selectedId === t.id) cancelEdit()
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
      startEdit({ ...t, status: 'active' })
    } catch (err) {
      toast.error(`Reactivate failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteTemplate(t) {
    if (!confirm(
      `Delete "${t.name}" from the Task Library? Existing assignments will still show their task name, ` +
      `but this template will be gone from the reusable list.`,
    )) return
    setBusy(true)
    try {
      await deleteTaskTemplate(t.id)
      toast.success(`Deleted "${t.name}"`)
      if (selectedId === t.id) cancelEdit()
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleAddArea(e) {
    e?.preventDefault?.()
    const name = newAreaName.trim()
    if (!name) {
      toast.info('Area name is required.')
      return
    }
    setBusy(true)
    try {
      const saved = await createTaskCategory({ name })
      setNewAreaName('')
      setCategoryFilter(saved.slug)
      toast.success(`Area added: ${saved.name}`)
    } catch (err) {
      toast.error(`Area add failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleRenameArea(area) {
    const nextName = prompt('Rename area', area.name)
    if (nextName == null) return
    const name = nextName.trim()
    if (!name) {
      toast.info('Area name is required.')
      return
    }
    if (name === area.name) return
    setBusy(true)
    try {
      const saved = await patchTaskCategory(area.id, { name })
      await refreshTaskTemplatesData({ includeArchived: showArchived })
      if (categoryFilter === area.slug) setCategoryFilter(saved.slug)
      if (draft.category === area.slug) setField('category', saved.slug)
      toast.success(`Renamed area to "${saved.name}"`)
    } catch (err) {
      toast.error(`Area rename failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteArea(category) {
    const used = category.totalCount ?? categoryCounts[category.slug] ?? 0
    const usageText = used > 0
      ? ` ${used} task${used === 1 ? '' : 's'} will move to Other.`
      : ''
    if (!confirm(`Delete area "${category.name}"?${usageText}`)) return
    setBusy(true)
    try {
      await deleteTaskCategory(category.id)
      await refreshTaskTemplatesData({ includeArchived: showArchived })
      if (categoryFilter === category.slug) setCategoryFilter('all')
      if (draft.category === category.slug) setField('category', '')
      toast.success(`Deleted area "${category.name}"`)
    } catch (err) {
      toast.error(`Area delete failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleCategoryOrderBlur(category) {
    const raw = categoryOrderDrafts[category.id]
    if (raw == null || raw === '') return
    const sortOrder = Number(raw)
    if (!Number.isFinite(sortOrder) || sortOrder < 0) {
      toast.info('Category order must be zero or greater.')
      setCategoryOrderDrafts(current => ({ ...current, [category.id]: category.sortOrder ?? 0 }))
      return
    }
    if (sortOrder === Number(category.sortOrder ?? 0)) return
    setBusy(true)
    try {
      await patchTaskCategory(category.id, { sortOrder })
      toast.success(`${category.name} order updated.`)
    } catch (err) {
      toast.error(`Category order failed: ${err.message}`)
      setCategoryOrderDrafts(current => ({ ...current, [category.id]: category.sortOrder ?? 0 }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Task Library">
      <div className={`${styles.modal} ${styles.taskLibraryModal}`} onClick={e => e.stopPropagation()}>

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
          <div className={styles.taskLibraryHeaderActions}>
            <button type="button" className={styles.btnPrimary} onClick={startNew}>
              + New Task
            </button>
            <button
              type="button"
              className={styles.modalClose}
              onClick={onClose}
              aria-label="Close"
            >x</button>
          </div>
        </header>

        <div className={styles.taskLibraryStats} aria-label="Task areas">
          <button type="button" className={styles.taskStat} data-active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')}>
            <span>{activeCount}</span>
            <small>All</small>
          </button>
          {activeCategories.map(c => (
            <div key={c.slug} className={styles.taskAreaChip} data-active={categoryFilter === c.slug}>
              <button type="button" className={styles.taskAreaChipMain} onClick={() => setCategoryFilter(c.slug)}>
                <span>{categoryCounts[c.slug] ?? 0}</span>
                <small>{c.name}</small>
              </button>
              <div className={styles.taskAreaChipActions}>
                <label className={styles.taskAreaOrder} title="Controls category order in task dropdowns">
                  <span>Order</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={categoryOrderDrafts[c.id] ?? c.sortOrder ?? 0}
                    onChange={event => setCategoryOrderDrafts(current => ({
                      ...current,
                      [c.id]: event.target.value,
                    }))}
                    onBlur={() => handleCategoryOrderBlur(c)}
                    disabled={busy || String(c.id ?? '').startsWith('default-')}
                    aria-label={`Sort order for ${c.name}`}
                  />
                </label>
                <button
                  type="button"
                  className={styles.taskAreaMiniBtn}
                  onClick={() => handleRenameArea(c)}
                  disabled={busy || String(c.id ?? '').startsWith('default-')}
                  aria-label={`Rename area ${c.name}`}
                  title="Rename area"
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={styles.taskAreaMiniBtn}
                  data-danger="true"
                  onClick={() => handleDeleteArea(c)}
                  disabled={busy || String(c.id ?? '').startsWith('default-')}
                  aria-label={`Delete area ${c.name}`}
                  title="Delete area"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          <form className={styles.taskAreaAddForm} onSubmit={handleAddArea}>
            <input
              type="text"
              className={styles.taskAreaAddInput}
              value={newAreaName}
              onChange={e => setNewAreaName(e.target.value)}
              placeholder="New area"
              disabled={busy}
              aria-label="New task area"
            />
            <button type="submit" className={styles.taskAreaAddBtn} disabled={busy || !newAreaName.trim()}>
              Add Area
            </button>
          </form>
          <button type="button" className={styles.taskStat} data-active={categoryFilter === 'archived'} onClick={() => { setShowArchived(true); setCategoryFilter('archived') }}>
            <span>{archivedCount}</span>
            <small>Archived</small>
          </button>
        </div>

        <div className={styles.tasksToolbar}>
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
            aria-label="Filter by area"
          >
            {categoryFilterOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
            {showArchived && (
              <option value="archived">Archived only</option>
            )}
          </select>
          <label className={styles.taskArchiveToggle}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={e => {
                const next = e.target.checked
                setShowArchived(next)
                if (!next && categoryFilter === 'archived') {
                  setCategoryFilter('all')
                }
              }}
            />
            <span>Show archived</span>
          </label>
        </div>

        <div className={styles.taskLibraryBody}>
          <section className={styles.taskLibraryListPane} aria-label="Task templates">
            <ul className={`${styles.equipmentList} ${styles.taskLibraryList}`}>
              {totalCount === 0 ? (
                <li className={styles.equipmentEmpty}>
                  No task templates yet. Click <strong>+ New Task</strong> to add one.
                </li>
              ) : filteredTemplates.length === 0 ? (
                <li className={styles.equipmentEmpty}>
                  No tasks match that search/filter.
                </li>
              ) : filteredTemplates.map(t => {
                const isArchived = t.status === 'archived'
                const isSelected = selectedId === t.id
                const notesPrev = (t.defaultNotes ?? '').trim()
                const metaPieces = [
                  categoryLabel(t.category, activeCategories),
                  `sort ${t.sortOrder ?? 0}`,
                  t.defaultStartTime || null,
                  t.defaultLocation || null,
                ].filter(Boolean)
                return (
                  <li
                    key={t.id}
                    className={`${styles.equipmentRow} ${styles.taskLibraryRow}${isSelected ? ' ' + styles.taskLibraryRowActive : ''}${isArchived ? ' ' + styles.taskArchivedRow : ''}`}
                    data-status={t.status}
                  >
                    <button
                      type="button"
                      className={styles.taskLibraryRowButton}
                      onClick={() => startEdit(t)}
                      aria-current={isSelected ? 'true' : undefined}
                    >
                      <span className={styles.equipmentMain}>
                        <span className={styles.equipmentName}>{t.name}</span>
                        <span className={styles.taskMetaLine}>
                          {metaPieces.join(' · ')}
                        </span>
                        {notesPrev && (
                          <span className={styles.taskNotesPreview} title={notesPrev}>
                            Notes: {notesPrev}
                          </span>
                        )}
                      </span>
                    </button>

                    <div className={styles.equipmentStatusCol}>
                      <span
                        className={styles.statusPill}
                        data-status={isArchived ? 'maintenance' : 'available'}
                      >
                        {statusLabel(t.status)}
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
                      <button
                        type="button"
                        className={styles.btnDanger}
                        onClick={() => handleDeleteTemplate(t)}
                        disabled={busy}
                        title="Permanently remove this saved task from the library."
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>

          <aside className={styles.taskLibraryEditor} aria-label="Task editor">
            {selectedId ? (
              <form className={styles.taskForm} onSubmit={handleSave}>
                <div className={styles.taskEditorHeader}>
                  <div>
                    <span className={styles.taskEditorEyebrow}>{draft.id ? 'Edit template' : 'New template'}</span>
                    <h3>{draft.name.trim() || 'Untitled task'}</h3>
                  </div>
                  {selectedTemplate && (
                    <span className={styles.statusPill} data-status={selectedTemplate.status === 'archived' ? 'maintenance' : 'available'}>
                      {statusLabel(selectedTemplate.status)}
                    </span>
                  )}
                </div>

                <div className={styles.taskFormGrid}>
                  <label className={styles.taskFormLabelWide}>
                    <span>Name *</span>
                    <input
                      type="text"
                      className={styles.modalSearchInput}
                      value={draft.name}
                      onChange={e => setField('name', e.target.value)}
                      placeholder="Mow Greens"
                      autoFocus
                    />
                  </label>

                  <label className={styles.taskFormLabel}>
                    <span>Area</span>
                    <select
                      className={styles.modalSearchInput}
                      value={draft.category}
                      onChange={e => setField('category', e.target.value)}
                    >
                      {categoryOptions.map(o => (
                        <option key={o.value || 'none'} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.taskFormLabel}>
                    <span>Default start</span>
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
                      placeholder="Front 9"
                    />
                  </label>

                  <label className={styles.taskFormLabelWide}>
                    <span>Default notes</span>
                    <textarea
                      className={styles.modalSearchInput}
                      rows={4}
                      value={draft.defaultNotes}
                      onChange={e => setField('defaultNotes', e.target.value)}
                      placeholder="Crew note"
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
                    Clear
                  </button>
                  <button
                    type="submit"
                    className={styles.btnPrimary}
                    disabled={busy}
                  >
                    {busy ? 'Saving...' : (draft.id ? 'Save changes' : 'Add task')}
                  </button>
                </div>
              </form>
            ) : (
              <div className={styles.taskEditorEmpty}>
                <strong>{visibleCount || totalCount}</strong>
                <span>{isFiltering ? 'matching tasks' : 'tasks in library'}</span>
                <button type="button" className={styles.btnPrimary} onClick={startNew}>
                  + New Task
                </button>
              </div>
            )}

          </aside>
        </div>

        <footer className={styles.modalFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>
            Done
          </button>
        </footer>

      </div>
    </div>
  )
}
