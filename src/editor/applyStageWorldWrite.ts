import type { RennWorld } from '@/types/world'
import {
  type ApplyWorldWrite,
  type WorldEditDescriptor,
  type WorldEditScene,
} from './applyWorldEdit'

/** Stage registry / stack edits never require a full scene rebuild — incremental sync only. */
export const STAGE_WORLD_EDIT_SCENE: WorldEditScene = 'sync'

export function stageWorldEditDescriptor(pushUndo: boolean): WorldEditDescriptor {
  return {
    undo: pushUndo ? 'push' : 'skip',
    scene: STAGE_WORLD_EDIT_SCENE,
  }
}

/**
 * Applies a resolved stage edit through the world-edit seam (undo + scene policy in one place).
 * `nextWorld` is computed from the pre-edit world by the caller; the updater ignores `prev`
 * today — same contract as the legacy `onWorldChange(nextWorld)` gateway.
 */
export function applyStageWorldWrite(
  applyWorldWrite: ApplyWorldWrite,
  descriptor: WorldEditDescriptor,
  nextWorld: RennWorld,
): void {
  applyWorldWrite(descriptor, () => nextWorld)
}
