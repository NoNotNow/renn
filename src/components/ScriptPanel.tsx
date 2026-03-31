import type { RennWorld } from '@/types/world'
import CopyableArea from './CopyableArea'
import EntityScriptEditor from './EntityScriptEditor'
import ScriptPanelMultiSelect from './ScriptPanelMultiSelect'

export interface ScriptPanelProps {
  world: RennWorld
  selectedEntityIds: string[]
  onWorldChange: (world: RennWorld) => void
}

export default function ScriptPanel({ world, selectedEntityIds, onWorldChange }: ScriptPanelProps) {
  if (selectedEntityIds.length === 0) {
    return (
      <CopyableArea
        copyPayload={{ scripts: world.scripts, selectedEntityIds: [], entityScriptIds: [] }}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%', minWidth: 280, overflow: 'visible' }}>
          <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8, borderBottom: '1px solid #2f3545' }}>
            <p style={{ margin: 0, fontSize: 13, color: '#9aa4b2' }}>Select an entity to edit its scripts</p>
          </div>
        </div>
      </CopyableArea>
    )
  }

  if (selectedEntityIds.length === 1) {
    const entityId = selectedEntityIds[0]!
    const entity = world.entities.find((e) => e.id === entityId)
    const entityScriptIds = entity?.scripts ?? []
    return (
      <CopyableArea
        copyPayload={{ scripts: world.scripts, selectedEntityIds, entityScriptIds }}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        <EntityScriptEditor world={world} entityId={entityId} onWorldChange={onWorldChange} />
      </CopyableArea>
    )
  }

  return <ScriptPanelMultiSelect world={world} selectedEntityIds={selectedEntityIds} onWorldChange={onWorldChange} />
}
