// Builds candidate transfer param sets from the maze-escape default car (c870). Usage: node tools/hunt-maze/make-sets.mjs <outDir>
import fs from 'node:fs'
import path from 'node:path'
const out = process.argv[2]
const c = JSON.parse(fs.readFileSync('src/avEvolution/maze/mazeEscapeDefaultCar.json', 'utf8'))
const L = ['mazeManeuverSpeed','maneuverRunSpeed','maneuverRunDecel','maneuverRunOffset','mazeReversePenalty','mazeMaxReverseRun','mazeDeviate','turnManeuverSpeed','cuspHeadW','cuspReachW','cuspLook','gearIncW','mazeTurnCos','mazeWpMin','mazeArriveR','mazeOffRoute','mazeGoalW']
const C = ['cuspHeadW','cuspReachW','cuspLook','gearIncW']
const R = ['planMargin','tightMargin','guardMargin','reversePenalty','gearSwitchPenalty','maxReverseRun','reverseSpeed','turnRoom','revCruiseBehind','maneuverSpeed','crawlTime','stuckSpeed','lookahead','carrotLookT','carrotPullCos','fieldBlockCost']
const pick = (ks) => Object.fromEntries(ks.filter((k) => k in c).map((k) => [k, c[k]]))
const miss = [...L, ...R].filter((k) => !(k in c))
if (miss.length) console.error('missing in c870:', miss.join(','))
fs.mkdirSync(out, { recursive: true })
for (const [n, v] of Object.entries({ L: pick(L), C: pick(C), LM: pick([...L, ...R]), F: c })) {
  fs.writeFileSync(path.join(out, n + '.json'), JSON.stringify(v, null, 1))
  console.log(n, Object.keys(v).length)
}
