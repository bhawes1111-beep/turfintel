import { useMemo, useState } from 'react'
import WorkspaceSection from '../../components/shared/WorkspaceSection'
import ReportPreviewModal from '../../components/reports/ReportPreviewModal'
import { REPORT_DEFS, isReady } from '../../utils/reports/reportDefs'
import { useEquipmentData } from '../../utils/equipment/equipmentStore'
import { useCulturalPractices } from '../../utils/culturalPractices/culturalPracticesStore'
import { useNutritionData } from '../../utils/nutrition/nutritionStore'
import { useDisease } from '../../utils/disease/diseaseStore'
import { useMoistureData } from '../../utils/moisture/moistureStore'
import { useTurfHealthData } from '../../utils/turfHealth/turfHealthStore'
import { useWeather } from '../../utils/weather/useWeather'
import { useConditionLogs } from '../../utils/conditionLog/conditionLogStore'
import { useSelectedCourse } from '../../utils/courses/courseStore'
import { buildMorningBrief } from '../../utils/operations/morningBrief'
// Phase 7E (1/?) — Spray Intelligence report wiring. Bundle keys
// 'sprays', 'inventoryProducts', 'catalogProducts', and 'labelsByItemId'
// feed the new Spray Intelligence report def.
import { useSpraysData } from '../../utils/sprays/spraysStore'
import { useInventoryData } from '../../utils/inventory/inventoryStore'
import { useProductCatalog } from '../../utils/productCatalog/productCatalogStore'
import { useImportedLabels } from '../../utils/inventory/labelImportStore'
// Phase 7G (1/?) — Spray Program report bundle inputs.
import { useSprayPrograms } from '../../utils/sprayPrograms/sprayProgramStore'
import styles from './Reports.module.css'

/**
 * Reports hub — registry-driven generator.
 *
 * The hub does NOT know how to build any specific report. It fetches the
 * raw stores it needs, packages them into a bundle keyed to match each
 * registry entry's `requires`, then maps over REPORT_DEFS and renders one
 * card per entry. Clicking a ready card builds the report and opens the
 * shared ReportPreviewModal. Nothing else is module-aware here.
 *
 * Frontend-only: no API calls, no mutations, no schema changes — only
 * read-only consumption of existing stores plus the pure builders from
 * src/utils/reports/reportBuilder.js.
 */
export default function Reports() {
  const equipment        = useEquipmentData()
  const cultural         = useCulturalPractices()
  const nutrition        = useNutritionData()
  const disease          = useDisease()
  const moisture         = useMoistureData()
  const turfHealth       = useTurfHealthData()
  const weather          = useWeather()
  const conditionLogs    = useConditionLogs()
  const selectedCourse   = useSelectedCourse()
  // Phase 7E (1/?) — inputs for Spray Intelligence report.
  const sprays           = useSpraysData()
  const inventory        = useInventoryData()
  const catalog          = useProductCatalog()
  const importedLabels   = useImportedLabels()
  // Phase 7G (1/?) — inputs for Spray Program report.
  const sprayPrograms    = useSprayPrograms()

  const [activeReport, setActiveReport] = useState(null)

  // Latest condition log → minimum input for the brief's Course Status section.
  const latestConditionLog = conditionLogs?.logs?.[0] ?? null

  // Minimal morning-brief snapshot. The Operations page assembles a richer
  // snapshot (derived impacts, watchAreas, etc.); the hub stays read-only
  // and feeds only what's directly available from stores. Missing sections
  // are gracefully omitted by buildMorningBrief.
  const morningBrief = useMemo(() => buildMorningBrief({
    weatherCurrent: weather?.current ?? null,
    conditionLog:   latestConditionLog,
  }, {
    courseName:  selectedCourse?.shortName ?? selectedCourse?.name ?? null,
    generatedAt: new Date().toISOString().slice(0, 10),
  }), [weather?.current, latestConditionLog, selectedCourse])

  // Bundle: keys must match each ReportDef's `requires`. Each value either
  // is the raw data or carries { loading, error } so isReady() can disable
  // cards whose dependencies aren't resolved yet.
  const bundle = useMemo(() => ({
    maintenanceLogs: equipment.loading || equipment.error
      ? { loading: equipment.loading, error: equipment.error }
      : (equipment.serviceLog ?? []),

    culturalPractices: cultural.loading || cultural.error
      ? { loading: cultural.loading, error: cultural.error }
      : (cultural.practices ?? []),

    nutrition: nutrition.loading || nutrition.error
      ? { loading: nutrition.loading, error: nutrition.error }
      : {
          // Static lab-report fixtures aren't in any store yet; supply empty
          // arrays so the builder still produces a valid envelope.
          soilReports:     [],
          tissueReports:   [],
          waterReports:    [],
          recommendations: nutrition.applications ?? [],
        },

    diseaseObservations: disease.loading || disease.error
      ? { loading: disease.loading, error: disease.error }
      : (disease.observations ?? []),

    moistureObservations: moisture.loading || moisture.error
      ? { loading: moisture.loading, error: moisture.error }
      : (moisture.observations ?? []),

    turfHealthObservations: turfHealth.loading || turfHealth.error
      ? { loading: turfHealth.loading, error: turfHealth.error }
      : (turfHealth.observations ?? []),

    // Phase 7E (1/?) — Spray Intelligence report inputs. Each bundle
    // key independently surfaces { loading, error } so a single slow
    // store doesn't block adjacent reports' cards.
    sprays: sprays.loading || sprays.error
      ? { loading: sprays.loading, error: sprays.error }
      : (sprays.records ?? []),

    inventoryProducts: inventory.loading || inventory.error
      ? { loading: inventory.loading, error: inventory.error }
      : (inventory.items ?? []),

    catalogProducts: catalog.loading || catalog.error
      ? { loading: catalog.loading, error: catalog.error }
      : (catalog.products ?? []),

    labelsByItemId: importedLabels.loading || importedLabels.error
      ? { loading: importedLabels.loading, error: importedLabels.error }
      : (() => {
          // Same indexing the live Spray Builder uses — keep the shape
          // identical so the helper resolver finds rows consistently.
          const out = {}
          for (const lbl of importedLabels.labels ?? []) {
            if (lbl?.inventoryItemId) out[lbl.inventoryItemId] = lbl
          }
          return out
        })(),

    // Phase 7G (1/?) — Spray Program report inputs.
    // - `programs` mirrors the store array (defaults to non-archived).
    // - `itemsByProgramId` is the lazy per-program cache the planner
    //   populates on selection. The report builder surfaces an explicit
    //   notice for programs whose items haven't been loaded yet so the
    //   user can refresh / open those programs to fill the cache.
    programs: sprayPrograms.loading || sprayPrograms.error
      ? { loading: sprayPrograms.loading, error: sprayPrograms.error }
      : (sprayPrograms.programs ?? []),

    itemsByProgramId: sprayPrograms.loading || sprayPrograms.error
      ? { loading: sprayPrograms.loading, error: sprayPrograms.error }
      : (sprayPrograms.itemsByProgramId ?? {}),

    morningBrief,
  }), [equipment, cultural, nutrition, disease, moisture, turfHealth,
       sprays, inventory, catalog, importedLabels, sprayPrograms, morningBrief])

  const courseInfo = useMemo(() => ({
    name:           selectedCourse?.name ?? selectedCourse?.shortName ?? '',
    superintendent: selectedCourse?.superintendent ?? '',
  }), [selectedCourse])

  function handleGenerate(def) {
    try {
      const report = def.build(bundle)
      setActiveReport(report)
    } catch (err) {
      // Pure builders should not throw on well-typed input, but if a future
      // entry mis-wires its bundle key we surface that instead of silently
      // showing nothing.
      console.error(`Report build failed for ${def.id}:`, err)
    }
  }

  return (
    <div className={styles.tabContent}>
      <WorkspaceSection
        title="Reports"
        subtitle="Generate operational, agronomic, and equipment reports from current course data."
      >
        <div className={styles.reportsGrid}>
          {REPORT_DEFS.map(def => {
            const ready = isReady(def, bundle)
            return (
              <div key={def.id} className={styles.reportCard}>
                <div className={styles.reportCardHeader}>
                  <span className={styles.reportModule}>{def.module}</span>
                </div>
                <p className={styles.reportTitle}>{def.title}</p>
                <p className={styles.reportDesc}>{def.desc}</p>
                <button
                  className={styles.reportBtn}
                  onClick={() => handleGenerate(def)}
                  disabled={!ready}
                  title={ready ? undefined : 'Waiting for data to load.'}
                >
                  {ready ? 'Generate →' : 'Loading…'}
                </button>
              </div>
            )
          })}
        </div>
      </WorkspaceSection>

      <ReportPreviewModal
        report={activeReport}
        onClose={() => setActiveReport(null)}
        courseInfo={courseInfo}
      />
    </div>
  )
}
