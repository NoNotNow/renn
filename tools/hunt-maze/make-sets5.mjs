// Set G = keys whose single-key transfer keeps av:quick green. Usage: node tools/hunt-maze/make-sets5.mjs <setsDir>
import fs from 'node:fs'
import path from 'node:path'
const d = process.argv[2]
const c = JSON.parse(fs.readFileSync('src/avEvolution/maze/mazeEscapeDefaultCar.json', 'utf8'))
const G = ['cuspReachW', 'cuspLook', 'mazeTurnCos', 'mazeWpMin', 'mazeArriveR', 'mazeOffRoute', 'tightMargin', 'turnRoom', 'revCruiseBehind', 'crawlTime', 'stuckSpeed', 'fieldBlockCost']
const pick = (ks) => Object.fromEntries(ks.map((k) => [k, c[k]]))
fs.writeFileSync(path.join(d, 'G.json'), JSON.stringify(pick(G), null, 1))
fs.writeFileSync(path.join(d, 'G-ego.json'), JSON.stringify(pick(['mazeTurnCos', 'mazeWpMin', 'mazeArriveR', 'mazeOffRoute']), null, 1))
