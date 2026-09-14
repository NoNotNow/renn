import type { PipeNavPathSegment } from '@/types/pipeNav'

export interface PipeCardStageContext {
  pipeId: string
  stackIndex: number | undefined
  scopePath: PipeNavPathSegment[]
}

export interface PipeCardStageHandlers {
  onPipeControlToggle?: (opts: {
    pipeId: string
    stackIndex?: number
    memberParentPipeId?: string
    memberIndex?: number
  }) => void
  onPipeParamChange?: (opts: {
    pipeId: string
    stackIndex?: number
    scopePath?: PipeNavPathSegment[]
    key: string
    value: unknown
  }) => void
  onPipeParamsReplace?: (opts: {
    pipeId: string
    stackIndex?: number
    scopePath?: PipeNavPathSegment[]
    params: Record<string, unknown>
  }) => void
}

export interface PipeCardToggleExtras {
  memberParentPipeId?: string
  memberIndex?: number
}

function normalizedToggleStackIndex(stackIndex: number | undefined): number | undefined {
  return stackIndex !== undefined && stackIndex >= 0 ? stackIndex : undefined
}

/** Wrap flat pipe-nav callbacks into PipeCard prop shapes. */
export function createPipeCardStageCallbacks(
  ctx: PipeCardStageContext,
  handlers: PipeCardStageHandlers,
  toggleExtras?: PipeCardToggleExtras,
): {
  onToggleEnabled: () => void
  onParamChange: (key: string, value: unknown) => void
  onParamsReplace: (params: Record<string, unknown>) => void
} {
  const { pipeId, stackIndex, scopePath } = ctx
  const { onPipeControlToggle, onPipeParamChange, onPipeParamsReplace } = handlers

  return {
    onToggleEnabled: () =>
      onPipeControlToggle?.({
        pipeId,
        stackIndex: normalizedToggleStackIndex(stackIndex),
        ...toggleExtras,
      }),
    onParamChange: (key, value) =>
      onPipeParamChange?.({
        pipeId,
        stackIndex,
        scopePath,
        key,
        value,
      }),
    onParamsReplace: (params) =>
      onPipeParamsReplace?.({
        pipeId,
        stackIndex,
        scopePath,
        params,
      }),
  }
}
