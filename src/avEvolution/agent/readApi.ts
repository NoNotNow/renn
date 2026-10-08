/**
 * Shared (browser + node safe) read/apply helpers for AV-evolution results.
 * No fs / no window access here; see diskExports.ts (node-only) and ../browser/agentApi.ts.
 */
import type { LogicVerificationWorldPatch } from '@/agent/applyLogicVerificationWorldPatch'
import { EXPORT_SCHEMA, prepareExport, sortCandidatesBestFirst, type ExportOptions, type CandidateRecord, type EvolutionStore, type RunExport, type RunRecord } from '../core/store'

export interface AvEvolutionRunSummary {
  runId: string
  name?: string
  createdAt: number
  updatedAt: number
  specVersion: string
  stackVersion: string
  candidateCount?: number
  bestFitness?: number
  generations?: number
}

export interface AvEvolutionCandidateSummary {
  runId: string
  id: string
  gen: number
  fitness: number
  n: number
  reachRate: number
  meanExitT: number
  meanContactEvents: number
  meanReversals?: number
  params: CandidateRecord['params']
}

export interface BestCandidatesInput {
  /** omit or 'all' to span every run */
  runId?: string
  topN?: number
  minEpisodes?: number
}

export interface ApplyCandidateInput {
  entityId: string
  pipeId?: string
  stackIndex?: number
}

export const DEFAULT_TOP_N = 5

export function summarizeCandidate(c: CandidateRecord): AvEvolutionCandidateSummary {
  return {
    runId: c.runId,
    id: c.id,
    gen: c.gen,
    fitness: c.fitness,
    n: c.n,
    reachRate: c.reachRate,
    meanExitT: c.meanExitT,
    meanContactEvents: c.meanContactEvents,
    meanReversals: c.meanReversals,
    params: c.params,
  }
}

/** Lowest fitness first (fitness: lower = better), ties and unevaluated candidates in a stable gen/id order. */
export function sortCandidates(cands: CandidateRecord[], topN = DEFAULT_TOP_N, minEpisodes = 1): CandidateRecord[] {
  return sortCandidatesBestFirst(cands.filter((c) => c.n >= minEpisodes)).slice(0, Math.max(1, Math.floor(topN)))
}

function runHeader(r: RunRecord): AvEvolutionRunSummary {
  return {
    runId: r.runId,
    name: r.name,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    specVersion: r.specVersion,
    stackVersion: r.stackVersion,
  }
}

export async function listRuns(store: EvolutionStore): Promise<AvEvolutionRunSummary[]> {
  const runs = await store.listRuns()
  const out: AvEvolutionRunSummary[] = []
  for (const r of runs) {
    const top = await store.topCandidates(r.runId, 1, 1)
    const gens = await store.listGenerations(r.runId)
    out.push({ ...runHeader(r), bestFitness: top[0]?.fitness, generations: gens.length })
  }
  return out
}

export async function bestCandidates(store: EvolutionStore, input: BestCandidatesInput = {}): Promise<AvEvolutionCandidateSummary[]> {
  const rows = await store.topCandidates(input.runId ?? 'all', input.topN ?? DEFAULT_TOP_N, input.minEpisodes ?? 1)
  return rows.map(summarizeCandidate)
}

export async function getCandidate(store: EvolutionStore, runId: string, candidateId: string): Promise<CandidateRecord> {
  const rows = await store.topCandidates(runId, Number.MAX_SAFE_INTEGER, 0)
  const c = rows.find((x) => x.id === candidateId)
  if (!c) throw new Error(`unknown candidate ${candidateId} in run ${runId}`)
  return c
}

/**
 * Patch that merges candidate params into an entity's pipe binding.
 * entityId is mandatory (apply is always explicit). mergeBindingParams is a shallow merge,
 * so candidate.params must contain full nested objects.
 */
export function buildApplyPatch(candidate: Pick<CandidateRecord, 'params'>, target: ApplyCandidateInput): LogicVerificationWorldPatch {
  if (!target?.entityId) throw new Error('entityId is required to apply a candidate')
  return {
    entityPipeStack: [
      {
        entityId: target.entityId,
        pipeId: target.pipeId,
        stackIndex: target.stackIndex ?? 0,
        mergeBindingParams: candidate.params as Record<string, unknown>,
      },
    ],
  }
}

export function isRunExport(x: unknown): x is RunExport {
  return !!x && typeof x === 'object' && (x as RunExport).schema === EXPORT_SCHEMA && Array.isArray((x as RunExport).candidates)
}

/** Pure helpers over already-parsed exports (headless disk fallback). */
/**
 * One export per runId: a full export and its compact twin (same dir) must not double-count. Prefers the full file,
 * else the one with more candidates, else the newer one. Reads both formats; input order of first appearance is kept.
 */
export function dedupeExports(exports: RunExport[]): RunExport[] {
  const best = new Map<string, RunExport>()
  for (const e of exports) {
    const cur = best.get(e.run.runId)
    const better = !cur || (!!cur.compact && !e.compact) || (!!cur.compact === !!e.compact && (e.candidates.length > cur.candidates.length || (e.candidates.length === cur.candidates.length && e.exportedAt > cur.exportedAt)))
    if (better) best.set(e.run.runId, e)
  }
  return [...best.values()]
}

export function listRunsFromExports(exports: RunExport[]): AvEvolutionRunSummary[] {
  return dedupeExports(exports).map((e) => ({
    ...runHeader(e.run),
    candidateCount: e.compact?.totalCandidates ?? e.candidates.length,
    bestFitness: sortCandidates(e.candidates, 1)[0]?.fitness,
    generations: e.generations.length,
  }))
}

export function bestFromExports(exports: RunExport[], input: BestCandidatesInput = {}): AvEvolutionCandidateSummary[] {
  const pool = dedupeExports(exports)
    .filter((e) => !input.runId || input.runId === 'all' || e.run.runId === input.runId)
    .flatMap((e) => e.candidates)
  return sortCandidates(pool, input.topN, input.minEpisodes).map(summarizeCandidate)
}

/** Headless counterpart of `store.exportJSON`: re-sort / compact an already-read export (full or compact input). */
export function exportFromExports(exports: RunExport[], input: ExportOptions & { runId?: string } = {}): RunExport {
  const pool = dedupeExports(exports)
  const found = input.runId ? pool.find((e) => e.run.runId === input.runId) : pool.sort((a, b) => b.run.updatedAt - a.run.updatedAt)[0]
  if (!found) throw new Error(input.runId ? `unknown run ${input.runId}` : 'no exported AV-evolution runs found')
  return prepareExport(found, input)
}
