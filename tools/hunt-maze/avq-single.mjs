// Measurement helper: for each key of the given sets, apply ONLY that c870 value to the AV binding and run the av:quick vitest files.
// Usage: node tools/hunt-maze/avq-single.mjs <outDir> <set.json>...   (prints key -> failing rows other than the known baseline maze-b-rev-door)
import fs from 'node:fs'
import path from 'node:path'
import { execSync, spawnSync } from 'node:child_process'
const [outDir, ...sets] = process.argv.slice(2)
fs.mkdirSync(outDir, { recursive: true })
const world = 'public/exampleWorlds/self_hunt_flexible/world.json'
const keys = new Map()
for (const s of sets) for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(s, 'utf8')))) keys.set(k, v)
const rows = []
for (const [k, v] of keys) {
  execSync(`git checkout -- ${world}`)
  const f = path.join(outDir, `single-${k}.json`)
  fs.writeFileSync(f, JSON.stringify({ [k]: v }))
  execSync(`node tools/hunt-maze/apply-set.mjs ${f}`, { stdio: 'ignore' })
  const r = spawnSync('npx', ['vitest', 'run', 'src/test/scenarios/av-evasion-scenarios.test.ts', 'src/test/scenarios/av-maze-scenarios.test.ts'], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 600000 })
  const txt = (r.stdout ?? '') + (r.stderr ?? '')
  fs.writeFileSync(path.join(outDir, `single-${k}.txt`), txt)
  const fails = [...new Set(txt.split('\n').filter((l) => /^FAIL /.test(l)).map((l) => l.split(/\s+/)[1]))].filter((n) => n !== 'maze-b-rev-door')
  const line = `${k}=${v} -> ${fails.length ? fails.join(',') : 'green'}`
  console.log(line)
  rows.push(line)
}
execSync(`git checkout -- ${world}`)
fs.writeFileSync(path.join(outDir, 'single-summary.txt'), rows.join('\n') + '\n')
