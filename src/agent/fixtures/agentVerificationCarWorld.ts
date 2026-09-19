/**
 * Pinned self-driving car world for agent logic verification (headless + MCP).
 */

import type { RennWorld } from '@/types/world'
import {
  buildScriptedRawInput,
  DEFAULT_LOGIC_VERIFICATION_DT,
  type LogicVerificationInputScript,
} from '@/agent/logicVerificationHost'
import agentVerificationCarWorldJson from './agentVerificationCarWorld.json'

export const AGENT_VERIFICATION_CAR_ENTITY_ID = 'car' as const

/** Steps after load so contacts and transformer chains settle before scripted input. */
export const AGENT_VERIFICATION_CAR_WARMUP_STEPS = 30

/** Default scripted drive duration for car verification scenarios. */
export const AGENT_VERIFICATION_CAR_DRIVE_SIM_SECONDS = 2

export function loadAgentVerificationCarWorld(): RennWorld {
  return structuredClone(agentVerificationCarWorldJson as unknown as RennWorld)
}

/** Throttle + alternating steer (same pattern as host integration test). */
export function buildAgentCarDriveInputScript(): LogicVerificationInputScript {
  return ({ stepIndex }) =>
    buildScriptedRawInput({ w: true, d: stepIndex % 2 === 0 })
}

export function agentCarDriveStepCount(
  simSeconds: number = AGENT_VERIFICATION_CAR_DRIVE_SIM_SECONDS,
  dt: number = DEFAULT_LOGIC_VERIFICATION_DT,
): number {
  return Math.max(0, Math.ceil(simSeconds / dt))
}
