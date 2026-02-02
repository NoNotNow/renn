import { useState } from 'react'
import PropertyPanel from './PropertyPanel'
import ScriptPanel from './ScriptPanel'
import AssetPanel from './AssetPanel'
import type { RennWorld, Vec3, Quat } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'

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
      <button
        type="button"
        onClick={() => {
          uiLogger.click('Builder', 'Toggle right drawer', { isOpen })
          onToggle()
        }}
        aria-label={isOpen ? 'Collapse right sidebar' : 'Expand right sidebar'}
        style={{
          position: 'absolute',
          left: isOpen ? -16 : -16,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 20,
          height: 60,
          background: '#fff',
          border: '1px solid #ccc',
          borderRight: isOpen ? '1px solid #ccc' : 'none',
          borderRadius: isOpen ? '4px 0 0 4px' : '0 4px 4px 0',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          zIndex: 1001,
          transition: 'all 0.2s ease',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          color: '#333',
          pointerEvents: 'auto',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#f5f5f5'
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#fff'
          e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'
        }}
      >
        {isOpen ? '▶' : '◀'}
      </button>

      <aside
        style={{
          width: isOpen ? 320 : 0,
          borderLeft: '1px solid #ccc',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
          transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          backgroundColor: '#fff',
          boxShadow: isOpen ? '-2px 0 8px rgba(0,0,0,0.1)' : 'none',
        }}
      >
      {isOpen && (
        <>
          <div style={{ display: 'flex', borderBottom: '1px solid #ccc' }}>
            {(['properties', 'scripts', 'assets'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                style={{
                  padding: '8px 12px',
                  background: rightTab === tab ? '#e0e0ff' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'background 0.2s ease',
                }}
                onClick={() => {
                  uiLogger.click('Builder', 'Switch right panel tab', { tab })
                  setRightTab(tab)
                }}
                onMouseEnter={(e) => {
                  if (rightTab !== tab) {
                    e.currentTarget.style.background = '#f0f0f0'
                  }
                }}
                onMouseLeave={(e) => {
                  if (rightTab !== tab) {
                    e.currentTarget.style.background = 'transparent'
                  }
                }}
              >
                {tab}
              </button>
            ))}
          </div>
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
