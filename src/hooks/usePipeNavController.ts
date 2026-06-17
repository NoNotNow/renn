import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TransformerConfig, TransformerPipe } from '@/types/transformer'
import type { PipeNavPathSegment } from '@/types/pipeNav'
import type { Entity, RennWorld } from '@/types/world'
import type { WorkspaceTarget } from '@/types/workspace'
import { usePipeNavigator } from '@/hooks/usePipeNavigator'
import { useEditorUndo } from '@/contexts/EditorUndoContext'
import type { PipeTreeNode } from '@/components/workspace/pipeNav/PipeNavTree'
import {
  addExistingPipeAtFocus,
  createEmptyPipe,
  renamePipe,
  toggleStackBindingEnabled,
  toggleMemberEnabled,
  updateBindingParams,
  updateBindingScopeParams,
  setBindingParams,
  setBindingScopeParams,
  decoupleStackBindingToCopy,
  ensureEntityPipeStack,
  reorderStackBindings,
  reorderPipeMembers,
  updateFocusedStageOrder,
  deleteStackBinding,
  deletePipeMember,
  insertEmptyPipeAtNode,
  nestStackPipeAsMember,
  promoteMemberPipeToStack,
  moveMemberPipe,
  moveMemberStage,
} from '@/utils/pipeNavMutations'
import {
  drillIntoPipePath,
  isPipeNavLeafLevel,
  reconcilePipeNavPath,
  resolveFocusedStageConfigs,
  stackSiblingInsertIndexFromPath,
  wouldNestCreateCycle,
} from '@/utils/pipeNavResolve'
import {
  defaultNameForTreeInsert,
  placementForTreeContext,
  type PipeTreeContextTarget,
} from '@/utils/pipeNavTreeHelpers'
import { countEntitiesLinkingPipe } from '@/utils/commitTransformerConfigsToWorld'
import { getEntityPipeStack, normalizePipeMembers } from '@/utils/transformerPipeResolve'
import {
  entityIdsAffectedByPipeParamChange,
  isStackRootScopePath,
  stackIndexFromScopePath,
} from '@/utils/pipeStageResolve'

type PipeParamEditOpts = {
  pipeId: string
  stackIndex?: number
  scopePath?: PipeNavPathSegment[]
  key?: string
  value?: unknown
  params?: Record<string, unknown>
}

function applyPipeParamWorldUpdate(
  world: RennWorld,
  entityId: string,
  opts: PipeParamEditOpts,
  mode: 'merge' | 'replace',
): RennWorld {
  const stackIndex = opts.stackIndex
  if (stackIndex === undefined || stackIndex < 0) return world

  const params =
    opts.params ??
    (opts.key !== undefined ? { [opts.key]: opts.value } : {})

  const scopePath = opts.scopePath ?? [{ kind: 'stack' as const, index: stackIndex }]
  if (isStackRootScopePath(scopePath)) {
    return mode === 'replace'
      ? setBindingParams(world, entityId, stackIndex, params)
      : updateBindingParams(world, entityId, stackIndex, params)
  }

  return mode === 'replace'
    ? setBindingScopeParams(world, entityId, stackIndex, scopePath, params)
    : updateBindingScopeParams(world, entityId, stackIndex, scopePath, params)
}

export function usePipeNavController(
  world: RennWorld,
  entity: Entity,
  entry: WorkspaceTarget | null | undefined,
  onWorldChange: (world: RennWorld) => void,
  onEntryChange?: (next: WorkspaceTarget) => void,
  onCommitStagesFlat?: (configs: TransformerConfig[], orderedIds?: string[]) => void,
  onMergedParamSync?: (nextWorld: RennWorld, entityIds: string[]) => void,
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
    const prevPath = entry.pipeNavPath ?? []
    const prevIndex = entry.pipeNavSelectedIndex ?? 0
    if (
      prevIndex === focus.selectedSiblingIndex &&
      JSON.stringify(prevPath) === JSON.stringify(focus.path)
    ) {
      return
    }
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

  const syncMergedParamsAfterPipeEdit = useCallback(
    (nextWorld: RennWorld, _opts: PipeParamEditOpts) => {
      if (!onMergedParamSync) return
      const entityIds = entityIdsAffectedByPipeParamChange(nextWorld, {
        entityId: entity.id,
      })
      if (entityIds.length > 0) onMergedParamSync(nextWorld, entityIds)
    },
    [entity.id, onMergedParamSync],
  )

  const commitPipeParamEdit = useCallback(
    (opts: PipeParamEditOpts, mode: 'merge' | 'replace') => {
      const stackIndex =
        opts.stackIndex ??
        (opts.scopePath ? stackIndexFromScopePath(opts.scopePath) : undefined)
      const resolved: PipeParamEditOpts = { ...opts, stackIndex }
      const nextWorld = applyPipeParamWorldUpdate(world, entity.id, resolved, mode)
      pushWorld(nextWorld)
      syncMergedParamsAfterPipeEdit(nextWorld, resolved)
    },
    [world, entity.id, pushWorld, syncMergedParamsAfterPipeEdit],
  )

  const promptName = useCallback((title: string, defaultName: string, onConfirm: (name: string) => void) => {
    setNameDialog({ title, name: defaultName, onConfirm })
  }, [])

  const createPipeAtFocus = useCallback(
    (
      name: string,
      placement: 'stack_sibling' | 'member_sibling' | 'member_child',
      insertIndex?: number,
    ) => {
      const { world: nextWorld, focusPath } = createEmptyPipe(
        world,
        entity.id,
        name,
        focus.path,
        placement,
        insertIndex,
      )
      pushWorld(nextWorld)
      setPath(focusPath, 0)
    },
    [world, entity.id, focus.path, pushWorld, setPath],
  )

  const handleCreatePipe = useCallback(
    (name: string) => {
      if (isPipeNavLeafLevel(view)) {
        createPipeAtFocus(name, 'stack_sibling', stackSiblingInsertIndexFromPath(focus.path))
        return
      }
      const placement = view?.mode === 'pipe_members' ? 'member_sibling' : 'stack_sibling'
      createPipeAtFocus(name, placement)
    },
    [view, focus.path, createPipeAtFocus],
  )

  const handleAddChildPipe = useCallback(
    (name: string) => {
      createPipeAtFocus(name, 'member_child')
    },
    [createPipeAtFocus],
  )

  const handleAddExistingPipe = useCallback(
    (pipe: TransformerPipe, mode: 'linked' | 'copy') => {
      const atLeafLevel = isPipeNavLeafLevel(view)
      const { world: nw, focusPath } = addExistingPipeAtFocus(
        world,
        entity.id,
        pipe,
        mode,
        atLeafLevel ? [] : focus.path,
        atLeafLevel ? stackSiblingInsertIndexFromPath(focus.path) : undefined,
      )
      pushWorld(nw)
      setPath(focusPath, 0)
    },
    [world, entity.id, view, focus.path, pushWorld, setPath],
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
      onMergedParamSync?.(nextWorld, [entity.id])
    },
    [view?.mode, entity, world, focus.path, stageData.ids, onCommitStagesFlat, pushWorld, onMergedParamSync],
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
      scopePath?: PipeNavPathSegment[]
      key: string
      value: unknown
    }) => {
      commitPipeParamEdit(opts, 'merge')
    },
    [commitPipeParamEdit],
  )

  const replacePipeParams = useCallback(
    (opts: {
      pipeId: string
      stackIndex?: number
      scopePath?: PipeNavPathSegment[]
      params: Record<string, unknown>
    }) => {
      commitPipeParamEdit(opts, 'replace')
    },
    [commitPipeParamEdit],
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

  const applyStructuralChange = useCallback(
    (nextWorld: RennWorld, nextPath?: ReturnType<typeof reconcilePipeNavPath>) => {
      const freshEntity = nextWorld.entities.find((e) => e.id === entity.id)
      if (!freshEntity) return
      pushWorld(nextWorld)
      const reconciled =
        nextPath ?? reconcilePipeNavPath(nextWorld, freshEntity, focus.path, focus.selectedSiblingIndex)
      setPath(reconciled.path, reconciled.selectedSiblingIndex)
    },
    [entity.id, focus.path, focus.selectedSiblingIndex, pushWorld, setPath],
  )

  const handleTreeDelete = useCallback(
    (node: PipeTreeNode) => {
      if (node.kind === 'entity') return

      if (node.kind === 'stack_pipe') {
        const linkCount = countEntitiesLinkingPipe(world, node.pipeId)
        if (linkCount > 1) {
          const ok = window.confirm(
            `${linkCount} entities use "${node.label}". Remove this pipe from the entity stack only?`,
          )
          if (!ok) return
        } else if (!window.confirm(`Remove pipe "${node.label}" from this entity?`)) {
          return
        }
        const nextWorld = deleteStackBinding(world, entity.id, node.stackIndex)
        applyStructuralChange(nextWorld)
        return
      }

      if (node.kind === 'member_stage') {
        if (!window.confirm(`Remove stage "${node.label}" from this pipe?`)) return
        const nextWorld = deletePipeMember(world, entity.id, node.parentPipeId, node.memberIndex)
        applyStructuralChange(nextWorld)
        return
      }

      if (node.kind === 'member_pipe') {
        const linkCount = countEntitiesLinkingPipe(world, node.pipeId)
        if (linkCount > 1) {
          const ok = window.confirm(
            `${linkCount} entities use "${node.label}". Remove this nested pipe reference only?`,
          )
          if (!ok) return
        } else if (!window.confirm(`Remove nested pipe "${node.label}" from this pipe?`)) {
          return
        }
        const nextWorld = deletePipeMember(world, entity.id, node.parentPipeId, node.memberIndex)
        applyStructuralChange(nextWorld)
      }
    },
    [world, entity.id, applyStructuralChange],
  )

  const handleTreeContext = useCallback(
    (action: 'add_before' | 'add_after' | 'add_child' | 'delete', target: PipeTreeContextTarget) => {
      if (action === 'delete') {
        handleTreeDelete(target.node)
        return
      }
      const placement = placementForTreeContext(action, target)
      if (!placement) return
      const defaultName = defaultNameForTreeInsert(world)
      promptName('Name pipe', defaultName, (name) => {
        const { world: nextWorld, focusPath } = insertEmptyPipeAtNode(
          world,
          entity.id,
          name,
          placement,
        )
        applyStructuralChange(nextWorld, reconcilePipeNavPath(nextWorld, entity, focusPath, 0))
      })
    },
    [world, entity, promptName, handleTreeDelete, applyStructuralChange],
  )

  const handleTreeDrop = useCallback(
    (drag: PipeTreeNode, drop: PipeTreeNode) => {
      const registry = world.transformerPipes ?? {}

      if (drag.kind === 'member_stage') {
        if (drop.kind === 'entity') {
          window.alert('Stages must live inside a pipe.')
          return
        }

        if (drop.kind === 'member_stage') {
          if (drag.parentPipeId === drop.parentPipeId) {
            if (drag.memberIndex === drop.memberIndex) return
            applyStructuralChange(
              reorderPipeMembers(world, drag.parentPipeId, drag.memberIndex, drop.memberIndex),
            )
            return
          }
          applyStructuralChange(
            moveMemberStage(
              world,
              entity.id,
              drag.parentPipeId,
              drag.memberIndex,
              drop.parentPipeId,
              drop.memberIndex,
            ),
          )
          return
        }

        const targetPipeId = drop.kind === 'stack_pipe' || drop.kind === 'member_pipe' ? drop.pipeId : null
        if (targetPipeId) {
          const targetMembers = normalizePipeMembers(registry[targetPipeId] ?? {})
          if (drag.parentPipeId === targetPipeId) {
            const lastIndex = targetMembers.length - 1
            if (drag.memberIndex === lastIndex) return
            applyStructuralChange(
              reorderPipeMembers(world, targetPipeId, drag.memberIndex, lastIndex),
            )
            return
          }
          applyStructuralChange(
            moveMemberStage(
              world,
              entity.id,
              drag.parentPipeId,
              drag.memberIndex,
              targetPipeId,
              targetMembers.length,
            ),
          )
        }
        return
      }

      if (drag.kind === 'stack_pipe' && drop.kind === 'stack_pipe') {
        if (drag.stackIndex === drop.stackIndex) return
        const nextWorld = reorderStackBindings(world, entity.id, drag.stackIndex, drop.stackIndex)
        applyStructuralChange(nextWorld)
        return
      }

      if (drag.kind === 'stack_pipe' && drop.kind === 'member_pipe') {
        if (wouldNestCreateCycle(registry, drop.pipeId, drag.pipeId)) {
          window.alert('Cannot nest a pipe inside its own descendant.')
          return
        }
        const nextWorld = nestStackPipeAsMember(
          world,
          entity.id,
          drag.stackIndex,
          drop.pipeId,
        )
        if (nextWorld === world) {
          window.alert('Cannot nest a pipe inside its own descendant.')
          return
        }
        applyStructuralChange(nextWorld)
        return
      }

      if (drag.kind === 'member_pipe' && drop.kind === 'entity') {
        const nextWorld = promoteMemberPipeToStack(
          world,
          entity.id,
          drag.parentPipeId,
          drag.memberIndex,
        )
        applyStructuralChange(nextWorld)
        return
      }

      if (drag.kind === 'member_pipe' && drop.kind === 'member_pipe') {
        if (drag.parentPipeId === drop.parentPipeId) {
          if (drag.memberIndex === drop.memberIndex) return
          const nextWorld = reorderPipeMembers(
            world,
            drag.parentPipeId,
            drag.memberIndex,
            drop.memberIndex,
          )
          applyStructuralChange(nextWorld)
          return
        }
        if (wouldNestCreateCycle(registry, drop.parentPipeId, drag.pipeId)) {
          window.alert('Cannot nest a pipe inside its own descendant.')
          return
        }
        const nextWorld = moveMemberPipe(
          world,
          entity.id,
          drag.parentPipeId,
          drag.memberIndex,
          drop.parentPipeId,
          drop.memberIndex,
        )
        if (nextWorld === world) {
          window.alert('Cannot nest a pipe inside its own descendant.')
          return
        }
        applyStructuralChange(nextWorld)
        return
      }

    },
    [world, entity, applyStructuralChange],
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
    replacePipeParams,
    decouplePipeBinding,
    toggleStackAt: (idx: number) => pushWorld(toggleStackBindingEnabled(world, entity.id, idx)),
    updateParamsAt: (stackIndex: number, key: string, value: unknown) =>
      commitPipeParamEdit(
        {
          pipeId: getEntityPipeStack(entity)[stackIndex]?.pipeId ?? '',
          stackIndex,
          scopePath: [{ kind: 'stack', index: stackIndex }],
          key,
          value,
        },
        'merge',
      ),
    reorderStack: (from: number, to: number) => pushWorld(reorderStackBindings(world, entity.id, from, to)),
    reorderMember: (pipeId: string, from: number, to: number) =>
      pushWorld(reorderPipeMembers(world, pipeId, from, to)),
    handleTreeDelete,
    handleTreeContext,
    handleTreeDrop,
    promptName,
  }
}
