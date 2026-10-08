// B0: real failing tests per labelled run (vitest "×" lines). Usage: node truth.mjs DIR label1 label2 ... -> prints and writes DIR/truth.json
import fs from 'node:fs'
import path from 'node:path'
const [dir, ...labs] = process.argv.slice(2)
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '')
const out = {}
for (const l of labs) {
  const f = []
  for (const file of fs.readdirSync(dir).filter((x) => x.startsWith(l + '_') && x.endsWith('.log'))) {
    const t = strip(fs.readFileSync(path.join(dir, file), 'utf8'))
    const tag = file.slice(l.length + 4).replace(/\.test\.log|\.integration\.test\.log/, '').replace('maze-scenarios', 'maze').replace('evasion-scenarios', 'ev')
    for (const m of t.matchAll(/^\s*× ([^:\s]+)/gm)) f.push(tag + ':' + m[1])
  }
  out[l] = f
  console.log(l.padEnd(5), f.join(' '))
}
fs.writeFileSync(path.join(dir, 'truth.json'), JSON.stringify(out, null, 1))
