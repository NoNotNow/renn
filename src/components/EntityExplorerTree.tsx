import { useMemo, useState, useCallback, type ReactNode } from 'react'
import type { Entity, EntityGroup, RennWorld } from '@/types/world'
import {
  collectEntityIdsInGroup,
  findGroupById,
  findGroupContaining,
  getGroupTree,
  type GroupTreeNode,
} from '@/utils/entityGroups'
import { theme } from '@/config/theme'
import { uiLogger } from '@/utils/uiLogger'
import CopyableArea from './CopyableArea'
import { secondaryButtonStyle } from './sharedStyles'

export interface EntityExplorerTreeProps {
  world: RennWorld
  /** Entities visible after Search/Filters in the parent. */
  visibleEntities: Entity[]
  selectedEntityIds: string[]
  /** Group IDs that are explicitly selected (separate from entity selection). */
  selectedGroupIds: string[]
  onSelectEntity: (id: string, options?: { additive?: boolean }) => void
  onSelectGroup: (groupId: string, options?: { additive?: boolean }) => void
  onCreateGroupFromSelection: () => void
  onUngroup: (groupId: string) => void
  onAddSelectedToGroup: (groupId: string) => void
  onRemoveSelectedFromGroup: () => void
  onToggleGroupCollapsed: (groupId: string, collapsed: boolean) => void
  onRenameGroup: (groupId: string, name: string) => void
  emptyMessage: string
}

interface GroupActionState {
  canCreate: boolean
  canUngroup: boolean
  ungroupTargetId: string | null
  canAddToGroup: boolean
  addTargetGroupId: string | null
  canRemoveFromGroup: boolean
}

/**
 * Inspect the current selection and return which group actions are enabled.
 *
 * - canCreate: ≥ 2 entities/groups selected and not all in the same direct parent group
 * - canUngroup: exactly one group is selected (no entity additionally selected)
 * - canAddToGroup: exactly one group + ≥ 1 entity is selected (and the entity is not already
 *   a direct member of that group)
 * - canRemoveFromGroup: ≥ 1 selected entity is currently a member of any group
 */
export function computeGroupActionState(
  world: RennWorld,
  selectedEntityIds: readonly string[],
  selectedGroupIds: readonly string[],
): GroupActionState {
  const totalSel = selectedEntityIds.length + selectedGroupIds.length
  const canCreate = totalSel >= 2
  const canUngroup = selectedEntityIds.length === 0 && selectedGroupIds.length === 1
  const ungroupTargetId = canUngroup ? selectedGroupIds[0]! : null

  let canAddToGroup = false
  let addTargetGroupId: string | null = null
  if (selectedGroupIds.length === 1 && selectedEntityIds.length >= 1) {
    const gid = selectedGroupIds[0]!
    const group = findGroupById(world, gid)
    if (group) {
      const memberSet = new Set(group.memberIds)
      const someoneOutside = selectedEntityIds.some((id) => !memberSet.has(id))
      if (someoneOutside) {
        canAddToGroup = true
        addTargetGroupId = gid
      }
    }
  }

  const canRemoveFromGroup = selectedEntityIds.some((id) => findGroupContaining(world, id) !== null)

  return { canCreate, canUngroup, ungroupTargetId, canAddToGroup, addTargetGroupId, canRemoveFromGroup }
}

const ROW_INDENT_PX = 14

function GroupCaret({ collapsed }: { collapsed: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 10,
        textAlign: 'center',
        color: theme.text.muted,
        fontSize: 10,
        lineHeight: '14px',
        userSelect: 'none',
      }}
    >
      {collapsed ? '▶' : '▼'}
    </span>
  )
}

function GroupIcon() {
  return (
    <span aria-hidden style={{ fontSize: 12, opacity: 0.85 }} title="Group">
      📁
    </span>
  )
}

interface GroupRowProps {
  group: EntityGroup
  depth: number
  isSelected: boolean
  memberCount: number
  onSelect: (additive: boolean) => void
  onToggleCollapsed: () => void
  onRename: (name: string) => void
}

function GroupRow({ group, depth, isSelected, memberCount, onSelect, onToggleCollapsed, onRename }: GroupRowProps) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(group.name ?? '')
  const collapsed = group.collapsed ?? false
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        paddingLeft: depth * ROW_INDENT_PX,
      }}
    >
      <button
        type="button"
        aria-label={collapsed ? 'Expand group' : 'Collapse group'}
        onClick={(ev) => {
          ev.stopPropagation()
          onToggleCollapsed()
        }}
        style={{
          background: 'transparent',
          border: 'none',
          padding: '2px 2px',
          cursor: 'pointer',
        }}
      >
        <GroupCaret collapsed={collapsed} />
      </button>
      <button
        type="button"
        onClick={(ev) => onSelect(ev.shiftKey || ev.metaKey || ev.ctrlKey)}
        onDoubleClick={() => {
          setDraftName(group.name ?? '')
          setEditing(true)
        }}
        style={{
          flex: 1,
          textAlign: 'left',
          padding: '4px 6px',
          background: isSelected ? theme.button.primary : 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: theme.text.primary,
        }}
        title="Click to select group (and its entities). Double-click to rename."
        onMouseEnter={(ev) => {
          if (!isSelected) ev.currentTarget.style.background = theme.bg.listHover
        }}
        onMouseLeave={(ev) => {
          if (!isSelected) ev.currentTarget.style.background = 'transparent'
        }}
      >
        <GroupIcon />
        {editing ? (
          <input
            type="text"
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => {
              setEditing(false)
              onRename(draftName)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                ;(e.target as HTMLInputElement).blur()
              } else if (e.key === 'Escape') {
                setDraftName(group.name ?? '')
                setEditing(false)
              }
              e.stopPropagation()
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              background: theme.bg.panelAlt,
              border: `1px solid ${theme.border.default}`,
              color: theme.text.primary,
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 13,
            }}
          />
        ) : (
          <>
            <span style={{ flex: 1 }}>{group.name?.trim() || group.id}</span>
            <span style={{ fontSize: 11, color: theme.text.muted }}>{memberCount}</span>
          </>
        )}
      </button>
    </div>
  )
}

interface EntityRowProps {
  entity: Entity
  depth: number
  isSelected: boolean
  onSelect: (additive: boolean) => void
}

function EntityRow({ entity, depth, isSelected, onSelect }: EntityRowProps) {
  return (
    <div style={{ paddingLeft: depth * ROW_INDENT_PX + 16 /* caret reserve */ }}>
      <CopyableArea copyPayload={entity} style={{ display: 'block' }}>
        <button
          type="button"
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '4px 8px',
            background: isSelected ? theme.button.primary : 'transparent',
            border: 'none',
            cursor: 'pointer',
            transition: 'background 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          onClick={(ev) => {
            uiLogger.click('Builder', 'Select entity', { entityId: entity.id, entityName: entity.name })
            onSelect(ev.shiftKey || ev.metaKey || ev.ctrlKey)
          }}
          onMouseEnter={(ev) => {
            if (!isSelected) ev.currentTarget.style.background = theme.bg.listHover
          }}
          onMouseLeave={(ev) => {
            if (!isSelected) ev.currentTarget.style.background = 'transparent'
          }}
        >
          {entity.locked && <span style={{ fontSize: 11, opacity: 0.7 }}>🔒</span>}
          <span>{entity.name ?? entity.id}</span>
        </button>
      </CopyableArea>
    </div>
  )
}

export default function EntityExplorerTree({
  world,
  visibleEntities,
  selectedEntityIds,
  selectedGroupIds,
  onSelectEntity,
  onSelectGroup,
  onCreateGroupFromSelection,
  onUngroup,
  onAddSelectedToGroup,
  onRemoveSelectedFromGroup,
  onToggleGroupCollapsed,
  onRenameGroup,
  emptyMessage,
}: EntityExplorerTreeProps) {
  const visibleEntityIds = useMemo(() => new Set(visibleEntities.map((e) => e.id)), [visibleEntities])
  const entityById = useMemo(() => new Map(world.entities.map((e) => [e.id, e] as const)), [world.entities])
  const selectedEntitySet = useMemo(() => new Set(selectedEntityIds), [selectedEntityIds])
  const selectedGroupSet = useMemo(() => new Set(selectedGroupIds), [selectedGroupIds])

  const tree = useMemo(() => getGroupTree(world), [world])

  const actionState = useMemo(
    () => computeGroupActionState(world, selectedEntityIds, selectedGroupIds),
    [world, selectedEntityIds, selectedGroupIds],
  )

  const memberCount = useCallback(
    (groupId: string) => collectEntityIdsInGroup(world, groupId).length,
    [world],
  )

  /**
   * Apply the same Search/Filters cull as the flat list previously did, but in tree shape:
   * - hide entity rows whose id is not in `visibleEntityIds`
   * - hide a group row only when it has zero visible descendants AND no group descendants (otherwise keep,
   *   so the user can still see / interact with their structure).
   */
  function renderNode(node: GroupTreeNode, depth: number): ReactNode {
    if (node.kind === 'entity') {
      if (!visibleEntityIds.has(node.entityId)) return null
      const e = entityById.get(node.entityId)
      if (!e) return null
      return (
        <EntityRow
          key={`e-${node.entityId}`}
          entity={e}
          depth={depth}
          isSelected={selectedEntitySet.has(node.entityId)}
          onSelect={(additive) => onSelectEntity(node.entityId, { additive })}
        />
      )
    }
    const childNodes = node.children
      .map((c) => renderNode(c, depth + 1))
      .filter((x) => x !== null)
    const hasVisibleEntityDescendant = childNodes.length > 0
    const isGroupSelected = selectedGroupSet.has(node.group.id)
    const collapsed = node.group.collapsed ?? false

    if (!hasVisibleEntityDescendant && memberCount(node.group.id) > 0) {
      // All descendants culled by filters. Still show the empty group when nothing was filtered (count 0)
      // but hide it when it had members but they are all filtered out.
      return null
    }

    return (
      <div key={`g-${node.group.id}`}>
        <GroupRow
          group={node.group}
          depth={depth}
          isSelected={isGroupSelected}
          memberCount={memberCount(node.group.id)}
          onSelect={(additive) => onSelectGroup(node.group.id, { additive })}
          onToggleCollapsed={() => onToggleGroupCollapsed(node.group.id, !collapsed)}
          onRename={(name) => onRenameGroup(node.group.id, name)}
        />
        {!collapsed && childNodes.length > 0 && <div>{childNodes}</div>}
      </div>
    )
  }

  const renderedNodes = tree.map((n) => renderNode(n, 0)).filter((x) => x !== null)
  const isEmpty = renderedNodes.length === 0

  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          marginBottom: 6,
          minHeight: 26,
        }}
        aria-label="Group actions"
      >
        <button
          type="button"
          disabled={!actionState.canCreate}
          onClick={() => {
            uiLogger.click('Builder', 'Group selected', {
              entityCount: selectedEntityIds.length,
              groupCount: selectedGroupIds.length,
            })
            onCreateGroupFromSelection()
          }}
          style={{
            ...secondaryButtonStyle,
            padding: '3px 8px',
            fontSize: 11,
            opacity: actionState.canCreate ? 1 : 0.4,
            cursor: actionState.canCreate ? 'pointer' : 'not-allowed',
          }}
          title="Create a new group from the current selection (Cmd/Ctrl+G)"
        >
          Group
        </button>
        <button
          type="button"
          disabled={!actionState.canUngroup}
          onClick={() => {
            if (!actionState.ungroupTargetId) return
            uiLogger.click('Builder', 'Ungroup', { groupId: actionState.ungroupTargetId })
            onUngroup(actionState.ungroupTargetId)
          }}
          style={{
            ...secondaryButtonStyle,
            padding: '3px 8px',
            fontSize: 11,
            opacity: actionState.canUngroup ? 1 : 0.4,
            cursor: actionState.canUngroup ? 'pointer' : 'not-allowed',
          }}
          title="Dissolve the selected group; its members become loose (Cmd/Ctrl+Shift+G)"
        >
          Ungroup
        </button>
        <button
          type="button"
          disabled={!actionState.canAddToGroup}
          onClick={() => {
            if (!actionState.addTargetGroupId) return
            uiLogger.click('Builder', 'Add to group', {
              groupId: actionState.addTargetGroupId,
              entityIds: selectedEntityIds,
            })
            onAddSelectedToGroup(actionState.addTargetGroupId)
          }}
          style={{
            ...secondaryButtonStyle,
            padding: '3px 8px',
            fontSize: 11,
            opacity: actionState.canAddToGroup ? 1 : 0.4,
            cursor: actionState.canAddToGroup ? 'pointer' : 'not-allowed',
          }}
          title="Add the selected entities to the selected group"
        >
          Add to group
        </button>
        <button
          type="button"
          disabled={!actionState.canRemoveFromGroup}
          onClick={() => {
            uiLogger.click('Builder', 'Remove from group', { entityIds: selectedEntityIds })
            onRemoveSelectedFromGroup()
          }}
          style={{
            ...secondaryButtonStyle,
            padding: '3px 8px',
            fontSize: 11,
            opacity: actionState.canRemoveFromGroup ? 1 : 0.4,
            cursor: actionState.canRemoveFromGroup ? 'pointer' : 'not-allowed',
          }}
          title="Remove the selected entities from any group they belong to"
        >
          Remove from group
        </button>
      </div>
      <div role="tree" aria-label="Entity explorer">
        {isEmpty ? (
          <div style={{ color: theme.text.muted, fontSize: 13, padding: '8px 0' }}>{emptyMessage}</div>
        ) : (
          renderedNodes
        )}
      </div>
    </div>
  )
}
