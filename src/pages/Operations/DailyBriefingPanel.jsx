// Phase 6 — Daily Briefing panel for the Operations workspace.
//
// Replaces the old empty CrewNotes tab. Supervisor-facing editor for
// operations_daily_notes. The same notes feed the Display Board.
//
// Important: notes are crew-visible. The UI carries an explicit
// reminder so management never types disciplinary content here.

import { useMemo, useRef, useState } from 'react'
import {
  useOperationsNotesData,
  createOperationsNote,
  patchOperationsNote,
  archiveOperationsNote,
  unarchiveOperationsNote,
  deleteOperationsNote,
} from '../../utils/operations/notesStore'
import { useToast } from '../../utils/feedback/toastContext'
import { useSelectedCourse } from '../../utils/courses/courseStore'
import {
  useAttachmentsForParent,
  uploadAttachment,
  deleteAttachment as deleteAttachmentApi,
} from '../../utils/attachments/attachmentsStore'
import styles from './DailyBriefingPanel.module.css'

const TODAY = () => new Date().toISOString().slice(0, 10)

const PRIORITIES = [
  { value: 'routine',   label: 'Routine' },
  { value: 'important', label: 'Important' },
  { value: 'urgent',    label: 'Urgent' },
  { value: 'weather',   label: 'Weather' },
  { value: 'safety',    label: 'Safety' },
]

const PRIORITY_ORDER = {
  urgent: 0, safety: 1, weather: 2, important: 3, routine: 4,
}

function emptyDraft() {
  return {
    id:       null,
    noteDate: TODAY(),
    title:    '',
    body:     '',
    // Phase 9C.5b2 — manual Spanish translation. Optional. Empty saves
    // as null on the server so the kiosk (9C.5b3) can fall back to
    // English-only rendering cleanly.
    titleEs:  '',
    bodyEs:   '',
    priority: 'routine',
    pinned:   false,
  }
}

export default function DailyBriefingPanel() {
  const { notes, loading, error } = useOperationsNotesData()
  const toast                     = useToast()
  const selectedCourse            = useSelectedCourse()

  const [draft,          setDraft]          = useState(emptyDraft())
  const [showArchived,   setShowArchived]   = useState(false)
  const [busy,           setBusy]           = useState(false)
  const bodyRef                             = useRef(null)

  // ── Filter + sort ─────────────────────────────────────────────────────
  const visible = useMemo(() => {
    const today = TODAY()
    return notes
      .filter(n => showArchived
        ? true                                      // show everything
        : n.status === 'active')
      .filter(n => showArchived
        ? true                                      // archive view = all dates
        : n.noteDate === today)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        const pa = PRIORITY_ORDER[a.priority] ?? 9
        const pb = PRIORITY_ORDER[b.priority] ?? 9
        if (pa !== pb) return pa - pb
        return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
      })
  }, [notes, showArchived])

  const todayCount = useMemo(
    () => notes.filter(n => n.status === 'active' && n.noteDate === TODAY()).length,
    [notes],
  )

  // ── Mutations ─────────────────────────────────────────────────────────
  function setField(k, v) { setDraft(prev => ({ ...prev, [k]: v })) }

  function startEdit(note) {
    setDraft({
      id:       note.id,
      noteDate: note.noteDate,
      title:    note.title ?? '',
      body:     note.body,
      // Phase 9C.5b2 — hydrate Spanish fields from the saved row so
      // the author sees and can edit the existing translation.
      titleEs:  note.titleEs ?? '',
      bodyEs:   note.bodyEs ?? '',
      priority: note.priority,
      pinned:   note.pinned,
    })
    setTimeout(() => bodyRef.current?.focus(), 30)
  }

  function startNew() {
    setDraft(emptyDraft())
    setTimeout(() => bodyRef.current?.focus(), 30)
  }

  async function handleSave(e) {
    e?.preventDefault?.()
    if (!draft.body.trim()) {
      toast.info('Briefing body is required')
      return
    }
    setBusy(true)
    try {
      if (draft.id) {
        await patchOperationsNote(draft.id, {
          noteDate: draft.noteDate,
          title:    draft.title || null,
          body:     draft.body,
          // Phase 9C.5b2 — Spanish translation. || null so empty strings
          // become null on the server (cleaner data, kiosk fall-through).
          titleEs:  draft.titleEs || null,
          bodyEs:   draft.bodyEs  || null,
          priority: draft.priority,
          pinned:   draft.pinned,
        })
        toast.success('Briefing updated')
      } else {
        await createOperationsNote({
          noteDate:  draft.noteDate,
          title:     draft.title || null,
          body:      draft.body,
          // Phase 9C.5b2 — Spanish translation. || null matches the
          // English title convention; the kiosk treats null as "no
          // translation available, render English only" in 9C.5b3.
          titleEs:   draft.titleEs || null,
          bodyEs:    draft.bodyEs  || null,
          priority:  draft.priority,
          pinned:    draft.pinned,
          createdBy: null,            // future: replace with logged-in user
        })
        toast.success('Briefing posted to Display Board')
      }
      setDraft(emptyDraft())
    } catch (err) {
      toast.error(`Save failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleArchive(note) {
    try {
      if (note.status === 'archived') {
        await unarchiveOperationsNote(note.id)
        toast.success('Briefing restored')
      } else {
        await archiveOperationsNote(note.id)
        toast.success('Briefing archived')
      }
    } catch (err) {
      toast.error(`Could not update: ${err.message}`)
    }
  }

  async function handleDelete(note) {
    if (!confirm(`Delete this briefing permanently?\n\n"${note.title || note.body.slice(0, 60)}"`)) return
    try {
      await deleteOperationsNote(note.id)
      toast.success('Briefing deleted')
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`)
    }
  }

  async function togglePin(note) {
    try {
      await patchOperationsNote(note.id, { pinned: !note.pinned })
    } catch (err) {
      toast.error(`Pin failed: ${err.message}`)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className={styles.wrap}>

      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Daily Briefing</h2>
          <p className={styles.subtitle}>
            Crew-visible operational notes for {prettyDate(TODAY())}
            {selectedCourse?.shortName ? ` · ${selectedCourse.shortName}` : ''}
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={`${styles.toggleBtn} ${showArchived ? styles.toggleBtnOn : ''}`}
            onClick={() => setShowArchived(v => !v)}
            title="Toggle archived briefings"
          >
            {showArchived ? 'Hide archive' : 'Show archive'}
          </button>
          {draft.id != null && (
            <button
              type="button"
              className={styles.toggleBtn}
              onClick={startNew}
            >
              + New briefing
            </button>
          )}
        </div>
      </header>

      <div className={styles.crewVisibleNotice}>
        <strong>Crew-visible:</strong> notes posted here appear on the Display
        Board. Use this for operational instructions, weather, frost delays,
        course conditions, and safety alerts only — <em>never</em> for
        disciplinary or pay-related content.
      </div>

      {/* ── Editor ────────────────────────────────────────────────────── */}
      <form className={styles.editor} onSubmit={handleSave}>
        <div className={styles.editorRow}>
          <div className={styles.field}>
            <label className={styles.label}>Date</label>
            <input
              type="date"
              className={styles.input}
              value={draft.noteDate}
              onChange={e => setField('noteDate', e.target.value)}
            />
          </div>
          <div className={styles.fieldWide}>
            <label className={styles.label}>Title (optional)</label>
            <input
              type="text"
              className={styles.input}
              value={draft.title}
              onChange={e => setField('title', e.target.value)}
              placeholder="e.g. Frost delay until 7:30"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Priority</label>
            <select
              className={styles.input}
              value={draft.priority}
              onChange={e => setField('priority', e.target.value)}
            >
              {PRIORITIES.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        <textarea
          ref={bodyRef}
          className={styles.body}
          value={draft.body}
          onChange={e => setField('body', e.target.value)}
          rows={3}
          placeholder="Briefing copy — what the crew needs to know at 5:30 AM."
        />

        {/* Phase 9C.5b2 — Spanish translation block. Optional; empty
            saves as null and the kiosk (9C.5b3) falls back to English. */}
        <div className={styles.spanishNotice}>
          <strong>Spanish (optional):</strong> Crew-visible translation. Verify before saving.
        </div>
        <div className={styles.editorRow}>
          <div className={styles.fieldWide}>
            <label className={styles.label}>Spanish title</label>
            <input
              type="text"
              lang="es"
              className={styles.input}
              value={draft.titleEs ?? ''}
              onChange={e => setField('titleEs', e.target.value)}
              placeholder="Título en español (opcional)"
            />
          </div>
        </div>
        <textarea
          lang="es"
          className={styles.body}
          value={draft.bodyEs ?? ''}
          onChange={e => setField('bodyEs', e.target.value)}
          rows={3}
          placeholder="Cuerpo en español (opcional)"
        />

        <div className={styles.editorFooter}>
          <label className={styles.pinToggle}>
            <input
              type="checkbox"
              checked={draft.pinned}
              onChange={e => setField('pinned', e.target.checked)}
            />
            Pin to top of Display Board
          </label>
          <div className={styles.editorActions}>
            {draft.id && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setDraft(emptyDraft())}
                disabled={busy}
              >
                Cancel edit
              </button>
            )}
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={busy}
            >
              {busy
                ? 'Saving…'
                : draft.id
                  ? 'Save changes'
                  : 'Post briefing'}
            </button>
          </div>
        </div>
      </form>

      {/* ── List ──────────────────────────────────────────────────────── */}
      <div className={styles.feedHeader}>
        <span>
          {showArchived
            ? `${visible.length} briefing${visible.length !== 1 ? 's' : ''} (all dates)`
            : `${todayCount} active briefing${todayCount !== 1 ? 's' : ''} for today`}
        </span>
        {error && <span className={styles.errorText}>{error}</span>}
      </div>

      {loading && notes.length === 0 ? (
        <p className={styles.empty}>Loading briefings…</p>
      ) : visible.length === 0 ? (
        <p className={styles.empty}>
          {showArchived
            ? 'No briefings in the archive.'
            : 'No briefings posted for today yet. Post one above — it goes live on the Display Board instantly.'}
        </p>
      ) : (
        <div className={styles.feed}>
          {visible.map(note => (
            <article
              key={note.id}
              className={styles.note}
              data-priority={note.priority}
              data-pinned={note.pinned ? 'true' : undefined}
              data-archived={note.status === 'archived' ? 'true' : undefined}
            >
              <div className={styles.noteHeader}>
                <div>
                  {note.title && <p className={styles.noteTitle}>{note.title}</p>}
                  <p className={styles.noteMeta}>
                    <span className={styles.priorityChip} data-priority={note.priority}>
                      {note.priority}
                    </span>
                    {note.pinned && <span className={styles.pinChip}>📌 pinned</span>}
                    <span>{note.noteDate}</span>
                    {note.status === 'archived' && (
                      <span className={styles.archivedChip}>archived</span>
                    )}
                  </p>
                </div>
                <div className={styles.noteActions}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => togglePin(note)}
                    title={note.pinned ? 'Unpin' : 'Pin to top'}
                  >
                    {note.pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => startEdit(note)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => handleArchive(note)}
                  >
                    {note.status === 'archived' ? 'Restore' : 'Archive'}
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtnDanger}
                    onClick={() => handleDelete(note)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className={styles.noteBody}>{note.body}</p>
              <BriefingPhotoStrip noteId={note.id} editable />
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Photo strip (Phase 8) ─────────────────────────────────────────── */

function BriefingPhotoStrip({ noteId, editable }) {
  const { attachments, loading, refresh } = useAttachmentsForParent('daily_briefing', noteId)
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const toast = useToast()

  async function handleFiles(fileList) {
    const files = Array.from(fileList ?? [])
    if (files.length === 0) return
    setUploading(true)
    let ok = 0
    for (const file of files) {
      try {
        await uploadAttachment({
          parentType: 'daily_briefing',
          parentId:   noteId,
          file,
        })
        ok += 1
      } catch (err) {
        toast.error(`${file.name}: ${err.message}`)
      }
    }
    if (ok > 0) {
      await refresh()
      toast.success(`Uploaded ${ok} photo${ok !== 1 ? 's' : ''}`)
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleDelete(att) {
    if (!confirm('Delete this photo? This removes it from the Display Board too.')) return
    try {
      await deleteAttachmentApi(att.id)
      refresh()
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`)
    }
  }

  // Nothing yet AND not editable → render nothing so the feed row stays compact.
  if (!editable && attachments.length === 0) return null

  return (
    <div className={styles.photoStrip}>
      {attachments.length === 0 && !loading && editable && (
        <span className={styles.photoEmpty}>No photos attached yet.</span>
      )}
      {attachments.map(att => (
        <div key={att.id} className={styles.photoThumb}>
          <img src={att.url} alt={att.caption ?? att.fileName ?? 'briefing photo'} />
          {editable && (
            <button
              type="button"
              className={styles.photoRemove}
              onClick={() => handleDelete(att)}
              aria-label="Remove photo"
              title="Remove photo"
            >
              ×
            </button>
          )}
        </div>
      ))}
      {editable && (
        <label className={`${styles.photoAddBtn} ${uploading ? styles.photoAddBtnBusy : ''}`}>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            disabled={uploading}
            onChange={e => handleFiles(e.target.files)}
            style={{ display: 'none' }}
          />
          {uploading ? 'Uploading…' : '+ Add photos'}
        </label>
      )}
    </div>
  )
}

function prettyDate(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}
