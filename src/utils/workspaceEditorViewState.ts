import type { editor } from 'monaco-editor'
import type { PipeNavPathSegment } from '@/types/pipeNav'
import type { WorkspaceShellTabId } from '@/types/workspace'

export type WorkspaceEditorViewState = editor.ICodeEditorViewState

export type WorkspaceEditorItemKeyInput = {
  entityId?: string
  tab: WorkspaceShellTabId
  itemId?: string
  pipeNavPath?: PipeNavPathSegment[]
}

/** Stable key for per-item Monaco scroll/cursor persistence. */
export function workspaceEditorItemKey(input: WorkspaceEditorItemKeyInput): string | null {
  if (!input.itemId) return null
  const entity = input.entityId ?? '_no_entity'
  const pathKey =
    input.pipeNavPath?.length ?
      input.pipeNavPath
        .map((seg) =>
          seg.kind === 'stack' ? `s${seg.index}` : `m${seg.pipeId}:${seg.memberIndex}`,
        )
        .join('/')
    : '_root'
  return `${entity}:${input.tab}:${input.itemId}:${pathKey}`
}

const viewStateStore = new Map<string, WorkspaceEditorViewState>()
const draftStore = new Map<string, string>()

export function saveWorkspaceEditorViewState(key: string, state: WorkspaceEditorViewState): void {
  viewStateStore.set(key, state)
}

export function loadWorkspaceEditorViewState(key: string): WorkspaceEditorViewState | undefined {
  return viewStateStore.get(key)
}

/** Persists in-progress Monaco text (e.g. unapplied script edits) across workspace close/reopen. */
export function saveWorkspaceEditorDraft(key: string, text: string): void {
  draftStore.set(key, text)
}

export function loadWorkspaceEditorDraft(key: string): string | undefined {
  return draftStore.get(key)
}

export function deleteWorkspaceEditorDraft(key: string): void {
  draftStore.delete(key)
}

export function clearWorkspaceEditorViewStateStoreForTests(): void {
  viewStateStore.clear()
  draftStore.clear()
}
