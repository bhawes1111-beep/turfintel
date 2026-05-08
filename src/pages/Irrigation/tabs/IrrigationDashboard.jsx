import styles from '../Irrigation.module.css'

export default function IrrigationDashboard() {
  return (
    <div className={styles.irDashWrap}>
      <div className={styles.irDashGrid}>

        <div className={styles.irDashCard}>
          <p className={styles.irDashCardTitle}>System Status</p>
          <p className={styles.irDashCardSub}>Zone mapping, active/inactive zones, and pressure readings</p>
          <span className={styles.irDashComingSoon}>Coming Soon</span>
        </div>

        <div className={styles.irDashCard}>
          <p className={styles.irDashCardTitle}>Last Irrigation Cycle</p>
          <p className={styles.irDashCardSub}>Cycle summary, runtime by zone, total volume applied</p>
          <span className={styles.irDashComingSoon}>Coming Soon</span>
        </div>

        <div className={styles.irDashCard}>
          <p className={styles.irDashCardTitle}>Pump Station</p>
          <p className={styles.irDashCardSub}>Flow rate, pressure readings, VFD status, and alarms</p>
          <span className={styles.irDashComingSoon}>Coming Soon</span>
        </div>

        <div className={styles.irDashCard}>
          <p className={styles.irDashCardTitle}>Wet / Dry Map</p>
          <p className={styles.irDashCardSub}>Course moisture scouting overlay — hand-watering priorities</p>
          <span className={styles.irDashComingSoon}>Coming Soon</span>
        </div>

        <div className={styles.irDashCard}>
          <p className={styles.irDashCardTitle}>Toro Lynx Integration</p>
          <p className={styles.irDashCardSub}>Live sync with Lynx central controller for scheduling and alarms</p>
          <span className={styles.irDashComingSoon}>Coming Soon</span>
        </div>

        <div className={styles.irDashCard}>
          <p className={styles.irDashCardTitle}>ET &amp; Weather Adjust</p>
          <p className={styles.irDashCardSub}>ET-based runtime adjustments tied to weather station data</p>
          <span className={styles.irDashComingSoon}>Coming Soon</span>
        </div>

      </div>
    </div>
  )
}
