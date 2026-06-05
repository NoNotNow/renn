import { useCallback, useRef } from 'react'
import type { Entity, RennWorld } from '@/types/world'
import type { AddableShapeType } from '@/data/entityDefaults'
import CopyableArea from '../CopyableArea'
import EntityExplorerTree, {
  type EntityExplorerSelectEntityOptions,
} from '../EntityExplorerTree'
import { fieldLabelStyle } from '../sharedStyles'
import EntitySearchPicker from '@/components/entitySearch/EntitySearchPicker'
import { useEntitySearchPicker } from '@/components/entitySearch/useEntitySearchPicker'

export interface EntityListPanelProps {
  entities: Entity[]
  world: RennWorld
  selectedEntityIds: string[]
  selectedGroupIds: string[]
  entityWorkHistory: string[]
  onSelectEntity: (id: string | null, options?: EntityExplorerSelectEntityOptions) => void
  onSelectGroup: (groupId: string, options?: { additive?: boolean }) => void
  onCreateGroupFromSelection: () => void
  onUngroup: (groupId: string) => void
  onAddSelectedToGroup: (groupId: string) => void
  onRemoveSelectedFromGroup: () => void
  onToggleGroupCollapsed: (groupId: string, collapsed: boolean) => void
  onRenameGroup: (groupId: string, name: string) => void
  onAddEntity: (shapeType: AddableShapeType) => void
}

/**
 * "Entities" tab content for the left sidebar: add-entity dropdown, search,
 * filters, and the entity/group explorer tree.
 */
export default function EntityListPanel({
  entities,
  world,
  selectedEntityIds,
  selectedGroupIds,
  entityWorkHistory,
  onSelectEntity,
  onSelectGroup,
  onCreateGroupFromSelection,
  onUngroup,
  onAddSelectedToGroup,
  onRemoveSelectedFromGroup,
  onToggleGroupCollapsed,
  onRenameGroup,
  onAddEntity,
}: EntityListPanelProps) {
  const addEntitySelectRef = useRef<HTMLSelectElement>(null)
  const pickerState = useEntitySearchPicker(entities, entityWorkHistory)
  const { filteredEntities, entityListEmptyMessage } = pickerState

  const handleAddEntity = useCallback(
    (shapeType: AddableShapeType) => {
      onAddEntity(shapeType)
      if (addEntitySelectRef.current) {
        addEntitySelectRef.current.value = ''
      }
    },
    [onAddEntity],
  )

  const handlePickerSelect = useCallback(
    (id: string) => {
      onSelectEntity(id)
    },
    [onSelectEntity],
  )

  return (
    <CopyableArea
      copyPayload={entities.map((e) => ({
        id: e.id,
        name: e.name,
        shape: e.shape?.type,
        bodyType: e.bodyType,
        position: e.position,
        scripts: e.scripts,
      }))}
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
      }}
    >
      <div data-testid="entity-list-controls" style={{ flexShrink: 0 }}>
        <label
          style={{ ...fieldLabelStyle, cursor: 'help' }}
          title="Pick a primitive to insert a new entity at the default spawn point."
        >
          Add
          <select
            ref={addEntitySelectRef}
            value=""
            onChange={(e) => {
              const v = e.target.value as AddableShapeType
              if (v) handleAddEntity(v)
            }}
            style={{ display: 'block', width: '100%', marginTop: 4 }}
            title="Add entity"
          >
            <option value="">—</option>
            <option value="box">Box</option>
            <option value="sphere">Sphere</option>
            <option value="cylinder">Cylinder</option>
            <option value="capsule">Capsule</option>
            <option value="cone">Cone</option>
            <option value="pyramid">Pyramid</option>
            <option value="plane">Plane</option>
          </select>
        </label>
        <div style={{ marginTop: 8, marginBottom: 8 }}>
          <EntitySearchPicker
            entities={entities}
            entityWorkHistory={entityWorkHistory}
            selectedEntityId={selectedEntityIds[0] ?? null}
            onSelectEntity={handlePickerSelect}
            variant="panel"
            pickerState={pickerState}
            testId="sidebar-entity-search"
          />
        </div>
      </div>
      <EntityExplorerTree
        world={world}
        visibleEntities={filteredEntities}
        selectedEntityIds={selectedEntityIds}
        selectedGroupIds={selectedGroupIds}
        onSelectEntity={onSelectEntity}
        onSelectGroup={onSelectGroup}
        onCreateGroupFromSelection={onCreateGroupFromSelection}
        onUngroup={onUngroup}
        onAddSelectedToGroup={onAddSelectedToGroup}
        onRemoveSelectedFromGroup={onRemoveSelectedFromGroup}
        onToggleGroupCollapsed={onToggleGroupCollapsed}
        onRenameGroup={onRenameGroup}
        emptyMessage={entityListEmptyMessage}
      />
    </CopyableArea>
  )
}
