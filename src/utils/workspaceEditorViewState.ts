/** In-memory Monaco scroll/cursor view-state store; consumed by workspaceEditorSession for the shared shell editor. */

import type { editor } from 'monaco-editor'

export type WorkspaceEditorViewState = editor.ICodeEditorViewState

const viewStateStore = new Map<string, WorkspaceEditorViewState>()

export function saveWorkspaceEditorViewState(key: string, state: WorkspaceEditorViewState): void {
  viewStateStore.set(key, state)
}

export function loadWorkspaceEditorViewState(key: string): WorkspaceEditorViewState | undefined {
  return viewStateStore.get(key)
}

export function clearWorkspaceEditorViewStateStoreForTests(): void {
  viewStateStore.clear()
}
