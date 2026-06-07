import { Fragment, useCallback, useState, type CSSProperties, type RefObject } from 'react'
import type { TransformerConfig, TransformerPipe } from '@/types/transformer'
import type { Entity, RennWorld } from '@/types/world'
import type { TransformerTraceStep } from '@/transformers/transformerTrace'
import { theme } from '@/config/theme'
import { TransformerHorizontalPipeline, type TransformerCardErrorKind } from '@/components/workspace/TransformerPipelineHorizontal'
import type { AddExistingTransformerMode } from '@/components/workspace/AddTransformerDialogPanel'
import {
  appendExistingTransformerStage,
  appendPresetTransformerStage,
} from '@/utils/appendTransformerStage'
import PipeCard from './PipeCard'
import PipeAddDialog from './PipeAddDialog'
import type { ResolvedPipeNavView, StripItem } from '@/types/pipeNav'
import { isPipeNavLeafLevel } from '@/utils/pipeNavResolve'
import { getEntityPipeStack, normalizePipeMembers } from '@/utils/transformerPipeResolve'

export interface PipeFocusedStripProps {
  world: RennWorld
  entity: Entity
  view: ResolvedPipeNavView
  depth: number
  selectedIndex: number
  stageConfigs: TransformerConfig[]
  stageIds: string[]
  registryEntityId?: string
  liveTraceSteps: TransformerTraceStep[] | null
  drawerPortalTarget: RefObject<HTMLDivElement | null>
  onCommitStages: (configs: TransformerConfig[], orderedIds?: string[]) => void
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
    key: string
    value: unknown
    useSharedDefaults?: boolean
  }) => void
  onPipeParamsReplace?: (opts: {
    pipeId: string
    stackIndex?: number
    params: Record<string, unknown>
    useSharedDefaults?: boolean
  }) => void
  onDecouplePipeBinding?: (stackIndex: number) => void
  onMakeUnique?: (id: string) => void
  makeUniqueDisabledReason?: string
  usageCounts?: Record<string, number>
  selectedStageId?: string | null
  cardErrorsByStackIndex?: Record<number, TransformerCardErrorKind>
}

export default function PipeFocusedStrip({
  world,
  entity,
  view,
  depth,
  selectedIndex,
  stageConfigs,
  stageIds,
  registryEntityId,
  liveTraceSteps,
  drawerPortalTarget,
  onCommitStages,
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
}: PipeFocusedStripProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const pipes = world.transformerPipes ?? {}
  const stack = getEntityPipeStack(entity)

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
          onSelectCode={onSelectStageId}
          onMakeUnique={onMakeUnique}
          makeUniqueDisabledReason={makeUniqueDisabledReason}
          usageCounts={usageCounts}
          existingRegistry={world.transformers}
          selectedId={selectedStageId}
          cardErrorsByStackIndex={cardErrorsByStackIndex}
          cardDepth={depth}
          externalAddDialog
          renderAddButton={() => renderPlusButton()}
        />
        {addDialog}
      </>
    )
  }

  if (view.mode === 'pipe_siblings' || (view.mode === 'pipe_members' && view.items.every((i) => i.kind === 'pipe'))) {
    const pipeItems = view.items.filter((i) => i.kind === 'pipe')
    return (
      <>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 0,
            overflowX: 'auto',
            overflowY: 'visible',
            padding: '8px 4px',
            minHeight: 0,
            flex: '1 1 auto',
          }}
        >
          {pipeItems.map((item, idx) => {
            const pipe = pipes[item.pipeId] as TransformerPipe | undefined
            if (!pipe) return null
            const binding = item.kind === 'pipe' ? item.binding : undefined
            const enabled = binding?.enabled !== false
            const stackIdx = view.mode === 'pipe_siblings' ? idx : stackIndexForPipeId?.(item.pipeId)
            return (
              <Fragment key={`${item.pipeId}-${idx}`}>
                {idx > 0 ?
                  <div style={{ width: 24, height: 2, background: theme.pipeNav.accentMuted, flexShrink: 0 }} />
                : null}
                <PipeCard
                  pipe={pipe}
                  binding={binding}
                  world={world}
                  depth={depth}
                  isSelected={selectedIndex === idx}
                  enabled={enabled}
                  stackIndex={stackIdx !== undefined && stackIdx >= 0 ? stackIdx : undefined}
                  drawerPortalTarget={drawerPortalTarget}
                  onSelect={() => onSelectPipeIndex(idx)}
                  onDrillIn={() => onDrillIntoPipe(idx, item.pipeId)}
                  onToggleEnabled={() =>
                    onPipeControlToggle?.({
                      pipeId: item.pipeId,
                      stackIndex: stackIdx !== undefined && stackIdx >= 0 ? stackIdx : undefined,
                    })
                  }
                  onParamChange={(key, value) =>
                    onPipeParamChange?.({
                      pipeId: item.pipeId,
                      stackIndex: stackIdx,
                      key,
                      value,
                      useSharedDefaults: stackIdx === undefined || stackIdx < 0,
                    })
                  }
                  onParamsReplace={(params) =>
                    onPipeParamsReplace?.({
                      pipeId: item.pipeId,
                      stackIndex: stackIdx,
                      params,
                      useSharedDefaults: stackIdx === undefined || stackIdx < 0,
                    })
                  }
                  onDecoupleBinding={
                    stackIdx !== undefined && stackIdx >= 0 ?
                      () => onDecouplePipeBinding?.(stackIdx)
                    : undefined
                  }
                  useSharedDefaults={stackIdx === undefined || stackIdx < 0}
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
            onSelectCode={onSelectStageId}
            onMakeUnique={onMakeUnique}
            makeUniqueDisabledReason={makeUniqueDisabledReason}
            usageCounts={usageCounts}
            existingRegistry={world.transformers}
            selectedId={selectedStageId}
            cardErrorsByStackIndex={cardErrorsByStackIndex}
            cardDepth={depth}
            externalAddDialog
            renderAddButton={() => renderPlusButton()}
          />
          {addDialog}
        </>
      )
    }

    const parentPipeId = view.containerPipeId
    const renderPipeCard = (item: Extract<StripItem, { kind: 'pipe' }>) => {
      const pipe = pipes[item.pipeId]
      if (!pipe) return null
      const member = parentPipeId ?
        normalizePipeMembers(pipes[parentPipeId] ?? { id: '', name: '', stageIds: [], stages: [] })[item.index]
      : undefined
      const enabled = member?.kind === 'pipe' ? member.enabled !== false : true
      const stackIdx = stackIndexForPipeId?.(item.pipeId)
      const stackBinding =
        stackIdx !== undefined && stackIdx >= 0 ? stack[stackIdx] : undefined
      return (
        <PipeCard
          pipe={pipe}
          binding={stackBinding}
          world={world}
          depth={depth}
          isSelected={selectedIndex === item.index}
          enabled={enabled}
          stackIndex={stackIdx !== undefined && stackIdx >= 0 ? stackIdx : undefined}
          drawerPortalTarget={drawerPortalTarget}
          onSelect={() => onSelectPipeIndex(item.index)}
          onDrillIn={() => onDrillIntoPipe(item.index, item.pipeId)}
          onToggleEnabled={() =>
            onPipeControlToggle?.({
              pipeId: item.pipeId,
              stackIndex: stackIdx !== undefined && stackIdx >= 0 ? stackIdx : undefined,
              memberParentPipeId: parentPipeId,
              memberIndex: item.index,
            })
          }
          onParamChange={(key, value) =>
            onPipeParamChange?.({
              pipeId: item.pipeId,
              stackIndex: stackIdx,
              key,
              value,
              useSharedDefaults: stackIdx === undefined || stackIdx < 0,
            })
          }
          onParamsReplace={(params) =>
            onPipeParamsReplace?.({
              pipeId: item.pipeId,
              stackIndex: stackIdx,
              params,
              useSharedDefaults: stackIdx === undefined || stackIdx < 0,
            })
          }
          onDecoupleBinding={
            stackIdx !== undefined && stackIdx >= 0 ?
              () => onDecouplePipeBinding?.(stackIdx)
            : undefined
          }
          useSharedDefaults={stackIdx === undefined || stackIdx < 0}
        />
      )
    }

    const renderStageCard = (item: Extract<StripItem, { kind: 'stage' }>) => {
      const stageIdx = stageIds.indexOf(item.stageId)
      if (stageIdx < 0) return null
      const cfg = stageConfigs[stageIdx]
      if (!cfg) return null
      return (
        <TransformerHorizontalPipeline
          transformers={[cfg]}
          transformerIds={[item.stageId]}
          registryEntityId={registryEntityId}
          liveTraceSteps={liveTraceSteps}
          drawerPortalTarget={drawerPortalTarget}
          onCommit={(nextConfigs) => {
            const nextAll = [...stageConfigs]
            nextAll[stageIdx] = nextConfigs[0]!
            onCommitStages(nextAll)
          }}
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
          cardDepth={depth}
          inline
          embedStackIndex={stageIdx}
          externalAddDialog
          renderAddButton={() => null}
        />
      )
    }

    return (
      <>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 0,
            overflowX: 'auto',
            overflowY: 'visible',
            padding: '8px 4px',
            minHeight: 0,
            flex: '1 1 auto',
          }}
        >
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
