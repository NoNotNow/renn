// B0: recall of a name-subset of the proxy on the validation labels + cost. Usage: node subset.mjs DIR name1,name2,...
import fs from 'node:fs'
import path from 'node:path'
const [dir, names] = process.argv.slice(2)
const S = new Set(names.split(','))
const truth = JSON.parse(fs.readFileSync(path.join(dir, 'truth.json'), 'utf8'))
let cost = 0
const rd = (l, b) => JSON.parse(fs.readFileSync(path.join(dir, `px_${l}_${b}.json`), 'utf8'))
for (const b of ['full', 'eco']) for (const r of rd('base', b)) if (S.has(r.name)) cost += r.wallMs
let caught = 0, total = 0
for (const l of Object.keys(truth)) {
  const pred = new Set()
  for (const b of ['full', 'eco']) for (const r of rd(l, b)) if (!r.pass && S.has(r.name) && !(r.name === 'wide-berth-open-field' && b === 'eco')) pred.add((r.name === 'kr-old-hits' ? 'keep-right:the' : (b === 'eco' ? 'maze.eco:' : 'maze:') + r.name))
  const cand = truth[l].length > 0
  const hit = pred.size > 0
  total += cand ? 1 : 0; caught += cand && hit ? 1 : 0
  const rows = truth[l].filter((t) => pred.has(t)).length
  console.log(`${l.padEnd(5)} candidate-fail ${cand} flagged ${hit} rows ${rows}/${truth[l].length}`)
}
console.log(`subset ${S.size} cases, base cost ${(cost / 1000).toFixed(1)} s (excl. vitest startup); failing candidates flagged ${caught}/${total}`)
