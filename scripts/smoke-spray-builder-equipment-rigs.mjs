import { readFileSync } from 'node:fs'

const builder = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
const equipmentApi = readFileSync('worker/api/equipment.js', 'utf8')
const migration = readFileSync('worker/migrations/0065_equipment_tank_capacity.sql', 'utf8')
const sprayerSeed = readFileSync('worker/migrations/0066_equipment_sprayer_capacity_seed.sql', 'utf8')

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok - ${message}`)
}

assert(
  /useEquipmentData/.test(builder) &&
    /const \{ equipment: fleetEquipment \}\s+= useEquipmentData\(\)/.test(builder) &&
    /filter\(isSprayerEquipment\)/.test(builder) &&
    !/const SPRAY_RIGS = \[/.test(builder),
  'spray builder pulls spray rigs from equipment records'
)

assert(
  /function equipmentTankCapacity\(unit\)/.test(builder) &&
    /tankCapacity:\s*nextCapacity/.test(builder) &&
    /selectedSprayRig\.capacity > 0/.test(builder) &&
    /handleSprayRigChange\(e\.target\.value\)/.test(builder),
  'selected sprayer auto-fills tank capacity'
)

assert(
  /function inferTargetTreatment\(rows\)/.test(builder) &&
    /type\.includes\('fungicide'\)[\s\S]*add\('Disease'\)/.test(builder) &&
    /type\.includes\('herbicide'\)[\s\S]*add\('Weed'\)/.test(builder) &&
    /type\.includes\('insecticide'\) \|\| type\.includes\('nematicide'\)[\s\S]*add\('Pest'\)/.test(builder) &&
    /targetPest:\s+targetTreatment/.test(builder),
  'target treatment auto-populates from tank product types'
)

assert(
  /tankCapacityGal:\s+row\.tank_capacity_gal/.test(equipmentApi) &&
    /tankCapacityGal:\s+'tank_capacity_gal'/.test(equipmentApi) &&
    /tank_capacity_gal/.test(equipmentApi),
  'equipment API reads and writes tank capacity'
)

assert(
  /ALTER TABLE equipment ADD COLUMN tank_capacity_gal REAL/.test(migration) &&
    /Spray Rig #1/.test(migration) &&
    /Spray Rig #2/.test(migration),
  'migration adds tank capacity and seeds existing spray rigs'
)

assert(
  /LIKE '%5800%' THEN 300/.test(sprayerSeed) &&
    /LIKE '%1750%' THEN 175/.test(sprayerSeed) &&
    /LIKE '%backpack%' THEN 4/.test(sprayerSeed),
  'sprayer capacity seed covers common existing sprayer names'
)
