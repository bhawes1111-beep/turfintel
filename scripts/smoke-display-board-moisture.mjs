#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'

let passed = 0
let failed = 0

function check(condition, message) {
  if (condition) {
    passed += 1
    console.log(`PASS ${message}`)
  } else {
    failed += 1
    console.error(`FAIL ${message}`)
  }
}

const board = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
const worker = readFileSync('worker/index.js', 'utf8')
const crew = readFileSync('public/iphone-field/crew.js', 'utf8')

check(
  /href="\/iphone-field\/\?board=1"[\s\S]*?>Moisture<\/a>/.test(board),
  'public Display Board includes the Moisture shortcut',
)
check(
  /pathname === '\/api\/display-board\/moisture'/.test(worker)
    && /todayFieldMap\(env, true, true/.test(worker),
  'worker exposes the public read-only moisture map feed',
)
check(
  /courseId !== 'crossroads-gc'/.test(worker),
  'public moisture map is restricted to the Crosswinds course',
)
check(
  /if\(board\)[\s\S]*?fetch\('\/api\/display-board\/moisture\?courseId=crossroads-gc&areas=all'/.test(crew),
  'field view loads the public board feed without a device token',
)
check(
  existsSync('public/iphone-field/index.html')
    && existsSync('public/iphone-field/greens.json')
    && existsSync('public/iphone-field/sw.js'),
  'field view ships its page, mapped greens, and offline worker',
)
check(
  /currentArea=id/.test(crew) && !/state\.green/.test(crew),
  'field swipe navigation follows the area currently shown on the map',
)
check(
  worker.indexOf("pathname.startsWith('/api/field-device/')")
    < worker.indexOf('if (isMutation(method))'),
  'linked field-device authentication runs before the session mutation gate',
)

console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
