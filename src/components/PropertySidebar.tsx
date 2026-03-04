import { useState } from 'react'
import PropertyPanel from './PropertyPanel'
import ScriptPanel from './ScriptPanel'
import AssetPanel from './AssetPanel'
import type { RennWorld, Vec3, Rotation } from '@/types/world'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import { uiLogger } from '@/utils/uiLogger'
import Sidebar from './layout/Sidebar'
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
  onRefreshFromPhysics?: (entityId: string) => void
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
  onRefreshFromPhysics,
  isOpen,
  onToggle,
}: PropertySidebarProps) {
  const [rightTab, setRightTab] = useState<RightTab>('properties')
  const [rightSidebarWidth, setRightSidebarWidth] = useLocalStorageState('rightSidebarWidth', 300)

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
    >
      <div
        style={{
          flex: 1,
          overflow: rightTab === 'scripts' ? 'visible' : 'auto',
          minHeight: 200,
        }}
      >
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
            onRefreshFromPhysics={onRefreshFromPhysics}
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
    </Sidebar>
  )
}
