/** In-memory store for unapplied Scripts-tab Monaco text across workspace close/reopen. */

const draftStore = new Map<string, string>()

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

export function clearWorkspaceEditorDraftStoreForTests(): void {
  draftStore.clear()
}
