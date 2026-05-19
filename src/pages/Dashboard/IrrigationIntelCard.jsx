// Phase 28C — Irrigation & Moisture Intelligence dashboard card.
//
// Compact 5-row card in the intelligence row beside GDD, App
// Effectiveness, Agronomic Intelligence, and Spray Window Intelligence.
// Mirrors the density of those cards.
//
// Reads:
//   - useWeather()              → current + forecast (NWS + Ambient)
//   - useWeatherHistoryData()   → captured weather snapshots (D1 backed)
//
// Compose layer: src/utils/irrigation/irrigationIntel.js (which folds
// the existing irrigationEngine summary into the new Phase 28C views).
// Decision-support only — never executes irrigation.

import { useMemo } from 'react'
import { useWeather }              from '../../utils/weather/useWeather'
import { useWeatherHistoryData }   from '../../utils/weather/weatherHistoryStore'
import { computeIrrigationIntel }  from '../../utils/irrigation/irrigationIntel'
import styles from './IrrigationIntelCard.module.css'

function fmtIn(v) {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${v.toFixed(2)}"`
}

const RAIN_CATEGORY_LABEL = {
  none:        'No rain',
  trace:       'Trace',
  light:       'Light',
  effective:   'Effective',
  soaking:     'Soaking',
  runoffRisk:  'Runoff risk',
}

const RAIN_CATEGORY_CLASS = {
  none:        styles.rainNone,
  trace:       styles.rainTrace,
  light:       styles.rainLight,
  effective:   styles.rainEffective,
  soaking:     styles.rainSoaking,
  runoffRisk:  styles.rainRunoff,
}

const WILT_LABEL = { none: 'Low', elevated: 'Elevated', high: 'High' }
const WILT_CLASS = {
  none:     styles.wiltNone,
  elevated: styles.wiltElevated,
  high:     styles.wiltHigh,
}

export default function IrrigationIntelCard() {
  const { current, forecast, loading } = useWeather()
  const { history }                    = useWeatherHistoryData()

  const intel = useMemo(() => computeIrrigationIntel({
    current,
    forecast,
    history,
  }), [current, forecast, history])

  if (loading) {
    return <p className={styles.empty}>Loading conditions…</p>
  }

  const { summary, rainfall24hClass, wilt, consecutive, topRisk } = intel

  // Tonight recommendation: 'skip' when no application is recommended,
  // otherwise show the inches with a why-tooltip from the existing engine.
  const tonightSkip = !summary || summary.recApplication <= 0
  const tonightLabel = tonightSkip ? 'Skip' : `${summary.recApplication.toFixed(2)}"`

  return (
    <div className={styles.wrap}>

      {/* Row 1 — ET today + 24h rain category */}
      <div className={styles.row}>
        <div className={styles.rowLabel}>ET / RAIN</div>
        <div className={styles.rowBody}>
          <span
            className={styles.metricPrimary}
            title={`ET today: ${fmtIn(summary?.etToday)} · 24h rain: ${fmtIn(summary?.rainOffset)}`}
          >
            {fmtIn(summary?.etToday)} ET · {fmtIn(summary?.rainOffset)} rain
          </span>
          <span
            className={`${styles.rainPill} ${RAIN_CATEGORY_CLASS[rainfall24hClass.category] ?? ''}`}
            title={rainfall24hClass.why}
          >
            {RAIN_CATEGORY_LABEL[rainfall24hClass.category]}
          </span>
        </div>
      </div>

      {/* Row 2 — Rolling deficit */}
      <div className={styles.row}>
        <div className={styles.rowLabel}>DEFICIT</div>
        <div className={styles.rowBody}>
          {consecutive.kind === 'known' ? (
            <>
              <span className={styles.metricPrimary}>
                {consecutive.streakDays}d streak
              </span>
              <span className={styles.rowMeta} title={consecutive.why}>
                {consecutive.streakDays >= 3
                  ? 'deficit building'
                  : consecutive.streakDays > 0
                    ? 'within normal range'
                    : 'no deficit'}
              </span>
            </>
          ) : (
            <span className={styles.rowMeta} title={consecutive.why}>
              {consecutive.why}
            </span>
          )}
        </div>
      </div>

      {/* Row 3 — Tonight recommendation */}
      <div className={styles.row}>
        <div className={styles.rowLabel}>TONIGHT</div>
        <div className={styles.rowBody}>
          <span
            className={`${styles.tonightPill} ${tonightSkip ? styles.tonightSkip : styles.tonightApply}`}
            title={
              tonightSkip
                ? 'No application recommended — net deficit covered or below action threshold'
                : `Apply ${fmtIn(summary.recApplication)} — net deficit ${fmtIn(summary.netDeficit)} after rainfall offset`
            }
          >
            {tonightLabel}
          </span>
          {!tonightSkip && summary?.netDeficit != null && (
            <span className={styles.rowMeta}>
              net deficit {fmtIn(summary.netDeficit)}
            </span>
          )}
          {tonightSkip && summary?.rainOffset > 0 && (
            <span className={styles.rowMeta}>
              {summary.rainOffset >= summary.etToday ? 'rainfall offsets ET' : 'no action needed'}
            </span>
          )}
        </div>
      </div>

      {/* Row 4 — Top risk */}
      <div className={styles.row}>
        <div className={styles.rowLabel}>TOP RISK</div>
        <div className={styles.rowBody}>
          {topRisk ? (
            <>
              <span className={`${styles.riskPill} ${
                topRisk.rating === 'high' ? styles.riskHigh : styles.riskCaution
              }`}>
                {topRisk.source}
              </span>
              <span className={styles.rowMeta} title={topRisk.why}>
                {topRisk.why.length > 64 ? topRisk.why.slice(0, 62) + '…' : topRisk.why}
              </span>
            </>
          ) : (
            <span className={styles.rowMeta}>No irrigation risks flagged</span>
          )}
        </div>
      </div>

      {/* Row 5 — Wilt / syringe indicator */}
      <div className={styles.row}>
        <div className={styles.rowLabel}>WILT</div>
        <div className={styles.rowBody}>
          {wilt.kind === 'known' ? (
            <>
              <span
                className={`${styles.wiltPill} ${WILT_CLASS[wilt.rating] ?? ''}`}
                title={wilt.why}
              >
                {WILT_LABEL[wilt.rating]}
              </span>
              {wilt.crossings?.length > 0 && (
                <span className={styles.rowMeta}>
                  {wilt.crossings.join(' · ')}
                </span>
              )}
            </>
          ) : (
            <span className={styles.rowMeta} title={wilt.why}>
              {wilt.why}
            </span>
          )}
        </div>
      </div>

    </div>
  )
}
