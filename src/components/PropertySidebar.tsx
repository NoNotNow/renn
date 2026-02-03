import { useState } from 'react'
import PropertyPanel from './PropertyPanel'
import ScriptPanel from './ScriptPanel'
import AssetPanel from './AssetPanel'
import type { RennWorld, Vec3, Quat } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import Sidebar from './layout/Sidebar'

type RightTab = 'properties' | 'scripts' | 'assets'

export interface PropertySidebarProps {
  world: RennWorld
  assets: Map<string, Blob>
  selectedEntityId: string | null
  onWorldChange: (world: RennWorld) => void
  onAssetsChange: (assets: Map<string, Blob>) => void
  onDeleteEntity: (entityId: string) => void
  getCurrentPose?: (id: string) => { position: Vec3; rotation: Quat }
  onEntityPoseChange?: (id: string, pose: { position?: Vec3; rotation?: Quat }) => void
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
  isOpen,
  onToggle,
}: PropertySidebarProps) {
  const [rightTab, setRightTab] = useState<RightTab>('properties')

  const handleTabChange = (tab: string) => {
    uiLogger.click('Builder', 'Switch right panel tab', { tab })
    setRightTab(tab as RightTab)
  }

  return (
    <Sidebar
      side="right"
      isOpen={isOpen}
      onToggle={onToggle}
      tabs={['properties', 'scripts', 'assets'] as const}
      activeTab={rightTab}
      onTabChange={handleTabChange}
      width={300}
      toggleLogContext="Toggle right drawer"
    >
      <div style={{ flex: 1, overflow: 'auto', minHeight: 200 }}>
        {rightTab === 'properties' && (
          <PropertyPanel
            world={world}
            selectedEntityId={selectedEntityId}
            onWorldChange={onWorldChange}
            onDeleteEntity={onDeleteEntity}
            getCurrentPose={getCurrentPose}
            onEntityPoseChange={onEntityPoseChange}
          />
        )}
        {rightTab === 'scripts' && (
          <ScriptPanel world={world} onWorldChange={onWorldChange} />
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
