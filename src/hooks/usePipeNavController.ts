import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TransformerConfig, TransformerPipe } from '@/types/transformer'
import type { Entity, RennWorld } from '@/types/world'
import type { WorkspaceTarget } from '@/types/workspace'
import { usePipeNavigator } from '@/hooks/usePipeNavigator'
import { useEditorUndo } from '@/contexts/EditorUndoContext'
import {
  addExistingPipeAtFocus,
  createEmptyPipe,
  renamePipe,
  toggleStackBindingEnabled,
  toggleMemberEnabled,
  updateBindingParams,
  updatePipeDefaultParams,
  decoupleStackBindingToCopy,
  ensureEntityPipeStack,
  reorderStackBindings,
  reorderPipeMembers,
  updateFocusedStageOrder,
} from '@/utils/pipeNavMutations'
import { drillIntoPipePath, resolveFocusedStageConfigs } from '@/utils/pipeNavResolve'
import { getEntityPipeStack } from '@/utils/transformerPipeResolve'

export function usePipeNavController(
  world: RennWorld,
  entity: Entity,
  entry: WorkspaceTarget | null | undefined,
  onWorldChange: (world: RennWorld) => void,
  onEntryChange?: (next: WorkspaceTarget) => void,
  onCommitStagesFlat?: (configs: TransformerConfig[], orderedIds?: string[]) => void,
) {
  const undo = useEditorUndo()
  const navigator = usePipeNavigator(world, entity, entry?.pipeNavPath, entry?.pipeNavSelectedIndex)
  const { focus, view, setPath, goUp, goLeft, goRight, drillInto, selectSibling, focusedPipeId } = navigator

  const [nameDialog, setNameDialog] = useState<{
    title: string
    name: string
    onConfirm: (name: string) => void
  } | null>(null)

  const stageData = useMemo(
    () => resolveFocusedStageConfigs(world, entity, focus),
    [world, entity, focus],
  )

  const focusedTitle = view?.containerLabel ?? entity.name ?? entity.id

  const stackIndexForPipeId = useCallback(
    (pipeId: string) => getEntityPipeStack(entity).findIndex((b) => b.pipeId === pipeId),
    [entity],
  )

  useEffect(() => {
    if (!onEntryChange || !entry) return
    onEntryChange({
      ...entry,
      pipeNavPath: focus.path,
      pipeNavSelectedIndex: focus.selectedSiblingIndex,
    })
  }, [focus.path, focus.selectedSiblingIndex, onEntryChange, entry])

  useEffect(() => {
    if (!entity.id) return
    const fresh = world.entities.find((e) => e.id === entity.id)
    if (!fresh || getEntityPipeStack(fresh).length > 0) return

    const { world: nextWorld, created, pipeId } = ensureEntityPipeStack(world, entity.id)
    if (!created || !pipeId) return

    const freshEntity = nextWorld.entities.find((e) => e.id === entity.id)
    if (!freshEntity) return

    onWorldChange(nextWorld)
    const drillPath = drillIntoPipePath(nextWorld, freshEntity, [], 0, 'pipe', pipeId)
    setPath(drillPath, 0)
  }, [entity.id, world, onWorldChange, setPath])

  const pushWorld = useCallback(
    (next: RennWorld) => {
      undo?.pushBeforeEdit()
      onWorldChange(next)
    },
    [undo, onWorldChange],
  )

  const promptName = useCallback((title: string, defaultName: string, onConfirm: (name: string) => void) => {
    setNameDialog({ title, name: defaultName, onConfirm })
  }, [])

  const createPipeAtFocus = useCallback(
    (name: string, placement: 'stack_sibling' | 'member_sibling' | 'member_child') => {
      const { world: nextWorld, focusPath } = createEmptyPipe(
        world,
        entity.id,
        name,
        focus.path,
        placement,
      )
      pushWorld(nextWorld)
      setPath(focusPath, 0)
    },
    [world, entity.id, focus.path, pushWorld, setPath],
  )

  const handleCreatePipe = useCallback(
    (name: string) => {
      const placement = view?.mode === 'pipe_members' ? 'member_sibling' : 'stack_sibling'
      createPipeAtFocus(name, placement)
    },
    [view?.mode, createPipeAtFocus],
  )

  const handleAddChildPipe = useCallback(
    (name: string) => {
      createPipeAtFocus(name, 'member_child')
    },
    [createPipeAtFocus],
  )

  const handleAddExistingPipe = useCallback(
    (pipe: TransformerPipe, mode: 'linked' | 'copy') => {
      const { world: nw, focusPath } = addExistingPipeAtFocus(
        world,
        entity.id,
        pipe,
        mode,
        focus.path,
      )
      pushWorld(nw)
      setPath(focusPath, 0)
    },
    [world, entity.id, focus.path, pushWorld, setPath],
  )

  const handleRename = useCallback(
    (name: string) => {
      if (!focusedPipeId) return
      pushWorld(renamePipe(world, focusedPipeId, name))
    },
    [focusedPipeId, world, pushWorld],
  )

  const handleCommitStagesWrapped = useCallback(
    (configs: TransformerConfig[], orderedIds?: string[]) => {
      if (view?.mode === 'entity_stages' && getEntityPipeStack(entity).length === 0) {
        onCommitStagesFlat?.(configs, orderedIds)
        return
      }
      let nextWorld = world
      const ids = orderedIds ?? stageData.ids
      for (let i = 0; i < configs.length; i++) {
        const id = ids[i]
        if (id && configs[i]) {
          nextWorld = {
            ...nextWorld,
            transformers: { ...(nextWorld.transformers ?? {}), [id]: configs[i]! },
          }
        }
      }
      if (orderedIds) {
        nextWorld = updateFocusedStageOrder(nextWorld, entity.id, focus.path, orderedIds)
      }
      pushWorld(nextWorld)
    },
    [view?.mode, entity, world, focus.path, stageData.ids, onCommitStagesFlat, pushWorld],
  )

  const confirmNameDialog = useCallback(() => {
    if (nameDialog?.name.trim()) nameDialog.onConfirm(nameDialog.name.trim())
    setNameDialog(null)
  }, [nameDialog])

  const togglePipeEnabled = useCallback(
    (opts: { stackIndex?: number; memberParentPipeId?: string; memberIndex?: number }) => {
      if (opts.stackIndex !== undefined && opts.stackIndex >= 0) {
        pushWorld(toggleStackBindingEnabled(world, entity.id, opts.stackIndex))
        return
      }
      if (opts.memberParentPipeId != null && opts.memberIndex != null) {
        pushWorld(toggleMemberEnabled(world, opts.memberParentPipeId, opts.memberIndex))
      }
    },
    [world, entity.id, pushWorld],
  )

  const updatePipeParam = useCallback(
    (opts: {
      pipeId: string
      stackIndex?: number
      key: string
      value: unknown
      useSharedDefaults?: boolean
    }) => {
      if (opts.useSharedDefaults || opts.stackIndex === undefined || opts.stackIndex < 0) {
        pushWorld(updatePipeDefaultParams(world, opts.pipeId, { [opts.key]: opts.value }))
        return
      }
      pushWorld(updateBindingParams(world, entity.id, opts.stackIndex, { [opts.key]: opts.value }))
    },
    [world, entity.id, pushWorld],
  )

  const decouplePipeBinding = useCallback(
    (stackIndex: number) => {
      const binding = getEntityPipeStack(entity)[stackIndex]
      const linkCount = world.entities.filter((e) =>
        getEntityPipeStack(e).some((b) => b.pipeId === binding?.pipeId && b.mode !== 'copy'),
      ).length
      const ok = window.confirm(
        `${linkCount} entities share this pipe. Copy it for this entity only? Other entities keep the shared version.`,
      )
      if (!ok) return
      pushWorld(decoupleStackBindingToCopy(world, entity.id, stackIndex))
    },
    [world, entity, pushWorld],
  )

  return {
    navigator,
    view,
    focus,
    stageData,
    focusedTitle,
    focusedPipeId,
    setPath,
    goUp,
    goLeft,
    goRight,
    drillInto,
    selectSibling,
    handleCreatePipe,
    handleAddChildPipe,
    handleAddExistingPipe,
    handleRename,
    handleCommitStagesWrapped,
    nameDialog,
    setNameDialog,
    confirmNameDialog,
    pushWorld,
    stackIndexForPipeId,
    togglePipeEnabled,
    updatePipeParam,
    decouplePipeBinding,
    toggleStackAt: (idx: number) => pushWorld(toggleStackBindingEnabled(world, entity.id, idx)),
    updateParamsAt: (stackIndex: number, key: string, value: unknown) =>
      pushWorld(updateBindingParams(world, entity.id, stackIndex, { [key]: value })),
    reorderStack: (from: number, to: number) => pushWorld(reorderStackBindings(world, entity.id, from, to)),
    reorderMember: (pipeId: string, from: number, to: number) =>
      pushWorld(reorderPipeMembers(world, pipeId, from, to)),
  }
}
