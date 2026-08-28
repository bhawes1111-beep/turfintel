import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const preferences = read('src/utils/dashboard/dashboardPreferences.js')
const dashboard = read('src/pages/Dashboard/Dashboard.jsx')
const widget = read('src/pages/Dashboard/NutrientAlertsWidget.jsx')
const turfHealth = read('src/pages/TurfHealth/TurfHealth.jsx')
const samples = read('src/components/turfHealth/NutrientSamples.jsx')
const css = read('src/pages/Dashboard/NutrientAlertsWidget.module.css')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(preferences.includes("id: 'nutrientAlerts'"), 'Dashboard preferences do not register nutrient alerts')
assert(preferences.indexOf("id: 'nutrientAlerts'") < preferences.indexOf("id: 'applicationTiming'"), 'Nutrient alerts are not in the intended default position')
assert(preferences.includes('order.splice(insertAt, 0, id)'), 'New modules are not inserted into existing saved layouts')
assert(dashboard.includes("import NutrientAlertsWidget from './NutrientAlertsWidget'"), 'Dashboard widget import is missing')
assert(dashboard.includes('title="Nutrient Alerts"'), 'Dashboard module is missing')
assert(widget.includes('buildNutrientActionQueue(samples, records, items)'), 'Dashboard and Turf Health do not share the action queue calculation')
assert(widget.includes("activeTab: 'Nutrients'"), 'Dashboard alerts do not open the Nutrients tab')
assert(widget.includes('nutrientSampleId: sampleId'), 'Dashboard alerts do not carry the selected sample')
assert(turfHealth.includes('useLocation'), 'Turf Health does not read route state')
assert(turfHealth.includes("initialSampleId={location.state?.nutrientSampleId ?? ''}"), 'Turf Health does not pass the linked sample')
assert(turfHealth.includes("key={location.state?.nutrientSampleId || 'nutrients'}"), 'Linked samples do not remount the nutrient workspace')
assert(samples.includes("initialSampleId = ''"), 'Nutrient Samples does not accept a linked sample')
assert(samples.includes('useState(initialSampleId)'), 'A linked sample is not selected')
assert(css.includes('@media (max-width: 600px)'), 'The nutrient widget has no mobile layout')

console.log('Dashboard nutrient alerts smoke checks passed.')
