import { useState, useEffect } from 'react'
import PropertyPanel from './PropertyPanel'
import CodingTabPanel from './CodingTabPanel'
import AssetPanel from './AssetPanel'
import ModelPresetPanel from './ModelPresetPanel'
import type { RennWorld, Vec3, Rotation, Entity, ModelPreset } from '@/types/world'
import type { TransformerConfig } from '@/types/transformer'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import { uiLogger } from '@/utils/uiLogger'
import Sidebar, { SIDEBAR_MIN_WIDTH } from './layout/Sidebar'
import { TabIcons } from './TabIcons'

type RightTab = 'properties' | 'code' | 'assets' | 'presets'

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
  livePoses?: Map<string, { position: Vec3; rotation: Rotation; scale?: Vec3 }> | null
  isOpen: boolean
  onToggle: () => void
  /** Single-entity material panel: open layered texture compositor. */
  onOpenTextureStudio?: (entityId: string) => void | Promise<void>
  /** After preset apply when scene is not rebuilt — sync materials / double-sided to the live registry. */
  onAfterModelPresetApply?: (previews: { id: string; merged: Entity }[], preset: ModelPreset) => void | Promise<void>
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
  livePoses,
  isOpen,
  onToggle,
  onOpenTextureStudio,
  onAfterModelPresetApply,
}: PropertySidebarProps) {
  const [rightTab, setRightTab] = useState<RightTab>('properties')
  const [rightSidebarWidth, setRightSidebarWidth] = useLocalStorageState('rightSidebarWidth', 300)

  useEffect(() => {
    if (rightSidebarWidth < SIDEBAR_MIN_WIDTH) {
      setRightSidebarWidth(SIDEBAR_MIN_WIDTH)
    }
  }, [rightSidebarWidth, setRightSidebarWidth])

  const handleTabChange = (tab: string) => {
    uiLogger.click('Builder', 'Switch right panel tab', { tab })
    setRightTab(tab as RightTab)
  }

  return (
    <Sidebar
      side="right"
      isOpen={isOpen}
      onToggle={onToggle}
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
        <div style={{ flex: 1, minHeight: 0, width: '100%', minWidth: rightTab === 'code' ? SIDEBAR_MIN_WIDTH : 0, display: 'flex', flexDirection: 'column', overflow: rightTab === 'code' ? 'visible' : undefined }}>
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
