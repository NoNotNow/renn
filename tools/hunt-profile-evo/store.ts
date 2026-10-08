/** Out-dir persistence: checkpoint.json (atomic), candidates.jsonl (append, last wins), tasks.jsonl (see pool.ts), progress.json. */
import fs from 'node:fs'
import path from 'node:path'
import type { CaseResult } from './probe/proxy'
import type { ScenSummary } from './fitness'
import type { Genome, Profile } from './genome'

export interface CandRecord {
  hash: string
  gen: number
  genome: Genome
  profile: Profile
  nKeys: number
  /** sentinel-fail: only the sentinel tier ran; harness: sentinel ok + harness, proxy skipped (fitness above the elite cut); full: everything ran */
  stage: 'sentinel-fail' | 'harness' | 'full'
  /** true/false after the full proxy; null = not verified (stage harness / sentinel-fail is false) */
  feasible: boolean | null
  violation: number
  failing: string[]
  fitness: number | null
  /** ranking score: fitness when feasible/unverified, infeasibleScore otherwise */
  score: number
  per: Record<string, ScenSummary> | null
  proxy: Record<string, CaseResult>
  timingsMs: { sentinel: number; harness: number; proxy: number }
}

export interface Checkpoint {
  version: 1
  /** completed generations (0 = seed generation done) */
  gen: number
  /** generation currently being evaluated: its offspring (fixed before evaluation so a resume re-derives nothing) */
  offspring: Genome[] | null
  pop: Genome[]
  rngState: number
  initDone: boolean
  initPop: Genome[]
  baseFitness: number | null
  configSig: string
  history: { gen: number; bestFeasible: number | null; feasibleRate: number; evals: number; wallS: number }[]
  wallSPrev: number
}

export const files = (dir: string) => ({
  checkpoint: path.join(dir, 'checkpoint.json'),
  candidates: path.join(dir, 'candidates.jsonl'),
  tasks: path.join(dir, 'tasks.jsonl'),
  progress: path.join(dir, 'progress.json'),
  best: path.join(dir, 'best.json'),
})

export function writeJsonAtomic(file: string, data: unknown): void {
  const tmp = `${file}.tmp${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(data))
  fs.renameSync(tmp, file)
}
export function readJson<T>(file: string): T | null {
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as T) : null
}
export function loadCandidates(file: string): Map<string, CandRecord> {
  const m = new Map<string, CandRecord>()
  if (!fs.existsSync(file)) return m
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try { const r = JSON.parse(line) as CandRecord; m.set(r.hash, r) } catch { /* torn line */ }
  }
  return m
}
export function appendCandidate(file: string, r: CandRecord): void {
  fs.appendFileSync(file, JSON.stringify(r) + '\n')
}
