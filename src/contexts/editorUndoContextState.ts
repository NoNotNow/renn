import { createContext } from 'react'

/** Builder-only: coordinate undo checkpoints with drag coalescing. */
export interface EditorUndoApi {
  /** Snapshot document before a discrete edit (also used before blur commits that change value). */
  pushBeforeEdit: () => void
  /** Start of a number scrub: capture pre-gesture state once. */
  notifyScrubStart: () => void
  /** End of scrub; if the pointer moved past dead zone, record one undo step. */
  notifyScrubEnd: (hadScrub: boolean) => void
}

export const EditorUndoContext = createContext<EditorUndoApi | null>(null)
