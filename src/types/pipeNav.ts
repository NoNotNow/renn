/** One segment in the pipe navigation path (entity root = empty path). */
export type PipeNavPathSegment =
  | { kind: 'stack'; index: number }
  | { kind: 'member'; pipeId: string; memberIndex: number }

export type PipeNavFocus = {
  path: PipeNavPathSegment[]
  selectedSiblingIndex: number
}

export type PipeNavViewMode = 'entity_stages' | 'pipe_siblings' | 'pipe_members'

export type StripItem =
  | {
      kind: 'pipe'
      pipeId: string
      index: number
      binding?: import('./transformer').TransformerPipeBinding
    }
  | { kind: 'stage'; stageId: string; index: number }

/** A row in the pipe-nav tree. Also the addressing used by tree delete / drop edits. */
export type PipeTreeNode =
  | { kind: 'entity'; entityId: string; label: string }
  | { kind: 'stack_pipe'; pipeId: string; stackIndex: number; label: string }
  | { kind: 'member_stage'; pipeId: string; parentPipeId: string; memberIndex: number; stageId: string; label: string }
  /** A stage sitting directly on the entity, next to its pipe stack. */
  | { kind: 'top_stage'; stageId: string; label: string }
  | { kind: 'member_pipe'; pipeId: string; parentPipeId: string; memberIndex: number; label: string }

export type ResolvedPipeNavView = {
  mode: PipeNavViewMode
  depth: number
  items: StripItem[]
  /** Pipe id of the container being viewed (undefined at entity root). */
  containerPipeId?: string
  containerLabel: string
  canGoUp: boolean
  siblingCount: number
}
