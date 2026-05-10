import { useState, useMemo } from 'react'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import { EmptyState } from '../../../components/shared/EmptyState'
import styles from '../Spray.module.css'

export default function MixCalculator() {
  const [area, setArea]         = useState('')   // sq ft
  const [rate, setRate]         = useState('')   // oz per 1000 sq ft
  const [carrier, setCarrier]   = useState('')   // gal per 1000 sq ft
  const [tankSize, setTankSize] = useState('')   // gal

  const results = useMemo(() => {
    const a = parseFloat(area)
    const r = parseFloat(rate)
    const c = parseFloat(carrier)
    const t = parseFloat(tankSize)

    if (!a || !r) return null

    const units        = a / 1000
    const totalProduct = units * r
    const totalWater   = c ? units * c : null
    const numTanks     = totalWater && t ? Math.ceil(totalWater / t) : null

    return { totalProduct, totalWater, numTanks }
  }, [area, rate, carrier, tankSize])

  return (
    <div className={styles.tabContent}>
      <WorkspaceSection
        title="Mix Calculator"
        subtitle="Compute total product, water volume, and tank loads for an application."
      >
      <div className={styles.calcLayout}>

        {/* Inputs */}
        <div className={styles.calcPanel}>
          <p className={styles.calcPanelTitle}>Inputs</p>

          <div className={styles.calcField}>
            <label className={styles.calcLabel}>Application Area (sq ft)</label>
            <input
              type="number"
              className={styles.calcInput}
              placeholder="e.g. 50000"
              value={area}
              onChange={e => setArea(e.target.value)}
              min="0"
            />
          </div>

          <div className={styles.calcField}>
            <label className={styles.calcLabel}>Product Rate (oz / 1,000 sq ft)</label>
            <input
              type="number"
              className={styles.calcInput}
              placeholder="e.g. 0.125"
              value={rate}
              onChange={e => setRate(e.target.value)}
              min="0"
              step="0.001"
            />
          </div>

          <div className={styles.calcDivider} />

          <div className={styles.calcField}>
            <label className={styles.calcLabel}>Carrier Volume (gal / 1,000 sq ft) — optional</label>
            <input
              type="number"
              className={styles.calcInput}
              placeholder="e.g. 2"
              value={carrier}
              onChange={e => setCarrier(e.target.value)}
              min="0"
              step="0.1"
            />
          </div>

          <div className={styles.calcField}>
            <label className={styles.calcLabel}>Tank Size (gal) — optional</label>
            <input
              type="number"
              className={styles.calcInput}
              placeholder="e.g. 150"
              value={tankSize}
              onChange={e => setTankSize(e.target.value)}
              min="0"
            />
          </div>
        </div>

        {/* Results */}
        <div className={styles.calcPanel}>
          <p className={styles.calcPanelTitle}>Results</p>

          {!results ? (
            <EmptyState
              compact
              title="Awaiting inputs."
              description="Enter application area and product rate to calculate."
            />
          ) : (
            <div className={styles.resultGrid}>
              <div className={styles.resultItem}>
                <span className={styles.resultLabel}>Total Product Needed</span>
                <span className={styles.resultValue}>
                  {results.totalProduct < 128
                    ? `${results.totalProduct.toFixed(2)} oz`
                    : `${(results.totalProduct / 128).toFixed(2)} gal`}
                  <span className={styles.resultUnit}>
                    {results.totalProduct < 128 ? ` (${(results.totalProduct / 128).toFixed(3)} gal)` : ` (${results.totalProduct.toFixed(1)} oz)`}
                  </span>
                </span>
              </div>

              {results.totalWater !== null && (
                <div className={styles.resultItem}>
                  <span className={styles.resultLabel}>Total Water Needed</span>
                  <span className={styles.resultValue}>
                    {results.totalWater.toFixed(1)}
                    <span className={styles.resultUnit}> gal</span>
                  </span>
                </div>
              )}

              {results.numTanks !== null && (
                <div className={styles.resultItem}>
                  <span className={styles.resultLabel}>Tank Loads Required</span>
                  <span className={styles.resultValue}>
                    {results.numTanks}
                    <span className={styles.resultUnit}> × {tankSize} gal</span>
                  </span>
                </div>
              )}
            </div>
          )}

          <p className={styles.calcNote}>
            Estimates only. Always verify rates against the official product label before application.
          </p>
        </div>

      </div>
      </WorkspaceSection>
    </div>
  )
}
