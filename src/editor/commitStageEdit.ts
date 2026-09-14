import type { EditorUndoApi } from '@/contexts/EditorUndoContext'
import type { TransformerConfig } from '@/types/transformer'
import type { RennWorld } from '@/types/world'
import { allocateTransformerRegistryId } from '@/utils/commitTransformerConfigsToWorld'
import { patchStageConfigInWorld } from '@/utils/pipeNavMutations'

/**
 * Names the user action behind a transformer-stage edit.
 *
 * Callers state what the user did; `commitStageEdit` decides flush / undo / param-sync policy
 * from `kind` alone (see `STAGE_EDIT_POLICY`). Add an intent rather than branching at a call site.
 */
export type StageEditIntent =
  /** Single-stage registry patch: rename, enable toggle, or configure-drawer apply. */
  | { kind: 'patch'; stageId: string; config: TransformerConfig }
  /** Whole-stack write: stage added, removed, or replaced. */
  | { kind: 'commitStages'; configs: TransformerConfig[]; orderedRegistryIds?: string[] }
  /** Drag reorder of the stage strip. */
  | { kind: 'reorder'; configs: TransformerConfig[]; orderedRegistryIds?: string[] }
  /** Preset template loaded over the selected stage. */
  | { kind: 'loadTemplate'; configs: TransformerConfig[]; orderedRegistryIds?: string[] }
  /** Split a shared registry stage into an entity-local copy. */
  | { kind: 'makeUnique'; entityId: string; stageId: string }
  /** Debounced custom-code commit. */
  | { kind: 'codeEdit'; configs: TransformerConfig[]; orderedRegistryIds?: string[] }

/** Intent kinds a stage-strip commit callback can report for a whole-stack write. */
export type StageCommitKind = 'commitStages' | 'reorder'

export interface StageEditPolicy {
  /** Commit the pending debounced code draft first, so the undo snapshot includes it. */
  flushPendingCode: boolean
  /** Give this action its own undo entry. */
  pushUndo: boolean
}

/**
 * One row per user action, and the only place this policy is decided.
 *
 * `codeEdit` is the odd row on both counts: it *is* the flush of the pending draft, so flushing
 * again would recurse, and `handleCodeChange` already pushed an undo entry on the first keystroke
 * of the burst. Pushing here too is what produced two undo entries per pipe-scoped code edit.
 *
 * Live number scrubs deliberately do not appear here. Drag coalescing is owned by
 * `EditorUndoApi.notifyScrubStart` / `notifyScrubEnd` at the number-field seam, so a stage edit
 * that reaches this module is always a discrete action and always earns an undo entry.
 */
export const STAGE_EDIT_POLICY: Record<StageEditIntent['kind'], StageEditPolicy> = {
  patch: { flushPendingCode: true, pushUndo: true },
  commitStages: { flushPendingCode: true, pushUndo: true },
  reorder: { flushPendingCode: true, pushUndo: true },
  loadTemplate: { flushPendingCode: true, pushUndo: true },
  makeUnique: { flushPendingCode: true, pushUndo: true },
  codeEdit: { flushPendingCode: false, pushUndo: false },
}

/**
 * Writes a whole stage stack in the scope the edit belongs to (the entity's flat stack, or the
 * stage list of the focused pipe).
 *
 * Returns the world that merged pipe params must be re-derived from, or `null` when the scope
 * needs no sync or refused the write.
 */
export type StageStackWriter = (
  configs: TransformerConfig[],
  orderedRegistryIds: string[] | undefined,
) => RennWorld | null

export interface StageEditContext {
  /** World the edit is computed against. */
  world: RennWorld
  /** Entities the edit applies to; drives merged pipe-param re-derivation. */
  entityIds: string[]
  /** Commits any debounced custom-code draft as its own write. */
  flushPendingCode: () => void
  /** Undo host, or null when none is mounted. */
  undo: Pick<EditorUndoApi, 'pushBeforeEdit'> | null | undefined
  onWorldChange: (next: RennWorld) => void
  /** Scope-specific stack write; see `StageStackWriter`. */
  writeStack: StageStackWriter
  onMergedParamSync?: (next: RennWorld, entityIds: string[]) => void
}

export interface StageEditOutcome {
  /** False when the intent resolved to a no-op: nothing was written and no undo entry was pushed. */
  written: boolean
  /** Registry id the caller should select, when the edit created one. */
  selectStageId?: string
}

const NO_WRITE: StageEditOutcome = { written: false }

/** A resolved, not-yet-applied write. `apply` returns the world needing a merged-param sync, if any. */
interface ResolvedStageWrite {
  apply: () => RennWorld | null
  selectStageId?: string
}

/**
 * Commits one edited transformer stage.
 *
 * Fixed order, and the reason this module exists:
 *   1. flush the pending code draft (so it lands as its own write, before the undo snapshot)
 *   2. resolve the write — a no-op aborts here, before any undo entry is pushed
 *   3. undo checkpoint
 *   4. world mutation
 *   5. merged pipe-param sync
 *
 * Steps 1, 3 and 5 are keyed off `intent.kind` via `STAGE_EDIT_POLICY`. Step 4 is keyed off the
 * scope the caller supplied in `ctx.writeStack`.
 */
export function commitStageEdit(intent: StageEditIntent, ctx: StageEditContext): StageEditOutcome {
  const policy = STAGE_EDIT_POLICY[intent.kind]
  if (policy.flushPendingCode) ctx.flushPendingCode()

  const write = resolveStageWrite(intent, ctx)
  if (!write) return NO_WRITE

  if (policy.pushUndo) ctx.undo?.pushBeforeEdit()

  const syncWorld = write.apply()
  if (syncWorld && ctx.entityIds.length > 0) {
    ctx.onMergedParamSync?.(syncWorld, ctx.entityIds)
  }
  return { written: true, selectStageId: write.selectStageId }
}

function resolveStageWrite(intent: StageEditIntent, ctx: StageEditContext): ResolvedStageWrite | null {
  if (intent.kind === 'patch') {
    return {
      apply: () => {
        const next = patchStageConfigInWorld(ctx.world, intent.stageId, intent.config)
        ctx.onWorldChange(next)
        return next
      },
    }
  }

  if (intent.kind === 'makeUnique') {
    const unique = makeStageUniqueWorld(ctx.world, intent.entityId, intent.stageId)
    if (!unique) return null
    return {
      apply: () => {
        ctx.onWorldChange(unique.world)
        // Make-unique clears the entity's pipe stack, so there are no merged pipe params left to sync.
        return null
      },
      selectStageId: unique.stageId,
    }
  }

  const { configs, orderedRegistryIds } = intent
  return { apply: () => ctx.writeStack(configs, orderedRegistryIds) }
}

/**
 * Copies a shared registry stage into an entity-local one and repoints the entity at the copy.
 * Returns null when the stage is not in the registry or the entity is gone.
 */
function makeStageUniqueWorld(
  world: RennWorld,
  entityId: string,
  stageId: string,
): { world: RennWorld; stageId: string } | null {
  const registry = world.transformers ?? {}
  const source = registry[stageId]
  if (!source) return null
  if (!world.entities.some((e) => e.id === entityId && e.transformers?.includes(stageId))) return null

  const nextRegistry = { ...registry }
  const uniqueId = allocateTransformerRegistryId(entityId, nextRegistry, new Set(Object.keys(nextRegistry)))
  nextRegistry[uniqueId] = JSON.parse(JSON.stringify(source)) as TransformerConfig

  return {
    stageId: uniqueId,
    world: {
      ...world,
      transformers: nextRegistry,
      entities: world.entities.map((e) =>
        e.id === entityId
          ? {
              ...e,
              transformers: e.transformers?.map((tid) => (tid === stageId ? uniqueId : tid)) ?? [],
              transformerPipeStack: undefined,
              transformerPipe: undefined,
            }
          : e,
      ),
    },
  }
}
