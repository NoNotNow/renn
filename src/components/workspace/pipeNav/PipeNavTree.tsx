import { useCallback, useState, type DragEvent, type ReactNode, type RefObject } from 'react'
import type { PipeNavPathSegment } from '@/types/pipeNav'
import type { Entity, RennWorld } from '@/types/world'
import { theme } from '@/config/theme'
import { getEntityPipeStack, normalizePipeMembers } from '@/utils/transformerPipeResolve'
import { isPipeScopeEffectivelyEnabled, stackIndexFromScopePath } from '@/utils/pipeStageResolve'
import type { PipeTreeContextTarget } from '@/utils/pipeNavTreeHelpers'
import PipeTreePipeControls from './PipeTreePipeControls'

export type PipeTreeNode =
  | { kind: 'entity'; entityId: string; label: string }
  | { kind: 'stack_pipe'; pipeId: string; stackIndex: number; label: string }
  | { kind: 'member_stage'; pipeId: string; parentPipeId: string; memberIndex: number; stageId: string; label: string }
  | { kind: 'member_pipe'; pipeId: string; parentPipeId: string; memberIndex: number; label: string }

export interface PipeNavTreeProps {
  world: RennWorld
  entity: Entity
  focusPath: PipeNavPathSegment[]
  selectedIndex: number
  onSelectPath: (path: PipeNavPathSegment[], index: number, stageId?: string) => void
  onDeleteNode?: (node: PipeTreeNode) => void
  onContextAction?: (
    action: 'add_before' | 'add_after' | 'add_child' | 'delete',
    target: PipeTreeContextTarget,
  ) => void
  onTreeDrop?: (drag: PipeTreeNode, drop: PipeTreeNode) => void
  drawerPortalTarget?: RefObject<HTMLDivElement | null>
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
}

export default function PipeNavTree({
  world,
  entity,
  focusPath,
  selectedIndex,
  onSelectPath,
  onDeleteNode,
  onContextAction,
  onTreeDrop,
  drawerPortalTarget,
  stackIndexForPipeId,
  onPipeControlToggle,
  onPipeParamChange,
  onPipeParamsReplace,
  onDecouplePipeBinding,
}: PipeNavTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['entity']))
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null)
  const [dragNode, setDragNode] = useState<PipeTreeNode | null>(null)
  const [openConfigKey, setOpenConfigKey] = useState<string | null>(null)
  const [scrollLeft, setScrollLeft] = useState(0)

  const stack = getEntityPipeStack(entity)
  const pipes = world.transformerPipes ?? {}

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
        const pipeEnabled = isPipeScopeEffectivelyEnabled(world, entity, nodePath)
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
                    memberParentPipeId={parentPipeId}
                    memberIndex={memberIndex}
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
      world.transformers,
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
      stackIndexForPipeId,
      onPipeControlToggle,
      onPipeParamChange,
      onPipeParamsReplace,
      onDecouplePipeBinding,
      drawerPortalTarget,
      openConfigKey,
    ],
  )

  const entityKey = 'entity'
  const entityExpanded = expanded.has(entityKey)
  const entityNode: PipeTreeNode = {
    kind: 'entity',
    entityId: entity.id,
    label: entity.name ?? entity.id,
  }

  return (
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
                      enabled={isPipeScopeEffectivelyEnabled(world, entity, path)}
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
      {stack.length === 0 && entityExpanded ?
        <div style={{ paddingLeft: 20, color: theme.text.muted, fontSize: 10 }}>
          {(entity.transformers ?? []).length > 0 ? 'Stages (ungrouped)' : 'Empty'}
        </div>
      : null}
    </div>
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
