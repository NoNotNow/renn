import type { RennWorld } from '@/types/world'
import {
  type ApplyWorldWrite,
  type WorldEditDescriptor,
  type WorldEditScene,
} from './applyWorldEdit'
import { PIPE_NAV_EDIT_POLICY, type PipeNavEditIntent } from './pipeNavEdit'

/** Pipe-nav registry edits never require a full scene rebuild — incremental sync only. */
export const PIPE_NAV_WORLD_EDIT_SCENE: WorldEditScene = 'sync'

export function pipeNavWorldEditDescriptor(
  intentKind: PipeNavEditIntent['kind'],
): WorldEditDescriptor {
  const { pushUndo } = PIPE_NAV_EDIT_POLICY[intentKind]
  return {
    undo: pushUndo ? 'push' : 'skip',
    scene: PIPE_NAV_WORLD_EDIT_SCENE,
  }
}

/**
 * Applies a resolved pipe-nav edit through the world-edit seam (undo + scene policy in one place).
 * `nextWorld` is computed from the pre-edit world by `resolvePipeNavEdit`; the updater ignores
 * `prev` today — same contract as the legacy `onWorldChange(nextWorld)` gateway.
 */
export function applyPipeNavWorldWrite(
  applyWorldWrite: ApplyWorldWrite,
  intentKind: PipeNavEditIntent['kind'],
  nextWorld: RennWorld,
): void {
  applyWorldWrite(pipeNavWorldEditDescriptor(intentKind), () => nextWorld)
}
