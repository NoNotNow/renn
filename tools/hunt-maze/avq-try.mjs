// Measurement helper: restore self_hunt_flexible world.json from git, apply a param set to the AV binding, run the av:quick vitest files,
// save the raw output and print the FAIL rows. Usage: node tools/hunt-maze/avq-try.mjs <set.json|none> <out.txt>
import fs from 'node:fs'
import { execSync, spawnSync } from 'node:child_process'
const [setFile, out] = process.argv.slice(2)
const world = 'public/exampleWorlds/self_hunt_flexible/world.json'
execSync(`git checkout -- ${world}`)
if (setFile !== 'none') execSync(`node tools/hunt-maze/apply-set.mjs ${setFile}`)
const r = spawnSync('npx', ['vitest', 'run', 'src/test/scenarios/av-evasion-scenarios.test.ts', 'src/test/scenarios/av-maze-scenarios.test.ts'], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 900000 })
fs.writeFileSync(out, (r.stdout ?? '') + (r.stderr ?? ''))
const txt = fs.readFileSync(out, 'utf8')
const fails = txt.split('\n').filter((l) => /^FAIL /.test(l)).map((l) => l.slice(0, 110))
console.log(setFile, 'status', r.status, 'fails', fails.length)
for (const f of fails) console.log('  ' + f)
