// Reports hub — declarative registry.
//
// One entry per generatable report card. The Reports hub page assembles a
// data bundle from existing store hooks, then maps over REPORT_DEFS and
// calls `build(data)` when a card is clicked.
//
// Pure module — no React, no fetch, no DOM. Adding a new card means:
//   1. Add a pure builder to reportBuilder.js (read-only over existing data).
//   2. Register it here with `requires` listing the bundle keys it consumes.
// No hub-page changes needed.

import {
  buildMaintenanceSummaryReport,
  buildMorningBriefReport,
  buildNutritionSummaryReport,
  buildCulturalHistoryReport,
  buildDiseaseLogReport,
  buildMoistureTrendReport,
  buildTurfHealthSummaryReport,
} from './reportBuilder.js'
import { buildSprayIntelligenceReport } from './builders/sprayIntelligenceReport.js'
import { buildSprayProgramReport }      from './builders/sprayProgramReport.js'
import { buildSprayProgramCostReport }  from './builders/sprayProgramCostReport.js'
import { REPORT_MODULE } from './reportSchemas.js'

/**
 * @typedef {Object} ReportDef
 * @property {string}   id        Stable identifier (kebab-case).
 * @property {string}   module    REPORT_MODULE value for grouping/badge.
 * @property {string}   title     Card title — also defaults the report title.
 * @property {string}   desc      One-sentence description for the card body.
 * @property {string[]} requires  Bundle keys the build function reads. The
 *                                hub disables a card whose required keys are
 *                                still loading or returned an error.
 * @property {(data: Object) => Object} build
 *                                Pure function. Receives the bundle assembled
 *                                by the hub and returns a TurfReport.
 */

/** @type {ReportDef[]} */
export const REPORT_DEFS = [
  // ── Equipment ─────────────────────────────────────────────────────────────
  {
    id:       'maintenance-summary',
    module:   REPORT_MODULE.EQUIPMENT,
    title:    'Maintenance Summary',
    desc:     'Aggregate of maintenance log records — counts, cost rollup, and breakdowns by category and technician.',
    requires: ['maintenanceLogs'],
    build: ({ maintenanceLogs }) =>
      buildMaintenanceSummaryReport(maintenanceLogs, {
        title: 'Maintenance Summary',
      }),
  },

  // ── Operations ────────────────────────────────────────────────────────────
  {
    id:       'morning-brief',
    module:   REPORT_MODULE.OPERATIONS,
    title:    'Morning Brief',
    desc:     "Today's operational brief — conditions, sprays, equipment, priorities — wrapped as a printable report.",
    requires: ['morningBrief'],
    build: ({ morningBrief }) =>
      buildMorningBriefReport(morningBrief),
  },
  {
    id:       'cultural-history',
    module:   REPORT_MODULE.OPERATIONS,
    title:    'Cultural Practices History',
    desc:     'Aerification, topdressing, verticutting, rolling, and related cultural events grouped by practice type.',
    requires: ['culturalPractices'],
    build: ({ culturalPractices }) =>
      buildCulturalHistoryReport(culturalPractices, {
        title: 'Cultural Practices History',
      }),
  },

  // ── Agronomy ──────────────────────────────────────────────────────────────
  {
    id:       'nutrition-summary',
    module:   REPORT_MODULE.AGRONOMY,
    title:    'Plant Nutrition Summary',
    desc:     'Soil, tissue, and water lab reports plus any active recommendations — counts and recent entries.',
    requires: ['nutrition'],
    build: ({ nutrition }) =>
      buildNutritionSummaryReport(nutrition, {
        title: 'Plant Nutrition Summary',
      }),
  },

  // ── Disease ───────────────────────────────────────────────────────────────
  {
    id:       'disease-log',
    module:   REPORT_MODULE.DISEASE,
    title:    'Disease Observation Log',
    desc:     'Active and resolved disease observations with severity rollup — sourced from field observation records.',
    requires: ['diseaseObservations'],
    build: ({ diseaseObservations }) =>
      buildDiseaseLogReport(diseaseObservations, {
        title: 'Disease Log',
      }),
  },

  // ── Moisture ──────────────────────────────────────────────────────────────
  {
    id:       'moisture-trend',
    module:   REPORT_MODULE.MOISTURE,
    title:    'Moisture Trend',
    desc:     'Recent moisture observations — readings, averages, and flagged wilt / dry-spot / handwater / syringe items.',
    requires: ['moistureObservations'],
    build: ({ moistureObservations }) =>
      buildMoistureTrendReport(moistureObservations, {
        title: 'Moisture Trend',
      }),
  },

  // ── Spray ────────────────────────────────────────────────────────────────
  // Phase 7E (1/?) — Spray Intelligence report (chemistry / rotation /
  // interval awareness). Read-only; reuses the same Phase 7D helpers
  // that power the live Spray Builder panels.
  {
    id:       'spray-intelligence',
    module:   REPORT_MODULE.SPRAY,
    title:    'Spray Intelligence',
    desc:     'Read-only awareness report for chemistry groups, rotation, intervals, and missing intelligence.',
    requires: ['sprays', 'inventoryProducts', 'catalogProducts', 'labelsByItemId'],
    build: ({ sprays, inventoryProducts, catalogProducts, labelsByItemId }) =>
      buildSprayIntelligenceReport({
        sprays, inventoryProducts, catalogProducts, labelsByItemId,
      }),
  },

  // Phase 7G (1/?) — Spray Program report: planned-vs-actual summary
  // over spray_programs + spray_program_items + linked spray_records.
  // Reuses Phase 7F.5 planActualComparison helper; no parallel logic.
  {
    id:       'spray-program',
    module:   REPORT_MODULE.SPRAY,
    title:    'Spray Program',
    desc:     'Read-only summary of spray programs, planned items, completed links, and plan-vs-actual comparisons.',
    requires: ['programs', 'itemsByProgramId', 'sprays'],
    build: ({ programs, itemsByProgramId, sprays, inventoryProducts, catalogProducts, labelsByItemId }) =>
      buildSprayProgramReport({
        programs, itemsByProgramId, sprays,
        inventoryProducts, catalogProducts, labelsByItemId,
      }),
  },

  // Phase 7I (3/?) — Spray Program Cost: read-only estimated cost
  // rollup + cost-basis gap report. Reuses programCostAwareness
  // (Phase 7I.1) and costBasisReview (Phase 7I.2) — no parallel
  // cost logic, no budget entries, no inventory deduction.
  {
    id:       'spray-program-cost',
    module:   REPORT_MODULE.SPRAY,
    title:    'Spray Program Cost',
    desc:     'Read-only cost estimate report for planned spray programs and inventory cost-basis gaps.',
    requires: ['programs', 'itemsByProgramId', 'inventoryProducts'],
    build: ({ programs, itemsByProgramId, inventoryProducts }) =>
      buildSprayProgramCostReport({
        programs, itemsByProgramId, inventoryProducts,
      }),
  },

  // ── Turf Health ───────────────────────────────────────────────────────────
  // Phase 7B.1 — shade / airflow / weak turf / chronic stress. Read-only;
  // the builder is pure JS over the observation rows from /api/turf-health.
  {
    id:       'turf-health-summary',
    module:   REPORT_MODULE.TURF_HEALTH,
    title:    'Turf Health Summary',
    desc:     'Shade, airflow, weak-turf, and chronic-stress observations — counts, severity rollup, by-type rollup, active issues, and a recent-observations table.',
    requires: ['turfHealthObservations'],
    build: ({ turfHealthObservations }) =>
      buildTurfHealthSummaryReport(turfHealthObservations, {
        title: 'Turf Health Summary',
      }),
  },
]

/**
 * Determine whether the bundle has all keys a definition requires resolved
 * (i.e. present and not in a loading/error state). The hub uses this to
 * disable cards whose data isn't ready yet.
 *
 * @param {ReportDef} def
 * @param {Object}    bundle  Page-assembled bundle. Each key maps to either
 *                            the raw data value or `{ loading, error }`.
 * @returns {boolean}
 */
export function isReady(def, bundle) {
  for (const key of def.requires) {
    const v = bundle[key]
    if (v == null) return false
    if (typeof v === 'object' && !Array.isArray(v) && (v.loading || v.error)) return false
  }
  return true
}
