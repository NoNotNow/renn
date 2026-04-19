import type { RennWorld } from '@/types/world'
import { useEditorUndo } from '@/contexts/EditorUndoContext'

/**
 * Shared edit helpers for the World tab sub-panels.
 *
 * - `pushUndo` snapshots the document before a discrete edit.
 * - `vec3Undo` is the gesture-undo bundle accepted by `Vec3Field` (no-op when
 *   no `EditorUndoApi` is mounted).
 * - `updateWorldSettings(patch)` shallow-merges `patch` into `world.world` and
 *   forwards to `onWorldChange`. Section components use this for top-level
 *   `world.world.*` writes; ground/material edits go through their own helpers
 *   in `WorldGroundSection`.
 */
export interface WorldPanelEdits {
  pushUndo: () => void
  vec3Undo: {
    onScrubStart?: () => void
    onScrubEnd?: (hadScrub: boolean) => void
    onBeforeCommit?: () => void
  }
  updateWorldSettings: (patch: Partial<RennWorld['world']>) => void
}

export function useWorldPanelEdits(
  world: RennWorld,
  onWorldChange: (world: RennWorld) => void,
): WorldPanelEdits {
  const undo = useEditorUndo()
  const pushUndo = () => undo?.pushBeforeEdit()
  const vec3Undo: WorldPanelEdits['vec3Undo'] =
    undo != null
      ? {
          onScrubStart: () => undo.notifyScrubStart(),
          onScrubEnd: (hadScrub: boolean) => undo.notifyScrubEnd(hadScrub),
          onBeforeCommit: pushUndo,
        }
      : {}

  const updateWorldSettings = (patch: Partial<RennWorld['world']>) => {
    onWorldChange({
      ...world,
      world: {
        ...world.world,
        ...patch,
      },
    })
  }

  return { pushUndo, vec3Undo, updateWorldSettings }
}
