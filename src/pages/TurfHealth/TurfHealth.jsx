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
import { useLocation, useNavigate } from 'react-router-dom'
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
  HEALTH_TYPE_LABELS,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
} from '../../utils/turfHealth/healthTypes'
import TurfHealthPhotoViewer from '../../components/turfHealth/TurfHealthPhotoViewer'
import TurfHealthCaptureSheet, { useRecentTurfHealthLocations } from '../../components/turfHealth/TurfHealthCaptureSheet'
import TurfHealthEditModal from '../../components/turfHealth/TurfHealthEditModal'
import NutrientSamples from '../../components/turfHealth/NutrientSamples'
import styles from './TurfHealth.module.css'

const TABS = ['Overview', 'Nutrients', 'Active Issues', 'Recent Observations', 'Resolved']

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

function fmtDate(value) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Workspace shell ────────────────────────────────────────────────────────

export default function TurfHealth() {
  const navigate = useNavigate()
  const location = useLocation()
  const requestedTab = TABS.includes(location.state?.activeTab) ? location.state.activeTab : 'Overview'
  const [activeTab, setActiveTab] = useState(requestedTab)
  const [viewerObs, setViewerObs] = useState(null)
  const [editObs, setEditObs] = useState(null)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')

  const { can } = useAuth()
  const canEdit = can('canEditTurfHealth')
  const { observations, loading, error } = useTurfHealthData()
  const { byParent: attachmentsByParent } = useTurfHealthAttachments()
  const recentLocations = useRecentTurfHealthLocations()

  const filteredObservations = useMemo(() => {
    const search = query.trim().toLowerCase()
    return observations.filter(observation => {
      if (typeFilter !== 'all' && observation.healthType !== typeFilter) return false
      if (severityFilter !== 'all' && observation.severity !== severityFilter) return false
      if (!search) return true
      const searchable = [
        observation.location,
        healthTypeLabel(observation.healthType),
        observation.surfaceNote,
        observation.notes,
        STATUS_LABEL[observation.status],
      ].filter(Boolean).join(' ').toLowerCase()
      return searchable.includes(search)
    })
  }, [observations, query, typeFilter, severityFilter])

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
      {activeTab !== 'Nutrients' && <div className={styles.toolbar}>
        <div className={styles.filters}>
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search location, type, or notes..."
            aria-label="Search turf health observations"
          />
          <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} aria-label="Filter by issue type">
            <option value="all">All issue types</option>
            {Object.entries(HEALTH_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select value={severityFilter} onChange={event => setSeverityFilter(event.target.value)} aria-label="Filter by severity">
            <option value="all">All severities</option>
            <option value="high">High</option>
            <option value="moderate">Moderate</option>
            <option value="low">Low</option>
          </select>
        </div>
        {canEdit && (
          <button type="button" className={styles.newButton} onClick={() => setCaptureOpen(true)}>
            + New Observation
          </button>
        )}
      </div>}

      {error && <p className={styles.error}>Load error: {error}</p>}

      {activeTab === 'Overview' && (
        <Overview
          observations={observations}
          loading={loading}
          attachmentsByParent={attachmentsByParent}
          onOpenViewer={setViewerObs}
        />
      )}

      {activeTab === 'Nutrients' && (
        <NutrientSamples
          key={location.state?.nutrientSampleId || 'nutrients'}
          canEdit={canEdit}
          initialSampleId={location.state?.nutrientSampleId ?? ''}
          onStartApplication={sample => navigate('/spray', {
            state: {
              activeTab: 'New Application',
              nutrientSampleId: sample.id,
              area: sample.location,
            },
          })}
        />
      )}

      {activeTab === 'Active Issues' && (
        <ActiveIssues
          observations={filteredObservations}
          loading={loading}
          attachmentsByParent={attachmentsByParent}
          onOpenViewer={setViewerObs}
          onEdit={canEdit ? setEditObs : null}
        />
      )}

      {activeTab === 'Resolved' && (
        <ResolvedIssues
          observations={filteredObservations}
          loading={loading}
          attachmentsByParent={attachmentsByParent}
          onOpenViewer={setViewerObs}
          onEdit={canEdit ? setEditObs : null}
        />
      )}

      {activeTab === 'Recent Observations' && (
        <RecentObservations
          observations={filteredObservations}
          loading={loading}
          attachmentsByParent={attachmentsByParent}
          onOpenViewer={setViewerObs}
          onEdit={canEdit ? setEditObs : null}
        />
      )}

      <TurfHealthPhotoViewer
        observation={viewerObs}
        attachments={viewerAttachments}
        onClose={() => setViewerObs(null)}
      />
      {captureOpen && (
        <TurfHealthCaptureSheet
          recentLocations={recentLocations}
          onClose={() => setCaptureOpen(false)}
        />
      )}
      {editObs && (
        <TurfHealthEditModal observation={editObs} onClose={() => setEditObs(null)} />
      )}
    </PageShell>
  )
}

// ── Overview tab ───────────────────────────────────────────────────────────

function Overview({ observations, loading, attachmentsByParent, onOpenViewer }) {
  const stats = useMemo(() => {
    const active     = observations.filter(o => o.status === 'active'     || o.status === 'monitoring').length
    const high       = observations.filter(o => o.severity === 'high'     && o.status !== 'resolved').length
    const resolved   = observations.filter(o => o.status === 'resolved').length
    const total      = observations.length
    // Per-type counts (active + monitoring only).
    const byType = {}
    for (const o of observations) {
      if (o.status === 'resolved') continue
      if (!o.healthType) continue
      byType[o.healthType] = (byType[o.healthType] ?? 0) + 1
    }
    const byTypeList = Object.entries(byType).sort((a, b) => b[1] - a[1])
    return { active, high, resolved, total, byTypeList }
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
        <StatCard label="Resolved"            value={stats.resolved} />
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

function ActiveIssues({ observations, loading, attachmentsByParent, onOpenViewer, onEdit }) {
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
            onEdit={onEdit}
            showStatus
          />
        ))}
      </ul>
    </div>
  )
}

// ── Recent Observations tab ────────────────────────────────────────────────

function RecentObservations({ observations, loading, attachmentsByParent, onOpenViewer, onEdit }) {
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
            onEdit={!o._pending ? onEdit : null}
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

function ResolvedIssues({ observations, loading, attachmentsByParent, onOpenViewer, onEdit }) {
  const resolved = useMemo(
    () => observations
      .filter(observation => observation.status === 'resolved' && !observation._pending)
      .sort((a, b) => (b.updatedAt ?? b.observedAt ?? '').localeCompare(a.updatedAt ?? a.observedAt ?? '')),
    [observations],
  )

  if (loading && observations.length === 0) {
    return <p className={styles.empty}>Loading...</p>
  }
  if (resolved.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No resolved turf health issues.</p>
        <p className={styles.emptyHint}>Resolved observations remain archived here and can be reopened.</p>
      </div>
    )
  }

  return (
    <div className={styles.section}>
      <ul className={styles.obsList}>
        {resolved.map(observation => (
          <ObservationRow
            key={observation.id}
            obs={observation}
            attachmentsByParent={attachmentsByParent}
            onOpenViewer={onOpenViewer}
            onEdit={onEdit}
            showStatus
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
  onEdit,
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
          {obs.followUpDate && (
            <span className={styles.followUp}>Follow-up {fmtDate(obs.followUpDate)}</span>
          )}
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
      {onEdit && (
        <button
          type="button"
          className={styles.editButton}
          onClick={() => onEdit(obs)}
        >Edit</button>
      )}
    </li>
  )
}
