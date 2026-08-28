import { useMemo, useState } from 'react'
import WorkspaceSection from '../../components/shared/WorkspaceSection'
import ReportPreviewModal from '../../components/reports/ReportPreviewModal'
import { REPORT_DEFS, isReady } from '../../utils/reports/reportDefs'
import { buildAgronomyProgressReport } from '../../utils/reports/reportBuilder'
import { useEquipmentData } from '../../utils/equipment/equipmentStore'
import { useCulturalPractices } from '../../utils/culturalPractices/culturalPracticesStore'
import { useNutritionData } from '../../utils/nutrition/nutritionStore'
import { useDisease } from '../../utils/disease/diseaseStore'
import { useMoistureData } from '../../utils/moisture/moistureStore'
import { useTurfHealthData } from '../../utils/turfHealth/turfHealthStore'
import { useWeather } from '../../utils/weather/useWeather'
import { useConditionLogs } from '../../utils/conditionLog/conditionLogStore'
import { useSelectedCourse } from '../../utils/courses/courseStore'
import { useAssignmentsData } from '../../utils/assignments/assignmentsStore'
import { useCalendarData } from '../../utils/calendar/calendarStore'
import { useCrewData } from '../../utils/crew/crewStore'
import { useTaskTemplatesData } from '../../utils/tasks/taskTemplateStore'
import { useEmployeeSchedulesData } from '../../utils/schedules/schedulesStore'
import { useScheduleOverridesData } from '../../utils/schedules/scheduleOverridesStore'
import { useRepairsData } from '../../utils/repairs/repairsStore'
import { useWeeklyGoalsData } from '../../utils/operations/weeklyGoalsStore'
import { useYearlyGoalsData } from '../../utils/operations/yearlyGoalsStore'
import { buildMorningBrief } from '../../utils/operations/morningBrief'
// Phase 7E (1/?) — Spray Intelligence report wiring. Bundle keys
// 'sprays', 'inventoryProducts', 'catalogProducts', and 'labelsByItemId'
// feed the new Spray Intelligence report def.
import { useSpraysData } from '../../utils/sprays/spraysStore'
import { useInventoryData } from '../../utils/inventory/inventoryStore'
import { useProductCatalog } from '../../utils/productCatalog/productCatalogStore'
import { useImportedLabels } from '../../utils/inventory/labelImportStore'
import { defaultOwnerReportRange, ownerReportEndDate } from '../../utils/reports/reportDateRange'
import {
  deleteAttachment,
  updateAttachment,
  uploadAttachment,
  useAttachmentsForParent,
} from '../../utils/attachments/attachmentsStore'
import styles from './Reports.module.css'

const initialOwnerReportRange = defaultOwnerReportRange()
const OWNER_PHOTO_LIMIT = 12
const OWNER_PHOTO_MAX_BYTES = 8 * 1024 * 1024
const OWNER_PHOTO_PARENT = {
  improvement: 'owner-report-improvement',
  concern:     'owner-report-concern',
}

function ownerPhotoFromAttachment(attachment, category) {
  const url = attachment?.url
    ? new URL(attachment.url, window.location.origin).href
    : ''
  return {
    id: attachment.id,
    filename: attachment.fileName || 'Report photo',
    type: 'image',
    size: attachment.fileSize || 0,
    thumbnailUrl: url,
    url,
    category,
    caption: attachment.caption || '',
    uploadedAt: attachment.createdAt || '',
    persisted: true,
  }
}

function formatOwnerPhotoDate(value) {
  const dateKey = String(value ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return 'Date unavailable'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${dateKey}T00:00:00Z`))
}

const OWNER_REPORT_SECTIONS = [
  { key: 'yearlyGoals', label: 'Yearly goals and status' },
  { key: 'weeklyGoals', label: 'Weekly goals and status' },
  { key: 'labor',       label: 'Payroll' },
  { key: 'hours',       label: 'Payroll hours' },
  { key: 'maintenance', label: 'Equipment' },
  { key: 'irrigation',  label: 'Irrigation repairs' },
  { key: 'plannedApplications', label: 'Planned applications' },
  { key: 'sprays',      label: 'Liquid applications' },
  { key: 'fertilizer',  label: 'Granular applications' },
  { key: 'tasks',       label: 'Tasks and weather delays' },
]

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
  const improvementPhotos = useAttachmentsForParent(
    'owner_report_photo',
    OWNER_PHOTO_PARENT.improvement,
  )
  const concernPhotos = useAttachmentsForParent(
    'owner_report_photo',
    OWNER_PHOTO_PARENT.concern,
  )
  const assignments      = useAssignmentsData()
  const calendar         = useCalendarData()
  const crew             = useCrewData()
  const taskTemplates    = useTaskTemplatesData()
  const employeeSchedules = useEmployeeSchedulesData()
  const scheduleOverrides = useScheduleOverridesData()
  const irrigationRepairs = useRepairsData()
  const weeklyGoals      = useWeeklyGoalsData()
  const yearlyGoals      = useYearlyGoalsData()
  // Phase 7E (1/?) — inputs for Spray Intelligence report.
  const sprays           = useSpraysData()
  const inventory        = useInventoryData()
  const catalog          = useProductCatalog()
  const importedLabels   = useImportedLabels()
  const [activeReport, setActiveReport] = useState(null)
  const [ownerReportGenerating, setOwnerReportGenerating] = useState(false)
  const [ownerPhotos, setOwnerPhotos] = useState([])
  const [ownerPhotoError, setOwnerPhotoError] = useState('')
  const [ownerPhotoUploading, setOwnerPhotoUploading] = useState(false)
  const [ownerPhotoNameDrafts, setOwnerPhotoNameDrafts] = useState({})
  const [ownerPhotoRenamingId, setOwnerPhotoRenamingId] = useState('')
  const [ownerReportForm, setOwnerReportForm] = useState(() => ({
    startDate: initialOwnerReportRange.startDate,
    endDate:   initialOwnerReportRange.endDate,
    sections: {
      tasks:       false,
      weeklyGoals: true,
      yearlyGoals: true,
      plannedApplications: false,
      sprays:      true,
      fertilizer:  true,
      maintenance: true,
      irrigation:  false,
      labor:       false,
      hours:       false,
    },
    notes: '',
  }))

  // Latest condition log → minimum input for the brief's Course Status section.
  const latestConditionLog = conditionLogs?.logs?.[0] ?? null
  const weatherCurrent = weather?.current ?? null
  const morningBriefCourseName = selectedCourse?.shortName ?? selectedCourse?.name ?? null

  // Minimal morning-brief snapshot. The Operations page assembles a richer
  // snapshot (derived impacts, watchAreas, etc.); the hub stays read-only
  // and feeds only what's directly available from stores. Missing sections
  // are gracefully omitted by buildMorningBrief.
  const morningBrief = useMemo(() => buildMorningBrief({
    weatherCurrent,
    conditionLog:   latestConditionLog,
  }, {
    courseName:  morningBriefCourseName,
    generatedAt: new Date().toISOString().slice(0, 10),
  }), [weatherCurrent, latestConditionLog, morningBriefCourseName])

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

    nutritionApplications: nutrition.loading || nutrition.error
      ? { loading: nutrition.loading, error: nutrition.error }
      : (nutrition.applications ?? []),

    diseaseObservations: disease.loading || disease.error
      ? { loading: disease.loading, error: disease.error }
      : (disease.observations ?? []),

    moistureObservations: moisture.loading || moisture.error
      ? { loading: moisture.loading, error: moisture.error }
      : (moisture.observations ?? []),

    turfHealthObservations: turfHealth.loading || turfHealth.error
      ? { loading: turfHealth.loading, error: turfHealth.error }
      : (turfHealth.observations ?? []),

    crewAssignments: assignments.loading || assignments.error
      ? { loading: assignments.loading, error: assignments.error }
      : (assignments.crewAssignments ?? []),

    calendarEvents: calendar.loading || calendar.error
      ? { loading: calendar.loading, error: calendar.error }
      : (calendar.events ?? []),

    employees: crew.loading || crew.error
      ? { loading: crew.loading, error: crew.error }
      : (crew.employees ?? []),

    taskTemplates: taskTemplates.loading || taskTemplates.error
      ? { loading: taskTemplates.loading, error: taskTemplates.error }
      : (taskTemplates.templates ?? []),

    weeklySchedules: employeeSchedules.loading || employeeSchedules.error
      ? { loading: employeeSchedules.loading, error: employeeSchedules.error }
      : (employeeSchedules.schedules ?? []),

    scheduleOverrides: scheduleOverrides.loading || scheduleOverrides.error
      ? { loading: scheduleOverrides.loading, error: scheduleOverrides.error }
      : (scheduleOverrides.overrides ?? []),

    irrigationRepairs: irrigationRepairs.loading || irrigationRepairs.error
      ? { loading: irrigationRepairs.loading, error: irrigationRepairs.error }
      : (irrigationRepairs.repairs ?? []),

    weeklyGoals: weeklyGoals.loading || weeklyGoals.error
      ? { loading: weeklyGoals.loading, error: weeklyGoals.error }
      : (weeklyGoals.goals ?? []),

    yearlyGoals: yearlyGoals.loading || yearlyGoals.error
      ? { loading: yearlyGoals.loading, error: yearlyGoals.error }
      : (yearlyGoals.goals ?? []),

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

    morningBrief,
  }), [equipment, cultural, nutrition, disease, moisture, turfHealth,
       assignments, calendar, crew, taskTemplates,
       employeeSchedules, scheduleOverrides, irrigationRepairs, weeklyGoals, yearlyGoals,
       sprays, inventory, catalog, importedLabels, morningBrief])

  const courseInfo = useMemo(() => ({
    name:           selectedCourse?.name ?? selectedCourse?.shortName ?? '',
    superintendent: selectedCourse?.superintendent ?? '',
  }), [selectedCourse])

  const ownerPhotoLibrary = useMemo(() => [
    ...(improvementPhotos.attachments ?? []).map(photo => ownerPhotoFromAttachment(photo, 'improvement')),
    ...(concernPhotos.attachments ?? []).map(photo => ownerPhotoFromAttachment(photo, 'concern')),
  ], [improvementPhotos.attachments, concernPhotos.attachments])

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

  const ownerReportReady = isReady({
    requires: [
      'crewAssignments',
      'calendarEvents',
      'taskTemplates',
      'sprays',
      'nutritionApplications',
      'maintenanceLogs',
      'employees',
      'weeklySchedules',
      'scheduleOverrides',
      'irrigationRepairs',
      'weeklyGoals',
      'yearlyGoals',
    ],
  }, bundle)

  function setOwnerField(key, value) {
    setOwnerReportForm(prev => ({ ...prev, [key]: value }))
  }

  function setOwnerStartDate(startDate) {
    setOwnerReportForm(prev => ({
      ...prev,
      startDate,
      endDate: ownerReportEndDate(startDate),
    }))
  }

  function toggleOwnerSection(key) {
    setOwnerReportForm(prev => ({
      ...prev,
      sections: {
        ...prev.sections,
        [key]: !prev.sections[key],
      },
    }))
  }

  async function addOwnerPhotos(category, fileList) {
    const available = Math.max(0, OWNER_PHOTO_LIMIT - ownerPhotos.length)
    const files = Array.from(fileList ?? []).slice(0, available)
    const invalid = files.find(file => !file.type.startsWith('image/') || file.size > OWNER_PHOTO_MAX_BYTES)
    if (invalid) {
      setOwnerPhotoError('Photos must be image files no larger than 8 MB.')
      return
    }
    if (files.length === 0) {
      setOwnerPhotoError(ownerPhotos.length >= OWNER_PHOTO_LIMIT ? `A report can include up to ${OWNER_PHOTO_LIMIT} photos.` : '')
      return
    }
    setOwnerPhotoUploading(true)
    try {
      const results = await Promise.allSettled(files.map(file => uploadAttachment({
        parentType: 'owner_report_photo',
        parentId: OWNER_PHOTO_PARENT[category],
        file,
      })))
      const photos = results
        .filter(result => result.status === 'fulfilled')
        .map(result => ownerPhotoFromAttachment(result.value, category))
      setOwnerPhotos(current => {
        const existing = new Set(current.map(photo => photo.id))
        return [...current, ...photos.filter(photo => !existing.has(photo.id))].slice(0, OWNER_PHOTO_LIMIT)
      })
      await (category === 'improvement' ? improvementPhotos.refresh() : concernPhotos.refresh())
      const failed = results.length - photos.length
      setOwnerPhotoError(failed ? `${failed} photo${failed === 1 ? '' : 's'} could not be saved.` : '')
    } catch (error) {
      setOwnerPhotoError(error.message || 'A photo could not be saved.')
    } finally {
      setOwnerPhotoUploading(false)
    }
  }

  function updateOwnerPhoto(id, patch) {
    setOwnerPhotos(current => current.map(photo => photo.id === id ? { ...photo, ...patch } : photo))
  }

  function removeOwnerPhoto(id) {
    setOwnerPhotos(current => current.filter(photo => photo.id !== id))
    setOwnerPhotoError('')
  }

  function addSavedOwnerPhoto(photo) {
    setOwnerPhotos(current => {
      if (current.some(item => item.id === photo.id)) return current
      if (current.length >= OWNER_PHOTO_LIMIT) return current
      return [...current, photo]
    })
    setOwnerPhotoError(ownerPhotos.length >= OWNER_PHOTO_LIMIT
      ? `A report can include up to ${OWNER_PHOTO_LIMIT} photos.`
      : '')
  }

  async function saveOwnerPhotoCaption(photo) {
    try {
      await updateAttachment(photo.id, { caption: photo.caption })
      await (photo.category === 'improvement' ? improvementPhotos.refresh() : concernPhotos.refresh())
      setOwnerPhotoError('')
    } catch (error) {
      setOwnerPhotoError(error.message || 'The photo caption could not be saved.')
    }
  }

  async function renameSavedOwnerPhoto(photo, nextValue) {
    const fileName = String(nextValue ?? '').trim().replace(/\s+/g, ' ')
    if (!fileName) {
      setOwnerPhotoError('Photo name cannot be blank.')
      return
    }
    setOwnerPhotoRenamingId(photo.id)
    try {
      const saved = await updateAttachment(photo.id, { fileName })
      setOwnerPhotos(current => current.map(item => (
        item.id === photo.id ? { ...item, filename: saved.fileName || fileName } : item
      )))
      setOwnerPhotoNameDrafts(current => {
        const next = { ...current }
        delete next[photo.id]
        return next
      })
      await (photo.category === 'improvement' ? improvementPhotos.refresh() : concernPhotos.refresh())
      setOwnerPhotoError('')
    } catch (error) {
      setOwnerPhotoError(error.message || 'The photo name could not be saved.')
    } finally {
      setOwnerPhotoRenamingId('')
    }
  }

  async function deleteSavedOwnerPhoto(photo) {
    try {
      await deleteAttachment(photo.id)
      setOwnerPhotos(current => current.filter(item => item.id !== photo.id))
      await (photo.category === 'improvement' ? improvementPhotos.refresh() : concernPhotos.refresh())
      setOwnerPhotoError('')
    } catch (error) {
      setOwnerPhotoError(error.message || 'The saved photo could not be deleted.')
    }
  }

  async function handleGenerateOwnerReport() {
    if (!ownerReportReady || ownerReportGenerating) return
    setOwnerReportGenerating(true)
    try {
      const report = buildAgronomyProgressReport({
        crewAssignments:       bundle.crewAssignments,
        calendarEvents:        bundle.calendarEvents,
        taskTemplates:         bundle.taskTemplates,
        sprays:                bundle.sprays,
        nutritionApplications: bundle.nutritionApplications,
        maintenanceLogs:       bundle.maintenanceLogs,
        employees:             bundle.employees,
        weeklySchedules:       bundle.weeklySchedules,
        scheduleOverrides:     bundle.scheduleOverrides,
        irrigationRepairs:     bundle.irrigationRepairs,
        weeklyGoals:            bundle.weeklyGoals,
        yearlyGoals:            bundle.yearlyGoals,
      }, {
        startDate:  ownerReportForm.startDate || null,
        endDate:    ownerReportForm.endDate || null,
        include:    ownerReportForm.sections,
        ownerNotes: ownerReportForm.notes,
        ownerPhotos,
        courseName: courseInfo.name,
      })
      setActiveReport(report)
    } catch (err) {
      console.error('Owner report failed:', err)
    } finally {
      setOwnerReportGenerating(false)
    }
  }

  return (
    <div className={styles.tabContent}>
      <WorkspaceSection
        title="Reports"
        subtitle="Generate operational, agronomic, and equipment reports from current course data."
      >
        <div className={styles.ownerReportCard}>
          <div className={styles.ownerReportHeader}>
            <div>
              <span className={styles.reportModule}>owner</span>
              <p className={styles.ownerReportTitle}>Agronomy Progress Report</p>
            </div>
            <button
              type="button"
              className={styles.ownerReportBtn}
              onClick={handleGenerateOwnerReport}
              disabled={!ownerReportReady || ownerReportGenerating}
              title={ownerReportReady ? undefined : 'Waiting for data to load.'}
            >
              {ownerReportGenerating ? 'Loading planned applications...' : (ownerReportReady ? 'Generate owner report' : 'Loading...')}
            </button>
          </div>

          <div className={styles.ownerReportControls}>
            <label className={styles.ownerField}>
              <span>Start date</span>
              <input
                type="date"
                value={ownerReportForm.startDate}
                onChange={event => setOwnerStartDate(event.target.value)}
              />
            </label>
            <label className={styles.ownerField}>
              <span>End date</span>
              <input
                type="date"
                value={ownerReportForm.endDate}
                onChange={event => setOwnerField('endDate', event.target.value)}
              />
            </label>
          </div>

          <div className={styles.ownerSectionPicker}>
            {OWNER_REPORT_SECTIONS.map(section => (
              <label key={section.key} className={styles.ownerCheckTile}>
                <input
                  type="checkbox"
                  checked={ownerReportForm.sections[section.key]}
                  onChange={() => toggleOwnerSection(section.key)}
                />
                <span>{section.label}</span>
              </label>
            ))}
          </div>

          <label className={styles.ownerNotes}>
            <span>Owner notes</span>
            <textarea
              rows={3}
              value={ownerReportForm.notes}
              onChange={event => setOwnerField('notes', event.target.value)}
              placeholder="Progress notes..."
            />
          </label>

          <div className={styles.ownerPhotosPanel}>
            <div className={styles.ownerPhotosHeader}>
              <span>Report photos</span>
              <span>{ownerPhotos.length} / {OWNER_PHOTO_LIMIT}</span>
            </div>
            <div className={styles.ownerPhotoGroups}>
              {[
                ['improvement', 'Improvements'],
                ['concern', 'Concerns'],
              ].map(([category, label]) => (
                <section key={category} className={styles.ownerPhotoGroup}>
                  <div className={styles.ownerPhotoGroupHeader}>
                    <strong>{label}</strong>
                    <label className={styles.ownerPhotoAdd}>
                      {ownerPhotoUploading ? 'Saving...' : '+ Upload & save'}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={ownerPhotos.length >= OWNER_PHOTO_LIMIT || ownerPhotoUploading}
                        onChange={event => {
                          addOwnerPhotos(category, event.target.files)
                          event.target.value = ''
                        }}
                      />
                    </label>
                  </div>
                  <div className={styles.ownerPhotoGrid}>
                    {ownerPhotos.filter(photo => photo.category === category).map(photo => (
                      <article key={photo.id} className={styles.ownerPhotoCard}>
                        <img src={photo.thumbnailUrl} alt={photo.caption || photo.filename} />
                        <input
                          value={photo.caption}
                          onChange={event => updateOwnerPhoto(photo.id, { caption: event.target.value })}
                          onBlur={() => saveOwnerPhotoCaption(photo)}
                          placeholder="Photo caption"
                          aria-label={`Caption for ${photo.filename}`}
                        />
                        <button type="button" onClick={() => removeOwnerPhoto(photo.id)}>Remove</button>
                      </article>
                    ))}
                    {ownerPhotos.every(photo => photo.category !== category) && (
                      <span className={styles.ownerPhotoEmpty}>No {label.toLowerCase()} photos added.</span>
                    )}
                  </div>
                </section>
              ))}
            </div>
            <section className={styles.ownerPhotoLibrary} aria-label="Saved report photo library">
              <div className={styles.ownerPhotoLibraryHeader}>
                <div>
                  <strong>Saved photo library</strong>
                  <span>Reuse course photos in future owner reports.</span>
                </div>
                <span>{ownerPhotoLibrary.length} saved</span>
              </div>
              {(improvementPhotos.loading || concernPhotos.loading) && (
                <span className={styles.ownerPhotoEmpty}>Loading saved photos...</span>
              )}
              {!improvementPhotos.loading && !concernPhotos.loading && ownerPhotoLibrary.length === 0 && (
                <span className={styles.ownerPhotoEmpty}>Uploaded report photos will be saved here.</span>
              )}
              {ownerPhotoLibrary.length > 0 && (
                <div className={styles.ownerPhotoLibraryGrid}>
                  {ownerPhotoLibrary.map(photo => {
                    const included = ownerPhotos.some(item => item.id === photo.id)
                    const nameDraft = ownerPhotoNameDrafts[photo.id] ?? photo.filename
                    const nameChanged = nameDraft.trim() !== photo.filename
                    return (
                      <article key={photo.id} className={styles.ownerPhotoLibraryItem}>
                        <img src={photo.thumbnailUrl} alt={photo.caption || photo.filename} />
                        <div className={styles.ownerPhotoLibraryBody}>
                          <input
                            type="text"
                            value={nameDraft}
                            maxLength={120}
                            onChange={event => setOwnerPhotoNameDrafts(current => ({
                              ...current,
                              [photo.id]: event.target.value,
                            }))}
                            onKeyDown={event => {
                              if (event.key !== 'Enter') return
                              event.preventDefault()
                              renameSavedOwnerPhoto(photo, nameDraft)
                            }}
                            aria-label={`Name for ${photo.filename}`}
                          />
                          <span>{photo.category === 'improvement' ? 'Improvement' : 'Concern'}</span>
                          <span>Uploaded {formatOwnerPhotoDate(photo.uploadedAt)}</span>
                        </div>
                        <div className={styles.ownerPhotoLibraryActions}>
                          <button
                            type="button"
                            className={styles.ownerPhotoRename}
                            disabled={!nameChanged || !nameDraft.trim() || ownerPhotoRenamingId === photo.id}
                            onClick={() => renameSavedOwnerPhoto(photo, nameDraft)}
                          >
                            {ownerPhotoRenamingId === photo.id ? 'Saving...' : 'Save name'}
                          </button>
                          <button
                            type="button"
                            className={styles.ownerPhotoUse}
                            disabled={included || ownerPhotos.length >= OWNER_PHOTO_LIMIT}
                            onClick={() => addSavedOwnerPhoto(photo)}
                          >
                            {included ? 'Included' : 'Add to report'}
                          </button>
                          <button
                            type="button"
                            className={styles.ownerPhotoDelete}
                            onClick={() => deleteSavedOwnerPhoto(photo)}
                          >
                            Delete saved
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
            {(improvementPhotos.error || concernPhotos.error) && (
              <p className={styles.ownerPhotoError}>Saved photos could not be loaded.</p>
            )}
            {ownerPhotoError && <p className={styles.ownerPhotoError}>{ownerPhotoError}</p>}
          </div>
        </div>

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
