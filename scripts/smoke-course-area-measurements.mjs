import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const settings = readFileSync('src/pages/Settings/sections/CourseConfigurationSection.jsx', 'utf8')
const builder = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
const styles = readFileSync('src/pages/Settings/Settings.module.css', 'utf8')

assert.match(settings, /const SQ_FT_PER_ACRE = 43560/)
assert.match(settings, /function squareFeetFromAcres/)
assert.match(settings, /function acresFromSquareFeet/)
assert.match(settings, /Built-in Course Areas/)
assert.match(settings, />Square feet</)
assert.match(settings, /customCourseAreas: form\.customCourseAreas/)
assert.match(builder, /displayLabel = areaAcres > 0/)
assert.match(builder, /a\.displayLabel \?\? a\.label/)
assert.match(styles, /\.courseAreaMeasurements/)

console.log('course area measurements smoke passed')
