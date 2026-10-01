import type { RennWorld } from '@/types/world'
import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import type { TransformerDef, TransformerPipe } from '@/types/transformer'
import {
  buildSelfDrivingCarWorld,
  buildSelfDrivingParkourWorld,
} from '@/test/fixtures/selfDrivingCarWorld'
import { selfDrivingStageChecksums } from '@/globalPipeline/selfDrivingCarStagePaths'
import {
  SHIPPED_GLOBAL_PIPE_PREFIX,
  SHIPPED_GLOBAL_TF_PREFIX,
  type ShippedGlobalBehaviorLibraryBundle,
} from '@/globalPipeline/shippedGlobalBehaviorLibraryTypes'

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function prefixStageId(stageId: string): string {
  return `${SHIPPED_GLOBAL_TF_PREFIX}${stageId}`
}

function extractPrefixedLibrary(
  world: RennWorld,
  sourcePipeId: string,
  globalPipeId: string,
  pipeName: string,
): GlobalBehaviorLibrary {
  const sourcePipe = world.transformerPipes?.[sourcePipeId]
  if (!sourcePipe) throw new Error(`Missing pipe ${sourcePipeId}`)
  const registry = world.transformers ?? {}

  const stageIds = sourcePipe.stageIds.map(prefixStageId)
  const transformers: Record<string, TransformerDef> = {}
  for (const oldId of sourcePipe.stageIds) {
    const def = registry[oldId]
    if (!def) throw new Error(`Missing stage ${oldId} for pipe ${sourcePipeId}`)
    transformers[prefixStageId(oldId)] = deepClone(def)
  }

  const stages = stageIds.map((sid) => deepClone(transformers[sid]))
  const members = sourcePipe.members?.map((member) =>
    member.kind === 'stage'
      ? { kind: 'stage' as const, stageId: prefixStageId(member.stageId), enabled: member.enabled }
      : member,
  )

  const pipe: TransformerPipe = {
    ...deepClone(sourcePipe),
    id: globalPipeId,
    name: pipeName,
    stageIds,
    stages,
    members: members ?? stageIds.map((stageId) => ({ kind: 'stage' as const, stageId })),
  }

  return {
    transformers,
    scripts: {},
    transformerPipes: { [globalPipeId]: pipe },
  }
}

function mergeLibraries(...parts: GlobalBehaviorLibrary[]): GlobalBehaviorLibrary {
  const transformers: Record<string, TransformerDef> = {}
  const transformerPipes: Record<string, TransformerPipe> = {}
  for (const part of parts) {
    Object.assign(transformers, part.transformers)
    Object.assign(transformerPipes, part.transformerPipes ?? {})
  }
  return { transformers, scripts: {}, transformerPipes }
}

/** Build Organize → Global defaults for the self-driving Pipe3 stack. */
export function buildSelfDrivingGlobalBehaviorLibrary(): GlobalBehaviorLibrary {
  const wandererWorld = buildSelfDrivingCarWorld({ variant: 'cubeGoalBehind' })
  const missionWorld = buildSelfDrivingParkourWorld()

  const wanderer = extractPrefixedLibrary(
    wandererWorld,
    'pipe3',
    `${SHIPPED_GLOBAL_PIPE_PREFIX}pipe3_wanderer`,
    'Self-drive Pipe3 (wanderer)',
  )
  const mission = extractPrefixedLibrary(
    missionWorld,
    'pipe3',
    `${SHIPPED_GLOBAL_PIPE_PREFIX}pipe3_mission`,
    'Self-drive Pipe3 (mission waypoints)',
  )

  return mergeLibraries(wanderer, mission)
}

export function buildShippedGlobalBehaviorLibraryBundle(): ShippedGlobalBehaviorLibraryBundle {
  const sums = selfDrivingStageChecksums()
  const checksum = `${sums.umlenker}-${sums.direction}-${sums.autoBrake}-${sums.targetLine}`
  return {
    version: 1,
    checksum,
    syncedAt: new Date().toISOString(),
    library: buildSelfDrivingGlobalBehaviorLibrary(),
  }
}
