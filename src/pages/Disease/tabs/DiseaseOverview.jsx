// Disease Overview — real, persisted summary.
//
// Active concerns, high-severity flags, due follow-ups, the Disease Pressure
// Awareness card (explainable environmental read — awareness, NOT prediction),
// and recent fungicide sprays (the treatment-history link). Honest empty
// state when nothing is logged. No fabricated outbreaks, no forecasting.

import { useMemo } from 'react'
import { useDisease } from '../../../utils/disease/diseaseStore'
import { useSpraysData } from '../../../utils/sprays/spraysStore'
import { useWeather } from '../../../utils/weather/useWeather'
import { useMoistureData } from '../../../utils/moisture/moistureStore'
import {
  categorizeObservations,
  highSeverityOpen,
  dueFollowUps,
  recentFungicideSprays,
  recentMoistureFlags,
} from '../../../utils/disease/diseaseView'
import { computeDiseasePressureAwareness } from '../../../utils/disease/diseasePressureAwareness'
import { EmptyState } from '../../../components/shared/EmptyState'
import styles from './DiseaseOverview.module.css'

const fmtDate = iso => {
  if (!iso) return ''
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function AwarenessCard({ awareness }) {
  return (
    <div className={styles.card}>
      <p className={styles.cardLabel}>Disease Pressure Awareness</p>
      <div className={styles.awareTop}>
        <span className={styles.awareLevel} data-level={awareness.level}>{awareness.label}</span>
        <span className={styles.awareSummary}>{awareness.summary}</span>
      </div>
      <ul className={styles.factorList}>
        {awareness.factors.map(f => (
          <li key={f.key} className={styles.factor}>
            <span className={styles.factorName}>{f.label}</span>
            <span className={styles.factorLvl}>{f.level}</span>
            {f.reasons?.length > 0 && <> — {f.reasons.join('; ')}</>}
          </li>
        ))}
      </ul>
      <p className={styles.awareNote}>
        Awareness only — an explainable read of current weather, recent moisture, and active
        observations. This is not a prediction or forecast of disease.
      </p>
    </div>
  )
}

export default function DiseaseOverview() {
  const { observations, loading } = useDisease()
  const { records: sprays } = useSpraysData()
  const weather = useWeather()
  const { observations: moistureObs } = useMoistureData()

  const { active } = useMemo(() => categorizeObservations(observations), [observations])
  const highSev    = useMemo(() => highSeverityOpen(observations), [observations])
  const followUps  = useMemo(() => dueFollowUps(observations), [observations])
  const fungicides = useMemo(() => recentFungicideSprays(sprays ?? []), [sprays])

  const awareness = useMemo(() => computeDiseasePressureAwareness({
    weather: weather.current,
    moistureFlags: recentMoistureFlags(moistureObs),
    observations,
  }), [weather.current, moistureObs, observations])

  const hasAny = observations.length > 0

  // Honest empty state — but still surface the environmental awareness card,
  // since that is real and useful even before any observation is logged.
  if (!hasAny) {
    return (
      <div className={styles.wrap}>
        <AwarenessCard awareness={awareness} />
        {loading ? (
          <p className={styles.empty}>Loading observations…</p>
        ) : (
          <EmptyState
            icon="🔬"
            title="No disease observations yet"
            description="Log what you scout on the Observations tab — disease, location, severity, symptoms, and treatment. Active concerns, high-severity flags, and follow-ups will summarize here. The awareness card above already reflects live conditions."
          />
        )}
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.statRow}>
        <div className={styles.statCard}><span className={styles.statVal}>{active.length}</span><span className={styles.statLbl}>Active concerns</span></div>
        <div className={styles.statCard}><span className={styles.statVal} data-alarm={highSev.length > 0 ? 'true' : 'false'}>{highSev.length}</span><span className={styles.statLbl}>High severity</span></div>
        <div className={styles.statCard}><span className={styles.statVal}>{followUps.length}</span><span className={styles.statLbl}>Due follow-ups</span></div>
      </div>

      <AwarenessCard awareness={awareness} />

      {active.length > 0 && (
        <div className={styles.card}>
          <p className={styles.cardLabel}>Active Concerns</p>
          <ul className={styles.list}>
            {active.slice(0, 8).map(o => (
              <li key={o.id} className={styles.listItem}>
                <span>{o.diseaseName}{o.severity ? ` (${o.severity})` : ''}</span>
                <span className={styles.itemMeta}>{o.location || '—'} · {fmtDate(o.observedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {followUps.length > 0 && (
        <div className={styles.card}>
          <p className={styles.cardLabel}>Follow-ups Due</p>
          <ul className={styles.list}>
            {followUps.map(o => (
              <li key={o.id} className={styles.listItem}>
                <span>{o.diseaseName}</span>
                <span className={styles.itemMeta}>{o.location || '—'} · {fmtDate(o.followUpDate)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.card}>
        <p className={styles.cardLabel}>Recent Fungicide Sprays</p>
        {fungicides.length === 0 ? (
          <p className={styles.empty}>No fungicide applications recorded in the last 45 days. Logged from the Spray Records — not duplicated here.</p>
        ) : (
          <ul className={styles.list}>
            {fungicides.map(s => (
              <li key={s.id} className={styles.listItem}>
                <span className={styles.sprayLink}>{s.products.join(', ') || 'Fungicide'}</span>
                <span className={styles.itemMeta}>{s.target || '—'} · {fmtDate(s.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
