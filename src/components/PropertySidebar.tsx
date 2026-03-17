import { useState, useEffect } from 'react'
import PropertyPanel from './PropertyPanel'
import ScriptPanel from './ScriptPanel'
import AssetPanel from './AssetPanel'
import type { RennWorld, Vec3, Rotation, Entity } from '@/types/world'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import { uiLogger } from '@/utils/uiLogger'
import Sidebar, { SIDEBAR_MIN_WIDTH } from './layout/Sidebar'
import { TabIcons } from './TabIcons'

type RightTab = 'properties' | 'scripts' | 'assets'

export interface PropertySidebarProps {
  world: RennWorld
  assets: Map<string, Blob>
  selectedEntityId: string | null
  onWorldChange: (world: RennWorld) => void
  onAssetsChange: (assets: Map<string, Blob>) => void
  onDeleteEntity: (entityId: string) => void
  getCurrentPose?: (id: string) => { position: Vec3; rotation: Rotation }
  onEntityPoseChange?: (id: string, pose: { position?: Vec3; rotation?: Rotation }) => void
  onEntityPhysicsChange?: (id: string, patch: Partial<Entity>) => void
  onEntityShapeChange?: (id: string, patch: Partial<Entity>) => void
  onEntityMaterialChange?: (id: string, patch: Partial<Entity>) => void
  onEntityModelTransformChange?: (id: string, patch: { modelRotation?: Vec3; modelScale?: Vec3 }) => void
  onRefreshFromPhysics?: (entityId: string) => void
  livePoses?: Map<string, { position: Vec3; rotation: Rotation }> | null
  isOpen: boolean
  onToggle: () => void
}

export default function PropertySidebar({
  world,
  assets,
  selectedEntityId,
  onWorldChange,
  onAssetsChange,
  onDeleteEntity,
  getCurrentPose,
  onEntityPoseChange,
  onEntityPhysicsChange,
  onEntityShapeChange,
  onEntityMaterialChange,
  onEntityModelTransformChange,
  onRefreshFromPhysics,
  livePoses,
  isOpen,
  onToggle,
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
        { id: 'scripts', icon: TabIcons.scripts, label: 'Scripts' },
        { id: 'assets', icon: TabIcons.assets, label: 'Assets' },
      ]}
      activeTab={rightTab}
      onTabChange={handleTabChange}
      width={rightSidebarWidth}
      onWidthChange={setRightSidebarWidth}
      toggleLogContext="Toggle right drawer"
      overflowVisible={rightTab === 'scripts'}
    >
      <div
        style={{
          flex: 1,
          minHeight: 200,
          minWidth: rightTab === 'scripts' ? SIDEBAR_MIN_WIDTH : undefined,
          overflow: rightTab === 'scripts' ? 'visible' : 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ flex: 1, minHeight: 0, width: '100%', minWidth: rightTab === 'scripts' ? SIDEBAR_MIN_WIDTH : 0, display: 'flex', flexDirection: 'column', overflow: rightTab === 'scripts' ? 'visible' : undefined }}>
        {rightTab === 'properties' && (
          <PropertyPanel
            world={world}
            assets={assets}
            selectedEntityId={selectedEntityId}
            onWorldChange={onWorldChange}
            onAssetsChange={onAssetsChange}
            onDeleteEntity={onDeleteEntity}
            getCurrentPose={getCurrentPose}
            onEntityPoseChange={onEntityPoseChange}
            onEntityPhysicsChange={onEntityPhysicsChange}
            onEntityShapeChange={onEntityShapeChange}
            onEntityMaterialChange={onEntityMaterialChange}
            onEntityModelTransformChange={onEntityModelTransformChange}
            onRefreshFromPhysics={onRefreshFromPhysics}
            livePoses={livePoses}
          />
        )}
        {rightTab === 'scripts' && (
          <ScriptPanel
            world={world}
            selectedEntityId={selectedEntityId}
            onWorldChange={onWorldChange}
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
        </div>
      </div>
    </Sidebar>
  )
}
