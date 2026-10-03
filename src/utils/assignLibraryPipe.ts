import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import type { PipeNavPathSegment } from '@/types/pipeNav'
import type { RennWorld } from '@/types/world'
import { copyGlobalPipeIntoWorld } from '@/globalPipeline/copyGlobalPipeIntoWorld'
import { addExistingPipeAtFocus } from '@/utils/pipeNavMutations'

export type LibraryPipeSource = 'project' | 'global'

/**
 * Add a project pipe or a global-library pipe to an entity: at the end of its pipe stack, or as a nested pipe at `parentPath`.
 *
 * A global pipe is first copied into the project (with nested pipes and stages) unless a project pipe with the same id
 * already exists, which is then reused. `linked` shares the project pipe; `copy` gives the entity its own clone.
 * Returns `null` when the pipe cannot be found.
 */
export function assignLibraryPipeToEntity(
  world: RennWorld,
  entityId: string,
  source: LibraryPipeSource,
  pipeId: string,
  mode: 'linked' | 'copy',
  library?: GlobalBehaviorLibrary,
  /** Where to add: `[]` = the entity's pipe stack, otherwise the pipe at this path (as a nested pipe). */
  parentPath: PipeNavPathSegment[] = [],
  insertIndex?: number,
): { world: RennWorld; focusPath: PipeNavPathSegment[] } | null {
  let base = world
  if (source === 'global') {
    if (!library?.transformerPipes?.[pipeId]) return null
    if (!world.transformerPipes?.[pipeId]) base = copyGlobalPipeIntoWorld(world, library, pipeId, pipeId)
  }
  const pipe = base.transformerPipes?.[pipeId]
  if (!pipe) return null
  return addExistingPipeAtFocus(base, entityId, pipe, mode, parentPath, insertIndex)
}
