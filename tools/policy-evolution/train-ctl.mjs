#!/usr/bin/env node
/**
 * train-ctl: see and control the long-running background jobs of this repo (local Mac session).
 *
 *   node tools/policy-evolution/train-ctl.mjs                # status: what runs, why, at which gen
 *   node tools/policy-evolution/train-ctl.mjs stop           # stop the training right after a gen line (state saves each gen)
 *   node tools/policy-evolution/train-ctl.mjs start         # start / resume the training (the documented resume command)
 *   node tools/policy-evolution/train-ctl.mjs restart       # stop + start
 *   node tools/policy-evolution/train-ctl.mjs ship          # stop -> ship.ts (HOLDOUT finish-count gate) -> start, verdict printed
 *
 * Known jobs: the v3cap policy-evolution training (bash run-v3.sh -> npm exec tsx run-islands.ts, log via tee)
 * and the vite dev server. Detection is by command line + repo path, never a blanket pkill pattern.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TRAIN = {
  state: resolve(root, 'training-data/policy-evolution/v3cap.json'),
  log: resolve(root, 'training-data/policy-evolution/v3cap.log'),
  nohupLog: resolve(root, 'training-data/policy-evolution/v3cap.nohup.log'),
  targetGen: 3000,
  why: 'policy evolution: v3cap speed-capped fork (--speed-cap 15, warm from v3 gen 1500), 7 workers, ship check when the HOLDOUT gate passes',
  // the documented resume command (single source of truth; run-v3.sh re-attaches the tee log itself)
  start: 'V3_OUT=training-data/policy-evolution/v3cap.json V3_EXTRA_ARGS="--speed-cap 15 --warm training-data/policy-evolution/v3.json" nohup bash tools/policy-evolution/run-v3.sh 3000 7 > training-data/policy-evolution/v3cap.nohup.log 2>&1 &',
}
const VITE_WHY = 'vite dev server (localhost preview) - the test / play workflow'

const ps = () => spawnSync('ps', ['-Ao', 'pid,ppid,pcpu,etime,command'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean)

/** All processes belonging to a job; absolute repo path OR the repo-relative launcher paths (bash run-v3.sh / tee are started relative). */
function findProcs(pattern) {
  const me = String(process.pid)
  const rel = /tools\/policy-evolution\/run-v3\.sh|tools\/policy-evolution\/run-islands|training-data\/policy-evolution\/v3cap\.log/
  return ps()
    .map((l) => {
      const m = l.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(\S+)\s+(.*)$/)
      if (!m) return null
      const cmd = m[5]
      if (m[1] === me || cmd.includes('train-ctl')) return null
      return pattern.test(cmd) && (cmd.includes(root) || rel.test(cmd)) ? { pid: m[1], ppid: m[2], cpu: m[3], etime: m[4], cmd } : null
    })
    .filter(Boolean)
}

const trainProcs = () => findProcs(/run-islands|run-v3\.sh|v3cap\.log/)
const viteProcs = () => findProcs(/node_modules\/\.bin\/vite|vite\.js/).filter((p) => /vite/.test(p.cmd) && p.cmd.includes(root))

function trainGen() {
  try {
    const st = JSON.parse(readFileSync(TRAIN.state, 'utf8'))
    return st.state?.gen ?? st.gen ?? null
  } catch {
    return null
  }
}

function lastGenLine() {
  try {
    const txt = readFileSync(TRAIN.log, 'utf8')
    const m = txt.match(/^gen (\d+).*$/gm)
    return m ? m[m.length - 1] : null
  } catch {
    return null
  }
}

function status() {
  const tr = trainProcs()
  const vi = viteProcs()
  const gen = trainGen()
  console.log(`repo: ${root}\n`)
  if (tr.length) {
    const workers = tr.filter((p) => /run-islands/.test(p.cmd)).length
    const cpu = tr.reduce((a, p) => a + Number(p.cpu), 0)
    console.log(`TRAINING  RUNNING  gen ${gen ?? '?'}/${TRAIN.targetGen}  (~${workers} proc, ~${Math.round(cpu)}% CPU total)`)
    console.log(`  why:    ${TRAIN.why}`)
    console.log(`  last:   ${lastGenLine() ?? '-'}`)
    for (const p of tr) console.log(`  pid ${p.pid}  cpu ${p.cpu}%  up ${p.etime}  ${p.cmd.slice(0, 120)}`)
    console.log(`  control: node tools/policy-evolution/train-ctl.mjs stop|start|restart|ship`)
  } else {
    console.log(`TRAINING  STOPPED  (state gen ${gen ?? '?'}/${TRAIN.targetGen}, resume keeps every finished generation)`)
    console.log(`  why it exists: ${TRAIN.why}`)
    console.log(`  control: node tools/policy-evolution/train-ctl.mjs start`)
  }
  console.log('')
  if (vi.length) {
    console.log(`VITE DEV  RUNNING`)
    console.log(`  why:    ${VITE_WHY}`)
    for (const p of vi) console.log(`  pid ${p.pid}  cpu ${p.cpu}%  up ${p.etime}  ${p.cmd.slice(0, 120)}`)
  } else {
    console.log(`VITE DEV  not running  (npm run dev starts it; ${VITE_WHY})`)
  }
  if (!tr.length && !existsSync(TRAIN.nohupLog)) return
  return { running: tr.length > 0 }
}

/** Stop right after a gen line: the state file saves every finished gen, so at most the in-flight gen is lost. */
function stop() {
  const tr = trainProcs()
  if (!tr.length) {
    console.log('training is not running')
    return
  }
  const before = trainGen()
  const logSize = existsSync(TRAIN.log) ? statSync(TRAIN.log).size : 0
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const now = Date.now()
    let size = logSize
    try {
      size = statSync(TRAIN.log).size
    } catch {}
    if (size > logSize) {
      const m = readFileSync(TRAIN.log, 'utf8').match(/^gen (\d+).*$/gm)
      if (m && m[m.length - 1]) break // a fresh gen line landed: safe boundary
    }
    spawnSync('sleep', ['0.25'])
  }
  const pids = tr.map((p) => p.pid)
  spawnSync('kill', pids)
  spawnSync('sleep', ['2'])
  const left = trainProcs()
  if (left.length) spawnSync('kill', ['-9', ...left.map((p) => p.pid)])
  console.log(`training stopped (pids ${pids.join(' ')}); state gen ${before} -> ${trainGen()}`)
}

function start() {
  if (trainProcs().length) {
    console.log('training already running')
    return
  }
  spawnSync('bash', ['-c', TRAIN.start], { cwd: root, stdio: 'ignore' })
  let up = false
  for (let i = 0; i < 20 && !up; i++) {
    spawnSync('sleep', ['0.5'])
    up = trainProcs().length > 0
  }
  console.log(up ? `training started, resuming at gen ${trainGen() ?? '?'}/${TRAIN.targetGen}` : 'start FAILED: no process came up, check training-data/policy-evolution/v3cap.nohup.log')
}

function ship() {
  if (trainProcs().length) stop()
  const r = spawnSync('npx', ['tsx', 'tools/policy-evolution/ship.ts', 'training-data/policy-evolution/v3cap.json', '--v3', '--workers', '9'], {
    cwd: root,
    encoding: 'utf8',
  })
  const out = (r.stdout || '') + (r.stderr || '')
  const verdict = out.split('\n').filter((l) => /WROTE|kept the shipped policy|KEEP|SHIP/.test(l))
  console.log(verdict.join('\n') || out.split('\n').slice(-5).join('\n'))
  start()
}

const cmd = process.argv[2] ?? 'status'
if (cmd === 'status') status()
else if (cmd === 'stop') stop()
else if (cmd === 'start') start()
else if (cmd === 'restart') { stop(); start() }
else if (cmd === 'ship') ship()
else {
  console.log('usage: train-ctl.mjs [status|stop|start|restart|ship]')
  process.exit(1)
}
