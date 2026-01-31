import { useState } from 'react'
import PropertyPanel from './PropertyPanel'
import ScriptPanel from './ScriptPanel'
import AssetPanel from './AssetPanel'
import type { RennWorld } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'

type RightTab = 'properties' | 'scripts' | 'assets'

export interface PropertySidebarProps {
  world: RennWorld
  assets: Map<string, Blob>
  selectedEntityId: string | null
  onWorldChange: (world: RennWorld) => void
  onAssetsChange: (assets: Map<string, Blob>) => void
  onDeleteEntity: (entityId: string) => void
}

export default function PropertySidebar({
  world,
  assets,
  selectedEntityId,
  onWorldChange,
  onAssetsChange,
  onDeleteEntity,
}: PropertySidebarProps) {
  const [rightTab, setRightTab] = useState<RightTab>('properties')

  return (
    <aside style={{ width: 320, borderLeft: '1px solid #ccc', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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
            }}
            onClick={() => {
              uiLogger.click('Builder', 'Switch right panel tab', { tab })
              setRightTab(tab)
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
    </aside>
  )
}
