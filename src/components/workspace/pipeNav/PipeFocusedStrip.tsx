import { Fragment, useCallback, useMemo, useState, type CSSProperties, type RefObject } from 'react'
import type { PipeNavPathSegment } from '@/types/pipeNav'
import type { TransformerConfig, TransformerPipe } from '@/types/transformer'
import type { StageCommitKind } from '@/editor/commitStageEdit'
import type { Entity, RennWorld } from '@/types/world'
import type { TransformerTraceStep } from '@/transformers/transformerTrace'
import { theme } from '@/config/theme'
import { TransformerHorizontalPipeline, type StageConfigRequest, type TransformerCardErrorKind } from '@/components/workspace/TransformerPipelineHorizontal'
import type { AddExistingTransformerMode } from '@/components/workspace/AddTransformerDialogPanel'
import {
  appendExistingTransformerStage,
  insertGlobalTransformerStage,
  appendPresetTransformerStage,
} from '@/utils/appendTransformerStage'
import PipeCard from './PipeCard'
import PipeAddDialog from './PipeAddDialog'
import type { ResolvedPipeNavView, StripItem } from '@/types/pipeNav'
import { isPipeNavLeafLevel } from '@/utils/pipeNavResolve'
import { getEntityPipeStack } from '@/utils/transformerPipeResolve'
import { resolveEntityStageRuntime, stackIndexFromScopePath } from '@/utils/pipeStageResolve'
import { createPipeCardStageCallbacks } from './pipeStageCallbacks'
import { pipeStripStageEnabledFromFocus } from './pipeStripStageEnable'

export interface PipeFocusedStripProps {
  world: RennWorld
  entity: Entity
  view: ResolvedPipeNavView
  focusPath: PipeNavPathSegment[]
  depth: number
  selectedIndex: number
  stageConfigs: TransformerConfig[]
  stageIds: string[]
  registryEntityId?: string
  liveTraceSteps: TransformerTraceStep[] | null
  drawerPortalTarget: RefObject<HTMLDivElement | null>
  onCommitStages: (configs: TransformerConfig[], orderedIds?: string[], kind?: StageCommitKind) => void
  onPatchStage?: (stageId: string, config: TransformerConfig) => void
  onSelectStageId: (id: string) => void
  onSelectPipeIndex: (index: number) => void
  onDrillIntoPipe: (index: number, pipeId: string) => void
  onCreatePipe: (name: string) => void
  onAddChildPipe: (name: string) => void
  onAddExistingPipe: (pipe: TransformerPipe, mode: 'linked' | 'copy') => void
  stackIndexForPipeId?: (pipeId: string) => number
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
  onDecouplePipeBinding?: (stackIndex: number) => void
  onMakeUnique?: (id: string) => void
  makeUniqueDisabledReason?: string
  usageCounts?: Record<string, number>
  selectedStageId?: string | null
  cardErrorsByStackIndex?: Record<number, TransformerCardErrorKind>
  /** Settings requested from the pipe-nav tree: open this stage's config drawer. */
  stageConfigRequest?: StageConfigRequest | null
  /** Global-library transformers offered in the add dialog (copied into the project on add). */
  globalTransformers?: Record<string, TransformerConfig>
}

export default function PipeFocusedStrip({
  world,
  entity,
  view,
  focusPath,
  depth,
  selectedIndex,
  stageConfigs,
  stageIds,
  registryEntityId,
  liveTraceSteps,
  drawerPortalTarget,
  onCommitStages,
  onPatchStage,
  onSelectStageId,
  onSelectPipeIndex,
  onDrillIntoPipe,
  onCreatePipe,
  onAddChildPipe,
  onAddExistingPipe,
  stackIndexForPipeId,
  onPipeControlToggle,
  onPipeParamChange,
  onPipeParamsReplace,
  onDecouplePipeBinding,
  onMakeUnique,
  makeUniqueDisabledReason,
  usageCounts,
  selectedStageId,
  cardErrorsByStackIndex,
  stageConfigRequest,
  globalTransformers,
}: PipeFocusedStripProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [scrollLeft, setScrollLeft] = useState(0)
  const pipes = world.transformerPipes ?? {}
  const stack = getEntityPipeStack(entity)
  const stageRuntime = useMemo(() => resolveEntityStageRuntime(world, entity), [world, entity])

  const isLeafLevel = isPipeNavLeafLevel(view)

  const openAddDialog = useCallback(() => setAddDialogOpen(true), [])

  const handleAddPreset = useCallback(
    (type: string) => {
      const next = appendPresetTransformerStage(
        stageConfigs,
        stageIds,
        type,
        registryEntityId,
        world.transformers ?? {},
      )
      onCommitStages(next.configs, next.ids)
      onSelectStageId(next.selectId)
    },
    [stageConfigs, stageIds, registryEntityId, world.transformers, onCommitStages, onSelectStageId],
  )

  const handleAddExisting = useCallback(
    (registryId: string, mode: AddExistingTransformerMode) => {
      const next = appendExistingTransformerStage(
        stageConfigs,
        stageIds,
        registryId,
        mode,
        registryEntityId,
        world.transformers ?? {},
      )
      if (!next) return
      onCommitStages(next.configs, next.ids)
      onSelectStageId(next.selectId)
    },
    [stageConfigs, stageIds, registryEntityId, world.transformers, onCommitStages, onSelectStageId],
  )

  const handleAddGlobalTransformer = useCallback(
    (globalId: string) => {
      const def = globalTransformers?.[globalId]
      if (!def) return
      // Copy the global stage into the project under a fresh id (never overwrites a project stage).
      const next = insertGlobalTransformerStage(
        stageConfigs,
        stageIds,
        globalId,
        def,
        registryEntityId,
        { ...(world.transformers ?? {}), [globalId]: def },
      )
      onCommitStages(next.configs, next.ids)
      onSelectStageId(next.selectId)
    },
    [globalTransformers, stageConfigs, stageIds, registryEntityId, world.transformers, onCommitStages, onSelectStageId],
  )

  const plusButtonStyle = isLeafLevel ? transformerPlusBtnStyle : pipeLevelPlusBtnStyle

  const renderPlusButton = () => (
    <button
      type="button"
      onClick={openAddDialog}
      aria-label="Add"
      data-testid="pipe-focused-add-button"
      data-leaf-level={isLeafLevel ? 'true' : 'false'}
      style={plusButtonStyle}
    >
      +
    </button>
  )

  const addDialog = (
    <PipeAddDialog
      isOpen={addDialogOpen}
      onClose={() => setAddDialogOpen(false)}
      mode={view.mode}
      hasPipeStack={stack.length > 0}
      world={world}
      existingRegistry={world.transformers ?? {}}
      excludedStageIds={stageIds}
      onAddPreset={handleAddPreset}
      onAddExisting={handleAddExisting}
      globalTransformers={globalTransformers}
      onAddGlobalTransformer={globalTransformers ? handleAddGlobalTransformer : undefined}
      onCreatePipe={onCreatePipe}
      onAddChildPipe={onAddChildPipe}
      onAddExistingPipe={onAddExistingPipe}
    />
  )

  if (view.mode === 'entity_stages' && stack.length === 0) {
    return (
      <>
        <TransformerHorizontalPipeline
          transformers={stageConfigs}
          transformerIds={stageIds}
          registryEntityId={registryEntityId}
          liveTraceSteps={liveTraceSteps}
          drawerPortalTarget={drawerPortalTarget}
          onCommit={onCommitStages}
          onPatchStage={onPatchStage}
          onSelectCode={onSelectStageId}
          onMakeUnique={onMakeUnique}
          makeUniqueDisabledReason={makeUniqueDisabledReason}
          usageCounts={usageCounts}
          existingRegistry={world.transformers}
          selectedId={selectedStageId}
          cardErrorsByStackIndex={cardErrorsByStackIndex}
          configRequest={stageConfigRequest}
          scope={{ kind: 'pipeStrip', depth, renderAddButton: renderPlusButton }}
        />
        {addDialog}
      </>
    )
  }

  if (view.mode === 'pipe_siblings' || (view.mode === 'pipe_members' && view.items.every((i) => i.kind === 'pipe'))) {
    const pipeItems = view.items.filter((i) => i.kind === 'pipe')
    return (
      <>
        <div onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)} style={pipeStripScrollStyle}>
          {pipeItems.map((item, idx) => {
            const pipe = pipes[item.pipeId] as TransformerPipe | undefined
            if (!pipe) return null
            const binding = item.kind === 'pipe' ? item.binding : undefined
            const stackIdx = view.mode === 'pipe_siblings' ? idx : stackIndexForPipeId?.(item.pipeId)
            const scopePath: PipeNavPathSegment[] =
              view.mode === 'pipe_siblings' ?
                [{ kind: 'stack', index: idx }]
              : focusPath
            const enabled = stageRuntime.isScopeEnabled(scopePath)
            const stackIdxForScope = stackIndexFromScopePath(scopePath)
            const pipeCardCallbacks = createPipeCardStageCallbacks(
              { pipeId: item.pipeId, stackIndex: stackIdxForScope, scopePath },
              { onPipeControlToggle, onPipeParamChange, onPipeParamsReplace },
            )
            return (
              <Fragment key={`${item.pipeId}-${idx}`}>
                {idx > 0 ?
                  <div style={{ width: 24, height: 2, background: theme.pipeNav.accentMuted, flexShrink: 0 }} />
                : null}
                <PipeCard
                  pipe={pipe}
                  binding={binding}
                  scopePath={scopePath}
                  world={world}
                  depth={depth}
                  isSelected={selectedIndex === idx}
                  enabled={enabled}
                  stackIndex={stackIdxForScope !== undefined && stackIdxForScope >= 0 ? stackIdxForScope : undefined}
                  drawerPortalTarget={drawerPortalTarget}
                  scrollLeft={scrollLeft}
                  onSelect={() => onSelectPipeIndex(idx)}
                  onDrillIn={() => onDrillIntoPipe(idx, item.pipeId)}
                  onToggleEnabled={pipeCardCallbacks.onToggleEnabled}
                  onParamChange={pipeCardCallbacks.onParamChange}
                  onParamsReplace={pipeCardCallbacks.onParamsReplace}
                  onDecoupleBinding={
                    stackIdx !== undefined && stackIdx >= 0 ?
                      () => onDecouplePipeBinding?.(stackIdx)
                    : undefined
                  }
                />
              </Fragment>
            )
          })}
          <div
            style={{
              position: 'relative',
              marginLeft: 8,
              flexShrink: 0,
              padding: 4,
              boxSizing: 'border-box',
              border: `1px dashed ${theme.pipeNav.accentMuted}`,
              borderRadius: 6,
              background: theme.pipeNav.levelBg[depth % theme.pipeNav.levelBg.length],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              alignSelf: 'center',
            }}
          >
            {renderPlusButton()}
          </div>
        </div>
        {addDialog}
      </>
    )
  }

  if (view.mode === 'pipe_members') {
    const hasMixedMembers =
      view.items.some((item) => item.kind === 'pipe') && view.items.some((item) => item.kind === 'stage')

    if (!hasMixedMembers && view.items.every((item) => item.kind === 'stage')) {
      return (
        <>
          <TransformerHorizontalPipeline
            transformers={stageConfigs}
            transformerIds={stageIds}
            registryEntityId={registryEntityId}
            liveTraceSteps={liveTraceSteps}
            drawerPortalTarget={drawerPortalTarget}
            onCommit={onCommitStages}
            onPatchStage={onPatchStage}
            onSelectCode={onSelectStageId}
            onMakeUnique={onMakeUnique}
            makeUniqueDisabledReason={makeUniqueDisabledReason}
            usageCounts={usageCounts}
            existingRegistry={world.transformers}
            selectedId={selectedStageId}
            cardErrorsByStackIndex={cardErrorsByStackIndex}
            configRequest={stageConfigRequest}
            scope={{
              kind: 'pipeStrip',
              depth,
              renderAddButton: renderPlusButton,
              isStageEnabled: pipeStripStageEnabledFromFocus(
                (path) => stageRuntime.isScopeEnabled(path),
                focusPath,
              ),
            }}
          />
          {addDialog}
        </>
      )
    }

    const parentPipeId = view.containerPipeId
    const renderPipeCard = (item: Extract<StripItem, { kind: 'pipe' }>) => {
      const pipe = pipes[item.pipeId]
      if (!pipe) return null
      const memberScopePath: PipeNavPathSegment[] =
        parentPipeId ?
          [...focusPath, { kind: 'member', pipeId: parentPipeId, memberIndex: item.index }]
        : focusPath
      const enabled = stageRuntime.isScopeEnabled(memberScopePath)
      const stackIdx = stackIndexFromScopePath(memberScopePath)
      const stackBinding =
        stackIdx !== undefined && stackIdx >= 0 ? stack[stackIdx] : undefined
      const pipeCardCallbacks = createPipeCardStageCallbacks(
        { pipeId: item.pipeId, stackIndex: stackIdx, scopePath: memberScopePath },
        { onPipeControlToggle, onPipeParamChange, onPipeParamsReplace },
        { memberParentPipeId: parentPipeId, memberIndex: item.index },
      )
      return (
        <PipeCard
          pipe={pipe}
          binding={stackBinding}
          scopePath={memberScopePath}
          world={world}
          depth={depth}
          isSelected={selectedIndex === item.index}
          enabled={enabled}
          stackIndex={stackIdx !== undefined && stackIdx >= 0 ? stackIdx : undefined}
          drawerPortalTarget={drawerPortalTarget}
          scrollLeft={scrollLeft}
          onSelect={() => onSelectPipeIndex(item.index)}
          onDrillIn={() => onDrillIntoPipe(item.index, item.pipeId)}
          onToggleEnabled={pipeCardCallbacks.onToggleEnabled}
          onParamChange={pipeCardCallbacks.onParamChange}
          onParamsReplace={pipeCardCallbacks.onParamsReplace}
          onDecoupleBinding={
            stackIdx !== undefined && stackIdx >= 0 ?
              () => onDecouplePipeBinding?.(stackIdx)
            : undefined
          }
        />
      )
    }

    const renderStageCard = (item: Extract<StripItem, { kind: 'stage' }>) => {
      // `item.index` is the position among ALL members (stages and pipes mixed); `stageIds` lists only the stages,
      // so address the stage by id. Index math silently dropped every stage that follows a nested pipe.
      const cfg = world.transformers?.[item.stageId]
      if (!cfg) return null
      const flatIdx = stageIds.indexOf(item.stageId)
      const stageIdx = flatIdx >= 0 ? flatIdx : 0
      return (
        <TransformerHorizontalPipeline
          transformers={[cfg]}
          transformerIds={[item.stageId]}
          registryEntityId={registryEntityId}
          liveTraceSteps={liveTraceSteps}
          drawerPortalTarget={drawerPortalTarget}
          onCommit={(nextConfigs) => {
            if (onPatchStage) {
              onPatchStage(item.stageId, nextConfigs[0]!)
              return
            }
            if (flatIdx < 0) return
            const nextAll = [...stageConfigs]
            nextAll[flatIdx] = nextConfigs[0]!
            onCommitStages(nextAll)
          }}
          onPatchStage={onPatchStage}
          onSelectCode={onSelectStageId}
          onMakeUnique={onMakeUnique}
          makeUniqueDisabledReason={makeUniqueDisabledReason}
          usageCounts={usageCounts}
          existingRegistry={world.transformers}
          selectedId={selectedStageId}
          cardErrorsByStackIndex={
            cardErrorsByStackIndex?.[stageIdx] != null ?
              { 0: cardErrorsByStackIndex[stageIdx]! }
            : undefined
          }
          configRequest={stageConfigRequest}
          scope={{ kind: 'pipeMember', depth, stackIndex: stageIdx }}
        />
      )
    }

    return (
      <>
        <div onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)} style={pipeStripScrollStyle}>
          {view.items.map((item, displayIdx) => (
            <Fragment key={item.kind === 'stage' ? item.stageId : `${item.pipeId}-${item.index}`}>
              {displayIdx > 0 ?
                <div style={{ width: 16, height: 2, background: theme.pipeNav.accentMuted, flexShrink: 0 }} />
              : null}
              {item.kind === 'pipe' ? renderPipeCard(item) : renderStageCard(item)}
            </Fragment>
          ))}
          <div
            style={{
              position: 'relative',
              marginLeft: 8,
              flexShrink: 0,
              padding: 4,
              boxSizing: 'border-box',
              border: `1px dashed ${theme.pipeNav.accentMuted}`,
              borderRadius: 6,
              background: theme.pipeNav.levelBg[depth % theme.pipeNav.levelBg.length],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              alignSelf: 'center',
            }}
          >
            {renderPlusButton()}
          </div>
        </div>
        {addDialog}
      </>
    )
  }

  return null
}

const pipeStripScrollStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 0,
  overflowX: 'auto',
  overflowY: 'visible',
  padding: '8px 4px',
  minHeight: 0,
  flex: '1 1 auto',
}

const transformerPlusBtnStyle: CSSProperties = {
  width: 28,
  height: 28,
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
  fontWeight: 600,
  lineHeight: 1,
  background: theme.bg.codeOverlay,
  border: `1px solid ${theme.border.default}`,
  borderRadius: 4,
  color: theme.text.muted,
  cursor: 'pointer',
}

const pipeLevelPlusBtnStyle: CSSProperties = {
  width: 28,
  height: 28,
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
  fontWeight: 600,
  background: theme.bg.codeOverlay,
  border: `1px solid ${theme.pipeNav.accentBorder}`,
  borderRadius: 4,
  color: theme.pipeNav.accent,
  cursor: 'pointer',
}
