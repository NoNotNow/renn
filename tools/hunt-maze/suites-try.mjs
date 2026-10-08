// Measurement helper: apply a param set to the AV binding (or 'none'), regenerate derived worlds (sync:global-pipeline), run the regression suites,
// print pass/fail per file, restore the worlds. Usage: node tools/hunt-maze/suites-try.mjs <set.json|none> <outDir>
import fs from 'node:fs'
import path from 'node:path'
import { execSync, spawnSync } from 'node:child_process'
const [setFile, outDir] = process.argv.slice(2)
fs.mkdirSync(outDir, { recursive: true })
const worlds = 'public/exampleWorlds'
execSync(`git checkout -- ${worlds}`)
if (setFile !== 'none') execSync(`node tools/hunt-maze/apply-set.mjs ${setFile}`, { stdio: 'ignore' })
execSync('npm run sync:global-pipeline', { stdio: 'ignore' })
const T = 'src/test/scenarios/'
const files = ['hunt-game.integration', 'hunt-game-score.integration', 'av-evasion-sweep.0', 'av-evasion-sweep.1', 'av-evasion-sweep.2', 'av-evasion-sweep.3',
  'av-keep-right', 'av-evasion-scenarios.eco', 'av-maze-scenarios.eco', 'av-fleet-budget', 'agent-example-world-av-fleet.integration']
for (const f of files) {
  const r = spawnSync('npx', ['vitest', 'run', `${T}${f}.test.ts`], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 900000 })
  const txt = (r.stdout ?? '') + (r.stderr ?? '')
  fs.writeFileSync(path.join(outDir, `${f}.txt`), txt)
  const m = txt.match(/Tests\s+(.*)\n/)
  console.log(`${f}: ${r.status === 0 ? 'PASS' : 'FAIL'} ${m ? m[1].replace(/\u001b\[[0-9;]*m/g, '').trim() : 'no summary (status ' + r.status + ')'}`)
}
execSync(`git checkout -- ${worlds}`)
