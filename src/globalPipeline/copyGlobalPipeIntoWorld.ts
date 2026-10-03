import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import type { RennWorld } from '@/types/world'
import type { TransformerPipe } from '@/types/transformer'
import { normalizePipeMembers } from '@/utils/transformerPipeResolve'
import { originForPipe, originForStage } from '@/globalPipeline/globalOrigin'

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * Copy a global-library pipe into the project, including stage registry entries.
 * Nested pipes (manifold `members`) are copied too: child pipes keep their ids (an existing project pipe with the same
 * id is left untouched), and every leaf stage reachable through the tree is copied into the stage registry.
 */
export function copyGlobalPipeIntoWorld(
  world: RennWorld,
  globalLibrary: GlobalBehaviorLibrary,
  globalPipeId: string,
  projectPipeId: string = globalPipeId,
): RennWorld {
  const def = globalLibrary.transformerPipes?.[globalPipeId]
  if (!def) return world

  const nextTransformers = { ...(world.transformers ?? {}) }
  const nextPipes: Record<string, TransformerPipe> = { ...(world.transformerPipes ?? {}) }

  const copyStage = (stageId: string, snapshot?: TransformerPipe['stages'][number]) => {
    if (nextTransformers[stageId]) return
    const fromGlobal = globalLibrary.transformers?.[stageId]
    if (fromGlobal) nextTransformers[stageId] = { ...deepClone(fromGlobal), origin: originForStage(stageId, fromGlobal) }
    else if (snapshot) nextTransformers[stageId] = deepClone(snapshot)
  }

  const visit = (source: TransformerPipe, targetId: string, visited: Set<string>) => {
    if (visited.has(source.id)) return
    visited.add(source.id)
    const pipe: TransformerPipe = { ...deepClone(source), id: targetId, origin: originForPipe(source.id, source) }
    for (let i = 0; i < pipe.stageIds.length; i++) copyStage(pipe.stageIds[i]!, pipe.stages[i])
    for (const member of normalizePipeMembers(pipe)) {
      if (member.kind === 'stage') {
        copyStage(member.stageId)
      } else {
        const child = globalLibrary.transformerPipes?.[member.pipeId]
        if (child && !nextPipes[member.pipeId]) visit(child, member.pipeId, visited)
      }
    }
    nextPipes[targetId] = pipe
  }
  visit(def, projectPipeId, new Set())

  return { ...world, transformers: nextTransformers, transformerPipes: nextPipes }
}
