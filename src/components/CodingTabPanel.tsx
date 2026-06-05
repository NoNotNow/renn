import { useCallback, useEffect, useMemo, type CSSProperties } from 'react'
import type { Entity } from '@/types/world'
import type { TransformerConfig } from '@/types/transformer'
import type { RennWorld } from '@/types/world'
import { theme } from '@/config/theme'
import { EntityPanelIcons } from '@/components/EntityPanelIcons'
import { entityPanelIconButtonStyle } from '@/components/sharedStyles'
import {
  mergeTransformers,
  intersectScriptIdsAcrossEntities,
  intersectTransformerIdsAcrossEntities,
} from '@/utils/entityInspectorMerge'
import {
  clearTransformerLiveTraceSnapshot,
  setTransformerTraceTargetEntityId,
} from '@/runtime/transformerTraceBridge'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import type { WorkspaceTarget } from '@/types/workspace'

type CodingSubgroup = 'scripts' | 'transformers'

const VALID_CODING_SUBGROUPS = new Set<CodingSubgroup>(['scripts', 'transformers'])
const BUILDER_CODING_SUBTAB_KEY = 'builderCodingPanelSubTab'
const DEFAULT_CODING_SUBGROUP: CodingSubgroup = 'transformers'

export interface CodingTabPanelProps {
  world: RennWorld
  selectedEntityIds: string[]
  onWorldChange: (world: RennWorld) => void
  onEntityTransformersChange?: (entityIds: string[], transformers: TransformerConfig[]) => void
  onOpenWorkspaceAnchored?: (anchor: Pick<WorkspaceTarget, 'tab' | 'itemId'>) => void
  /** Snap live pose to each entity’s saved world position and rotation (same as properties tab strip). */
  onResetPoseToSavedWorld?: (entityIds: string[]) => void
  onSelectEntity?: (id: string) => void
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

const inspectorHintStyle: CSSProperties = {
  margin: '0 0 8px',
  fontSize: 12,
  color: theme.text.secondary,
  lineHeight: 1.45,
}

const inspectorSectionTitleStyle: CSSProperties = {
  margin: '0 0 8px',
  fontSize: 13,
  fontWeight: 600,
  color: theme.text.primary,
}

function nameRowButtonStyle(): CSSProperties {
  return {
    width: '100%',
    margin: '0 0 6px',
    padding: '10px 12px',
    borderRadius: 8,
    border: `1px solid ${theme.border.default}`,
    background: theme.bg.surface,
    color: theme.text.primary,
    textAlign: 'left' as const,
    cursor: 'pointer',
    fontSize: 12,
    lineHeight: 1.35,
    boxSizing: 'border-box',
  }
}

function normalizeCodingSubgroupStored(raw: unknown): CodingSubgroup {
  const s = typeof raw === 'string' ? raw : ''
  if (s === 'code') return DEFAULT_CODING_SUBGROUP
  if (VALID_CODING_SUBGROUPS.has(s as CodingSubgroup)) return s as CodingSubgroup
  return DEFAULT_CODING_SUBGROUP
}

/** Right sidebar: transformers + scripts summary; full editing opens the Workspace overlay. */
export default function CodingTabPanel({
  world,
  selectedEntityIds,
  onWorldChange: _onWorldChange,
  onEntityTransformersChange: _onEntityTransformersChange,
  onOpenWorkspaceAnchored,
  onResetPoseToSavedWorld: _onResetPoseToSavedWorld,
  onSelectEntity: _onSelectEntity,
}: CodingTabPanelProps) {
  const [rawSubgroup, setRawSubgroup] = useLocalStorageState<string>(
    BUILDER_CODING_SUBTAB_KEY,
    DEFAULT_CODING_SUBGROUP,
  )

  useEffect(() => {
    const next = normalizeCodingSubgroupStored(rawSubgroup)
    if (next !== rawSubgroup) setRawSubgroup(next)
  }, [rawSubgroup, setRawSubgroup])

  const subgroup = normalizeCodingSubgroupStored(rawSubgroup)

  const entities = useMemo(() => {
    const list: Entity[] = []
    for (const id of selectedEntityIds) {
      const entity = world.entities.find((x) => x.id === id)
      if (entity) list.push(entity)
    }
    return list
  }, [world.entities, selectedEntityIds])

  const openWorkspaceAnchored = useCallback(
    (anchor: Pick<WorkspaceTarget, 'tab' | 'itemId'>) => {
      onOpenWorkspaceAnchored?.(anchor)
    },
    [onOpenWorkspaceAnchored],
  )

  useEffect(() => {
    const traceActive = selectedEntityIds.length === 1 && subgroup === 'transformers'
    if (traceActive) {
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

  const anyLocked = entities.some((e) => e.locked)

  const worldTransformers = world.transformers ?? {}
  const scriptsReg = world.scripts ?? {}

  const uniformPipelineIds = mergeTransformers(entities)
  const transformerRowIds = intersectTransformerIdsAcrossEntities(entities)

  const scriptRowIds = intersectScriptIdsAcrossEntities(entities)

  const anyTransformerAssigned = entities.some((e) => (e.transformers?.length ?? 0) > 0)
  const anyScriptsAssigned = entities.some((e) => (e.scripts?.length ?? 0) > 0)

  const transformerMixedMulti =
    entities.length > 1 && uniformPipelineIds === null && transformerRowIds.length > 0 && anyTransformerAssigned
  const showNoSharedTransformersHint =
    entities.length > 1 && transformerRowIds.length === 0 && anyTransformerAssigned
  const showNoSharedScriptsHint = entities.length > 1 && scriptRowIds.length === 0 && anyScriptsAssigned

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          ...codingTabListStyle,
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div role="tablist" aria-label="Code panel views" style={{ display: 'flex', gap: 2, flexWrap: 'wrap', minWidth: 0 }}>
          <button
            type="button"
            role="tab"
            id="coding-tab-transformers"
            aria-selected={subgroup === 'transformers'}
            {...codingTabHoverHandlers('transformers', subgroup)}
            onClick={() => setRawSubgroup('transformers')}
            style={codingTabStyle(subgroup === 'transformers')}
            data-testid="coding-submenu-transformers"
          >
            Transformers
          </button>
          <button
            type="button"
            role="tab"
            id="coding-tab-scripts"
            aria-selected={subgroup === 'scripts'}
            {...codingTabHoverHandlers('scripts', subgroup)}
            onClick={() => setRawSubgroup('scripts')}
            style={codingTabStyle(subgroup === 'scripts')}
            data-testid="coding-submenu-scripts"
          >
            Scripts
          </button>
        </div>
        <button
          type="button"
          data-testid="coding-open-workspace"
          onClick={() => openWorkspaceAnchored({ tab: subgroup })}
          title="Open behavior workspace (full screen)"
          style={{
            ...entityPanelIconButtonStyle,
            marginLeft: 'auto',
            opacity: 0.85,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.85')}
        >
          {EntityPanelIcons.code}
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
          overflow: 'auto',
          padding: 10,
          boxSizing: 'border-box',
        }}
      >
        {selectedEntityIds.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ ...inspectorHintStyle, margin: 0 }}>Select an entity to view transformers and scripts.</p>
            <button
              type="button"
              data-testid="coding-open-workspace-empty"
              onClick={() => openWorkspaceAnchored({ tab: 'organize' })}
              style={nameRowButtonStyle()}
            >
              <strong>Open Behaviour Workspace</strong>
              <div style={{ color: theme.text.muted, fontSize: 11, marginTop: 2 }}>Manage project-wide behaviors</div>
            </button>
          </div>
        ) : subgroup === 'transformers' ? (
          <>
            <p style={{ ...inspectorHintStyle, margin: '0 0 10px' }}>
              Listed in pipeline order — click an item or use Open Workspace for stack editing.
            </p>
            <h3 style={inspectorSectionTitleStyle}>Transformers{entities.length > 1 ? ` (${entities.length} selected)` : ''}</h3>
            {transformerMixedMulti ? (
              <p style={{ ...inspectorHintStyle, marginTop: 0 }}>
                Stacks differ between selections — only transformers shared across all selected entities appear here.
              </p>
            ) : null}
            {showNoSharedTransformersHint ? (
              <p style={{ ...inspectorHintStyle, marginTop: 0 }}>
                Nothing in common across all selections — open Workspace per entity stack.
              </p>
            ) : null}
            {transformerRowIds.length === 0 ? (
              <p style={{ ...inspectorHintStyle, marginTop: 0, color: theme.text.muted }}>None attached.</p>
            ) : (
              transformerRowIds.map((tid) => {
                const cfg = worldTransformers[tid]
                const slotLabel = cfg?.name ?? cfg?.type ?? tid
                return (
                  <button
                    key={tid}
                    type="button"
                    data-testid={`coding-inspector-transformer-${tid}`}
                    onClick={() => openWorkspaceAnchored({ tab: 'transformers', itemId: tid })}
                    disabled={anyLocked}
                    title={anyLocked ? 'Unlock selection to edit' : 'Open Workspace on this transformer'}
                    style={{
                      ...nameRowButtonStyle(),
                      opacity: anyLocked ? 0.55 : 1,
                      cursor: anyLocked ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <strong>{slotLabel}</strong>
                    <div style={{ color: theme.text.muted, fontSize: 11, marginTop: 2 }}>{tid}</div>
                  </button>
                )
              })
            )}
          </>
        ) : (
          <>
            <p style={{ ...inspectorHintStyle, margin: '0 0 10px' }}>
              Click an attached script to edit in the Workspace, or Manage from the Scripts toolbar there.
            </p>
            <h3 style={inspectorSectionTitleStyle}>Scripts{entities.length > 1 ? ` (${entities.length} selected)` : ''}</h3>
            {showNoSharedScriptsHint ? (
              <p style={{ ...inspectorHintStyle, marginTop: 0 }}>
                No scripts shared across all selections — intersection is listed when multiple entities are selected.
              </p>
            ) : null}
            {scriptRowIds.length === 0 ? (
              <p style={{ ...inspectorHintStyle, marginTop: 0, color: theme.text.muted }}>None attached.</p>
            ) : (
              scriptRowIds.map((sid) => {
                const def = scriptsReg[sid]
                return (
                  <button
                    key={sid}
                    type="button"
                    data-testid={`coding-inspector-script-${sid}`}
                    onClick={() => openWorkspaceAnchored({ tab: 'scripts', itemId: sid })}
                    disabled={anyLocked}
                    title={anyLocked ? 'Unlock selection to edit' : 'Open Workspace on this script'}
                    style={{
                      ...nameRowButtonStyle(),
                      opacity: anyLocked ? 0.55 : 1,
                      cursor: anyLocked ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <strong>{sid}</strong>
                    {def?.event ?
                      <div style={{ color: theme.text.muted, fontSize: 11, marginTop: 2 }}>{def.event}</div>
                    : null}
                  </button>
                )
              })
            )}
          </>
        )}
      </div>
    </div>
  )
}
