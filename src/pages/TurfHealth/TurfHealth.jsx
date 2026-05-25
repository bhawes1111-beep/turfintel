// Phase 7B.1 — Turf Health workspace.
//
// Three tabs, all reading from the same useTurfHealthData /
// useTurfHealthAttachments store hooks added in Commit 3:
//
//   1. Overview         — active + high-severity counts, by-type rollup,
//                         recent photo-backed observations
//   2. Active Issues    — status=active|monitoring, severity-sorted
//   3. Recent Observations — newest-first, with pending/retry/photo states
//                         and delete (if permission)
//
// Tabs are sub-components in this same file to keep the v1 workspace tight.
// Each sub-component reads from the shared store hooks — no prop drilling.

import { useMemo, useState } from 'react'
import PageShell from '../../components/layout/PageShell'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../utils/feedback/toastContext'
import {
  useTurfHealthData,
  useTurfHealthAttachments,
  deleteTurfHealthObservation,
  retryPendingObservation,
  retryPendingPhoto,
  dismissPendingObservation,
  addPhotoToObservation,
} from '../../utils/turfHealth/turfHealthStore'
import { openPhotoPicker } from '../../utils/media/pickPhoto'
import {
  healthTypeLabel,
  healthTypeIcon,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
} from '../../utils/turfHealth/healthTypes'
import TurfHealthPhotoViewer from '../../components/turfHealth/TurfHealthPhotoViewer'
import styles from './TurfHealth.module.css'

const TABS = ['Overview', 'Active Issues', 'Recent Observations']

const SEVERITY_COLOR = {
  high:     '#ef4444',
  moderate: '#fbbf24',
  low:      '#4ade80',
}

const STATUS_LABEL = {
  active:     'Active',
  monitoring: 'Monitoring',
  resolved:   'Resolved',
}

function fmtAgo(iso) {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const h = (Date.now() - ms) / 3_600_000
  if (h < 1)  return `${Math.round(h * 60)}m ago`
  if (h < 24) return `${Math.round(h)}h ago`
  return `${Math.round(h / 24)}d ago`
}

// ── Workspace shell ────────────────────────────────────────────────────────

export default function TurfHealth() {
  const [activeTab, setActiveTab] = useState('Overview')
  const [viewerObs, setViewerObs] = useState(null)

  const { observations, loading, error } = useTurfHealthData()
  const { byParent: attachmentsByParent } = useTurfHealthAttachments()

  const viewerAttachments = viewerObs
    ? (attachmentsByParent.get(viewerObs.id) ?? [])
    : []

  return (
    <PageShell
      title="Turf Health"
      description="Shade, airflow, weak turf, and chronic stress observations."
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {error && <p className={styles.error}>Load error: {error}</p>}

      {activeTab === 'Overview' && (
        <Overview
          observations={observations}
          loading={loading}
          attachmentsByParent={attachmentsByParent}
          onOpenViewer={setViewerObs}
        />
      )}

      {activeTab === 'Active Issues' && (
        <ActiveIssues
          observations={observations}
          loading={loading}
          attachmentsByParent={attachmentsByParent}
          onOpenViewer={setViewerObs}
        />
      )}

      {activeTab === 'Recent Observations' && (
        <RecentObservations
          observations={observations}
          loading={loading}
          attachmentsByParent={attachmentsByParent}
          onOpenViewer={setViewerObs}
        />
      )}

      <TurfHealthPhotoViewer
        observation={viewerObs}
        attachments={viewerAttachments}
        onClose={() => setViewerObs(null)}
      />
    </PageShell>
  )
}

// ── Overview tab ───────────────────────────────────────────────────────────

function Overview({ observations, loading, attachmentsByParent, onOpenViewer }) {
  const stats = useMemo(() => {
    const active     = observations.filter(o => o.status === 'active'     || o.status === 'monitoring').length
    const high       = observations.filter(o => o.severity === 'high'     && o.status !== 'resolved').length
    const total      = observations.length
    // Per-type counts (active + monitoring only).
    const byType = {}
    for (const o of observations) {
      if (o.status === 'resolved') continue
      if (!o.healthType) continue
      byType[o.healthType] = (byType[o.healthType] ?? 0) + 1
    }
    const byTypeList = Object.entries(byType).sort((a, b) => b[1] - a[1])
    return { active, high, total, byTypeList }
  }, [observations])

  // Recent photo-backed observations — newest-first, top 3, only rows that
  // have at least one attachment cached. Cheap because byParent is a Map.
  const recentWithPhotos = useMemo(() => {
    return (observations ?? [])
      .filter(o => !o._pending && (attachmentsByParent.get(o.id)?.length ?? 0) > 0)
      .slice(0, 3)
  }, [observations, attachmentsByParent])

  if (loading && observations.length === 0) {
    return <p className={styles.empty}>Loading turf health observations…</p>
  }
  if (!loading && observations.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No turf health observations yet.</p>
        <p className={styles.emptyHint}>
          Tap the <strong>🌱 FAB</strong> on mobile to log a shade, airflow, traffic,
          or chronic-stress observation — the FAB is visible here and on the dashboard.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.section}>
      <div className={styles.statsRow}>
        <StatCard label="Active / monitoring" value={stats.active} />
        <StatCard label="High severity"       value={stats.high} accent={SEVERITY_COLOR.high} />
        <StatCard label="Total observations"  value={stats.total} muted />
      </div>

      {stats.byTypeList.length > 0 && (
        <div className={styles.subSection}>
          <p className={styles.sectionLabel}>By type (open observations)</p>
          <ul className={styles.typeList}>
            {stats.byTypeList.map(([type, count]) => (
              <li key={type} className={styles.typeRow}>
                <span className={styles.typeIcon} aria-hidden="true">{healthTypeIcon(type)}</span>
                <span className={styles.typeLabel}>{healthTypeLabel(type)}</span>
                <span className={styles.typeCount}>{count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recentWithPhotos.length > 0 && (
        <div className={styles.subSection}>
          <p className={styles.sectionLabel}>Recent photo-backed observations</p>
          <ul className={styles.obsList}>
            {recentWithPhotos.map(o => (
              <ObservationRow
                key={o.id}
                obs={o}
                attachmentsByParent={attachmentsByParent}
                onOpenViewer={onOpenViewer}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, accent, muted }) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statValue} style={accent ? { color: accent } : undefined}>
        {value}
      </span>
      <span className={`${styles.statLabel} ${muted ? styles.statLabelMuted : ''}`}>{label}</span>
    </div>
  )
}

// ── Active Issues tab ──────────────────────────────────────────────────────

function ActiveIssues({ observations, loading, attachmentsByParent, onOpenViewer }) {
  const visible = useMemo(() => {
    return (observations ?? [])
      .filter(o => o.status === 'active' || o.status === 'monitoring')
      .filter(o => !o._pending)  // pending rows live on the Recent tab
      .sort((a, b) => {
        const sa = SEVERITY_ORDER[a.severity] ?? 99
        const sb = SEVERITY_ORDER[b.severity] ?? 99
        if (sa !== sb) return sa - sb
        return (b.observedAt ?? '').localeCompare(a.observedAt ?? '')
      })
  }, [observations])

  if (loading && observations.length === 0) {
    return <p className={styles.empty}>Loading…</p>
  }
  if (visible.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No active turf health issues.</p>
        <p className={styles.emptyHint}>
          Active and monitoring observations appear here, sorted by severity.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.section}>
      <ul className={styles.obsList}>
        {visible.map(o => (
          <ObservationRow
            key={o.id}
            obs={o}
            attachmentsByParent={attachmentsByParent}
            onOpenViewer={onOpenViewer}
            showStatus
          />
        ))}
      </ul>
    </div>
  )
}

// ── Recent Observations tab ────────────────────────────────────────────────

function RecentObservations({ observations, loading, attachmentsByParent, onOpenViewer }) {
  const { can } = useAuth()
  const toast = useToast()
  const canEdit = can('canEditTurfHealth')

  function handleDelete(o) {
    if (o._pending) {
      dismissPendingObservation(o.clientId)
      return
    }
    if (!window.confirm('Delete this observation? This cannot be undone.')) return
    deleteTurfHealthObservation(o.id).catch(err => {
      toast?.error?.(`Delete failed: ${err.message ?? err}`)
    })
  }

  function handleAddPhoto(o) {
    if (!o || !o.id || o.id.startsWith('pending-')) return
    openPhotoPicker(file => {
      addPhotoToObservation(o.id, file).catch(err => {
        toast?.error?.(`Photo upload failed: ${err.message ?? err}`)
      })
    })
  }

  if (loading && observations.length === 0) {
    return <p className={styles.empty}>Loading…</p>
  }
  if (observations.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No observations yet.</p>
      </div>
    )
  }

  return (
    <div className={styles.section}>
      <ul className={styles.obsList}>
        {observations.slice(0, 50).map(o => (
          <ObservationRow
            key={o.id}
            obs={o}
            attachmentsByParent={attachmentsByParent}
            onOpenViewer={onOpenViewer}
            onAddPhoto={canEdit ? handleAddPhoto : null}
            onDelete={canEdit ? handleDelete : null}
            showStatus
            showRetry
          />
        ))}
      </ul>
    </div>
  )
}

// ── Shared observation row ─────────────────────────────────────────────────

function ObservationRow({
  obs,
  attachmentsByParent,
  onOpenViewer,
  onAddPhoto,
  onDelete,
  showStatus,
  showRetry,
}) {
  const photoCount = !obs._pending
    ? (attachmentsByParent.get(obs.id)?.length ?? 0)
    : 0
  const sevColor = SEVERITY_COLOR[obs.severity] ?? '#888'

  return (
    <li className={styles.obsItem} data-pending={obs._pending ? 'true' : 'false'}>
      <span
        className={styles.severityDot}
        style={{ background: sevColor }}
        aria-hidden="true"
      />
      <div className={styles.obsMain}>
        <div className={styles.obsHeader}>
          <span className={styles.obsLoc}>{obs.location}</span>
          <span className={styles.obsType}>
            <span aria-hidden="true">{healthTypeIcon(obs.healthType)}</span>
            {healthTypeLabel(obs.healthType)}
          </span>
        </div>
        <div className={styles.obsMeta}>
          {obs.severity && (
            <span className={styles.obsSeverity} style={{ color: sevColor }}>
              {SEVERITY_LABELS[obs.severity] ?? obs.severity}
            </span>
          )}
          {showStatus && obs.status && (
            <span className={styles.obsStatus}>{STATUS_LABEL[obs.status] ?? obs.status}</span>
          )}
          <span className={styles.obsTime}>{fmtAgo(obs.observedAt)}</span>
        </div>
        {(obs.surfaceNote || obs.notes) && (
          <p className={styles.obsNote}>{obs.surfaceNote || obs.notes}</p>
        )}
        <div className={styles.obsBadges}>
          {photoCount > 0 && (
            <button
              type="button"
              className={styles.photoChip}
              onClick={() => onOpenViewer?.(obs)}
              title="View photos"
            >
              📷 {photoCount}
            </button>
          )}
          {!obs._pending && photoCount === 0 && onAddPhoto && (
            <button
              type="button"
              className={styles.photoChipEmpty}
              onClick={() => onAddPhoto(obs)}
              title="Add a photo"
            >
              + 📷
            </button>
          )}
          {/* Observation-level retry (7A.2 pattern). */}
          {showRetry && obs._pending && obs._error && (
            <button
              type="button"
              className={styles.retryBadge}
              onClick={() => retryPendingObservation(obs.clientId)}
              title={`Retry — last attempt failed: ${obs._error}`}
            >
              ↻ Retry
            </button>
          )}
          {showRetry && obs._pending && !obs._error && (
            <span className={styles.savingBadge}>Saving…</span>
          )}
          {/* Photo-level retry (7A.4 pattern). */}
          {showRetry && !obs._pending && obs._photoError && (
            <button
              type="button"
              className={styles.retryBadge}
              onClick={() => retryPendingPhoto(obs.clientId)}
              title={`Retry photo — last upload failed: ${obs._photoError}`}
            >
              ↻ Retry photo
            </button>
          )}
          {showRetry && !obs._pending && obs._photoPending && (
            <span className={styles.savingBadge}>Uploading photo…</span>
          )}
        </div>
      </div>
      {onDelete && (
        <button
          type="button"
          className={styles.obsDel}
          onClick={() => onDelete(obs)}
          aria-label={obs._pending ? 'Discard pending observation' : 'Delete observation'}
          title={obs._pending ? 'Discard pending observation' : 'Delete observation'}
        >✕</button>
      )}
    </li>
  )
}
