import { useCallback, useMemo, useRef, useState, type RefObject } from 'react'
import type { EditorUndoApi } from '@/contexts/EditorUndoContext'
import {
  cloneEditorSnapshot,
  createEditorHistory,
  type EditorSnapshot,
} from '@/editor/editorHistory'
import type { RennWorld } from '@/types/world'

export interface UseEditorHistoryParams {
  /** Live `{ world, assets }` mirror; the hook reads these synchronously to record snapshots. */
  worldAssetsRef: RefObject<{ world: RennWorld; assets: Map<string, Blob> }>
  /** Maximum number of undo/redo entries to keep. */
  maxDepth: number
}

export interface UseEditorHistoryResult {
  /** Snapshots `worldAssetsRef.current` and pushes onto undo stack. Clears redo. */
  pushBeforeMutation: () => void
  /** Pop the latest undo entry; returns the snapshot to apply, or null when stack is empty. */
  tryUndo: () => EditorSnapshot | null
  /** Pop the latest redo entry; returns the snapshot to apply, or null when stack is empty. */
  tryRedo: () => EditorSnapshot | null
  /** Clear both stacks (e.g. when loading a different document). */
  clear: () => void
  /** Push a UI tick — call after `tryUndo`/`tryRedo`/`clear` resolves so consumers re-render. */
  bumpUi: () => void
  /** Tick value (re-rendering signal); also updated by `pushBeforeMutation` and `bumpUi`. */
  tick: number
  /** Memoized `EditorUndoApi` for `EditorUndoProvider` (gesture coalescing wired in). */
  editorUndoApi: EditorUndoApi
  /** True when there is at least one undo entry. Re-evaluated on `tick`. */
  canUndo: boolean
  /** True when there is at least one redo entry. Re-evaluated on `tick`. */
  canRedo: boolean
}

/**
 * Owns the project-level undo/redo history (`createEditorHistory` + a UI tick + the
 * pre-gesture snapshot used for coalesced drag commits via `EditorUndoApi`).
 *
 * The combined keyboard-shortcut handler in Builder still composes this with the
 * Texture Maker history (Texture Maker undo wins when its draft is active).
 */
export function useEditorHistory(
  { worldAssetsRef, maxDepth }: UseEditorHistoryParams,
): UseEditorHistoryResult {
  const historyRef = useRef(createEditorHistory(maxDepth))
  const gestureSnapshotRef = useRef<EditorSnapshot | null>(null)
  const [tick, setTick] = useState(0)
  const bumpUi = useCallback(() => setTick((n) => n + 1), [])

  const pushBeforeMutation = useCallback(() => {
    const { world, assets } = worldAssetsRef.current
    historyRef.current.pushBeforeMutation(world, assets)
    bumpUi()
  }, [bumpUi, worldAssetsRef])

  const tryUndo = useCallback((): EditorSnapshot | null => {
    const { world, assets } = worldAssetsRef.current
    const snap = historyRef.current.undo(world, assets)
    if (snap) bumpUi()
    return snap
  }, [bumpUi, worldAssetsRef])

  const tryRedo = useCallback((): EditorSnapshot | null => {
    const { world, assets } = worldAssetsRef.current
    const snap = historyRef.current.redo(world, assets)
    if (snap) bumpUi()
    return snap
  }, [bumpUi, worldAssetsRef])

  const clear = useCallback(() => {
    historyRef.current.clear()
    bumpUi()
  }, [bumpUi])

  const editorUndoApi = useMemo<EditorUndoApi>(
    () => ({
      pushBeforeEdit: () => {
        pushBeforeMutation()
      },
      notifyScrubStart: () => {
        const { world, assets } = worldAssetsRef.current
        gestureSnapshotRef.current = cloneEditorSnapshot(world, assets)
      },
      notifyScrubEnd: (hadScrub: boolean) => {
        if (hadScrub && gestureSnapshotRef.current) {
          historyRef.current.commitCoalescedGesture(gestureSnapshotRef.current)
          bumpUi()
        }
        gestureSnapshotRef.current = null
      },
    }),
    [pushBeforeMutation, bumpUi, worldAssetsRef],
  )

  void tick
  const canUndo = historyRef.current.canUndo()
  const canRedo = historyRef.current.canRedo()

  return {
    pushBeforeMutation,
    tryUndo,
    tryRedo,
    clear,
    bumpUi,
    tick,
    editorUndoApi,
    canUndo,
    canRedo,
  }
}
