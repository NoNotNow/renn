import { useCallback, useMemo, useState, type DragEvent, type ReactNode, type RefObject } from 'react'
import type { PipeNavPathSegment, PipeTreeNode } from '@/types/pipeNav'
import type { Entity, RennWorld } from '@/types/world'
import { theme } from '@/config/theme'
import { getEntityPipeStack, normalizePipeMembers } from '@/utils/transformerPipeResolve'
import { resolveEntityStageRuntime, stackIndexFromScopePath, topLevelStageIds } from '@/utils/pipeStageResolve'
import type { PipeTreeContextTarget } from '@/utils/pipeNavTreeHelpers'
import { collectNestedPipeIds } from '@/utils/pipeSummary'
import PipeTreePipeControls from './PipeTreePipeControls'

export interface PipeNavTreeProps {
  world: RennWorld
  entity: Entity
  focusPath: PipeNavPathSegment[]
  selectedIndex: number
  /** Stage currently selected in the editor (highlights top-level stage rows). */
  selectedStageId?: string | null
  onSelectPath: (path: PipeNavPathSegment[], index: number, stageId?: string) => void
  onDeleteNode?: (node: PipeTreeNode) => void
  onContextAction?: (
    action: 'add_before' | 'add_after' | 'add_child' | 'delete',
    target: PipeTreeContextTarget,
  ) => void
  onTreeDrop?: (drag: PipeTreeNode, drop: PipeTreeNode) => void
  drawerPortalTarget?: RefObject<HTMLDivElement | null>
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
  /** Open a stage's settings (select it, then open its config drawer in the strip). */
  onConfigureStage?: (path: PipeNavPathSegment[], index: number, stageId: string) => void
  /** Enable / disable one stage (same switch as the card's power dot). */
  onToggleStageEnabled?: (stageId: string) => void
  /** Open the "assign a pipe" dialog; shows the "+ Pipe" toolbar button when set. */
  onAddPipe?: () => void
  /** Wrap everything (pipes + top-level stages) in one new pipe; shows the "Wrap all" toolbar button when set. */
  onWrapAll?: () => void
}

export default function PipeNavTree({
  world,
  entity,
  focusPath,
  selectedIndex,
  selectedStageId,
  onSelectPath,
  onDeleteNode,
  onContextAction,
  onTreeDrop,
  drawerPortalTarget,
  onPipeControlToggle,
  onPipeParamChange,
  onPipeParamsReplace,
  onDecouplePipeBinding,
  onConfigureStage,
  onToggleStageEnabled,
  onAddPipe,
  onWrapAll,
}: PipeNavTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['entity']))
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null)
  const [dragNode, setDragNode] = useState<PipeTreeNode | null>(null)
  const [openConfigKey, setOpenConfigKey] = useState<string | null>(null)
  const [scrollLeft, setScrollLeft] = useState(0)

  const stack = getEntityPipeStack(entity)
  const pipes = useMemo(() => world.transformerPipes ?? {}, [world.transformerPipes])
  const stageRuntime = useMemo(() => resolveEntityStageRuntime(world, entity), [world, entity])

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const expandAll = () => {
    const ids = collectNestedPipeIds(
      pipes,
      stack.map((b) => b.pipeId),
    )
    setExpanded(new Set(['entity', ...ids.map((id) => `pipe:${id}`)]))
  }
  /** Keeps the entity row open so the stack stays visible. */
  const collapseAll = () => setExpanded(new Set(['entity']))

  const handleDrop = useCallback(
    (drop: PipeTreeNode) => {
      if (dragNode && onTreeDrop) onTreeDrop(dragNode, drop)
      setDragNode(null)
    },
    [dragNode, onTreeDrop],
  )

  const renderMemberNodes = useCallback(
    (parentPipeId: string, pathPrefix: PipeNavPathSegment[], depth: number): ReactNode[] => {
      const pipe = pipes[parentPipeId]
      if (!pipe) return []
      const members = normalizePipeMembers(pipe)
      return members.map((member, memberIndex) => {
        const nodePath = [...pathPrefix, { kind: 'member' as const, pipeId: parentPipeId, memberIndex }]
        const key = `${parentPipeId}:${memberIndex}`
        const contextTarget = (node: PipeTreeNode): PipeTreeContextTarget => ({
          node,
          containerPath: pathPrefix,
        })
        if (member.kind === 'stage') {
          const cfg = world.transformers?.[member.stageId]
          const label = cfg?.type === 'custom' ? (cfg.name ?? 'Custom') : String(cfg?.type ?? member.stageId)
          const node: PipeTreeNode = {
            kind: 'member_stage',
            pipeId: parentPipeId,
            parentPipeId,
            memberIndex,
            stageId: member.stageId,
            label,
          }
          const isSelected =
            pathsEqual(focusPath, nodePath) && selectedIndex === memberIndex
          return (
            <TreeRow
              key={key}
              depth={depth}
              label={label}
              icon="●"
              selected={isSelected}
              hovered={hoveredId === key}
              onHover={(h) => setHoveredId(h ? key : null)}
              onClick={() => onSelectPath(nodePath, memberIndex, member.stageId)}
              canEditConfig={Boolean(onConfigureStage)}
              onEditConfig={() => onConfigureStage?.(nodePath, memberIndex, member.stageId)}
              trailing={
                onConfigureStage && (hoveredId === key || isSelected || openMenuKey === key) ?
                  <span style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    {onToggleStageEnabled ?
                      <IconBtn
                        title={cfg?.enabled === false ? 'Enable stage' : 'Disable stage'}
                        onClick={() => onToggleStageEnabled(member.stageId)}
                      >
                        {cfg?.enabled === false ? '○' : '●'}
                      </IconBtn>
                    : null}
                    <IconBtn title="Stage settings" onClick={() => onConfigureStage(nodePath, memberIndex, member.stageId)}>
                      ⚙
                    </IconBtn>
                  </span>
                : null
              }
              onDelete={onDeleteNode ? () => onDeleteNode(node) : undefined}
              onMenu={() => setOpenMenuKey(key)}
              menuOpen={openMenuKey === key}
              onContextAction={(a) => onContextAction?.(a, contextTarget(node))}
              onCloseMenu={() => setOpenMenuKey(null)}
              draggable
              onDragStart={() => setDragNode(node)}
              onDrop={() => handleDrop(node)}
            />
          )
        }
        const child = pipes[member.pipeId]
        const node: PipeTreeNode = {
          kind: 'member_pipe',
          pipeId: member.pipeId,
          parentPipeId,
          memberIndex,
          label: child?.name ?? member.pipeId,
        }
        const expandKey = `pipe:${member.pipeId}`
        const isExpanded = expanded.has(expandKey)
        const isSelected = pathsEqual(focusPath, nodePath) && selectedIndex === memberIndex
        const stackIdx = stackIndexFromScopePath(nodePath)
        const stackBinding =
          stackIdx !== undefined && stackIdx >= 0 ? stack[stackIdx] : undefined
        const pipeEnabled = stageRuntime.isScopeEnabled(nodePath)
        return (
          <div key={key}>
            <TreeRow
              depth={depth}
              label={child?.name ?? member.pipeId}
              icon={isExpanded ? '▼' : '▶'}
              selected={isSelected}
              hovered={hoveredId === key}
              onHover={(h) => setHoveredId(h ? key : null)}
              onClick={() => {
                toggleExpand(expandKey)
                onSelectPath(nodePath, memberIndex)
              }}
              onDelete={onDeleteNode ? () => onDeleteNode(node) : undefined}
              onMenu={() => setOpenMenuKey(key)}
              menuOpen={openMenuKey === key}
              onContextAction={(a) => onContextAction?.(a, contextTarget(node))}
              onCloseMenu={() => setOpenMenuKey(null)}
              canAddChild
              draggable
              dropTarget
              onDragStart={() => setDragNode(node)}
              onDrop={() => handleDrop(node)}
              canEditConfig
              onEditConfig={() => setOpenConfigKey(key)}
              trailing={
                child && (hoveredId === key || openMenuKey === key || openConfigKey === key) ?
                  <PipeTreePipeControls
                    pipe={child}
                    world={world}
                    binding={stackBinding}
                    enabled={pipeEnabled}
                    configOpen={openConfigKey === key}
                    onConfigOpenChange={(open) => setOpenConfigKey(open ? key : null)}
                    stackIndex={stackIdx !== undefined && stackIdx >= 0 ? stackIdx : undefined}
                    drawerPortalTarget={drawerPortalTarget}
                    scrollLeft={scrollLeft}
                    scopePath={nodePath}
                    onToggleEnabled={() =>
                      onPipeControlToggle?.({
                        pipeId: member.pipeId,
                        stackIndex: stackIdx !== undefined && stackIdx >= 0 ? stackIdx : undefined,
                        memberParentPipeId: parentPipeId,
                        memberIndex,
                      })
                    }
                    onParamChange={(paramKey, value) =>
                      onPipeParamChange?.({
                        pipeId: member.pipeId,
                        stackIndex: stackIdx,
                        scopePath: nodePath,
                        key: paramKey,
                        value,
                      })
                    }
                    onParamsReplace={(params) =>
                      onPipeParamsReplace?.({
                        pipeId: member.pipeId,
                        stackIndex: stackIdx,
                        scopePath: nodePath,
                        params,
                      })
                    }
                    onDecoupleBinding={
                      stackIdx !== undefined && stackIdx >= 0 ?
                        () => onDecouplePipeBinding?.(stackIdx)
                      : undefined
                    }
                  />
                : null
              }
            />
            {isExpanded ? renderMemberNodes(member.pipeId, nodePath, depth + 1) : null}
          </div>
        )
      })
    },
    [
      pipes,
      world,
      stageRuntime,
      scrollLeft,
      focusPath,
      selectedIndex,
      hoveredId,
      openMenuKey,
      expanded,
      onSelectPath,
      onDeleteNode,
      onContextAction,
      handleDrop,
      stack,
      onPipeControlToggle,
      onPipeParamChange,
      onPipeParamsReplace,
      onDecouplePipeBinding,
      onConfigureStage,
      onToggleStageEnabled,
      drawerPortalTarget,
      openConfigKey,
    ],
  )

  /** Stages sitting directly on the entity (next to its pipes, or all of them when it has no pipes). */
  const renderTopLevelStages = (): ReactNode[] => {
    const ids = stack.length === 0 ? (entity.transformers ?? []) : topLevelStageIds(world, entity)
    return ids.map((stageId, i) => {
      const cfg = world.transformers?.[stageId]
      const label = cfg?.type === 'custom' ? (cfg.name ?? 'Custom') : String(cfg?.type ?? stageId)
      const key = `top:${stageId}`
      const node: PipeTreeNode = { kind: 'top_stage', stageId, label }
      const isSelected = focusPath.length === 0 && selectedStageId === stageId
      return (
        <TreeRow
          key={key}
          depth={1}
          label={label}
          icon="●"
          selected={isSelected}
          hovered={hoveredId === key}
          onHover={(h) => setHoveredId(h ? key : null)}
          onClick={() => onSelectPath([], i, stageId)}
          canEditConfig={Boolean(onConfigureStage)}
          onEditConfig={() => onConfigureStage?.([], i, stageId)}
          trailing={
            onConfigureStage && (hoveredId === key || isSelected) ?
              <span style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                {onToggleStageEnabled ?
                  <IconBtn
                    title={cfg?.enabled === false ? 'Enable stage' : 'Disable stage'}
                    onClick={() => onToggleStageEnabled(stageId)}
                  >
                    {cfg?.enabled === false ? '○' : '●'}
                  </IconBtn>
                : null}
                <IconBtn title="Stage settings" onClick={() => onConfigureStage([], i, stageId)}>
                  ⚙
                </IconBtn>
              </span>
            : null
          }
          onDelete={onDeleteNode ? () => onDeleteNode(node) : undefined}
          draggable
          onDragStart={() => setDragNode(node)}
        />
      )
    })
  }

  const entityKey = 'entity'
  const entityExpanded = expanded.has(entityKey)
  const entityNode: PipeTreeNode = {
    kind: 'entity',
    entityId: entity.id,
    label: entity.name ?? entity.id,
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        data-testid="pipe-nav-tree-toolbar"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          padding: '4px 8px',
          borderBottom: `1px solid ${theme.pipeNav.accentMuted}`,
          flexShrink: 0,
        }}
      >
        {onAddPipe ?
          <ToolbarBtn title="Add a transformer or pipe at the focused level" testId="pipe-nav-tree-add-pipe" onClick={onAddPipe}>
            + Add
          </ToolbarBtn>
        : null}
        {onWrapAll && (entity.transformers ?? []).length > 0 ?
          <ToolbarBtn title="Wrap everything this object has in one new pipe" testId="pipe-nav-tree-wrap-all" onClick={onWrapAll}>
            Wrap all
          </ToolbarBtn>
        : null}
        <ToolbarBtn title="Expand all pipes" testId="pipe-nav-tree-expand-all" onClick={expandAll}>
          Expand all
        </ToolbarBtn>
        <ToolbarBtn title="Collapse all pipes" testId="pipe-nav-tree-collapse-all" onClick={collapseAll}>
          Collapse all
        </ToolbarBtn>
      </div>
    <div
      data-testid="pipe-nav-tree"
      onScroll={(e) => {
        setScrollLeft(e.currentTarget.scrollLeft)
      }}
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        fontSize: 11,
        padding: '4px 0',
      }}
    >
      <TreeRow
        depth={0}
        label={entity.name ?? entity.id}
        icon={entityExpanded ? '▼' : '▶'}
        selected={focusPath.length === 0}
        hovered={hoveredId === entityKey}
        onHover={(h) => setHoveredId(h ? entityKey : null)}
        onClick={() => {
          toggleExpand(entityKey)
          onSelectPath([], 0)
        }}
        onContextAction={(a) =>
          onContextAction?.(a, { node: entityNode, containerPath: [] })
        }
        menuOpen={openMenuKey === entityKey}
        onMenu={() => setOpenMenuKey(entityKey)}
        onCloseMenu={() => setOpenMenuKey(null)}
        dropTarget
        onDrop={() => handleDrop(entityNode)}
      />
      {entityExpanded ?
        stack.map((binding, stackIndex) => {
          const pipe = pipes[binding.pipeId]
          const key = `stack:${stackIndex}`
          const expandKey = `pipe:${binding.pipeId}`
          const isExpanded = expanded.has(expandKey)
          const path: PipeNavPathSegment[] = [{ kind: 'stack', index: stackIndex }]
          const node: PipeTreeNode = {
            kind: 'stack_pipe',
            pipeId: binding.pipeId,
            stackIndex,
            label: pipe?.name ?? binding.pipeId,
          }
          return (
            <div key={key}>
              <TreeRow
                depth={1}
                label={pipe?.name ?? binding.pipeId}
                icon={isExpanded ? '▼' : '▶'}
                selected={pathsEqual(focusPath, path)}
                hovered={hoveredId === key}
                onHover={(h) => setHoveredId(h ? key : null)}
                onClick={() => {
                  toggleExpand(expandKey)
                  onSelectPath(path, 0)
                }}
                onDelete={onDeleteNode ? () => onDeleteNode(node) : undefined}
                onMenu={() => setOpenMenuKey(key)}
                menuOpen={openMenuKey === key}
                onContextAction={(a) =>
                  onContextAction?.(a, { node, containerPath: path })
                }
                onCloseMenu={() => setOpenMenuKey(null)}
                canAddChild
                draggable
                dropTarget
                onDragStart={() => setDragNode(node)}
                onDrop={() => handleDrop(node)}
                canEditConfig
                onEditConfig={() => setOpenConfigKey(key)}
                trailing={
                  pipe && (hoveredId === key || openMenuKey === key || openConfigKey === key) ?
                    <PipeTreePipeControls
                      pipe={pipe}
                      world={world}
                      binding={binding}
                      enabled={stageRuntime.isScopeEnabled(path)}
                      configOpen={openConfigKey === key}
                      onConfigOpenChange={(open) => setOpenConfigKey(open ? key : null)}
                      stackIndex={stackIndex}
                      drawerPortalTarget={drawerPortalTarget}
                      scrollLeft={scrollLeft}
                      onToggleEnabled={() =>
                        onPipeControlToggle?.({ pipeId: binding.pipeId, stackIndex })
                      }
                      onParamChange={(paramKey, value) =>
                        onPipeParamChange?.({
                          pipeId: binding.pipeId,
                          stackIndex,
                          scopePath: path,
                          key: paramKey,
                          value,
                        })
                      }
                      onParamsReplace={(params) =>
                        onPipeParamsReplace?.({
                          pipeId: binding.pipeId,
                          stackIndex,
                          scopePath: path,
                          params,
                        })
                      }
                      onDecoupleBinding={() => onDecouplePipeBinding?.(stackIndex)}
                    />
                  : null
                }
              />
              {isExpanded ? renderMemberNodes(binding.pipeId, path, 2) : null}
            </div>
          )
        })
      : null}
      {entityExpanded ? renderTopLevelStages() : null}
      {stack.length === 0 && entityExpanded && (entity.transformers ?? []).length === 0 ?
        <div style={{ paddingLeft: 20, color: theme.text.muted, fontSize: 10 }}>Empty</div>
      : null}
    </div>
    </div>
  )
}

function ToolbarBtn({
  children,
  onClick,
  title,
  testId,
}: {
  children: string
  onClick: () => void
  title: string
  testId: string
}) {
  return (
    <button
      type="button"
      title={title}
      data-testid={testId}
      onClick={onClick}
      style={{
        padding: '2px 8px',
        whiteSpace: 'nowrap',
        border: `1px solid ${theme.pipeNav.accentMuted}`,
        borderRadius: 4,
        background: 'transparent',
        color: theme.pipeNav.accent,
        fontSize: 10,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function pathsEqual(a: PipeNavPathSegment[], b: PipeNavPathSegment[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function TreeRow({
  depth,
  label,
  icon,
  selected,
  hovered,
  onHover,
  onClick,
  onDelete,
  onMenu,
  menuOpen,
  onContextAction,
  onCloseMenu,
  canAddChild,
  canEditConfig,
  onEditConfig,
  draggable,
  onDragStart,
  onDrop,
  dropTarget,
  trailing,
}: {
  depth: number
  label: string
  icon: string
  selected: boolean
  hovered: boolean
  onHover: (hover: boolean) => void
  onClick: () => void
  onDelete?: () => void
  onMenu?: () => void
  menuOpen?: boolean
  onContextAction?: (action: 'add_before' | 'add_after' | 'add_child' | 'delete') => void
  onCloseMenu?: () => void
  canAddChild?: boolean
  canEditConfig?: boolean
  onEditConfig?: () => void
  draggable?: boolean
  onDragStart?: () => void
  onDrop?: () => void
  dropTarget?: boolean
  trailing?: ReactNode
}) {
  const onDragOver = (e: DragEvent) => {
    if (draggable || dropTarget || onDrop) e.preventDefault()
  }
  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    onDrop?.()
  }

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={handleDrop}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px 4px',
        paddingLeft: 8 + depth * 14,
        background: selected ? theme.pipeNav.treeSelected : hovered ? theme.pipeNav.treeHover : 'transparent',
        borderLeft: selected ? `2px solid ${theme.pipeNav.accent}` : '2px solid transparent',
        cursor: 'pointer',
      }}
      onClick={onClick}
    >
      <span style={{ width: 12, fontSize: 9, color: theme.pipeNav.accent }}>{icon}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {trailing}
      {hovered || menuOpen ?
        <span style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          {onDelete ?
            <IconBtn title="Delete" onClick={onDelete}>
              ×
            </IconBtn>
          : null}
          {onMenu ?
            <IconBtn title="More" onClick={onMenu}>
              …
            </IconBtn>
          : null}
        </span>
      : null}
      {menuOpen && onContextAction ?
        <div
          style={{
            position: 'absolute',
            right: 8,
            top: '100%',
            background: theme.bg.panel,
            border: `1px solid ${theme.pipeNav.accentBorder}`,
            borderRadius: 4,
            zIndex: 20,
            padding: 4,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem label="Add before" onClick={() => { onContextAction('add_before'); onCloseMenu?.() }} />
          <MenuItem label="Add after" onClick={() => { onContextAction('add_after'); onCloseMenu?.() }} />
          {canAddChild ?
            <MenuItem label="Add child" onClick={() => { onContextAction('add_child'); onCloseMenu?.() }} />
          : null}
          {canEditConfig && onEditConfig ?
            <MenuItem
              label="Edit params"
              onClick={() => {
                onEditConfig()
                onCloseMenu?.()
              }}
            />
          : null}
          {onDelete ?
            <MenuItem
              label="Delete"
              destructive
              onClick={() => {
                onDelete()
                onContextAction('delete')
                onCloseMenu?.()
              }}
            />
          : null}
        </div>
      : null}
    </div>
  )
}

function IconBtn({ children, onClick, title }: { children: string; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: 18,
        height: 18,
        padding: 0,
        border: 'none',
        borderRadius: 3,
        background: 'rgba(240,208,64,0.12)',
        color: theme.pipeNav.accent,
        fontSize: 10,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function MenuItem({
  label,
  onClick,
  destructive,
}: {
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        padding: '4px 10px',
        textAlign: 'left',
        background: 'none',
        border: 'none',
        color: destructive ? theme.status.disabled : theme.text.primary,
        fontSize: 11,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
