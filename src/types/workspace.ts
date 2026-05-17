import type { ScriptEvent } from '@/types/world'

/** Top-level Workspace shell tabs (Phase 2+). */
export type WorkspaceShellTabId = 'transformers' | 'scripts' | 'organize'

/** Organize tab: which registry to browse (Phase 5+). */
export type WorkspaceOrganizeKind = 'transformers' | 'scripts'

/** Organize tab: data scope (Global = Phase 6). */
export type WorkspaceOrganizeScope = 'global' | 'project' | 'entity'

/**
 * Opens the Workspace anchored on an entity row + optional registry item.
 * `itemId` is a transformer ID (`world.transformers`) or script ID (`world.scripts`) when known.
 */
/** Whether `itemId` refers to the world registry or the IndexedDB global library (Organize → Global). */
export type WorkspaceItemSource = 'project' | 'global'

export type WorkspaceTarget = {
  entityId: string
  tab: 'transformers' | 'scripts' | 'organize'
  itemId?: string
  /** When set to `global`, `itemId` is resolved from the cross-project IndexedDB library. */
  itemSource?: WorkspaceItemSource
  /** When `tab === 'organize'`, restores scope/kind subtabs (e.g. Scripts > Manage). */
  organize?: {
    scope: WorkspaceOrganizeScope
    kind: WorkspaceOrganizeKind
  }
}

/** Drives the single shared `TransformerCustomCodeEditor` mounted in `Workspace.tsx`. */
export type WorkspaceMonacoPayload =
  | {
      kind: 'transformer-ts'
      value: string
      onChange: (next: string) => void
      disabled: boolean
      refreshKey: number
    }
  | {
      kind: 'script-js'
      value: string
      onChange: (next: string) => void
      disabled: boolean
      refreshKey: number
      scriptEvent: ScriptEvent
    }
  | {
      kind: 'placeholder'
      value: string
      onChange: (next: string) => void
      disabled: boolean
      refreshKey: number
    }
