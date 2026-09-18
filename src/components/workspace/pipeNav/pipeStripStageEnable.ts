import type { PipeNavPathSegment } from '@/types/pipeNav'

/**
 * Enable chrome for every stage card in a focused pipe strip. The strip index is ignored:
 * all cards share the same ancestor chain (`focusPath`).
 */
export function pipeStripStageEnabledFromFocus(
  isScopeEnabled: (path: PipeNavPathSegment[]) => boolean,
  focusPath: PipeNavPathSegment[],
): (indexInStrip: number) => boolean {
  return () => isScopeEnabled(focusPath)
}
