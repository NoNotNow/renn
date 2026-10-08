// B0: print activation table from ACT_OUT dir. Usage: node act-table.mjs DIR
import fs from 'node:fs'
import path from 'node:path'
const dir = process.argv[2]
for (const f of fs.readdirSync(dir).sort()) {
  const recs = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
  const byTest = new Map()
  for (const r of recs) {
    const e = byTest.get(r.test) ?? { sims: 0, act: 0, first: null, on: 0, frames: 0 }
    e.sims++; e.frames += r.frames
    if (r.firstOn !== null) { e.act++; e.on += r.onFrames; e.first = e.first === null ? r.firstOn : Math.min(e.first, r.firstOn) }
    byTest.set(r.test, e)
  }
  console.log(`# ${f.replace('.json', '')}`)
  for (const [t, e] of byTest) console.log(`  ${e.act ? 'ACTIVE' : 'inert '}  first=${e.first ?? '-'}s  simsOn ${e.act}/${e.sims}  onFrames ${e.on}/${e.frames}  ${t.slice(0, 100)}`)
}
