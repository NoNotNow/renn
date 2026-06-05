import { createContext, useContext, type RefObject } from 'react'

export const WORKSPACE_MONACO_TOOLBAR_WIDTH_PX = 36

export type WorkspaceMonacoEditorAreaContextValue = {
  editorAreaRef: RefObject<HTMLDivElement | null>
  toolbarWidthPx: number
}

export const WorkspaceMonacoEditorAreaContext =
  createContext<WorkspaceMonacoEditorAreaContextValue | null>(null)

export function useWorkspaceMonacoEditorArea(): WorkspaceMonacoEditorAreaContextValue | null {
  return useContext(WorkspaceMonacoEditorAreaContext)
}
