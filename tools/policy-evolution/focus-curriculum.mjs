#!/usr/bin/env node
/**
 * focus-curriculum: the failure-focus curriculum driver ("Crux-Fokus-Modus"), the automated phase loop behind
 * agent-context/focus-curriculum.md. When individual setups of the current best fail (a diagnose run), it:
 *   1. DIAGNOSES the current best on the band (diagnose-v3.ts, --out JSON - the source of truth for pass/fail)
 *   2. CHECKPOINTS: copies the source run state to <stem>-focus.json - the SOURCE stays the untouched rollback point,
 *      and the copy is the ONLY file the focused training ever writes (own --latest-best / --latest-stats, so the
 *      shared latest-best.json / latest-stats.json are not touched)
 *   3. FOCUSES: resumes the copy with --focus-setups <the failing TRAIN setups> in one-epoch chunks (the passing
 *      setups fully excluded) until the best island passes EVERY chain of every focus setup (run-islands writes
 *      focusPass into the state file at each epoch end; cap --max-focus-chunks, then roll back)
 *   4. VALIDATES: resumes the copy WITHOUT focus (--no-focus-setups, ALL setups re-included) for --validate-gens
 *      generations (default 50), then diagnoses the EPOCH-BEST candidate (the last epoch-end best island, file.epochBest -
 *      every chunk runs with --epoch-best): KEPT only if (i) every focus setup fully passes, (ii) the OTHER train setups
 *      have no new failures vs the checkpoint diagnosis, (iii) HOLDOUT does not regress. NOT the stored file.best: it
 *      only moves on a full-band fitness improvement, and the focused / recovering fitness does not beat the pre-focus
 *      best - the first real cycle's verdict diagnosed the old pre-focus genome byte-identically.
 *   5. Verdict: KEPT = the validated copy is the new lineage (promote it MANUALLY - this driver NEVER writes the
 *      source state file); ROLLED BACK = the copy is renamed *.rejected-<ts>.json and the untouched source IS the
 *      state to resume.
 * HOLDOUT failures are diagnosed and gated but NEVER trained on (holdout integrity).
 * Restartable: <stem>-focus.driver.json records the phase; a restart continues the phase it stopped in
 * (a finished cycle - kept / rolled-back - starts a FRESH diagnose). Started / stopped via train-ctl.mjs (job FOCUS):
 *   node tools/policy-evolution/train-ctl.mjs focus     # start (refuses while the real training runs)
 *   node tools/policy-evolution/train-ctl.mjs stop      # stops the driver + its trainer chunk
 *
 *   node tools/policy-evolution/focus-curriculum.mjs [--source FILE] [--policy FILE] [--validate-gens 50]
 *       [--max-focus-chunks 40] [--workers cores-1] [--kinds crux] [--train-per-kind 15] [--holdout-per-kind 10]
 *       [--batch 6] [--dry-run]
 */
import { spawnSync } from 'node:child_process'
import { cpus } from 'node:os'
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const argv = process.argv.slice(2)
const arg = (n, d) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 && argv[i + 1] !== undefined && !String(argv[i + 1]).startsWith('--') ? argv[i + 1] : d
}
const num = (n, d) => (arg(n, undefined) === undefined ? d : Number(arg(n, undefined)))
const flag = (n) => argv.includes(`--${n}`)

const src = resolve(root, arg('source', 'training-data/policy-evolution/v3cruxnose.json'))
const dir = dirname(src)
const stem = basename(src).replace(/\.json$/, '')
const state = resolve(dir, `${stem}-focus.json`)
const best = resolve(dir, `${stem}-focus.latest-best.json`)
const stats = resolve(dir, `${stem}-focus.latest-stats.json`)
const driverFile = resolve(dir, `${stem}-focus.driver.json`)
const checkpointBest = resolve(dir, `${stem}-focus.checkpoint-best.json`)
const candidateBest = resolve(dir, `${stem}-focus.candidate-best.json`)
const kinds = arg('kinds', 'crux')
const trainPerKind = num('train-per-kind', 15)
const holdoutPerKind = num('holdout-per-kind', 10)
const batch = num('batch', 6)
const validateGens = num('validate-gens', 50)
const maxFocusChunks = num('max-focus-chunks', 40)
const workers = num('workers', Math.max(1, cpus().length - 1))

const log = (s) => console.log(`[focus ${new Date().toISOString()}] ${s}`)
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const writeJson = (p, o) => writeFileSync(p, `${JSON.stringify(o, null, 1)}\n`)

let ds = null
const saveDs = (o) => {
  ds = { ...o, updatedAt: new Date().toISOString() }
  writeJson(driverFile, ds)
}
const phase = () => ds?.phase ?? 'diagnose'

/** The real v3cruxnose training must not run concurrently (cores + it owns the shared exports). */
function assertNoTrainer() {
  const r = spawnSync('node', [resolve(root, 'tools/policy-evolution/train-ctl.mjs'), 'status'], { cwd: root, encoding: 'utf8' })
  if (/TRAINING\s+RUNNING/.test(r.stdout || '')) throw new Error('the v3cruxnose training is RUNNING - stop it first (node tools/policy-evolution/train-ctl.mjs stop)')
}

/** One diagnose-v3 run on `policyFile` (needs a top-level .genome); returns the failing chain keys per split. */
function diagnose(policyFile, tag) {
  const outJson = resolve(dir, `${stem}-focus.diagnosis-${tag}.json`)
  log(`diagnose ${basename(policyFile)} on --kinds ${kinds} (${trainPerKind}/${holdoutPerKind} per kind) -> ${basename(outJson)}`)
  const r = spawnSync(
    'npx',
    ['tsx', 'tools/policy-evolution/diagnose-v3.ts', '--kinds', kinds, '--train-per-kind', String(trainPerKind), '--holdout-per-kind', String(holdoutPerKind), '--policy', policyFile, '--list', '--out', outJson],
    { cwd: root, stdio: 'inherit', encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`diagnose failed (exit ${r.status})`)
  const recs = readJson(outJson)
  const fails = (split) => recs.filter((x) => x.split === split && x.outcome !== 'finish').map((x) => x.key)
  return { trainFails: fails('train'), holdoutFails: fails('holdout') }
}

const setupOf = (chainKey) => chainKey.split('#')[0]

/** One trainer chunk (resume of the focus state file); throws on a nonzero exit. --epoch-best on every chunk: the
 *  verdict candidate is the LAST EPOCH-END BEST ISLAND (file.epochBest), not the stored file.best - a focused /
 *  recovering run's fitness does not beat the stored full-band best, so file.best can stay a pre-focus genome for a
 *  whole cycle (the first real cycle proved it: the verdict diagnosed the old gen-3575 genome byte-identically). */
function runTrainer(extra, gens) {
  const args = [
    'tsx', 'tools/policy-evolution/run-islands.ts', '--v3', '--resume', '--epoch-best',
    '--out', state, '--gens', String(gens), '--workers', String(workers),
    '--kinds', kinds, '--batch', String(batch),
    '--train-per-kind', String(trainPerKind), '--holdout-per-kind', String(holdoutPerKind),
    '--latest-best', best, '--latest-stats', stats,
    ...extra,
  ]
  log(`trainer: npx ${args.join(' ')}`)
  const r = spawnSync('npx', args, { cwd: root, stdio: 'inherit', encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`trainer chunk failed (exit ${r.status}) - see the log above`)
}

/** Gens to run so the chunk ends exactly at the next epoch end (the pass check fires only there). */
function chunkToEpoch() {
  const epoch = readJson(state).islands?.epoch ?? 25
  const g = readJson(state).state?.gen ?? 0
  const rem = epoch - (g % epoch)
  return rem === 0 ? epoch : rem
}

const focusPass = () => {
  try {
    return readJson(state).focusPass ?? null
  } catch {
    return null
  }
}
const fmtPass = (p) => (p ? `${p.perSetup.map((x) => `${x.setupKey} ${x.finished}/${x.chains}`).join(' ')}${p.allPass ? ' (ALL PASS)' : ''}` : 'no pass check yet')

/** Verdict paths. Rollback renames the focus files aside; the untouched source IS the checkpoint to resume. */
function rollback(reason) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  for (const p of [state, best, stats]) if (existsSync(p)) renameSync(p, p.replace(/\.json$/, `.rejected-${ts}.json`))
  log(`FOCUS CURRICULUM VERDICT: ROLLED BACK (${reason})`)
  log(`  the focus copy is moved aside as *.rejected-${ts}.json; the untouched checkpoint ${basename(src)} IS the state to resume (train-ctl.mjs start)`)
  saveDs({ ...(ds ?? {}), phase: 'rolled-back', verdict: reason })
}

function keep(cand, d2, focusSetups, base) {
  log(`  focus setups ALL PASS; other train failures ${d2.trainFails.filter((k) => !focusSetups.includes(setupOf(k))).length} (checkpoint ${base.trainFails.filter((k) => !focusSetups.includes(setupOf(k))).length}); holdout failures ${d2.holdoutFails.length} (checkpoint ${base.holdoutFails.length})`)
  log(`FOCUS CURRICULUM VERDICT: KEPT - the validated lineage is ${basename(state)} (gen ${readJson(state).state?.gen}); the validated candidate is the epoch-best (gen ${cand.gen}${cand.island !== undefined ? `, island ${cand.island}` : ''}) -> ${basename(candidateBest)}`)
  log(`  promote it MANUALLY (this driver never writes ${basename(src)}): cp ${basename(state)} ${basename(src)}, then resume the real training (train-ctl.mjs start)`)
  saveDs({ ...(ds ?? {}), phase: 'kept', verdict: 'validated' })
}

// --- phase 1 + 2: diagnose the current best, checkpoint the copy -----------------------------------------------------------------

if (!existsSync(src)) throw new Error(`source run file not found: ${src}`)
if (ds && (ds.phase === 'kept' || ds.phase === 'rolled-back')) {
  log(`previous cycle ${ds.phase} at ${ds.updatedAt ?? '?'} - starting a FRESH cycle`)
  ds = null
}
if (!ds) {
  assertNoTrainer()
  const policyFile = arg('policy', undefined) !== undefined ? resolve(root, arg('policy', undefined)) : checkpointBest
  if (arg('policy', undefined) === undefined) {
    const b = readJson(src).best
    if (!b?.genome) throw new Error(`${basename(src)} has no best.genome - nothing to diagnose`)
    writeJson(checkpointBest, { schema: 'renn.policy-evolution.focus-candidate/1', genome: b.genome, gen: b.gen, source: src })
  }
  log(`phase DIAGNOSE: the current best of ${basename(src)}`)
  const d = diagnose(policyFile, 'checkpoint')
  const focusSetups = [...new Set(d.trainFails.map(setupOf))]
  log(`diagnosis: ${d.trainFails.length} failing train chains, ${d.holdoutFails.length} failing holdout chains`)
  if (!focusSetups.length) {
    log(`VERDICT: nothing to focus on${d.holdoutFails.length ? ' (holdout-only failures are never trained on - holdout integrity)' : ' - the whole band passes'}`)
    process.exit(0)
  }
  log(`focus set (${focusSetups.length} setups): ${focusSetups.join(' ')}`)
  if (flag('dry-run')) {
    log(`DRY RUN - no focus state written (only the read-only diagnose artifacts). Plan:`)
    log(`  checkpoint: cp ${basename(src)} -> ${basename(state)} (the source stays the untouched rollback point)`)
    log(`  focus chunks: trainer --focus-setups "${focusSetups.join(',')}" in one-epoch chunks until focusPass.allPass (max ${maxFocusChunks} chunks)`)
    log(`  validate: trainer --no-focus-setups --gens ${validateGens} (ALL setups re-included), then diagnose the epoch-best candidate + keep/rollback`)
    process.exit(0)
  }
  log(`phase CHECKPOINT: cp ${basename(src)} -> ${basename(state)} (the source stays the untouched rollback point)`)
  copyFileSync(src, state)
  saveDs({
    schema: 'renn.policy-evolution.focus-curriculum/1',
    phase: 'focus',
    source: src,
    state,
    focusSetups,
    baseline: d,
    startedAt: new Date().toISOString(),
  })
}

// --- phase 3: focused training until every focus chain passes --------------------------------------------------------------------

if (ds.phase === 'focus') {
  if (!existsSync(state)) {
    log(`focus state file missing - re-checkpointing from ${basename(src)}`)
    copyFileSync(src, state)
  }
  const spec = ds.focusSetups.join(',')
  log(`phase FOCUS: train ONLY [${spec}] (${ds.focusSetups.length} setups, all their chains) until every focus chain passes (max ${maxFocusChunks} epoch chunks)`)
  let passed = focusPass()?.allPass === true
  for (let chunk = 1; !passed && chunk <= maxFocusChunks; chunk++) {
    const cg = chunkToEpoch()
    log(`focus chunk ${chunk}/${maxFocusChunks}: ${cg} gens from gen ${readJson(state).state?.gen} (--focus-setups "${spec}")`)
    assertNoTrainer()
    runTrainer(['--focus-setups', spec], cg)
    passed = focusPass()?.allPass === true
    log(`focus pass check after chunk ${chunk}: ${fmtPass(focusPass())}`)
  }
  if (passed) {
    const p = focusPass()
    log(`FOCUS PASSED at gen ${p.gen}: ${fmtPass(p)}`)
    saveDs({ ...ds, phase: 'validate', focusPassedAt: new Date().toISOString() })
  } else {
    rollback(`the focus setups still fail after ${maxFocusChunks} chunks (${fmtPass(focusPass())})`)
    process.exit(0)
  }
}

// --- phase 4: full-band validation window, then the verdict ----------------------------------------------------------------------

if (phase() === 'validate') {
  const focusSetups = ds.focusSetups
  const base = ds.baseline
  assertNoTrainer()
  log(`phase VALIDATE: ${validateGens} full-band generations (--no-focus-setups - ALL setups re-included), then the verdict diagnose`)
  runTrainer(['--no-focus-setups'], validateGens)
  // the verdict candidate: the LAST EPOCH-END BEST ISLAND (file.epochBest, written by every --epoch-best chunk) - the
  // candidate that actually went through focus + validation. NOT the stored file.best: it only moves on a full-band
  // fitness improvement, and a focused / recovering fitness does not beat the pre-focus best (first real cycle: the
  // verdict diagnosed the old gen-3575 genome byte-identically). Fallback (old state files / flag never set): file.best.
  const f = readJson(state)
  const eb = f.epochBest
  const b = f.best
  const cand = eb?.genome
    ? { genome: eb.genome, gen: eb.gen, island: eb.island }
    : b?.genome
      ? { genome: b.genome, gen: b.gen }
      : null
  if (!cand) throw new Error(`${basename(state)} has neither epochBest nor best.genome after validation`)
  log(`verdict candidate: ${eb?.genome ? `the epoch-end best island (gen ${eb.gen}, island ${eb.island})` : `FALLBACK to the stored file.best (gen ${b.gen}) - no epochBest in the state file (--epoch-best was never set)`}`)
  writeJson(candidateBest, { schema: 'renn.policy-evolution.focus-candidate/1', genome: cand.genome, gen: cand.gen, ...(cand.island !== undefined ? { island: cand.island } : {}), source: state })
  const d2 = diagnose(candidateBest, 'validated')
  const focusFails = d2.trainFails.filter((k) => focusSetups.includes(setupOf(k)))
  const otherFails = d2.trainFails.filter((k) => !focusSetups.includes(setupOf(k)))
  const baseOther = base.trainFails.filter((k) => !focusSetups.includes(setupOf(k)))
  const focusOk = focusFails.length === 0
  const trainOk = otherFails.length <= baseOther.length
  const holdoutOk = d2.holdoutFails.length <= base.holdoutFails.length
  log(`verdict check: (i) focus setups ${focusOk ? 'ALL PASS' : `${focusFails.length} still failing [${focusFails.join(' ')}]`}; (ii) other train failures ${otherFails.length} vs checkpoint ${baseOther.length}${trainOk ? '' : ` NEW [${otherFails.join(' ')}]`}; (iii) holdout failures ${d2.holdoutFails.length} vs checkpoint ${base.holdoutFails.length}${holdoutOk ? '' : ` REGRESSED [${d2.holdoutFails.join(' ')}]`}`)
  if (focusOk && trainOk && holdoutOk) keep(cand, d2, focusSetups, base)
  else rollback(`validation failed: (i) ${focusOk ? 'pass' : `${focusFails.length} focus chains still fail`}, (ii) ${otherFails.length} other train failures vs ${baseOther.length}, (iii) ${d2.holdoutFails.length} holdout failures vs ${base.holdoutFails.length}`)
  process.exit(0)
}

if (phase() !== 'focus') throw new Error(`unexpected driver phase: ${phase()}`)
