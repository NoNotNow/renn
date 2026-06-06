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
