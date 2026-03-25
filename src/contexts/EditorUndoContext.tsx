import { createContext, useContext, type ReactNode } from 'react'

/** Builder-only: coordinate undo checkpoints with drag coalescing. */
export interface EditorUndoApi {
  /** Snapshot document before a discrete edit (also used before blur commits that change value). */
  pushBeforeEdit: () => void
  /** Start of a number scrub: capture pre-gesture state once. */
  notifyScrubStart: () => void
  /** End of scrub; if the pointer moved past dead zone, record one undo step. */
  notifyScrubEnd: (hadScrub: boolean) => void
}

const EditorUndoContext = createContext<EditorUndoApi | null>(null)

export function EditorUndoProvider({
  value,
  children,
}: {
  value: EditorUndoApi
  children: ReactNode
}) {
  return <EditorUndoContext.Provider value={value}>{children}</EditorUndoContext.Provider>
}

export function useEditorUndo(): EditorUndoApi | null {
  return useContext(EditorUndoContext)
}
