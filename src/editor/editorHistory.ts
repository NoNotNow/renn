import type { RennWorld } from '@/types/world'

/** Immutable snapshot of builder-editable state for undo/redo. */
export interface EditorSnapshot {
  world: RennWorld
  assets: Map<string, Blob>
}

export function cloneEditorSnapshot(world: RennWorld, assets: Map<string, Blob>): EditorSnapshot {
  return {
    world: structuredClone(world),
    assets: new Map(assets),
  }
}

export interface EditorHistoryApi {
  /** Record current document before a discrete edit; clears redo. */
  pushBeforeMutation(world: RennWorld, assets: Map<string, Blob>): void
  /** Record pre-gesture state after a coalesced drag (caller captured at scrub start). */
  commitCoalescedGesture(preState: EditorSnapshot): void
  undo(currentWorld: RennWorld, currentAssets: Map<string, Blob>): EditorSnapshot | null
  redo(currentWorld: RennWorld, currentAssets: Map<string, Blob>): EditorSnapshot | null
  clear(): void
  canUndo(): boolean
  canRedo(): boolean
}

export function createEditorHistory(maxDepth: number): EditorHistoryApi {
  const undoStack: EditorSnapshot[] = []
  const redoStack: EditorSnapshot[] = []

  const trimUndo = (): void => {
    while (undoStack.length > maxDepth) {
      undoStack.shift()
    }
  }

  return {
    pushBeforeMutation(world: RennWorld, assets: Map<string, Blob>): void {
      undoStack.push(cloneEditorSnapshot(world, assets))
      trimUndo()
      redoStack.length = 0
    },

    commitCoalescedGesture(preState: EditorSnapshot): void {
      undoStack.push(cloneEditorSnapshot(preState.world, preState.assets))
      trimUndo()
      redoStack.length = 0
    },

    undo(currentWorld: RennWorld, currentAssets: Map<string, Blob>): EditorSnapshot | null {
      if (undoStack.length === 0) return null
      const prev = undoStack.pop()!
      redoStack.push(cloneEditorSnapshot(currentWorld, currentAssets))
      return prev
    },

    redo(currentWorld: RennWorld, currentAssets: Map<string, Blob>): EditorSnapshot | null {
      if (redoStack.length === 0) return null
      const next = redoStack.pop()!
      undoStack.push(cloneEditorSnapshot(currentWorld, currentAssets))
      return next
    },

    clear(): void {
      undoStack.length = 0
      redoStack.length = 0
    },

    canUndo(): boolean {
      return undoStack.length > 0
    },

    canRedo(): boolean {
      return redoStack.length > 0
    },
  }
}
