// Ablations of the L/LM sets. Usage: node tools/hunt-maze/make-sets2.mjs <setsDir>
import fs from 'node:fs'
import path from 'node:path'
const d = process.argv[2]
const LM = JSON.parse(fs.readFileSync(path.join(d, 'LM.json'), 'utf8'))
const L = JSON.parse(fs.readFileSync(path.join(d, 'L.json'), 'utf8'))
const C = JSON.parse(fs.readFileSync(path.join(d, 'C.json'), 'utf8'))
const omit = (o, ks) => Object.fromEntries(Object.entries(o).filter(([k]) => !(k in ks)))
const R = omit(LM, L)
fs.writeFileSync(path.join(d, 'R.json'), JSON.stringify(R, null, 1))
fs.writeFileSync(path.join(d, 'LMnoC.json'), JSON.stringify(omit(LM, C), null, 1))
fs.writeFileSync(path.join(d, 'LnoC.json'), JSON.stringify(omit(L, C), null, 1))
console.log(Object.keys(R).length, Object.keys(omit(LM, C)).length)
