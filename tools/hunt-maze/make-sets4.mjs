// Groups alone (L-groups and R-groups). Usage: node tools/hunt-maze/make-sets4.mjs <setsDir>
import fs from 'node:fs'
import path from 'node:path'
const d = process.argv[2]
const c = JSON.parse(fs.readFileSync('src/avEvolution/maze/mazeEscapeDefaultCar.json', 'utf8'))
const groups = {
  gLspeed: ['mazeManeuverSpeed', 'maneuverRunSpeed', 'maneuverRunDecel', 'maneuverRunOffset', 'turnManeuverSpeed'],
  gLrev: ['mazeReversePenalty', 'mazeMaxReverseRun', 'mazeDeviate'],
  gLego: ['mazeTurnCos', 'mazeWpMin', 'mazeArriveR', 'mazeOffRoute', 'mazeGoalW'],
  gRmargins: ['planMargin', 'tightMargin', 'guardMargin'],
  gRtrack: ['lookahead', 'carrotLookT', 'carrotPullCos', 'fieldBlockCost'],
  gRrev: ['reversePenalty', 'gearSwitchPenalty', 'maxReverseRun', 'reverseSpeed', 'turnRoom', 'revCruiseBehind'],
  gRman: ['maneuverSpeed', 'crawlTime', 'stuckSpeed'],
}
for (const [g, ks] of Object.entries(groups)) fs.writeFileSync(path.join(d, g + '.json'), JSON.stringify(Object.fromEntries(ks.map((k) => [k, c[k]])), null, 1))
