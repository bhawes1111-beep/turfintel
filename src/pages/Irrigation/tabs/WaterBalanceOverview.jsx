// Irrigation Intelligence Foundation — Overview (3/3).
//
// Superintendent decision-support surface, not generic analytics. Answers,
// at a glance: how much water did we lose, how much did rain replace, what's
// the rolling deficit, and what's the recent trend — all from REAL persisted
// data (daily_water_balance + weather_observations). Honest empty state
// until captures + rollups accumulate.

import { useMemo } from 'react'
import { useWaterBalance } from '../../../utils/irrigation/waterBalanceStore'
import { useWeatherHistoryData } from '../../../utils/weather/weatherHistoryStore'
import {
  computeWaterBalance,
  deficitSeverity,
  balanceSeries,
} from '../../../utils/irrigation/waterBalance'
import { WEATHER_SOURCE_LABEL, ET_SOURCE_LABEL } from '../../../utils/weather/etSourceStore'
import styles from './WaterBalanceOverview.module.css'

const SEV_COLOR = {
  good:     '#4ade80',
  info:     '#7dd3fc',
  caution:  '#fbbf24',
  warning:  '#fb923c',
  critical: '#ef4444',
}

function inches(v, sign = false) {
  if (v == null || Number.isNaN(v)) return '—'
  const s = sign && v > 0 ? '+' : ''
  return `${s}${Number(v).toFixed(2)}"`
}

function fmtDay(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Lightweight bar chart — same div-height approach as ETCard (no library).
function TrendChart({ title, series, unit = '"', color = '#5ba8a0' }) {
  const max = Math.max(...series.map(s => Math.abs(s.value)), 0.01)
  return (
    <div className={styles.chart}>
      <div className={styles.chartTitle}>{title}</div>
      <div className={styles.chartBars}>
        {series.map((s, i) => {
          const pct = (Math.abs(s.value) / max) * 100
          return (
            <div key={`${s.date}-${i}`} className={styles.chartItem} title={`${s.date}: ${s.value.toFixed(2)}${unit}`}>
              <div className={styles.chartBarTrack}>
                <div
                  className={styles.chartBarFill}
                  style={{ height: `${Math.max(pct, 2)}%`, background: color }}
                />
              </div>
              <div className={styles.chartLabel}>{fmtDay(s.date).split(' ')[1]}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DeficitCard({ label, roll }) {
  const sev = deficitSeverity(roll.deficitIn)
  const color = SEV_COLOR[sev]
  return (
    <div className={styles.statCard} style={{ borderLeftColor: color }}>
      <div className={styles.statValue} style={{ color }}>
        {roll.balanceIn < 0 ? inches(roll.deficitIn) : inches(roll.balanceIn, true)}
      </div>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statSub}>
        {roll.balanceIn < 0 ? 'cumulative deficit' : 'surplus'}
        {roll.partial && ` · ${roll.daysCounted}/${roll.days}d data`}
      </div>
    </div>
  )
}

export default function WaterBalanceOverview() {
  const { balance, loading, error } = useWaterBalance()
  const { history } = useWeatherHistoryData()

  const wb = useMemo(() => computeWaterBalance(balance), [balance])

  const etSeries   = useMemo(() => balanceSeries(balance, 'etIn', 14), [balance])
  const rainSeries = useMemo(() => balanceSeries(balance, 'rainfallIn', 14), [balance])

  // Latest raw observation (newest-first from the history store).
  const latestObs = history?.[0] ?? null

  const TREND_LABEL = {
    drying:  'Drying trend',
    wetting: 'Wetting trend',
    steady:  'Steady',
    unknown: 'Trend unavailable',
  }

  return (
    <div className={styles.wrap}>
      {/* Source attribution */}
      <div className={styles.sourceBar}>
        <span>Live Weather Source: <strong>{WEATHER_SOURCE_LABEL}</strong></span>
        <span>ET Source: <strong>{ET_SOURCE_LABEL}</strong></span>
      </div>

      {error && <p className={styles.error}>Water-balance load error: {error}</p>}

      {loading && balance.length === 0 ? (
        <p className={styles.empty}>Loading water balance…</p>
      ) : !wb.hasData ? (
        <p className={styles.empty}>
          Water-balance intelligence will appear once daily rollups accumulate.
          Snapshots are captured from {WEATHER_SOURCE_LABEL} every 30 minutes and
          rolled into a daily ET / rainfall / net record — check back after the
          first full day of captures.
        </p>
      ) : (
        <>
          {/* Today's balance + trend */}
          <div className={styles.statRow}>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{inches(wb.today.rainfallIn)}</div>
              <div className={styles.statLabel}>Rainfall Today</div>
              <div className={styles.statSub}>{fmtDay(wb.today.date)}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{inches(wb.today.etIn)}</div>
              <div className={styles.statLabel}>ET Today</div>
              <div className={styles.statSub}>
                {wb.today.etSource === 'georgia_weather_network' ? 'GA Network' : 'estimated'}
              </div>
            </div>
            <div className={styles.statCard}>
              <div
                className={styles.statValue}
                style={{ color: wb.today.netIn < 0 ? SEV_COLOR.caution : SEV_COLOR.good }}
              >
                {inches(wb.today.netIn, true)}
              </div>
              <div className={styles.statLabel}>Net Today</div>
              <div className={styles.statSub}>rainfall − ET</div>
            </div>
            <div className={styles.statCard} data-trend={wb.trend}>
              <div className={styles.statValue} style={{ fontSize: 18 }}>
                {wb.trend === 'drying' ? '↓' : wb.trend === 'wetting' ? '↑' : '→'}
              </div>
              <div className={styles.statLabel}>{TREND_LABEL[wb.trend]}</div>
              <div className={styles.statSub}>3-day direction</div>
            </div>
          </div>

          {/* Rolling deficits */}
          <div className={styles.statRow}>
            <DeficitCard label="3-Day Water Deficit"  roll={wb.rolling.d3} />
            <DeficitCard label="7-Day Water Deficit"  roll={wb.rolling.d7} />
            <DeficitCard label="14-Day Water Deficit" roll={wb.rolling.d14} />
          </div>

          {/* Trend charts (real persisted data) */}
          <div className={styles.chartRow}>
            <TrendChart title="ET (in/day)"        series={etSeries}   color="#fbbf24" />
            <TrendChart title="Rainfall (in/day)"  series={rainSeries} color="#38bdf8" />
          </div>

          {/* Latest observation */}
          {latestObs && (
            <div className={styles.latestBar}>
              <span className={styles.latestLabel}>Latest observation</span>
              <span className={styles.latestVal}>
                {latestObs.tempF != null ? `${Math.round(latestObs.tempF)}°F` : '—'}
                {latestObs.humidity != null ? ` · ${latestObs.humidity}% RH` : ''}
                {latestObs.windMph != null ? ` · wind ${Math.round(latestObs.windMph)} mph ${latestObs.windDir ?? ''}` : ''}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
