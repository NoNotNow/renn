import type { TextureDocument } from '@/utils/textureCompositor'

/** Immutable snapshot of Texture Maker draft state for undo/redo. */
export interface TextureMakerSnapshot {
  doc: TextureDocument
  assets: Map<string, Blob>
  selectedLayerId: string | null
}

export function cloneTextureMakerSnapshot(
  doc: TextureDocument,
  assets: Map<string, Blob>,
  selectedLayerId: string | null,
): TextureMakerSnapshot {
  return {
    doc: JSON.parse(JSON.stringify(doc)) as TextureDocument,
    assets: new Map(assets),
    selectedLayerId,
  }
}

export interface TextureMakerHistoryApi {
  /** Record current draft before a discrete edit; clears redo. */
  pushBeforeMutation(doc: TextureDocument, assets: Map<string, Blob>, selectedLayerId: string | null): void
  undo(
    currentDoc: TextureDocument,
    currentAssets: Map<string, Blob>,
    currentSelectedLayerId: string | null,
  ): TextureMakerSnapshot | null
  redo(
    currentDoc: TextureDocument,
    currentAssets: Map<string, Blob>,
    currentSelectedLayerId: string | null,
  ): TextureMakerSnapshot | null
  clear(): void
  canUndo(): boolean
  canRedo(): boolean
}

export function createTextureMakerHistory(maxDepth: number): TextureMakerHistoryApi {
  const undoStack: TextureMakerSnapshot[] = []
  const redoStack: TextureMakerSnapshot[] = []

  const trimUndo = (): void => {
    while (undoStack.length > maxDepth) {
      undoStack.shift()
    }
  }

  return {
    pushBeforeMutation(doc: TextureDocument, assets: Map<string, Blob>, selectedLayerId: string | null): void {
      undoStack.push(cloneTextureMakerSnapshot(doc, assets, selectedLayerId))
      trimUndo()
      redoStack.length = 0
    },

    undo(
      currentDoc: TextureDocument,
      currentAssets: Map<string, Blob>,
      currentSelectedLayerId: string | null,
    ): TextureMakerSnapshot | null {
      if (undoStack.length === 0) return null
      const prev = undoStack.pop()!
      redoStack.push(cloneTextureMakerSnapshot(currentDoc, currentAssets, currentSelectedLayerId))
      return prev
    },

    redo(
      currentDoc: TextureDocument,
      currentAssets: Map<string, Blob>,
      currentSelectedLayerId: string | null,
    ): TextureMakerSnapshot | null {
      if (redoStack.length === 0) return null
      const next = redoStack.pop()!
      undoStack.push(cloneTextureMakerSnapshot(currentDoc, currentAssets, currentSelectedLayerId))
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
