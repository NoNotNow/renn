import type { RennWorld } from '@/types/world'
import { requireAgentBuilderAuthoring } from '@/agent/agentBuilderAuthoringRegistry'
import {
  buildEntityAuthoringSummary,
  buildWorldAuthoringSnapshot,
} from '@/agent/agentEntityAuthoringSummary'
import type { LogicVerificationHost } from '@/agent/logicVerificationHost'

type AttachAuthoringState = {
  host: LogicVerificationHost | null
}

export async function resolveAuthoringWorldForAttach(
  state: AttachAuthoringState,
  projectName?: string,
): Promise<RennWorld> {
  const trimmed = projectName?.trim()
  if (trimmed) {
    return requireAgentBuilderAuthoring().getSavedProjectWorld(trimmed)
  }
  if (state.host) {
    return state.host.getWorld()
  }
  return requireAgentBuilderAuthoring().getCurrentWorld()
}

export async function getEntityAuthoringSummaryFromWorldSource(
  state: AttachAuthoringState,
  input: {
    entityId: string
    includeCode?: boolean
    codeMaxChars?: number
    projectName?: string
  },
) {
  const world = await resolveAuthoringWorldForAttach(state, input.projectName)
  return buildEntityAuthoringSummary(world, input.entityId, {
    includeCode: input.includeCode,
    codeMaxChars: input.codeMaxChars,
  })
}

export async function getWorldAuthoringSnapshotFromWorldSource(
  state: AttachAuthoringState,
  input: {
    entityIds?: string[]
    includeCode?: boolean
    codeMaxChars?: number
    maxEntities?: number
    projectName?: string
  },
) {
  const world = await resolveAuthoringWorldForAttach(state, input.projectName)
  return buildWorldAuthoringSnapshot(world, input)
}
