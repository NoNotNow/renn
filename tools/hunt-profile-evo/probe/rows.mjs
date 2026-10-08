// B0 helper: parse vitest logs of the constraint files into {rows, tests} and diff two label sets.
// Usage: node rows.mjs DIR labelA labelB   (reads DIR/<label>_<file>.log for every file found) -> prints per-file differing rows/tests
import fs from 'node:fs'
import path from 'node:path'
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '')
export function parseLog(file) {
  const txt = strip(fs.readFileSync(file, 'utf8'))
  const rows = {}
  const tests = {}
  for (const l of txt.split('\n')) {
    const m = l.match(/^(PASS|FAIL|SKIP)\s+(\S+)\s+(.*)$/)
    if (m) rows[m[2]] = m[1] + ' ' + m[3].trim()
    const t = l.match(/^\s*([✓×↓])\s+(.*?)(?:\s+(\d+)ms)?\s*$/)
    if (t) tests[t[2].slice(0, 90)] = t[1]
  }
  const sum = txt.match(/Tests\s+(.*)/)
  return { rows, tests, summary: sum ? sum[1].trim() : '?' }
}
if (process.argv[1].endsWith('rows.mjs')) {
  const [dir, a, b] = process.argv.slice(2)
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(a + '_') && f.endsWith('.log')).map((f) => f.slice(a.length + 1))
  for (const f of files) {
    if (!fs.existsSync(path.join(dir, `${b}_${f}`))) continue
    const A = parseLog(path.join(dir, `${a}_${f}`))
    const B = parseLog(path.join(dir, `${b}_${f}`))
    const diffRows = Object.keys({ ...A.rows, ...B.rows }).filter((k) => A.rows[k] !== B.rows[k])
    const diffTests = Object.keys({ ...A.tests, ...B.tests }).filter((k) => A.tests[k] !== B.tests[k])
    console.log(`${f}: ${a} [${A.summary}] vs ${b} [${B.summary}] rows ${Object.keys(A.rows).length} changed ${diffRows.length}; test-status changes ${diffTests.length}`)
    for (const k of diffRows) console.log(`   ROW ${k}\n      ${(A.rows[k] ?? '-').slice(0, 150)}\n      ${(B.rows[k] ?? '-').slice(0, 150)}`)
    for (const k of diffTests) console.log(`   TEST ${A.tests[k] ?? '-'} -> ${B.tests[k] ?? '-'} ${k}`)
  }
}
