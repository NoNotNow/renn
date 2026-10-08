// Group-wise sets for bisecting. Usage: node tools/hunt-maze/make-sets3.mjs <setsDir>
// Writes LnoC+<group>.json and <group>.json for groups of the R keys, and LnoC+all-but-<group>.json
import fs from 'node:fs'
import path from 'node:path'
const d = process.argv[2]
const rd = (n) => JSON.parse(fs.readFileSync(path.join(d, n + '.json'), 'utf8'))
const LnoC = rd('LnoC')
const R = rd('R')
const groups = {
  margins: ['planMargin', 'tightMargin', 'guardMargin'],
  track: ['lookahead', 'carrotLookT', 'carrotPullCos', 'fieldBlockCost'],
  rev: ['reversePenalty', 'gearSwitchPenalty', 'maxReverseRun', 'reverseSpeed', 'turnRoom', 'revCruiseBehind'],
  man: ['maneuverSpeed', 'crawlTime', 'stuckSpeed'],
}
const sub = (ks) => Object.fromEntries(ks.map((k) => [k, R[k]]))
const w = (n, o) => fs.writeFileSync(path.join(d, n + '.json'), JSON.stringify(o, null, 1))
for (const [g, ks] of Object.entries(groups)) {
  w('LnoC+' + g, { ...LnoC, ...sub(ks) })
  const rest = Object.keys(R).filter((k) => !ks.includes(k))
  w('LnoC+R-' + g, { ...LnoC, ...sub(rest) })
}
