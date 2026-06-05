import { createContext, useContext, type MutableRefObject } from 'react'
import type { editor } from 'monaco-editor'

export const WorkspaceMonacoContext = createContext<MutableRefObject<editor.IStandaloneCodeEditor | null> | null>(
  null,
)

export function useWorkspaceMonacoEditorRef(): MutableRefObject<editor.IStandaloneCodeEditor | null> {
  const ref = useContext(WorkspaceMonacoContext)
  if (!ref) {
    throw new Error('useWorkspaceMonacoEditorRef must be used inside Workspace')
  }
  return ref
}
