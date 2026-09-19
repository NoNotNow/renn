/**
 * Repo-relative fixture ids for MCP load_fixture.
 */

import type { RennWorld } from '@/types/world'
import {
  AGENT_VERIFICATION_CAR_WARMUP_STEPS,
  loadAgentVerificationCarWorld,
} from '@/agent/fixtures/agentVerificationCarWorld'

export type LogicVerificationFixtureId = 'agentVerificationCarWorld'

const FIXTURE_LOADERS: Record<LogicVerificationFixtureId, () => RennWorld> = {
  agentVerificationCarWorld: loadAgentVerificationCarWorld,
}

export function loadLogicVerificationFixture(fixtureId: string): RennWorld {
  const loader = FIXTURE_LOADERS[fixtureId as LogicVerificationFixtureId]
  if (!loader) {
    throw new Error(
      `Unknown fixture id "${fixtureId}" — known: ${Object.keys(FIXTURE_LOADERS).join(', ')}`,
    )
  }
  return loader()
}

export function defaultWarmupStepsForFixture(fixtureId: string): number | undefined {
  if (fixtureId === 'agentVerificationCarWorld') {
    return AGENT_VERIFICATION_CAR_WARMUP_STEPS
  }
  return undefined
}
