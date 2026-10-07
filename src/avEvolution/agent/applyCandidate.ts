import type { LogicVerificationWorldPatch } from '@/agent/applyLogicVerificationWorldPatch'
import type { EvolutionStore } from '../core/store'
import { buildApplyPatch, getCandidate, type ApplyCandidateInput } from './readApi'

export type AvEvolutionApplyInput = ApplyCandidateInput & { runId: string; candidateId: string }

/** Resolve candidate from store, build the patch, and hand it to `applyPatch`. */
export async function applyAvEvolutionCandidate<R>(
  store: EvolutionStore,
  input: AvEvolutionApplyInput,
  applyPatch: (patch: LogicVerificationWorldPatch) => Promise<R>,
): Promise<{ patch: LogicVerificationWorldPatch; result: R }> {
  const cand = await getCandidate(store, input.runId, input.candidateId)
  const patch = buildApplyPatch(cand, input)
  return { patch, result: await applyPatch(patch) }
}
