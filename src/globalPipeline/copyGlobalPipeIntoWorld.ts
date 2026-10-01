import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import type { RennWorld } from '@/types/world'
import type { TransformerPipe } from '@/types/transformer'

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Copy a global-library pipe into the project, including stage registry entries. */
export function copyGlobalPipeIntoWorld(
  world: RennWorld,
  globalLibrary: GlobalBehaviorLibrary,
  globalPipeId: string,
  projectPipeId: string = globalPipeId,
): RennWorld {
  const def = globalLibrary.transformerPipes?.[globalPipeId]
  if (!def) return world

  const pipe: TransformerPipe = { ...deepClone(def), id: projectPipeId }
  const nextTransformers = { ...(world.transformers ?? {}) }

  for (let i = 0; i < pipe.stageIds.length; i++) {
    const stageId = pipe.stageIds[i]
    if (nextTransformers[stageId]) continue
    const fromGlobal = globalLibrary.transformers?.[stageId]
    if (fromGlobal) {
      nextTransformers[stageId] = deepClone(fromGlobal)
      continue
    }
    const snap = pipe.stages[i]
    if (snap) nextTransformers[stageId] = deepClone(snap)
  }

  return {
    ...world,
    transformers: nextTransformers,
    transformerPipes: {
      ...(world.transformerPipes ?? {}),
      [projectPipeId]: pipe,
    },
  }
}
