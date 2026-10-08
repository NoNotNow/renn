/**
 * `window.__rennAvEvolution` — browser API for agents/UI to read AV-evolution results.
 * Install once from the Builder: `installAvEvolutionAgentApi()` (optionally pass a store).
 * Methods: list(), best({runId?, topN?, minEpisodes?}),
 * apply({runId, candidateId, entityId, pipeId?, stackIndex?}), export(runId) -> RunExport (schema 'renn.av-evolution/1').
 * `apply` merges candidate params into the entity's pipe binding in the live Builder document
 * (same authoring-registry path as RPC apply_world_patch). Default params are never changed implicitly.
 */
import { requireAgentBuilderAuthoring } from '@/agent/agentBuilderAuthoringRegistry'
import type { EvolutionStore, ExportOptions, RunExport } from '../core/store'
import { applyAvEvolutionCandidate, type AvEvolutionApplyInput } from '../agent/applyCandidate'
import { bestCandidates, listRuns, type BestCandidatesInput } from '../agent/readApi'
import { getAvEvolutionStore, setAvEvolutionStore } from '../agent/storeRegistry'

export interface RennAvEvolutionApi {
  list(): ReturnType<typeof listRuns>
  best(input?: BestCandidatesInput): ReturnType<typeof bestCandidates>
  apply(input: AvEvolutionApplyInput): ReturnType<typeof applyAvEvolutionCandidate>
  /** candidates best-first; `{compact: true, topN?}` drops episodes / vecs / engine state */
  export(runId: string, opts?: ExportOptions): Promise<RunExport>
}

declare global {
  interface Window {
    __rennAvEvolution?: RennAvEvolutionApi
  }
}

export function createAvEvolutionAgentApi(): RennAvEvolutionApi {
  return {
    list: () => listRuns(getAvEvolutionStore()),
    best: (input) => bestCandidates(getAvEvolutionStore(), input),
    apply: (input) =>
      applyAvEvolutionCandidate(getAvEvolutionStore(), input, async (patch) =>
        requireAgentBuilderAuthoring().applyLogicVerificationWorldPatchToDocument(patch),
      ),
    export: (runId, opts) => getAvEvolutionStore().exportJSON(runId, opts),
  }
}

/** Registers the store (if given) and exposes `window.__rennAvEvolution`. Returns an uninstall fn. */
export function installAvEvolutionAgentApi(store?: EvolutionStore): () => void {
  if (store) setAvEvolutionStore(store)
  if (typeof window === 'undefined') return () => {}
  const api = createAvEvolutionAgentApi()
  window.__rennAvEvolution = api
  return () => {
    if (window.__rennAvEvolution === api) delete window.__rennAvEvolution
  }
}
