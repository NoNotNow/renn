import { Fragment, useCallback, useMemo, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import type { PipeNavPathSegment, PipeTreeNode } from '@/types/pipeNav'
import type { TransformerConfig, TransformerPipe } from '@/types/transformer'
import type { StageCommitKind } from '@/editor/commitStageEdit'
import type { Entity, RennWorld } from '@/types/world'
import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import type { LibraryPipeSource } from '@/utils/assignLibraryPipe'
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
import { entityLevelItems } from '@/utils/stripOrder'
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
  /** Add a project or global-library pipe at the focused level. */
  onAddLibraryPipe: (source: LibraryPipeSource, pipeId: string, mode: 'linked' | 'copy') => void
  globalLibrary?: GlobalBehaviorLibrary
  /** Controlled open state of the add dialog (the tree's "+ Add" opens the same dialog). */
  addDialogOpen?: boolean
  onAddDialogOpenChange?: (open: boolean) => void
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
  /** Drag in the entity-level strip (pipes + top-level stages): move `fromKey` to slot `toIndex`. */
  onReorderEntityLevel?: (fromKey: string, toIndex: number) => void
  /** Drag inside a pipe whose members mix stages and pipes. */
  onReorderMembers?: (pipeId: string, fromIndex: number, toIndex: number) => void
  /** × on a pipe card: delete the pipe (stack pipe or nested member) through the tree-delete edit. */
  onDeleteNode?: (node: PipeTreeNode) => void
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
  onAddLibraryPipe,
  globalLibrary,
  addDialogOpen: addDialogOpenProp,
  onAddDialogOpenChange,
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
  onReorderEntityLevel,
  onReorderMembers,
  onDeleteNode,
}: PipeFocusedStripProps) {
  const [addDialogOpenLocal, setAddDialogOpenLocal] = useState(false)
  const addDialogOpen = addDialogOpenProp ?? addDialogOpenLocal
  const setAddDialogOpen = onAddDialogOpenChange ?? setAddDialogOpenLocal
  const [scrollLeft, setScrollLeft] = useState(0)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const dragState: StripDragState = { dragKey, setDragKey, overIndex, setOverIndex }
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
      globalLibrary={globalLibrary}
      onAddLibraryPipe={onAddLibraryPipe}
    />
  )

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

  if (view.mode === 'pipe_siblings') {
    const ordered = entityLevelItems(world, entity)
    const renderSiblingPipeCard = (stackIdx: number, pipeId: string) => {
      const pipe = pipes[pipeId] as TransformerPipe | undefined
      if (!pipe) return null
      const binding = stack[stackIdx]
      const scopePath: PipeNavPathSegment[] = [{ kind: 'stack', index: stackIdx }]
      const pipeCardCallbacks = createPipeCardStageCallbacks(
        { pipeId, stackIndex: stackIdx, scopePath },
        { onPipeControlToggle, onPipeParamChange, onPipeParamsReplace },
      )
      return (
        <PipeCard
          pipe={pipe}
          binding={binding}
          scopePath={scopePath}
          world={world}
          depth={depth}
          isSelected={selectedIndex === stackIdx}
          enabled={stageRuntime.isScopeEnabled(scopePath)}
          stackIndex={stackIdx}
          drawerPortalTarget={drawerPortalTarget}
          scrollLeft={scrollLeft}
          onSelect={() => onSelectPipeIndex(stackIdx)}
          onDrillIn={() => onDrillIntoPipe(stackIdx, pipeId)}
          onToggleEnabled={pipeCardCallbacks.onToggleEnabled}
          onParamChange={pipeCardCallbacks.onParamChange}
          onParamsReplace={pipeCardCallbacks.onParamsReplace}
          onDecoupleBinding={() => onDecouplePipeBinding?.(stackIdx)}
          onRemove={
            onDeleteNode ?
              () => onDeleteNode({ kind: 'stack_pipe', pipeId, stackIndex: stackIdx, label: pipe.name })
            : undefined
          }
        />
      )
    }
    return (
      <>
        <div onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)} style={pipeStripScrollStyle}>
          {ordered.map((item, pos) => (
            <Fragment key={item.key}>
              {pos > 0 ?
                <div style={{ width: 16, height: 2, background: theme.pipeNav.accentMuted, flexShrink: 0 }} />
              : null}
              <StripSlot
                index={pos}
                itemKey={item.key}
                drag={dragState}
                onDrop={(fromKey, toIndex) => onReorderEntityLevel?.(fromKey, toIndex)}
              >
                {item.kind === 'pipe' ?
                  renderSiblingPipeCard(item.stackIndex!, item.pipeId)
                : renderStageCard({ kind: 'stage', stageId: item.stageId, index: pos })}
              </StripSlot>
            </Fragment>
          ))}
          <div style={addSlotStyle(depth)}>{renderPlusButton()}</div>
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
          onRemove={
            onDeleteNode && parentPipeId ?
              () =>
                onDeleteNode({
                  kind: 'member_pipe',
                  pipeId: item.pipeId,
                  parentPipeId,
                  memberIndex: item.index,
                  label: pipe.name,
                })
            : undefined
          }
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
              <StripSlot
                index={displayIdx}
                itemKey={`member:${item.index}`}
                drag={dragState}
                onDrop={(fromKey, toIndex) => {
                  if (parentPipeId) onReorderMembers?.(parentPipeId, Number(fromKey.slice('member:'.length)), toIndex)
                }}
              >
                {item.kind === 'pipe' ? renderPipeCard(item) : renderStageCard(item)}
              </StripSlot>
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

interface StripDragState {
  dragKey: string | null
  setDragKey: (k: string | null) => void
  overIndex: number | null
  setOverIndex: (i: number | null) => void
}

/** One strip item; dragging its card / header and dropping on another slot moves it there (run order). */
function StripSlot({
  index,
  itemKey,
  drag,
  onDrop,
  children,
}: {
  index: number
  itemKey: string
  drag: StripDragState
  onDrop: (fromKey: string, toIndex: number) => void
  children: ReactNode
}) {
  const dragging = drag.dragKey === itemKey
  const isTarget = drag.dragKey !== null && drag.overIndex === index && !dragging
  return (
    <div
      data-testid={`strip-slot-${itemKey}`}
      // The draggable part is the card itself (a stage card) or its header (a pipe card): their dragstart bubbles here.
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', itemKey)
        e.dataTransfer.effectAllowed = 'move'
        drag.setDragKey(itemKey)
      }}
      onDragEnd={() => {
        drag.setDragKey(null)
        drag.setOverIndex(null)
      }}
      onDragOver={(e) => {
        if (drag.dragKey === null) return
        e.preventDefault()
        if (drag.overIndex !== index) drag.setOverIndex(index)
      }}
      onDrop={(e) => {
        e.preventDefault()
        const from = drag.dragKey
        drag.setDragKey(null)
        drag.setOverIndex(null)
        if (from !== null && from !== itemKey) onDrop(from, index)
      }}
      style={{
        position: 'relative',
        flexShrink: 0,
        opacity: dragging ? 0.45 : 1,
        borderLeft: isTarget ? `3px solid ${theme.pipeNav.accent}` : '3px solid transparent',
        paddingLeft: 2,
      }}
    >
      {children}
    </div>
  )
}

const addSlotStyle = (depth: number): CSSProperties => ({
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
})

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
