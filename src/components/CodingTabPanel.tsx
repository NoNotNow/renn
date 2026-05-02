import { useMemo, useState } from 'react'
import type { Entity } from '@/types/world'
import type { TransformerConfig } from '@/types/transformer'
import type { RennWorld } from '@/types/world'
import ScriptPanel from '@/components/ScriptPanel'
import TransformerEditor from '@/components/TransformerEditor'
import CopyableArea from '@/components/CopyableArea'
import { theme } from '@/config/theme'
import { mergeTransformers } from '@/utils/entityInspectorMerge'

type CodingSubgroup = 'scripts' | 'transformers'

export interface CodingTabPanelProps {
  world: RennWorld
  selectedEntityIds: string[]
  onWorldChange: (world: RennWorld) => void
  onEntityTransformersChange?: (entityIds: string[], transformers: TransformerConfig[]) => void
}

const segmentWrap = {
  display: 'flex' as const,
  gap: 4,
  flexWrap: 'wrap' as const,
  alignItems: 'center' as const,
  padding: '8px',
  borderBottom: `1px solid ${theme.border.default}`,
}

function subgroupButton(active: boolean) {
  return {
    flex: '1',
    minWidth: 104,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: active ? (600 as const) : (500 as const),
    borderRadius: 6,
    border: active ? `1px solid ${theme.button.selectableBorder}` : `1px solid ${theme.border.default}`,
    background: active ? theme.button.selectable : theme.bg.surface,
    color: active ? theme.text.primary : theme.text.secondary,
    cursor: 'pointer' as const,
  }
}

/** Right sidebar workspace: Scripts + Transformers editors for the selection. */
export default function CodingTabPanel({
  world,
  selectedEntityIds,
  onWorldChange,
  onEntityTransformersChange,
}: CodingTabPanelProps) {
  const [subgroup, setSubgroup] = useState<CodingSubgroup>('scripts')

  const entities = useMemo(() => {
    const list: Entity[] = []
    for (const id of selectedEntityIds) {
      const e = world.entities.find((x) => x.id === id)
      if (e) list.push(e)
    }
    return list
  }, [world.entities, selectedEntityIds])

  const ids = useMemo(() => entities.map((e) => e.id), [entities])
  const idSet = useMemo(() => new Set(ids), [ids])

  const anyLocked = entities.some((e) => e.locked)
  const mergedTransformers = mergeTransformers(entities)

  const updateAllTransformers = (transformers: TransformerConfig[]) => {
    const nextEntities = world.entities.map((e) => (idSet.has(e.id) ? { ...e, transformers } : e))
    onWorldChange({ ...world, entities: nextEntities })
  }

  const handleTransformersCommit = (transformers: TransformerConfig[]) => {
    if (onEntityTransformersChange) {
      onEntityTransformersChange(ids, transformers)
    } else {
      updateAllTransformers(transformers)
    }
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={segmentWrap}>
        <button
          type="button"
          onClick={() => setSubgroup('scripts')}
          aria-pressed={subgroup === 'scripts'}
          style={subgroupButton(subgroup === 'scripts')}
          data-testid="coding-submenu-scripts"
        >
          Scripts
        </button>
        <button
          type="button"
          onClick={() => setSubgroup('transformers')}
          aria-pressed={subgroup === 'transformers'}
          style={subgroupButton(subgroup === 'transformers')}
          data-testid="coding-submenu-transformers"
        >
          Transformers
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'visible' }}>
        {subgroup === 'scripts' && (
          <ScriptPanel
            world={world}
            selectedEntityIds={selectedEntityIds}
            onWorldChange={onWorldChange}
            collapsibleScriptToolbar
          />
        )}

        {subgroup === 'transformers' && (
          <>
            {selectedEntityIds.length === 0 ? (
              <CopyableArea
                copyPayload={{ transformers: mergedTransformers, selectedEntityIds: [] }}
                style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
              >
                <div style={{ padding: 8 }}>
                  <p style={{ margin: 0, fontSize: 13, color: theme.text.muted }}>
                    Select an entity to edit its transformers.
                  </p>
                </div>
              </CopyableArea>
            ) : (
              <CopyableArea
                copyPayload={{
                  transformers: mergedTransformers,
                  selectedEntityIds,
                  entityIdsForEdit: ids,
                }}
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  padding: 8,
                  overflow: 'visible',
                }}
              >
                <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: theme.text.primary }}>
                  Transformers
                  {entities.length > 1 ? ` (${entities.length} entities)` : ''}
                </h3>
                <TransformerEditor
                  transformers={mergedTransformers === null ? [] : mergedTransformers}
                  transformersMixed={mergedTransformers === null}
                  onChange={(next) => handleTransformersCommit(next)}
                  disabled={anyLocked}
                />
              </CopyableArea>
            )}
          </>
        )}
      </div>
    </div>
  )
}
