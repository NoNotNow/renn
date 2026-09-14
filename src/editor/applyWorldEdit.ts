import type { RennWorld } from '@/types/world'
import { worldChangesRequireSceneRebuild } from '@/utils/sceneDependencyKey'

/** Whether to push an undo snapshot before mutating the document. */
export type WorldEditUndo = 'push' | 'skip'

/**
 * How the scene should follow a document write.
 * - `auto`: classify with `worldChangesRequireSceneRebuild` (same branches as `handleWorldChange`)
 * - `rebuild`: always capture live poses then bump scene version
 * - `sync`: incremental `syncWorldEntities` only
 * - `none`: caller already applied an imperative scene op
 */
export type WorldEditScene = 'auto' | 'rebuild' | 'sync' | 'none'

export interface WorldEditDescriptor {
  undo: WorldEditUndo
  scene: WorldEditScene
}

export interface ApplyWorldEditDeps {
  updateWorld: (updater: (prev: RennWorld) => RennWorld) => void
  bumpVersion: () => void
  pushBeforeEdit: () => void
  captureScenePosesForNextRebuild: () => void
  syncWorldEntities: (prev: RennWorld, next: RennWorld) => void
}

function applySceneFollowUp(
  deps: ApplyWorldEditDeps,
  scene: WorldEditScene,
  prev: RennWorld,
  next: RennWorld,
): void {
  switch (scene) {
    case 'none':
      return
    case 'rebuild':
      deps.captureScenePosesForNextRebuild()
      deps.bumpVersion()
      return
    case 'sync':
      deps.syncWorldEntities(prev, next)
      return
    case 'auto':
      if (worldChangesRequireSceneRebuild(prev, next)) {
        deps.captureScenePosesForNextRebuild()
        deps.bumpVersion()
      } else {
        deps.syncWorldEntities(prev, next)
      }
      return
  }
}

/**
 * Applies a world document edit with explicit undo and scene-follow policies.
 * `produceNext` receives the authoritative pre-write world from `updateWorld`.
 */
export function applyWorldEdit(
  deps: ApplyWorldEditDeps,
  descriptor: WorldEditDescriptor,
  produceNext: (prev: RennWorld) => RennWorld,
): void {
  if (descriptor.undo === 'push') {
    deps.pushBeforeEdit()
  }

  let prevWorld!: RennWorld
  let nextWorld!: RennWorld

  deps.updateWorld((prev) => {
    prevWorld = prev
    nextWorld = produceNext(prev)
    return nextWorld
  })

  applySceneFollowUp(deps, descriptor.scene, prevWorld, nextWorld)
}
