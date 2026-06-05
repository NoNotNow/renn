/** Remount shared Monaco shortly after first show so layout settles (same effect as Refresh editor). */
export const WORKSPACE_EDITOR_OPEN_REFRESH_MS = 100

/** Once per page load — avoids repeat remounts when closing and reopening Workspace. */
let workspaceEditorInitialRefreshDone = false

export function isWorkspaceEditorInitialRefreshDone(): boolean {
  return workspaceEditorInitialRefreshDone
}

export function markWorkspaceEditorInitialRefreshDone(): void {
  workspaceEditorInitialRefreshDone = true
}

/** @internal Resets session refresh flag (tests only). */
export function resetWorkspaceEditorInitialRefreshForTests(): void {
  workspaceEditorInitialRefreshDone = false
}
