// B0: compare per-sim trajectory hashes of two labelled instrumented runs (base vs profile).
// Usage: node hashdiff.mjs DIR base label  -> per sim: activated? onIdx, first divergence idx, identical?; summary of hypothesis violations
import fs from 'node:fs'
import path from 'node:path'
const [dir, A, B] = process.argv.slice(2)
let viol = 0, changedAct = 0, sameAct = 0, inertSame = 0, inertTotal = 0
const changed = []
for (const f of fs.readdirSync(path.join(dir, `${B}_act`)).sort()) {
  const pa = path.join(dir, `${A}_act`, f)
  if (!fs.existsSync(pa)) continue
  const a = JSON.parse(fs.readFileSync(pa, 'utf8'))
  const b = JSON.parse(fs.readFileSync(path.join(dir, `${B}_act`, f), 'utf8'))
  console.log('# ' + f.replace('.json', ''))
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i], y = b[i]
    let div = -1
    const n = Math.min(x.hs.length, y.hs.length)
    for (let k = 0; k < n; k++) if (x.hs[k] !== y.hs[k]) { div = k; break }
    if (div < 0 && x.hs.length !== y.hs.length) div = n
    const act = y.firstOn !== null
    const note = act ? `ON@${y.firstOn}s(idx ${y.onIdx})` : 'inert'
    const verdict = div < 0 ? 'identical' : `DIVERGES idx ${div} (${(div * 0.0167).toFixed(1)}s)`
    if (!act) { inertTotal++; if (div < 0) inertSame++; else { viol++; console.log('   !! VIOLATION inert sim diverges') } }
    else if (div < 0) sameAct++
    else { changedAct++; if (div < y.onIdx) { viol++; console.log('   !! VIOLATION diverges before activation') } }
    if (div >= 0) changed.push(`${f.replace('.json', '')} :: ${y.test.slice(-70)} ${note} ${verdict}`)
    console.log(`  ${note.padEnd(22)} ${verdict.padEnd(28)} ${y.test.slice(-80)}`)
  }
}
console.log(`\nSUMMARY ${B} vs ${A}: inert sims ${inertTotal} (identical ${inertSame}), activated sims identical ${sameAct}, activated & changed ${changedAct}, violations ${viol}`)
