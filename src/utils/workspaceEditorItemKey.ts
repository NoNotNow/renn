/** Shared stable key builder for workspace Monaco per-item persistence (view state and drafts). */

import type { PipeNavPathSegment } from '@/types/pipeNav'
import type { WorkspaceShellTabId } from '@/types/workspace'

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
