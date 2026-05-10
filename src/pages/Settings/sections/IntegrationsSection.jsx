/**
 * IntegrationsSection — external service connections.
 * Status reflects what is actually wired today (no invented connections).
 */

import styles from '../Settings.module.css'

const INTEGRATIONS = [
  {
    name:   'Cloudflare Workers',
    desc:   'App hosting + asset delivery.',
    status: 'connected',
    detail: 'turfintel.bhawes1111.workers.dev',
  },
  {
    name:   'Google Earth · KML',
    desc:   'Drag-and-drop KML import for course map layers.',
    status: 'connected',
    detail: 'KML 2.2 (plain only — KMZ not supported)',
  },
  {
    name:   'Weather.gov · NOAA',
    desc:   'Live forecast + ET + spray window data.',
    status: 'connected',
    detail: 'Station KSAV',
  },
  {
    name:   'Toro Lynx Irrigation',
    desc:   'IRX import for irrigation heads + sprinkler routes.',
    status: 'stub',
    detail: 'Adapter scaffolded; awaiting sample IRX file',
  },
  {
    name:   'Emlid Reach RS2+ GPS',
    desc:   'High-precision survey points / lines.',
    status: 'stub',
    detail: 'Adapter scaffolded; awaiting sample export',
  },
  {
    name:   'GPS Mapping Tools',
    desc:   'Generic GeoJSON ingestion (QGIS, etc.).',
    status: 'stub',
    detail: 'Adapter scaffolded; not wired into UI',
  },
]

const STATUS_META = {
  connected:    { label: 'Connected',     cls: 'statusPillConnected'    },
  stub:         { label: 'Stub',          cls: 'statusPillStub'         },
  notConfigured:{ label: 'Not Configured',cls: 'statusPillNotConfigured'},
}

export default function IntegrationsSection() {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <p className={styles.cardTitle}>Integrations</p>
      </div>
      <p className={styles.cardDesc}>External services and their current connection status.</p>

      {INTEGRATIONS.map(int => {
        const meta = STATUS_META[int.status]
        return (
          <div key={int.name} className={styles.row}>
            <div className={styles.rowStack}>
              <span className={styles.rowLabel}>{int.name}</span>
              <span className={styles.rowDesc}>{int.desc} · <em>{int.detail}</em></span>
            </div>
            <span className={`${styles.statusPill} ${styles[meta.cls]}`}>
              <span className={styles.statusDot} />
              {meta.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
