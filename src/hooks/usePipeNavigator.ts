import { useCallback, useMemo, useState } from 'react'
import type { PipeNavFocus, PipeNavPathSegment } from '@/types/pipeNav'
import type { Entity, RennWorld } from '@/types/world'
import {
  drillIntoPipePath,
  pipeNavParentPath,
  resolveFocusedPipeId,
  resolvePipeNavView,
} from '@/utils/pipeNavResolve'

export function usePipeNavigator(
  world: RennWorld,
  entity: Entity | undefined,
  initialPath?: PipeNavPathSegment[],
  initialSelectedIndex?: number,
) {
  const [focus, setFocus] = useState<PipeNavFocus>(() => ({
    path: initialPath ?? [],
    selectedSiblingIndex: initialSelectedIndex ?? 0,
  }))

  const view = useMemo(() => {
    if (!entity) return null
    return resolvePipeNavView(world, entity, focus)
  }, [world, entity, focus])

  const focusedPipeId = useMemo(() => {
    if (!entity) return undefined
    return resolveFocusedPipeId(world, entity, focus.path)
  }, [world, entity, focus.path])

  const setPath = useCallback((path: PipeNavPathSegment[], selectedSiblingIndex = 0) => {
    setFocus({ path, selectedSiblingIndex })
  }, [])

  const goUp = useCallback(() => {
    setFocus((prev) => ({
      path: pipeNavParentPath(prev.path),
      selectedSiblingIndex: 0,
    }))
  }, [])

  const goLeft = useCallback(() => {
    setFocus((prev) => {
      const count = prev.path.length === 0
        ? (entity ? resolvePipeNavView(world, entity, prev).siblingCount : 0)
        : resolvePipeNavView(world, entity!, prev).siblingCount
      if (count <= 1) return prev
      return {
        ...prev,
        selectedSiblingIndex: (prev.selectedSiblingIndex - 1 + count) % count,
      }
    })
  }, [world, entity])

  const goRight = useCallback(() => {
    setFocus((prev) => {
      const count = entity ? resolvePipeNavView(world, entity, prev).siblingCount : 0
      if (count <= 1) return prev
      return {
        ...prev,
        selectedSiblingIndex: (prev.selectedSiblingIndex + 1) % count,
      }
    })
  }, [world, entity])

  const drillInto = useCallback(
    (itemIndex: number, pipeId: string) => {
      if (!entity) return
      const nextPath = drillIntoPipePath(world, entity, focus.path, itemIndex, 'pipe', pipeId)
      setFocus({ path: nextPath, selectedSiblingIndex: 0 })
    },
    [world, entity, focus.path],
  )

  const selectSibling = useCallback((index: number) => {
    setFocus((prev) => ({ ...prev, selectedSiblingIndex: index }))
  }, [])

  return {
    focus,
    setFocus,
    setPath,
    view,
    focusedPipeId,
    goUp,
    goLeft,
    goRight,
    drillInto,
    selectSibling,
    depth: focus.path.length,
  }
}
