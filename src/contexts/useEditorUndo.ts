import { useContext } from 'react'
import { EditorUndoContext, type EditorUndoApi } from './editorUndoContextState'

export function useEditorUndo(): EditorUndoApi | null {
  return useContext(EditorUndoContext)
}
