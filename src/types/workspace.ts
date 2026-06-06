import type { ScriptEvent } from '@/types/world'

/** Top-level Workspace shell tabs (Phase 2+). */
export type WorkspaceShellTabId = 'transformers' | 'scripts' | 'organize'

/** Organize tab: which registry to browse (Phase 5+). */
export type WorkspaceOrganizeKind = 'transformers' | 'scripts' | 'pipes'

/** Organize tab: data scope (Global = Phase 6). */
export type WorkspaceOrganizeScope = 'global' | 'project' | 'entity'

/**
 * Opens the Workspace anchored on an entity row + optional registry item.
 * `itemId` is a transformer ID (`world.transformers`) or script ID (`world.scripts`) when known.
 */
/** Whether `itemId` refers to the world registry or the IndexedDB global library (Organize → Global). */
export type WorkspaceItemSource = 'project' | 'global'

export type WorkspaceTarget = {
  entityId?: string
  tab: 'transformers' | 'scripts' | 'organize'
  itemId?: string
  /** When set to `global`, `itemId` is resolved from the cross-project IndexedDB library. */
  itemSource?: WorkspaceItemSource
  /** Restores pipe navigation depth in the Transformers tab. */
  pipeNavPath?: import('./pipeNav').PipeNavPathSegment[]
  pipeNavSelectedIndex?: number
  /** When `tab === 'organize'`, restores scope/kind subtabs (e.g. Scripts > Manage). */
  organize?: {
    scope: WorkspaceOrganizeScope
    kind: WorkspaceOrganizeKind
  }
}

/** Drives the single shared `TransformerCustomCodeEditor` mounted in `Workspace.tsx`. */
type WorkspaceMonacoPayloadBase = {
  value: string
  onChange: (next: string) => void
  disabled: boolean
  /** Remount when the edited item changes (e.g. script id). Manual refresh uses Workspace state. */
  refreshKey: number
  /** Called before the shared Monaco remounts (flush debounced edits). */
  beforeRefresh?: () => void
}

/** Drives the single shared `TransformerCustomCodeEditor` mounted in `Workspace.tsx`. */
export type WorkspaceMonacoPayload =
  | (WorkspaceMonacoPayloadBase & { kind: 'transformer-ts' })
  | (WorkspaceMonacoPayloadBase & { kind: 'script-js'; scriptEvent: ScriptEvent })
  | (WorkspaceMonacoPayloadBase & { kind: 'placeholder' })
