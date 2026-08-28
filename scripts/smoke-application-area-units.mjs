import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
const styles = readFileSync('src/pages/Spray/Spray.module.css', 'utf8')

assert.match(source, /const SQ_FT_PER_ACRE = 43560/)
assert.match(source, /areaUnit:\s*'acres'/)
assert.match(source, /entered \/ SQ_FT_PER_ACRE/)
assert.match(source, /value="square-feet">Square feet/)
assert.match(source, /acreage:\s*draft\.acres/)
assert.match(source, /Area must be greater than zero/)
assert.match(styles, /\.naAreaSizeControl/)

console.log('application area unit smoke passed')
