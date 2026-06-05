import type { Entity } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import EntitySearchPicker from '@/components/entitySearch/EntitySearchPicker'
import { EntityPanelIcons } from '../EntityPanelIcons'
import {
  entityPanelIconButtonStyle,
  removeButtonStyle,
  removeButtonStyleDisabled,
} from '../sharedStyles'

export interface PropertyPanelHeaderProps {
  allEntities: Entity[]
  entityWorkHistory: readonly string[]
  selectedEntityId: string | null
  onSelectEntity?: (id: string) => void
  /** Label shown until hover/click when an entity is selected (workspace shell parity). */
  selectedLabel: string | null
  hasSelection: boolean
  entities: Entity[]
  ids: string[]
  primaryEntity?: Entity
  isMulti: boolean
  anyLocked: boolean
  onRefreshFromPhysics?: (entityIds: string[]) => void
  onCloneEntity?: (entityId: string) => void
  onDeleteEntities?: (entityIds: string[]) => void
}

export default function PropertyPanelHeader({
  allEntities,
  entityWorkHistory,
  selectedEntityId,
  onSelectEntity,
  selectedLabel,
  hasSelection,
  entities,
  ids,
  primaryEntity,
  isMulti,
  anyLocked,
  onRefreshFromPhysics,
  onCloneEntity,
  onDeleteEntities,
}: PropertyPanelHeaderProps) {
  const showActions = hasSelection && !!(onRefreshFromPhysics || onCloneEntity || onDeleteEntities)

  return (
    <div
      style={{
        margin: '0 0 2px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        minWidth: 0,
      }}
    >
      <div
        style={{
          flex: '1 1 auto',
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {hasSelection && anyLocked ?
          <span style={{ fontSize: 12, flexShrink: 0 }} aria-hidden>
            🔒
          </span>
        : null}
        <EntitySearchPicker
          entities={allEntities}
          entityWorkHistory={entityWorkHistory}
          selectedEntityId={selectedEntityId}
          onSelectEntity={(id) => onSelectEntity?.(id)}
          variant="panel"
          selectedLabel={hasSelection ? selectedLabel : null}
          hoverReveal={hasSelection}
          placeholder="Search entities…"
          autoFocus={!hasSelection}
          testId="property-panel-entity-search"
        />
      </div>
      {showActions && primaryEntity ?
        <div
          role="group"
          aria-label="Actions"
          style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
        >
          {onRefreshFromPhysics && (
            <button
              type="button"
              onClick={() => {
                uiLogger.click('PropertyPanel', 'Refresh from physics', { entityIds: ids })
                onRefreshFromPhysics(ids)
              }}
              title="Refresh position and rotation from physics"
              aria-label="Refresh position and rotation from physics"
              style={entityPanelIconButtonStyle}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.8')}
            >
              {EntityPanelIcons.refresh}
            </button>
          )}
          {onCloneEntity && (
            <button
              type="button"
              onClick={() => {
                if (isMulti) return
                uiLogger.click('PropertyPanel', 'Clone entity', { entityId: primaryEntity.id })
                onCloneEntity(primaryEntity.id)
              }}
              disabled={isMulti}
              title={isMulti ? 'Clone one entity at a time' : 'Clone entity'}
              aria-label="Clone entity"
              style={{
                ...entityPanelIconButtonStyle,
                opacity: isMulti ? 0.4 : 0.8,
                cursor: isMulti ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!isMulti) e.currentTarget.style.opacity = '1'
              }}
              onMouseLeave={(e) => {
                if (!isMulti) e.currentTarget.style.opacity = '0.8'
              }}
            >
              {EntityPanelIcons.clone}
            </button>
          )}
          {onDeleteEntities && (
            <button
              type="button"
              onClick={() => {
                if (anyLocked) return
                uiLogger.delete('PropertyPanel', 'Delete entities', { entityIds: ids })
                onDeleteEntities(ids)
              }}
              disabled={anyLocked}
              title={
                anyLocked
                  ? 'Cannot delete locked entities'
                  : isMulti
                    ? 'Delete selected entities'
                    : 'Delete entity'
              }
              aria-label="Delete entity"
              style={{
                ...entityPanelIconButtonStyle,
                ...removeButtonStyle,
                padding: 0,
                ...(anyLocked && removeButtonStyleDisabled),
              }}
              onMouseEnter={(e) => {
                if (!anyLocked) e.currentTarget.style.opacity = '1'
              }}
              onMouseLeave={(e) => {
                if (!anyLocked) e.currentTarget.style.opacity = '0.8'
              }}
            >
              {EntityPanelIcons.trash}
            </button>
          )}
        </div>
      : null}
    </div>
  )
}
