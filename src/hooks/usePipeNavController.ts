import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TransformerConfig, TransformerPipe } from '@/types/transformer'
import type { PipeTreeNode } from '@/types/pipeNav'
import type { Entity, RennWorld } from '@/types/world'
import type { WorkspaceTarget } from '@/types/workspace'
import { usePipeNavigator } from '@/hooks/usePipeNavigator'
import { useEditorUndo } from '@/contexts/useEditorUndo'
import { applyPipeNavWorldWrite } from '@/editor/applyPipeNavWorldWrite'
import { applyStageWorldWrite, stageWorldEditDescriptor } from '@/editor/applyStageWorldWrite'
import { STAGE_EDIT_POLICY, type StageStackIntentKind } from '@/editor/commitStageEdit'
import type { ApplyWorldWrite } from '@/editor/applyWorldEdit'
import {
  PIPE_NAV_EDIT_POLICY,
  resolvePipeNavEdit,
  windowPipeNavPrompts,
  type PipeNavEditIntent,
} from '@/editor/pipeNavEdit'
import type { PipeCardStageHandlers } from '@/components/workspace/pipeNav/pipeStageCallbacks'
import { commitFocusedStageConfigs } from '@/utils/pipeNavMutations'
import { resolveFocusedStageConfigs } from '@/utils/pipeNavResolve'
import {
  defaultNameForTreeInsert,
  placementForTreeContext,
  type PipeTreeContextTarget,
} from '@/utils/pipeNavTreeHelpers'
import { getEntityPipeStack } from '@/utils/transformerPipeResolve'

/** Enable/param/decouple callbacks, in the prop shape `PipeCard` hosts expect. */
type PipeControlHandlers = Required<PipeCardStageHandlers> & {
  onDecouplePipeBinding: (stackIndex: number) => void
}

/** "Add pipe" callbacks, in the prop shape `PipeFocusedStrip` expects. */
interface AddPipeHandlers {
  onCreatePipe: (name: string) => void
  onAddChildPipe: (name: string) => void
  onAddExistingPipe: (pipe: TransformerPipe, mode: 'linked' | 'copy') => void
}

/** Tree callbacks, in the prop shape `TransformerPipeNavSidebar` expects. */
interface PipeTreeHandlers {
  /** Undefined when the focus is not on a pipe, which hides the sidebar's rename affordance. */
  onRenamePipe: ((name: string) => void) | undefined
  onTreeDelete: (node: PipeTreeNode) => void
  onTreeContext: (
    action: 'add_before' | 'add_after' | 'add_child' | 'delete',
    target: PipeTreeContextTarget,
  ) => void
  onTreeDrop: (drag: PipeTreeNode, drop: PipeTreeNode) => void
}

type NameDialogState = { title: string; name: string; onConfirm: (name: string) => void }

/**
 * Wires the pipe-nav UI to world edits.
 *
 * Every world write goes through `resolvePipeNavEdit`, which owns the mutation, the post-edit nav
 * path, and the no-op rules; this hook only supplies React state (focus, name dialog) and applies
 * the result. Stage-strip edits are the exception: they belong to `commitStageEdit`, and
 * `writeFocusedStages` is the pipe-scoped writer it calls back into.
 */
export function usePipeNavController(
  world: RennWorld,
  entity: Entity,
  entry: WorkspaceTarget | null | undefined,
  onWorldChange: (world: RennWorld) => void,
  onEntryChange?: (next: WorkspaceTarget) => void,
  onMergedParamSync?: (nextWorld: RennWorld, entityIds: string[]) => void,
  /** When set (Builder), pipe-nav commits route through `applyWorldEdit` instead of the gateway. */
  applyWorldWrite?: ApplyWorldWrite,
) {
  const undo = useEditorUndo()
  const { focus, view, setPath, focusedPipeId } = usePipeNavigator(
    world,
    entity,
    entry?.pipeNavPath,
    entry?.pipeNavSelectedIndex,
  )

  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null)

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

  /**
   * Applies one pipe-nav edit: undo checkpoint (per `PIPE_NAV_EDIT_POLICY`), world, nav, param
   * sync. A `null` resolution means nothing happened, so no undo entry is pushed.
   */
  const commit = useCallback(
    (intent: PipeNavEditIntent) => {
      const result = resolvePipeNavEdit(intent, {
        world,
        entityId: entity.id,
        focus,
        prompts: windowPipeNavPrompts,
      })
      if (!result) return
      if (applyWorldWrite) {
        applyPipeNavWorldWrite(applyWorldWrite, intent.kind, result.world)
      } else {
        if (PIPE_NAV_EDIT_POLICY[intent.kind].pushUndo) undo?.pushBeforeEdit()
        onWorldChange(result.world)
      }
      if (result.nav) setPath(result.nav.path, result.nav.selectedSiblingIndex)
      if (result.syncEntityIds?.length) onMergedParamSync?.(result.world, result.syncEntityIds)
    },
    [world, entity.id, focus, undo, onWorldChange, setPath, onMergedParamSync, applyWorldWrite],
  )

  /**
   * Lets deferred callers (the name dialog) and the bootstrap effect commit without taking
   * `commit` as a dependency, while still writing against a fresh world.
   */
  const commitRef = useRef(commit)
  commitRef.current = commit

  /**
   * Bootstrap: entities predating the pipe stack get their first pipe on mount.
   *
   * Deliberately does **not** depend on `commit` (and so not on `focus`): this intent moves the
   * focus, and a host that does not feed the new world back would otherwise loop forever.
   */
  useEffect(() => {
    if (!entity.id) return
    commitRef.current({ kind: 'ensurePipeStack' })
  }, [entity.id, world])

  const promptName = useCallback(
    (title: string, defaultName: string, onConfirm: (name: string) => void) => {
      setNameDialog({ title, name: defaultName, onConfirm })
    },
    [],
  )

  /**
   * Which stack a stage edit from the focused strip writes to. `flat` while the entity has no pipe
   * stack at all — the strip is then showing the entity's bare transformer list.
   */
  const stageScope: 'flat' | 'pipe' =
    view?.mode === 'entity_stages' && getEntityPipeStack(entity).length === 0 ? 'flat' : 'pipe'

  /**
   * `StageStackWriter` for the focused pipe. Undo, code flushing and merged-param sync are the
   * caller's concern — `commitStageEdit` owns that policy for every scope.
   */
  const writeFocusedStages = useCallback(
    (
      configs: TransformerConfig[],
      orderedRegistryIds: string[] | undefined,
      intentKind: StageStackIntentKind,
    ): RennWorld => {
      const nextWorld = commitFocusedStageConfigs(
        world,
        entity.id,
        focus.path,
        configs,
        orderedRegistryIds ?? stageData.ids,
        orderedRegistryIds,
      )
      if (applyWorldWrite) {
        applyStageWorldWrite(
          applyWorldWrite,
          stageWorldEditDescriptor(STAGE_EDIT_POLICY[intentKind].pushUndo),
          nextWorld,
        )
      } else {
        onWorldChange(nextWorld)
      }
      return nextWorld
    },
    [world, entity.id, focus.path, stageData.ids, onWorldChange, applyWorldWrite],
  )

  const pipeControls = useMemo<PipeControlHandlers>(
    () => ({
      onPipeControlToggle: (opts) =>
        commit({
          kind: 'togglePipeEnabled',
          stackIndex: opts.stackIndex,
          memberParentPipeId: opts.memberParentPipeId,
          memberIndex: opts.memberIndex,
        }),
      onPipeParamChange: (opts) =>
        commit({
          kind: 'editPipeParams',
          mode: 'merge',
          stackIndex: opts.stackIndex,
          scopePath: opts.scopePath,
          key: opts.key,
          value: opts.value,
        }),
      onPipeParamsReplace: (opts) =>
        commit({
          kind: 'editPipeParams',
          mode: 'replace',
          stackIndex: opts.stackIndex,
          scopePath: opts.scopePath,
          params: opts.params,
        }),
      onDecouplePipeBinding: (stackIndex) => commit({ kind: 'decouplePipeBinding', stackIndex }),
    }),
    [commit],
  )

  const addPipe = useMemo<AddPipeHandlers>(
    () => ({
      onCreatePipe: (name) => commit({ kind: 'createPipe', name }),
      onAddChildPipe: (name) => commit({ kind: 'createChildPipe', name }),
      onAddExistingPipe: (pipe, mode) => commit({ kind: 'addExistingPipe', pipe, mode }),
    }),
    [commit],
  )

  const handleTreeContext = useCallback(
    (
      action: 'add_before' | 'add_after' | 'add_child' | 'delete',
      target: PipeTreeContextTarget,
    ) => {
      if (action === 'delete') {
        commit({ kind: 'treeDelete', node: target.node })
        return
      }
      const placement = placementForTreeContext(action, target)
      if (!placement) return
      promptName('Name pipe', defaultNameForTreeInsert(world), (name) => {
        commitRef.current({ kind: 'treeInsert', name, placement })
      })
    },
    [commit, promptName, world],
  )

  const treeActions = useMemo<PipeTreeHandlers>(
    () => ({
      onRenamePipe: focusedPipeId ? (name) => commit({ kind: 'renamePipe', name }) : undefined,
      onTreeDelete: (node) => commit({ kind: 'treeDelete', node }),
      onTreeContext: handleTreeContext,
      onTreeDrop: (drag, drop) => commit({ kind: 'treeDrop', drag, drop }),
    }),
    [commit, focusedPipeId, handleTreeContext],
  )

  const nameDialogProps = useMemo(
    () => ({
      nameDialog,
      onNameChange: (name: string) =>
        setNameDialog((prev) => (prev ? { ...prev, name } : null)),
      onNameConfirm: () => {
        const trimmed = nameDialog?.name.trim()
        if (trimmed) nameDialog?.onConfirm(trimmed)
        setNameDialog(null)
      },
      onNameCancel: () => setNameDialog(null),
    }),
    [nameDialog],
  )

  return {
    view,
    focus,
    setPath,
    focusedPipeId,
    focusedTitle,
    stageData,
    stageScope,
    stackIndexForPipeId,
    writeFocusedStages,
    pipeControls,
    addPipe,
    treeActions,
    nameDialogProps,
  }
}
