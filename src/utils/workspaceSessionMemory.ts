import type { WorkspaceTarget } from '@/types/workspace'

export type WorkspaceEntityMemory = Pick<
  WorkspaceTarget,
  'tab' | 'itemId' | 'itemSource' | 'pipeNavPath' | 'pipeNavSelectedIndex' | 'organize'
>

/** Per-entity workspace anchors (pipe depth, selection, tab) within a Builder session. */
export class WorkspaceSessionMemory {
  private readonly byEntity = new Map<string, WorkspaceEntityMemory>()

  save(entityId: string, entry: WorkspaceTarget): void {
    this.byEntity.set(entityId, {
      tab: entry.tab,
      itemId: entry.itemId,
      itemSource: entry.itemSource,
      pipeNavPath: entry.pipeNavPath,
      pipeNavSelectedIndex: entry.pipeNavSelectedIndex,
      organize: entry.organize,
    })
  }

  load(entityId: string): WorkspaceEntityMemory | undefined {
    return this.byEntity.get(entityId)
  }

  clearForTests(): void {
    this.byEntity.clear()
  }
}

export function mergeWorkspaceEntryForEntity(
  entityId: string,
  memory: WorkspaceEntityMemory | undefined,
  fallback: WorkspaceTarget,
): WorkspaceTarget {
  if (!memory) return { ...fallback, entityId }
  return {
    ...fallback,
    entityId,
    tab: memory.tab ?? fallback.tab,
    itemId: memory.itemId ?? fallback.itemId,
    itemSource: memory.itemSource ?? fallback.itemSource,
    pipeNavPath: memory.pipeNavPath ?? fallback.pipeNavPath,
    pipeNavSelectedIndex: memory.pipeNavSelectedIndex ?? fallback.pipeNavSelectedIndex,
    organize: memory.organize ?? fallback.organize,
  }
}
