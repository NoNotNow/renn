import { useEffect, useMemo, useSyncExternalStore, type CSSProperties } from 'react'
import type { Entity } from '@/types/world'
import type { TransformerConfig } from '@/types/transformer'
import type { RennWorld } from '@/types/world'
import ScriptPanel from '@/components/ScriptPanel'
import TransformerEditor from '@/components/TransformerEditor'
import CopyableArea from '@/components/CopyableArea'
import CustomTransformerCodeTab from '@/components/CustomTransformerCodeTab'
import { theme } from '@/config/theme'
import { mergeTransformers } from '@/utils/entityInspectorMerge'
import {
  clearTransformerLiveTraceSnapshot,
  getTransformerLiveTraceSnapshot,
  setTransformerTraceTargetEntityId,
  subscribeTransformerLiveTrace,
} from '@/runtime/transformerTraceBridge'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'

type CodingSubgroup = 'scripts' | 'transformers' | 'code'

const VALID_CODING_SUBGROUPS = new Set<CodingSubgroup>(['scripts', 'transformers', 'code'])
const BUILDER_CODING_SUBTAB_KEY = 'builderCodingPanelSubTab'
const DEFAULT_CODING_SUBGROUP: CodingSubgroup = 'transformers'

export interface CodingTabPanelProps {
  world: RennWorld
  selectedEntityIds: string[]
  onWorldChange: (world: RennWorld) => void
  onEntityTransformersChange?: (entityIds: string[], transformers: TransformerConfig[]) => void
}

/** Matches the icon tab strip in `SidebarTabs` so the Code drawer feels one piece with the right sidebar. */
const CODING_TAB_STRIP_BG = 'rgba(17, 20, 28, 0.72)'

const codingTabListStyle = {
  display: 'flex' as const,
  alignItems: 'stretch' as const,
  flexShrink: 0 as const,
  gap: 2,
  padding: '4px 6px 0',
  background: CODING_TAB_STRIP_BG,
  borderBottom: `1px solid ${theme.border.default}`,
}

function codingTabStyle(active: boolean): CSSProperties {
  return {
    flex: '0 0 auto',
    margin: 0,
    padding: '7px 10px 6px',
    fontSize: 12,
    fontWeight: active ? 600 : 500,
    letterSpacing: '0.02em',
    border: 'none',
    borderBottom: `2px solid ${active ? theme.accent : 'transparent'}`,
    marginBottom: -1,
    borderRadius: '5px 5px 0 0',
    background: active ? 'rgba(43, 53, 80, 0.28)' : 'transparent',
    color: active ? theme.text.primary : theme.text.secondary,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    transition: 'color 0.12s ease, border-color 0.12s ease, background 0.12s ease',
  }
}

const ACTIVE_TAB_BG = 'rgba(43, 53, 80, 0.28)'
const ACTIVE_TAB_BG_HOVER = 'rgba(43, 53, 80, 0.4)'

function codingTabHoverHandlers(tab: CodingSubgroup, subgroup: CodingSubgroup) {
  const active = subgroup === tab
  return {
    onMouseEnter: (e: { currentTarget: HTMLButtonElement }) => {
      e.currentTarget.style.background = active ? ACTIVE_TAB_BG_HOVER : theme.bg.listHover
    },
    onMouseLeave: (e: { currentTarget: HTMLButtonElement }) => {
      e.currentTarget.style.background = active ? ACTIVE_TAB_BG : 'transparent'
    },
  }
}

/** Right sidebar workspace: Transformers stack + Transformer code + Scripts for the selection. */
export default function CodingTabPanel({
  world,
  selectedEntityIds,
  onWorldChange,
  onEntityTransformersChange,
}: CodingTabPanelProps) {
  const [subgroupStored, setSubgroupStored] = useLocalStorageState<CodingSubgroup>(
    BUILDER_CODING_SUBTAB_KEY,
    DEFAULT_CODING_SUBGROUP,
  )

  useEffect(() => {
    if (!VALID_CODING_SUBGROUPS.has(subgroupStored)) {
      setSubgroupStored(DEFAULT_CODING_SUBGROUP)
    }
  }, [subgroupStored, setSubgroupStored])

  const subgroup: CodingSubgroup = VALID_CODING_SUBGROUPS.has(subgroupStored)
    ? subgroupStored
    : DEFAULT_CODING_SUBGROUP

  useEffect(() => {
    if (subgroup === 'transformers' && selectedEntityIds.length === 1) {
      setTransformerTraceTargetEntityId(selectedEntityIds[0]!)
    } else {
      setTransformerTraceTargetEntityId(null)
      clearTransformerLiveTraceSnapshot()
    }
    return () => {
      setTransformerTraceTargetEntityId(null)
      clearTransformerLiveTraceSnapshot()
    }
  }, [subgroup, selectedEntityIds])

  const liveTraceSnapshot = useSyncExternalStore(
    subscribeTransformerLiveTrace,
    getTransformerLiveTraceSnapshot,
    () => null,
  )

  const liveTraceSteps =
    subgroup === 'transformers' &&
    selectedEntityIds.length === 1 &&
    liveTraceSnapshot?.entityId === selectedEntityIds[0]
      ? liveTraceSnapshot.steps
      : null

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
      <div role="tablist" aria-label="Code panel views" style={codingTabListStyle}>
        <button
          type="button"
          role="tab"
          id="coding-tab-transformers"
          aria-selected={subgroup === 'transformers'}
          {...codingTabHoverHandlers('transformers', subgroup)}
          onClick={() => setSubgroupStored('transformers')}
          style={codingTabStyle(subgroup === 'transformers')}
          data-testid="coding-submenu-transformers"
        >
          Transformers
        </button>
        <button
          type="button"
          role="tab"
          id="coding-tab-code"
          aria-selected={subgroup === 'code'}
          {...codingTabHoverHandlers('code', subgroup)}
          onClick={() => setSubgroupStored('code')}
          style={codingTabStyle(subgroup === 'code')}
          data-testid="coding-submenu-code"
        >
          Transformer code
        </button>
        <button
          type="button"
          role="tab"
          id="coding-tab-scripts"
          aria-selected={subgroup === 'scripts'}
          {...codingTabHoverHandlers('scripts', subgroup)}
          onClick={() => setSubgroupStored('scripts')}
          style={codingTabStyle(subgroup === 'scripts')}
          data-testid="coding-submenu-scripts"
        >
          Scripts
        </button>
      </div>

      <div
        key={subgroup}
        role="tabpanel"
        aria-labelledby={`coding-tab-${subgroup}`}
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: subgroup === 'code' ? 'visible' : 'auto',
        }}
      >
        {subgroup === 'scripts' && (
          <ScriptPanel
            world={world}
            selectedEntityIds={selectedEntityIds}
            onWorldChange={onWorldChange}
            collapsibleScriptToolbar
          />
        )}

        {subgroup === 'code' && (
          <CustomTransformerCodeTab
            selectedEntityIds={selectedEntityIds}
            entityCount={entities.length}
            mergedTransformers={mergedTransformers}
            transformersMixed={mergedTransformers === null}
            anyLocked={anyLocked}
            onTransformersCommit={(next) => handleTransformersCommit(next)}
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
                  overflow: 'hidden',
                }}
              >
                <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: theme.text.primary }}>
                  Transformers
                  {entities.length > 1 ? ` (${entities.length} entities)` : ''}
                </h3>
                <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                  <TransformerEditor
                    transformers={mergedTransformers === null ? [] : mergedTransformers}
                    transformersMixed={mergedTransformers === null}
                    onChange={(next) => handleTransformersCommit(next)}
                    disabled={anyLocked}
                    liveTraceSteps={liveTraceSteps}
                  />
                </div>
              </CopyableArea>
            )}
          </>
        )}
      </div>
    </div>
  )
}
