/**
 * Resolve verification project source (fixture | bundle | inline) → world + optional assets.
 */

import type { RennWorld } from '@/types/world'
import { loadAgentProjectBundle } from '@/agent/loadAgentProjectBundle'
import {
  defaultWarmupStepsForFixture,
  loadLogicVerificationFixture,
} from '@/agent/logicVerificationFixtures'
import { prepareWorldForLogicVerification } from '@/agent/prepareWorldForLogicVerification'

export type VerificationProjectSource =
  | { kind: 'inline'; world: RennWorld }
  | { kind: 'fixture'; fixtureId: string }
  | { kind: 'bundle'; bundleId: string }

export type ResolvedVerificationProject = {
  world: RennWorld
  assets?: Map<string, Blob>
  fixtureId?: string
  bundleId?: string
  defaultWarmupSteps?: number
}

export function resolveInlineVerificationProject(world: RennWorld): ResolvedVerificationProject {
  return {
    world: prepareWorldForLogicVerification(world),
  }
}

export function resolveFixtureVerificationProject(fixtureId: string): ResolvedVerificationProject {
  const world = loadLogicVerificationFixture(fixtureId)
  return {
    world: prepareWorldForLogicVerification(world),
    fixtureId,
    defaultWarmupSteps: defaultWarmupStepsForFixture(fixtureId),
  }
}

export async function resolveBundleVerificationProject(
  bundleId: string,
): Promise<ResolvedVerificationProject> {
  const bundle = await loadAgentProjectBundle(bundleId)
  return {
    world: bundle.world,
    assets: bundle.assets,
    bundleId: bundle.bundleId,
  }
}

export async function resolveVerificationProjectSource(
  source: VerificationProjectSource,
): Promise<ResolvedVerificationProject> {
  switch (source.kind) {
    case 'inline':
      return resolveInlineVerificationProject(source.world)
    case 'fixture':
      return resolveFixtureVerificationProject(source.fixtureId)
    case 'bundle':
      return resolveBundleVerificationProject(source.bundleId)
    default:
      throw new Error(`Unknown verification project source: ${String(source)}`)
  }
}
