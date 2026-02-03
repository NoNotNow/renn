import { useState } from 'react'
import PropertyPanel from './PropertyPanel'
import ScriptPanel from './ScriptPanel'
import AssetPanel from './AssetPanel'
import type { RennWorld, Vec3, Quat } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { SidebarToggleButton } from '@/components/SidebarToggleButton'
import SidebarTabs from './SidebarTabs'

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

  return (
    <div style={{ 
      position: 'absolute', 
      right: 0, 
      top: 0, 
      bottom: 0, 
      display: 'flex', 
      height: '100%',
      zIndex: 100,
      pointerEvents: isOpen ? 'auto' : 'none',
    }}>
      {/* Toggle button - always visible */}
      <SidebarToggleButton
        isOpen={isOpen}
        onToggle={onToggle}
        side="right"
        logContext="Toggle right drawer"
      />

      <aside
        style={{
          width: isOpen ? 300 : 0,
          borderLeft: '1px solid #2f3545',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
          transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          backgroundColor: 'rgba(27, 31, 42, 0.92)',
          boxShadow: isOpen ? '-2px 0 12px rgba(0,0,0,0.45)' : 'none',
          color: '#e6e9f2',
        }}
      >
      {isOpen && (
        <>
          <SidebarTabs
            tabs={['properties', 'scripts', 'assets'] as const}
            activeTab={rightTab}
            onTabChange={(tab) => {
              uiLogger.click('Builder', 'Switch right panel tab', { tab })
              setRightTab(tab)
            }}
          />
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
        </>
      )}
      </aside>
    </div>
  )
}
