// B0: proxy recall / false alarms vs the real vitest results. Usage: node recall.mjs DIR label1 label2 ...  (needs DIR/truth.json from truth.mjs and DIR/px_<label>_<full|eco>.json)
import fs from 'node:fs'
import path from 'node:path'
const [dir, ...labs] = process.argv.slice(2)
const truth = JSON.parse(fs.readFileSync(path.join(dir, 'truth.json'), 'utf8'))
const base = {}
for (const b of ['full', 'eco']) for (const r of JSON.parse(fs.readFileSync(path.join(dir, `px_base_${b}.json`), 'utf8'))) base[b + ':' + r.name] = r
let tp = 0, fn = 0, fp = 0
for (const l of labs) {
  const pred = []
  const margin = []
  for (const b of ['full', 'eco']) {
    const f = path.join(dir, `px_${l}_${b}.json`)
    if (!fs.existsSync(f)) continue
    for (const r of JSON.parse(fs.readFileSync(f, 'utf8'))) {
      if (r.pass) continue
      if (r.name === 'wide-berth-open-field' && b === 'eco') continue // not an eco-suite row (fails in base at eco budget)
      const tag = r.name === 'kr-old-hits' ? 'keep-right:the' : (r.kind === 'maze' ? (b === 'eco' ? 'maze.eco:' : 'maze:') : (b === 'eco' ? 'ev.eco:' : 'ev:')) + r.name
      if (r.name.startsWith('kr-') && r.name !== 'kr-old-hits') pred.push('keep-right:' + r.name)
      else if (!(r.name === 'kr-old-hits' && b === 'eco')) pred.push(tag)
    }
  }
  const P = new Set(pred)
  // eco evasion rows are not run in `truth` tags the same way; compare on (suite family, name)
  const T = new Set(truth[l])
  const norm = (s) => s.replace(/^ev(\.eco)?:/, 'ev:')
  const Pn = new Set([...P].map(norm)), Tn = new Set([...T].map(norm))
  const hit = [...Tn].filter((x) => Pn.has(x)), miss = [...Tn].filter((x) => !Pn.has(x)), fa = [...Pn].filter((x) => !Tn.has(x))
  tp += hit.length; fn += miss.length; fp += fa.length
  console.log(`${l.padEnd(5)} truth ${Tn.size} caught ${hit.length} MISSED [${miss.join(' ')}] FALSE-ALARM [${fa.join(' ')}]`)
}
console.log(`TOTAL failing rows caught ${tp}/${tp + fn} (recall ${(tp / Math.max(1, tp + fn)).toFixed(2)}), false alarms ${fp}`)
// candidate-level
let candCaught = 0, candFail = 0, candFA = 0
for (const l of labs) {
  const t = truth[l].length > 0
  let p = false
  for (const b of ['full', 'eco']) { const f = path.join(dir, `px_${l}_${b}.json`); if (fs.existsSync(f)) p ||= JSON.parse(fs.readFileSync(f, 'utf8')).some((r) => !r.pass) }
  if (t) { candFail++; if (p) candCaught++ } else if (p) candFA++
}
console.log(`CANDIDATE level: failing candidates ${candFail}, flagged ${candCaught}; passing candidates flagged ${candFA}`)
