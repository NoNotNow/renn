import type { ReactNode } from 'react'
import { EditorUndoContext, type EditorUndoApi } from './editorUndoContextState'

export type { EditorUndoApi } from './editorUndoContextState'

export function EditorUndoProvider({
  value,
  children,
}: {
  value: EditorUndoApi
  children: ReactNode
}) {
  return <EditorUndoContext.Provider value={value}>{children}</EditorUndoContext.Provider>
}

