#!/usr/bin/env node
/**
 * auto-trial: while the training runs, deploy the newest candidate into the maze training worlds every --every
 * seconds (default 300): runs `train-ctl.mjs trial` whenever latest-best.json names a NEW best generation (same gen =
 * skip, no wasted export). train-ctl's trial pins the candidate to a snapshot, so a best that changes mid-export
 * cannot half-deploy. Started and killed by train-ctl start/stop; exits on its own when the training stays stopped.
 *
 *   node tools/policy-evolution/auto-trial.mjs [--every SECONDS]
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const everyIdx = args.indexOf('--every')
const every = Math.max(15, Number(everyIdx >= 0 ? args[everyIdx + 1] : 300))
const best = resolve(root, 'training-data/policy-evolution/latest-best.json')
const ctl = resolve(root, 'tools/policy-evolution/train-ctl.mjs')

const trainingRunning = () => {
  const r = spawnSync('node', [ctl, 'status'], { cwd: root, encoding: 'utf8' })
  return /TRAINING\s+RUNNING/.test(r.stdout || '')
}

const bestGen = () => {
  try {
    return JSON.parse(readFileSync(best, 'utf8')).best?.gen ?? null
  } catch {
    return null
  }
}

let lastGen = null
let misses = 0
console.log(`auto-trial: watching latest-best.json, deploying a new candidate every ${every} s while the training runs`)
for (;;) {
  if (trainingRunning()) {
    misses = 0
    const gen = bestGen()
    if (gen !== null && gen !== lastGen) {
      lastGen = gen
      console.log(`auto-trial: new best (gen ${gen}) -> trial`)
      spawnSync('node', [ctl, 'trial', best], { cwd: root, stdio: 'inherit' })
    }
  } else if (++misses >= 2) {
    console.log('auto-trial: the training is not running - exit')
    break
  }
  spawnSync('sleep', [String(every)])
}
