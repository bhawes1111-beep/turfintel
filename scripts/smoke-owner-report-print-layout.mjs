import fs from 'node:fs'

function assertIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    console.error(`FAIL: ${label}`)
    process.exitCode = 1
  } else {
    console.log(`PASS: ${label}`)
  }
}

const formatter = fs.readFileSync('src/utils/reports/reportFormatter.js', 'utf8')

assertIncludes(formatter, '@page { size: letter; margin: 0.35in; }', 'print uses compact page margins')
assertIncludes(formatter, 'print-color-adjust: exact', 'print preserves preview colors')
assertIncludes(formatter, 'body            { padding: 0; background: #f6f7f1; color: #15251b; max-width: 900px; }', 'print keeps preview page background and width')
assertIncludes(formatter, '.report-header  { margin-bottom: 10px; border-radius: 12px 12px 0 0; padding: 18px 22px 16px;', 'print keeps preview-style report header')
assertIncludes(formatter, '.section        { margin-bottom: 9px; padding: 10px 12px; background: #fffef9; break-inside: auto; }', 'print compacts sections and lets long sections flow')
assertIncludes(formatter, '.summary-tiles  { grid-template-columns: repeat(auto-fit, minmax(105px, 1fr)); gap: 5px; }', 'print compacts summary tiles')
assertIncludes(formatter, '.report-footer  { position: static;', 'print footer does not consume every page')

if (process.exitCode) process.exit(process.exitCode)
console.log('Owner report print layout smoke passed.')
