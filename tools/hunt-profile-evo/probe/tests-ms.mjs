// B0: per-test wall (ms, as printed by vitest) from the logs of one label. Usage: node tests-ms.mjs DIR label [file-substring]
import fs from 'node:fs'
import path from 'node:path'
const [dir, label, sub] = process.argv.slice(2)
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '')
for (const f of fs.readdirSync(dir).filter((x) => x.startsWith(label + '_') && x.endsWith('.log') && (!sub || x.includes(sub))).sort()) {
  console.log('# ' + f)
  let tot = 0
  for (const l of strip(fs.readFileSync(path.join(dir, f), 'utf8')).split('\n')) {
    const m = l.match(/^\s*([✓×↓])\s+(.*?)(?:\s+(\d+)ms)?\s*$/)
    if (!m) continue
    const ms = m[3] ? +m[3] : null
    if (ms) tot += ms
    console.log(`  ${m[1]} ${ms ?? '<?>'}ms ${m[2].split(':')[0].slice(0, 60)}`)
  }
  console.log(`  sum(printed) ${tot} ms`)
}
