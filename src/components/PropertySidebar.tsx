import { useEffect } from 'react'
import { EntityPanelIcons } from './EntityPanelIcons'
import PropertyPanel from './PropertyPanel'
import CodingTabPanel from './CodingTabPanel'
import AssetPanel from './AssetPanel'
import ModelPresetPanel from './ModelPresetPanel'
import type { RennWorld, Vec3, Rotation, Entity, ModelPreset } from '@/types/world'
import type { TransformerConfig } from '@/types/transformer'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import { uiLogger } from '@/utils/uiLogger'
import { entityPanelIconButtonStyle } from './sharedStyles'
import Sidebar, { SIDEBAR_MIN_WIDTH } from './layout/Sidebar'
import { TabIcons } from './TabIcons'

type RightTab = 'properties' | 'code' | 'assets' | 'presets'

const VALID_RIGHT_TABS = new Set<RightTab>(['properties', 'code', 'assets', 'presets'])

export interface PropertySidebarProps {
  world: RennWorld
  assets: Map<string, Blob>
  selectedEntityIds: string[]
  onWorldChange: (world: RennWorld) => void
  onAssetsChange: (assets: Map<string, Blob>) => void
  onDeleteEntities: (entityIds: string[]) => void
  onCloneEntity?: (entityId: string) => void
  onEntityPoseChange?: (ids: string[], pose: { position?: Vec3; rotation?: Rotation; scale?: Vec3 }) => void
  onEntityPhysicsChange?: (ids: string[], patch: Partial<Entity>) => void
  onEntityShapeChange?: (ids: string[], patch: Partial<Entity>) => void
  onEntityMaterialChange?: (ids: string[], patch: Partial<Entity>) => void
  onEntityModelTransformChange?: (
    ids: string[],
    patch: { modelRotation?: Vec3; modelScale?: Vec3; doubleSided?: boolean },
  ) => void
  onEntityTransformersChange?: (entityIds: string[], transformers: TransformerConfig[]) => void
  onRefreshFromPhysics?: (entityIds: string[]) => void
  /** Snap live pose to each entity’s saved world position and rotation (builder scene sync). */
  onResetPoseToSavedWorld?: (entityIds: string[]) => void
  livePoses?: Map<string, { position: Vec3; rotation: Rotation; scale?: Vec3 }> | null
  isOpen: boolean
  onToggle: () => void
  /** When true, the inspector sits in the flex layout beside the canvas (not layered over it). */
  dockLayout?: boolean
  onDockLayoutChange?: (docked: boolean) => void
  /** Single-entity material panel: open layered texture compositor. */
  onOpenTextureStudio?: (entityId: string) => void | Promise<void>
  /** After preset apply when scene is not rebuilt — sync materials / double-sided to the live registry. */
  onAfterModelPresetApply?: (previews: { id: string; merged: Entity }[], preset: ModelPreset) => void | Promise<void>
  /** Invoke when opening transformer code pop-out (e.g. collapse side drawers like fullscreen enter). */
  onTransformerCodePopoutOpen?: () => void
}

export default function PropertySidebar({
  world,
  assets,
  selectedEntityIds,
  onWorldChange,
  onAssetsChange,
  onDeleteEntities,
  onCloneEntity,
  onEntityPoseChange,
  onEntityPhysicsChange,
  onEntityShapeChange,
  onEntityMaterialChange,
  onEntityModelTransformChange,
  onEntityTransformersChange,
  onRefreshFromPhysics,
  onResetPoseToSavedWorld,
  livePoses,
  isOpen,
  onToggle,
  dockLayout = false,
  onDockLayoutChange,
  onOpenTextureStudio,
  onAfterModelPresetApply,
  onTransformerCodePopoutOpen,
}: PropertySidebarProps) {
  const [rightTabStored, setRightTabStored] = useLocalStorageState<RightTab>(
    'builderRightSidebarTab',
    'properties',
  )

  useEffect(() => {
    if (!VALID_RIGHT_TABS.has(rightTabStored)) {
      setRightTabStored('properties')
    }
  }, [rightTabStored, setRightTabStored])

  const rightTab: RightTab = VALID_RIGHT_TABS.has(rightTabStored) ? rightTabStored : 'properties'

  const [rightSidebarWidth, setRightSidebarWidth] = useLocalStorageState('rightSidebarWidth', 300)

  useEffect(() => {
    if (rightSidebarWidth < SIDEBAR_MIN_WIDTH) {
      setRightSidebarWidth(SIDEBAR_MIN_WIDTH)
    }
  }, [rightSidebarWidth, setRightSidebarWidth])

  const handleTabChange = (tab: string) => {
    if (!VALID_RIGHT_TABS.has(tab as RightTab)) return
    uiLogger.click('Builder', 'Switch right panel tab', { tab })
    setRightTabStored(tab as RightTab)
  }

  const selectedResolvedEntities = selectedEntityIds
    .map((id) => world.entities.find((e) => e.id === id))
    .filter((e): e is Entity => e != null)
  const canResetPoseToSaved =
    selectedResolvedEntities.length > 0 && selectedResolvedEntities.some((e) => !e.locked)

  const resetPoseTitle = canResetPoseToSaved
    ? 'Restore saved position and rotation (from world)'
    : selectedResolvedEntities.length > 0 && selectedResolvedEntities.every((e) => e.locked)
      ? 'Cannot reset locked entities'
      : 'Select an entity to restore saved position and rotation'

  const dockTitle = dockLayout ? 'Float panel over canvas' : 'Dock panel beside canvas'

  const tabsTrailing =
    onDockLayoutChange != null ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {onResetPoseToSavedWorld ? (
          <button
            type="button"
            title={resetPoseTitle}
            aria-label="Restore saved position and rotation"
            disabled={!canResetPoseToSaved}
            onClick={() => onResetPoseToSavedWorld(selectedEntityIds)}
            style={{
              ...entityPanelIconButtonStyle,
              cursor: canResetPoseToSaved ? 'pointer' : 'not-allowed',
              opacity: canResetPoseToSaved ? 0.85 : 0.45,
            }}
            onMouseEnter={(e) => {
              if (canResetPoseToSaved) e.currentTarget.style.opacity = '1'
            }}
            onMouseLeave={(e) => {
              if (canResetPoseToSaved) e.currentTarget.style.opacity = '0.85'
            }}
          >
            {EntityPanelIcons.reset}
          </button>
        ) : null}
        <button
          type="button"
          title={dockTitle}
          aria-label={dockTitle}
          onClick={() => {
            const next = !dockLayout
            uiLogger.click('Builder', 'Toggle right panel layout', { docked: next })
            onDockLayoutChange(next)
          }}
          style={{
            ...entityPanelIconButtonStyle,
            opacity: 0.85,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.85'
          }}
        >
          {dockLayout ? TabIcons.panelLayoutFloating : TabIcons.panelLayoutDocked}
        </button>
      </div>
    ) : onResetPoseToSavedWorld ? (
      <button
        type="button"
        title={resetPoseTitle}
        aria-label="Restore saved position and rotation"
        disabled={!canResetPoseToSaved}
        onClick={() => onResetPoseToSavedWorld(selectedEntityIds)}
        style={{
          ...entityPanelIconButtonStyle,
          cursor: canResetPoseToSaved ? 'pointer' : 'not-allowed',
          opacity: canResetPoseToSaved ? 0.85 : 0.45,
        }}
        onMouseEnter={(e) => {
          if (canResetPoseToSaved) e.currentTarget.style.opacity = '1'
        }}
        onMouseLeave={(e) => {
          if (canResetPoseToSaved) e.currentTarget.style.opacity = '0.85'
        }}
      >
        {EntityPanelIcons.reset}
      </button>
    ) : undefined

  return (
    <Sidebar
      side="right"
      isOpen={isOpen}
      onToggle={onToggle}
      layout={dockLayout ? 'inline' : 'overlay'}
      tabConfig={[
        { id: 'properties', icon: TabIcons.properties, label: 'Properties' },
        { id: 'code', icon: TabIcons.scripts, label: 'Code' },
        { id: 'assets', icon: TabIcons.assets, label: 'Assets' },
        { id: 'presets', icon: TabIcons.presets, label: 'Presets' },
      ]}
      activeTab={rightTab}
      onTabChange={handleTabChange}
      width={rightSidebarWidth}
      onWidthChange={setRightSidebarWidth}
      toggleLogContext="Toggle right drawer"
      overflowVisible={rightTab === 'code'}
      tabsTrailing={tabsTrailing}
    >
      <div
        style={{
          flex: 1,
          minHeight: 200,
          minWidth: rightTab === 'code' ? SIDEBAR_MIN_WIDTH : undefined,
          overflow: rightTab === 'code' ? 'visible' : 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            width: '100%',
            minWidth: rightTab === 'code' ? SIDEBAR_MIN_WIDTH : 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: rightTab === 'code' ? 'visible' : undefined,
          }}
        >
          {rightTab === 'properties' && (
            <PropertyPanel
              world={world}
              assets={assets}
              selectedEntityIds={selectedEntityIds}
              onWorldChange={onWorldChange}
              onAssetsChange={onAssetsChange}
              onDeleteEntities={onDeleteEntities}
              onCloneEntity={onCloneEntity}
              onEntityPoseChange={onEntityPoseChange}
              onEntityPhysicsChange={onEntityPhysicsChange}
              onEntityShapeChange={onEntityShapeChange}
              onEntityMaterialChange={onEntityMaterialChange}
              onEntityModelTransformChange={onEntityModelTransformChange}
              onEntityTransformersChange={onEntityTransformersChange}
              onRefreshFromPhysics={onRefreshFromPhysics}
              livePoses={livePoses}
              onOpenTextureStudio={onOpenTextureStudio}
            />
          )}
          {rightTab === 'code' && (
            <CodingTabPanel
              world={world}
              selectedEntityIds={selectedEntityIds}
              onWorldChange={onWorldChange}
              onEntityTransformersChange={onEntityTransformersChange}
              onTransformerCodePopoutOpen={onTransformerCodePopoutOpen}
              onResetPoseToSavedWorld={onResetPoseToSavedWorld}
            />
          )}
          {rightTab === 'assets' && (
            <AssetPanel
              assets={assets}
              world={world}
              onAssetsChange={onAssetsChange}
              onWorldChange={onWorldChange}
            />
          )}
          {rightTab === 'presets' && (
            <ModelPresetPanel
              selectedEntityIds={selectedEntityIds}
              onAfterPresetApply={onAfterModelPresetApply}
            />
          )}
        </div>
      </div>
    </Sidebar>
  )
}
