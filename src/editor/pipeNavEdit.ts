import type { TransformerPipe } from '@/types/transformer'
import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import { assignLibraryPipeToEntity, type LibraryPipeSource } from '@/utils/assignLibraryPipe'
import type { PipeNavFocus, PipeNavPathSegment, PipeTreeNode } from '@/types/pipeNav'
import type { Entity, RennWorld } from '@/types/world'
import { countEntitiesLinkingPipe } from '@/utils/commitTransformerConfigsToWorld'
import {
  addExistingPipeAtFocus,
  createEmptyPipe,
  decoupleStackBindingToCopy,
  deletePipeMember,
  deleteStackBinding,
  ensureEntityPipeStack,
  insertEmptyPipeAtNode,
  moveMemberPipe,
  moveMemberStage,
  nestStackPipeAsMember,
  promoteMemberPipeToStack,
  renamePipe,
  reorderPipeMembers,
  reorderStackBindings,
  setBindingParams,
  setBindingScopeParams,
  toggleMemberEnabled,
  toggleStackBindingEnabled,
  updateBindingParams,
  updateBindingScopeParams,
  type InsertPipePlacement,
} from '@/utils/pipeNavMutations'
import {
  drillIntoPipePath,
  isPipeNavLeafLevel,
  reconcilePipeNavPath,
  resolveFocusedPipeId,
  resolvePipeNavView,
  stackSiblingInsertIndexFromPath,
  wouldNestCreateCycle,
} from '@/utils/pipeNavResolve'
import { isStackRootScopePath, stackIndexFromScopePath } from '@/utils/pipeStageResolve'
import { getEntityPipeStack, normalizePipeMembers } from '@/utils/transformerPipeResolve'

/**
 * Names the user action behind a pipe-nav structural or parameter edit.
 *
 * Callers state what the user did; `resolvePipeNavEdit` decides the world mutation, the nav path
 * to land on, and whether the action is a no-op. Undo policy comes from `PIPE_NAV_EDIT_POLICY`,
 * keyed off `kind` alone. Add an intent rather than branching at a call site.
 */
export type PipeNavEditIntent =
  /** Sidebar/strip "add pipe": placement is derived from the focused level. */
  | { kind: 'createPipe'; name: string }
  /** "Add child pipe" on the focused pipe. */
  | { kind: 'createChildPipe'; name: string }
  /** Link or copy an existing registry pipe in at the focused level. */
  | { kind: 'addExistingPipe'; pipe: TransformerPipe; mode: 'linked' | 'copy' }
  /** Append a project or global-library pipe to the end of the entity's pipe stack, whatever the focus. */
  | {
      kind: 'assignLibraryPipe'
      source: LibraryPipeSource
      pipeId: string
      mode: 'linked' | 'copy'
      library?: GlobalBehaviorLibrary
    }
  /** Rename the focused pipe. */
  | { kind: 'renamePipe'; name: string }
  /** Enable/disable a stack binding or a pipe member. */
  | { kind: 'togglePipeEnabled'; stackIndex?: number; memberParentPipeId?: string; memberIndex?: number }
  /** Write pipe binding params, either merged into or replacing the existing scope params. */
  | ({ kind: 'editPipeParams'; mode: 'merge' | 'replace' } & PipeParamEdit)
  /** Split a shared stack binding into an entity-local copy. */
  | { kind: 'decouplePipeBinding'; stackIndex: number }
  /** Tree context-menu delete of a stack pipe, nested pipe, or stage. */
  | { kind: 'treeDelete'; node: PipeTreeNode }
  /** Tree context-menu insert; the caller has already collected the name. */
  | { kind: 'treeInsert'; name: string; placement: InsertPipePlacement }
  /** Tree drag-and-drop reorder, nest, promote, or move. */
  | { kind: 'treeDrop'; drag: PipeTreeNode; drop: PipeTreeNode }
  /** Bootstrap: give an entity with no pipe stack its first pipe. Not a user action. */
  | { kind: 'ensurePipeStack' }

/** Addressing for a pipe param write. `stackIndex` is derived from `scopePath` when omitted. */
export interface PipeParamEdit {
  stackIndex?: number
  scopePath?: PipeNavPathSegment[]
  key?: string
  value?: unknown
  params?: Record<string, unknown>
}

export interface PipeNavEditPolicy {
  /** Give this action its own undo entry. */
  pushUndo: boolean
}

/**
 * One row per user action, and the only place pipe-nav undo policy is decided.
 *
 * `ensurePipeStack` is the odd row: it is an automatic migration that runs on mount for entities
 * that predate the pipe stack, not something the user did, so it must not be undoable on its own.
 */
export const PIPE_NAV_EDIT_POLICY: Record<PipeNavEditIntent['kind'], PipeNavEditPolicy> = {
  createPipe: { pushUndo: true },
  createChildPipe: { pushUndo: true },
  addExistingPipe: { pushUndo: true },
  assignLibraryPipe: { pushUndo: true },
  renamePipe: { pushUndo: true },
  togglePipeEnabled: { pushUndo: true },
  editPipeParams: { pushUndo: true },
  decouplePipeBinding: { pushUndo: true },
  treeDelete: { pushUndo: true },
  treeInsert: { pushUndo: true },
  treeDrop: { pushUndo: true },
  ensurePipeStack: { pushUndo: false },
}

/**
 * Blocking confirmations and warnings a pipe-nav edit may need before it resolves.
 *
 * Injected so the resolver stays pure and testable: `windowPipeNavPrompts` in the app, a recording
 * stub in tests.
 */
export interface PipeNavEditPrompts {
  /** Returns false to abort the edit. */
  confirm: (message: string) => boolean
  /** Explains why an edit is impossible; the edit then resolves to a no-op. */
  warn: (message: string) => void
}

export const windowPipeNavPrompts: PipeNavEditPrompts = {
  confirm: (message) => window.confirm(message),
  warn: (message) => window.alert(message),
}

export interface PipeNavEditContext {
  /** World the edit is computed against. */
  world: RennWorld
  /** Entity whose pipe stack is being edited. */
  entityId: string
  /** Where the pipe-nav is focused; drives placement and post-edit path reconciliation. */
  focus: PipeNavFocus
  prompts: PipeNavEditPrompts
}

export interface PipeNavEditResult {
  /** World to commit. Never reference-equal to `ctx.world` unless `nav` moves. */
  world: RennWorld
  /** Nav focus to apply after the write. Absent means leave the focus where it is. */
  nav?: PipeNavFocus
  /** Entities whose merged pipe params must be re-derived from `world`. */
  syncEntityIds?: string[]
}

/**
 * Resolves one pipe-nav edit into a world, a nav focus, and a merged-param sync list.
 *
 * Pure: performs no writes, pushes no undo entry, and touches no React state. The caller applies
 * the result in this order — undo checkpoint (per `PIPE_NAV_EDIT_POLICY`), world, nav, param sync.
 *
 * Returns `null` for a no-op, which is what the caller must check before pushing undo. An edit is
 * a no-op when the entity is gone, the user declined a confirmation, the drop is illegal, or the
 * mutation left the world untouched with the focus unmoved.
 */
export function resolvePipeNavEdit(
  intent: PipeNavEditIntent,
  ctx: PipeNavEditContext,
): PipeNavEditResult | null {
  const entity = ctx.world.entities.find((e) => e.id === ctx.entityId)
  if (!entity) return null

  const resolved = resolveIntent(intent, ctx, entity)
  if (!resolved) return null
  if (resolved.world === ctx.world && !resolved.nav) return null
  return resolved
}

function resolveIntent(
  intent: PipeNavEditIntent,
  ctx: PipeNavEditContext,
  entity: Entity,
): PipeNavEditResult | null {
  const { world, entityId, focus, prompts } = ctx

  switch (intent.kind) {
    case 'ensurePipeStack': {
      if (getEntityPipeStack(entity).length > 0) return null
      const { world: next, created, pipeId } = ensureEntityPipeStack(world, entityId)
      if (!created || !pipeId) return null
      const fresh = next.entities.find((e) => e.id === entityId)
      if (!fresh) return null
      return { world: next, nav: focusAt(drillIntoPipePath(next, fresh, [], 0, 'pipe', pipeId)) }
    }

    case 'createPipe': {
      const view = resolvePipeNavView(world, entity, focus)
      const atLeaf = isPipeNavLeafLevel(view)
      const placement = atLeaf || view.mode !== 'pipe_members' ? 'stack_sibling' : 'member_sibling'
      const insertIndex = atLeaf ? stackSiblingInsertIndexFromPath(focus.path) : undefined
      return createAtFocus(world, entityId, intent.name, focus.path, placement, insertIndex)
    }

    case 'createChildPipe':
      return createAtFocus(world, entityId, intent.name, focus.path, 'member_child', undefined)

    case 'addExistingPipe': {
      const atLeaf = isPipeNavLeafLevel(resolvePipeNavView(world, entity, focus))
      const { world: next, focusPath } = addExistingPipeAtFocus(
        world,
        entityId,
        intent.pipe,
        intent.mode,
        atLeaf ? [] : focus.path,
        atLeaf ? stackSiblingInsertIndexFromPath(focus.path) : undefined,
      )
      return { world: next, nav: focusAt(focusPath) }
    }

    case 'assignLibraryPipe': {
      const res = assignLibraryPipeToEntity(
        world,
        entityId,
        intent.source,
        intent.pipeId,
        intent.mode,
        intent.library,
      )
      if (!res) return null
      return { world: res.world, nav: focusAt(res.focusPath) }
    }

    case 'renamePipe': {
      const pipeId = resolveFocusedPipeId(world, entity, focus.path)
      if (!pipeId) return null
      return { world: renamePipe(world, pipeId, intent.name) }
    }

    case 'togglePipeEnabled': {
      if (intent.stackIndex !== undefined && intent.stackIndex >= 0) {
        return { world: toggleStackBindingEnabled(world, entityId, intent.stackIndex) }
      }
      if (intent.memberParentPipeId != null && intent.memberIndex != null) {
        return { world: toggleMemberEnabled(world, intent.memberParentPipeId, intent.memberIndex) }
      }
      return null
    }

    case 'editPipeParams': {
      const next = applyPipeParamEdit(world, entityId, intent, intent.mode)
      if (!next) return null
      return { world: next, syncEntityIds: [entityId] }
    }

    case 'decouplePipeBinding': {
      const binding = getEntityPipeStack(entity)[intent.stackIndex]
      if (!binding) return null
      const linkCount = world.entities.filter((e) =>
        getEntityPipeStack(e).some((b) => b.pipeId === binding.pipeId && b.mode !== 'copy'),
      ).length
      if (
        !prompts.confirm(
          `${linkCount} entities share this pipe. Copy it for this entity only? Other entities keep the shared version.`,
        )
      ) {
        return null
      }
      return { world: decoupleStackBindingToCopy(world, entityId, intent.stackIndex) }
    }

    case 'treeDelete':
      return resolveTreeDelete(intent.node, ctx)

    case 'treeInsert': {
      const { world: next, focusPath } = insertEmptyPipeAtNode(world, entityId, intent.name, intent.placement)
      return structural(next, ctx, focusAt(focusPath))
    }

    case 'treeDrop':
      return resolveTreeDrop(intent.drag, intent.drop, ctx)
  }
}

function focusAt(path: PipeNavPathSegment[]): PipeNavFocus {
  return { path, selectedSiblingIndex: 0 }
}

function createAtFocus(
  world: RennWorld,
  entityId: string,
  name: string,
  parentPath: PipeNavPathSegment[],
  placement: 'stack_sibling' | 'member_sibling' | 'member_child',
  insertIndex: number | undefined,
): PipeNavEditResult {
  const { world: next, focusPath } = createEmptyPipe(world, entityId, name, parentPath, placement, insertIndex)
  return { world: next, nav: focusAt(focusPath) }
}

/**
 * Completes a structural edit by clamping the nav path against the *post-edit* entity.
 *
 * `preferredNav` (e.g. the path of a freshly inserted pipe) is still reconciled, because the
 * mutation may have refused the write and left that path pointing at nothing.
 */
function structural(
  nextWorld: RennWorld,
  ctx: PipeNavEditContext,
  preferredNav?: PipeNavFocus,
): PipeNavEditResult | null {
  const fresh = nextWorld.entities.find((e) => e.id === ctx.entityId)
  if (!fresh) return null
  const from = preferredNav ?? ctx.focus
  return {
    world: nextWorld,
    nav: reconcilePipeNavPath(nextWorld, fresh, from.path, from.selectedSiblingIndex),
  }
}

/** Writes binding params at the stack root or at a nested member scope. Null when unaddressable. */
function applyPipeParamEdit(
  world: RennWorld,
  entityId: string,
  edit: PipeParamEdit,
  mode: 'merge' | 'replace',
): RennWorld | null {
  const stackIndex =
    edit.stackIndex ?? (edit.scopePath ? stackIndexFromScopePath(edit.scopePath) : undefined)
  if (stackIndex === undefined || stackIndex < 0) return null

  const params = edit.params ?? (edit.key !== undefined ? { [edit.key]: edit.value } : {})
  const scopePath = edit.scopePath ?? [{ kind: 'stack' as const, index: stackIndex }]

  if (isStackRootScopePath(scopePath)) {
    return mode === 'replace'
      ? setBindingParams(world, entityId, stackIndex, params)
      : updateBindingParams(world, entityId, stackIndex, params)
  }
  return mode === 'replace'
    ? setBindingScopeParams(world, entityId, stackIndex, scopePath, params)
    : updateBindingScopeParams(world, entityId, stackIndex, scopePath, params)
}

function resolveTreeDelete(node: PipeTreeNode, ctx: PipeNavEditContext): PipeNavEditResult | null {
  const { world, entityId, prompts } = ctx
  if (node.kind === 'entity') return null

  if (node.kind === 'stack_pipe') {
    if (!confirmPipeRemoval(world, node.pipeId, prompts, {
      shared: (count) => `${count} entities use "${node.label}". Remove this pipe from the entity stack only?`,
      sole: `Remove pipe "${node.label}" from this entity?`,
    })) {
      return null
    }
    return structural(deleteStackBinding(world, entityId, node.stackIndex), ctx)
  }

  if (node.kind === 'member_stage') {
    if (!prompts.confirm(`Remove stage "${node.label}" from this pipe?`)) return null
    return structural(deletePipeMember(world, entityId, node.parentPipeId, node.memberIndex), ctx)
  }

  if (!confirmPipeRemoval(world, node.pipeId, prompts, {
    shared: (count) => `${count} entities use "${node.label}". Remove this nested pipe reference only?`,
    sole: `Remove nested pipe "${node.label}" from this pipe?`,
  })) {
    return null
  }
  return structural(deletePipeMember(world, entityId, node.parentPipeId, node.memberIndex), ctx)
}

/** Shared pipes get a "this entity only" warning; sole-owner pipes get a plain confirmation. */
function confirmPipeRemoval(
  world: RennWorld,
  pipeId: string,
  prompts: PipeNavEditPrompts,
  messages: { shared: (count: number) => string; sole: string },
): boolean {
  const linkCount = countEntitiesLinkingPipe(world, pipeId)
  return prompts.confirm(linkCount > 1 ? messages.shared(linkCount) : messages.sole)
}

const CYCLE_WARNING = 'Cannot nest a pipe inside its own descendant.'

function resolveTreeDrop(
  drag: PipeTreeNode,
  drop: PipeTreeNode,
  ctx: PipeNavEditContext,
): PipeNavEditResult | null {
  const { world, entityId, prompts } = ctx
  const registry = world.transformerPipes ?? {}

  if (drag.kind === 'member_stage') {
    if (drop.kind === 'entity') {
      prompts.warn('Stages must live inside a pipe.')
      return null
    }

    if (drop.kind === 'member_stage') {
      if (drag.parentPipeId === drop.parentPipeId) {
        if (drag.memberIndex === drop.memberIndex) return null
        return structural(
          reorderPipeMembers(world, drag.parentPipeId, drag.memberIndex, drop.memberIndex),
          ctx,
        )
      }
      return structural(
        moveMemberStage(world, entityId, drag.parentPipeId, drag.memberIndex, drop.parentPipeId, drop.memberIndex),
        ctx,
      )
    }

    // Dropping a stage on a pipe appends it to the end of that pipe's members.
    const targetMembers = normalizePipeMembers(registry[drop.pipeId] ?? {})
    if (drag.parentPipeId === drop.pipeId) {
      const lastIndex = targetMembers.length - 1
      if (drag.memberIndex === lastIndex) return null
      return structural(reorderPipeMembers(world, drop.pipeId, drag.memberIndex, lastIndex), ctx)
    }
    return structural(
      moveMemberStage(world, entityId, drag.parentPipeId, drag.memberIndex, drop.pipeId, targetMembers.length),
      ctx,
    )
  }

  if (drag.kind === 'stack_pipe' && drop.kind === 'stack_pipe') {
    if (drag.stackIndex === drop.stackIndex) return null
    return structural(reorderStackBindings(world, entityId, drag.stackIndex, drop.stackIndex), ctx)
  }

  if (drag.kind === 'stack_pipe' && drop.kind === 'member_pipe') {
    if (wouldNestCreateCycle(registry, drop.pipeId, drag.pipeId)) {
      prompts.warn(CYCLE_WARNING)
      return null
    }
    return structuralOrCycleWarning(
      nestStackPipeAsMember(world, entityId, drag.stackIndex, drop.pipeId),
      ctx,
    )
  }

  if (drag.kind === 'member_pipe' && drop.kind === 'entity') {
    return structural(promoteMemberPipeToStack(world, entityId, drag.parentPipeId, drag.memberIndex), ctx)
  }

  if (drag.kind === 'member_pipe' && drop.kind === 'member_pipe') {
    if (drag.parentPipeId === drop.parentPipeId) {
      if (drag.memberIndex === drop.memberIndex) return null
      return structural(
        reorderPipeMembers(world, drag.parentPipeId, drag.memberIndex, drop.memberIndex),
        ctx,
      )
    }
    if (wouldNestCreateCycle(registry, drop.parentPipeId, drag.pipeId)) {
      prompts.warn(CYCLE_WARNING)
      return null
    }
    return structuralOrCycleWarning(
      moveMemberPipe(world, entityId, drag.parentPipeId, drag.memberIndex, drop.parentPipeId, drop.memberIndex),
      ctx,
    )
  }

  return null
}

/**
 * Nest/move mutations also refuse cycles internally by returning the world unchanged; surface that
 * refusal to the user rather than silently dropping it.
 */
function structuralOrCycleWarning(
  nextWorld: RennWorld,
  ctx: PipeNavEditContext,
): PipeNavEditResult | null {
  if (nextWorld === ctx.world) {
    ctx.prompts.warn(CYCLE_WARNING)
    return null
  }
  return structural(nextWorld, ctx)
}
