import type { ReactNode } from 'react'

/** Optional toolbar buttons and overlays rendered by `WorkspaceMonacoSlot`. */
export type WorkspaceMonacoEditorChrome = {
  toolbarExtra?: ReactNode
  overlay?: ReactNode
}
