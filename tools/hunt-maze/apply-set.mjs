// Merges a params JSON into the self_hunt_flexible AV car pipe-0 binding (measurement helper).
// Usage: node tools/hunt-maze/apply-set.mjs <set.json> [chasers]
import fs from 'node:fs'
const p = 'public/exampleWorlds/self_hunt_flexible/world.json'
const w = JSON.parse(fs.readFileSync(p, 'utf8'))
const set = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const ents = w.entities ?? w.world?.entities ?? []
const av = ents.find((e) => e.id === 'entity_1779823253285_brtkx1p')
if (!av) throw new Error('AV not found; top keys: ' + Object.keys(w).join(','))
const b = av.transformerPipeStack[0]
b.params = { ...b.params, ...set }
fs.writeFileSync(p, JSON.stringify(w, null, 2) + '\n')
console.log('applied', Object.keys(set).length, 'keys')
