import { useCallback, useRef } from 'react'
import type { Entity, RennWorld } from '@/types/world'
import type { AddableShapeType } from '@/data/entityDefaults'
import CopyableArea from '../CopyableArea'
import CollapsibleSection from '../CollapsibleSection'
import EntityExplorerTree from '../EntityExplorerTree'
import {
  fieldLabelStyle,
  sidebarLabelStyle,
  sidebarRowStyle,
  secondaryButtonStyle,
} from '../sharedStyles'
import { theme } from '@/config/theme'
import { useEntityListFilters } from './useEntityListFilters'

const SHAPE_FILTER_OPTIONS: { value: 'any' | AddableShapeType; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'box', label: 'Box' },
  { value: 'sphere', label: 'Sphere' },
  { value: 'cylinder', label: 'Cylinder' },
  { value: 'capsule', label: 'Capsule' },
  { value: 'cone', label: 'Cone' },
  { value: 'pyramid', label: 'Pyramid' },
  { value: 'plane', label: 'Plane' },
  { value: 'trimesh', label: 'Trimesh' },
]

export interface EntityListPanelProps {
  entities: Entity[]
  world: RennWorld
  selectedEntityIds: string[]
  selectedGroupIds: string[]
  onSelectEntity: (id: string | null, options?: { additive?: boolean }) => void
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
  const filters = useEntityListFilters(entities)
  const {
    searchQuery,
    setSearchQuery,
    filterHasModel,
    setFilterHasModel,
    filterShape,
    setFilterShape,
    filterHasTransformers,
    setFilterHasTransformers,
    filterSizeMin,
    setFilterSizeMin,
    filterSizeMax,
    setFilterSizeMax,
    hasActiveEntityFilters,
    clearEntityFilters,
    filteredEntities,
    entityListEmptyMessage,
  } = filters

  const handleAddEntity = useCallback(
    (shapeType: AddableShapeType) => {
      onAddEntity(shapeType)
      if (addEntitySelectRef.current) {
        addEntitySelectRef.current.value = ''
      }
    },
    [onAddEntity],
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
    >
      <>
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
        <div style={{ marginTop: 8, marginBottom: 8, position: 'relative' }}>
          <input
            type="text"
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search entities"
            style={{
              width: '100%',
              padding: searchQuery ? '8px 32px 8px 32px' : '8px 12px 8px 32px',
              borderRadius: 6,
              background: theme.bg.panelAlt,
              border: `1px solid ${theme.border.default}`,
              color: theme.text.primary,
              fontSize: 14,
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: theme.text.muted,
              pointerEvents: 'none',
            }}
            aria-hidden
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              title="Clear search"
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: theme.text.muted,
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                opacity: 0.8,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = theme.text.primary }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.color = theme.text.muted }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <CollapsibleSection
          title="Filters"
          titleTooltip="Narrow the entity list by model presence, shape type, transformers, or approximate size."
          defaultCollapsed
          trailing={
            hasActiveEntityFilters ? (
              <button
                type="button"
                onClick={clearEntityFilters}
                style={{
                  ...secondaryButtonStyle,
                  fontSize: 11,
                  padding: '2px 8px',
                }}
              >
                Clear filters
              </button>
            ) : undefined
          }
        >
          <div style={sidebarRowStyle}>
            <label
              htmlFor="entity-filter-model"
              style={{ ...sidebarLabelStyle, cursor: 'help' }}
              title="Filter by whether the entity has a separate visual GLB in the 3D Model slot (not the trimesh shape model)."
            >
              3D model
            </label>
            <select
              id="entity-filter-model"
              value={filterHasModel}
              onChange={(e) => setFilterHasModel(e.target.value as typeof filterHasModel)}
              style={{ display: 'block', width: '100%' }}
              aria-label="Filter by entity 3D model"
            >
              <option value="any">Any</option>
              <option value="yes">Has model</option>
              <option value="no">No model</option>
            </select>
          </div>
          <div style={sidebarRowStyle}>
            <label
              htmlFor="entity-filter-shape"
              style={{ ...sidebarLabelStyle, cursor: 'help' }}
              title="Restrict the list to one collider primitive type."
            >
              Shape
            </label>
            <select
              id="entity-filter-shape"
              value={filterShape}
              onChange={(e) =>
                setFilterShape(e.target.value as 'any' | AddableShapeType)
              }
              style={{ display: 'block', width: '100%' }}
              aria-label="Filter by shape type"
            >
              {SHAPE_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div style={sidebarRowStyle}>
            <label
              htmlFor="entity-filter-transformers"
              style={{ ...sidebarLabelStyle, cursor: 'help' }}
              title="Filter by whether the entity has any transformer stack entries."
            >
              Transformers
            </label>
            <select
              id="entity-filter-transformers"
              value={filterHasTransformers}
              onChange={(e) => setFilterHasTransformers(e.target.value as typeof filterHasTransformers)}
              style={{ display: 'block', width: '100%' }}
              aria-label="Filter by transformers"
            >
              <option value="any">Any</option>
              <option value="yes">Has transformers</option>
              <option value="no">No transformers</option>
            </select>
          </div>
          <div style={sidebarRowStyle}>
            <label
              htmlFor="entity-filter-size-min"
              style={{ ...sidebarLabelStyle, cursor: 'help' }}
              title="Approximate largest bounding dimension of the entity (shape + scale); entities smaller than this are hidden."
            >
              Size (min)
            </label>
            <input
              id="entity-filter-size-min"
              type="text"
              inputMode="decimal"
              placeholder="—"
              value={filterSizeMin}
              onChange={(e) => setFilterSizeMin(e.target.value)}
              aria-label="Minimum approximate size"
              style={{ display: 'block', width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div style={sidebarRowStyle}>
            <label
              htmlFor="entity-filter-size-max"
              style={{ ...sidebarLabelStyle, cursor: 'help' }}
              title="Approximate largest bounding dimension; entities larger than this are hidden."
            >
              Size (max)
            </label>
            <input
              id="entity-filter-size-max"
              type="text"
              inputMode="decimal"
              placeholder="—"
              value={filterSizeMax}
              onChange={(e) => setFilterSizeMax(e.target.value)}
              aria-label="Maximum approximate size"
              style={{ display: 'block', width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        </CollapsibleSection>
        <EntityExplorerTree
          world={world}
          visibleEntities={filteredEntities}
          selectedEntityIds={selectedEntityIds}
          selectedGroupIds={selectedGroupIds}
          onSelectEntity={(id, options) => onSelectEntity(id, options)}
          onSelectGroup={onSelectGroup}
          onCreateGroupFromSelection={onCreateGroupFromSelection}
          onUngroup={onUngroup}
          onAddSelectedToGroup={onAddSelectedToGroup}
          onRemoveSelectedFromGroup={onRemoveSelectedFromGroup}
          onToggleGroupCollapsed={onToggleGroupCollapsed}
          onRenameGroup={onRenameGroup}
          emptyMessage={entityListEmptyMessage}
        />
      </>
    </CopyableArea>
  )
}
