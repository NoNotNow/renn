import { useRef, useCallback, useState, useMemo } from 'react'
import {
  type Entity,
  type CameraMode,
  type RennWorld,
  type AvatarFocusSnapshot,
  CAMERA_MODE_CYCLE_ORDER,
  CAMERA_MODE_LABELS,
} from '@/types/world'
import type { AddableShapeType, BulkEntityParams } from '@/data/entityDefaults'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import { uiLogger } from '@/utils/uiLogger'
import { getEntityApproximateSize } from '@/utils/entityApproximateSize'
import Sidebar from './layout/Sidebar'
import { TabIcons } from './TabIcons'
import WorldPanel from './WorldPanel'
import SoundPanel from './SoundPanel'
import CopyableArea from './CopyableArea'
import BulkSpawnForm from './BulkSpawnForm'
import CollapsibleSection from './CollapsibleSection'
import { sidebarRowStyle, sidebarLabelStyle, fieldLabelStyle, secondaryButtonStyle } from './sharedStyles'
import AvatarDialog from './AvatarDialog'
import { avatarEntityIconLetter, getAvatarRosterEntityIds } from '@/utils/avatarUtils'
import { theme } from '@/config/theme'
import EntityExplorerTree from './EntityExplorerTree'

export interface EntitySidebarProps {
  entities: Entity[]
  selectedEntityIds: string[]
  /** Group IDs explicitly selected (in addition to entity selection). */
  selectedGroupIds: string[]
  cameraControl: 'free' | 'follow' | 'top' | 'front' | 'right'
  cameraTarget: string
  cameraMode: CameraMode
  world: RennWorld
  onSelectEntity: (id: string | null, options?: { additive?: boolean }) => void
  onSelectGroup: (groupId: string, options?: { additive?: boolean }) => void
  onCreateGroupFromSelection: () => void
  onUngroup: (groupId: string) => void
  onAddSelectedToGroup: (groupId: string) => void
  onRemoveSelectedFromGroup: () => void
  onToggleGroupCollapsed: (groupId: string, collapsed: boolean) => void
  onRenameGroup: (groupId: string, name: string) => void
  onAddEntity: (shapeType: AddableShapeType) => void
  onBulkAddEntities: (params: BulkEntityParams) => void
  onCameraControlChange: (control: 'free' | 'follow' | 'top' | 'front' | 'right') => void
  onCameraTargetChange: (target: string) => void
  onCameraModeChange: (mode: CameraMode) => void
  onWorldChange: (world: RennWorld) => void
  onSoundPlaybackCommand?: (action: 'play' | 'stop') => void
  /** Builder: read live follow/orbit state for “save as default” in Avatar dialog. */
  getAvatarFocusSnapshot?: () => AvatarFocusSnapshot | null
  isOpen: boolean
  onToggle: () => void
}

type LeftTab = 'entities' | 'camera' | 'actions' | 'world' | 'sound'

type TriState = 'any' | 'yes' | 'no'

const SHAPE_FILTER_OPTIONS: { value: 'any' | AddableShapeType; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'box', label: 'Box' },
  { value: 'sphere', label: 'Sphere' },
  { value: 'cylinder', label: 'Cylinder' },
  { value: 'capsule', label: 'Capsule' },
  { value: 'cone', label: 'Cone' },
  { value: 'pyramid', label: 'Pyramid' },
  { value: 'ring', label: 'Ring' },
  { value: 'plane', label: 'Plane' },
  { value: 'trimesh', label: 'Trimesh' },
]

export default function EntitySidebar({
  entities,
  selectedEntityIds,
  selectedGroupIds,
  cameraControl,
  cameraTarget,
  cameraMode,
  world,
  onSelectEntity,
  onSelectGroup,
  onCreateGroupFromSelection,
  onUngroup,
  onAddSelectedToGroup,
  onRemoveSelectedFromGroup,
  onToggleGroupCollapsed,
  onRenameGroup,
  onAddEntity,
  onBulkAddEntities,
  onCameraControlChange,
  onCameraTargetChange,
  onCameraModeChange,
  onWorldChange,
  onSoundPlaybackCommand,
  getAvatarFocusSnapshot,
  isOpen,
  onToggle,
}: EntitySidebarProps) {
  const [leftTab, setLeftTab] = useState<LeftTab>('camera')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterHasModel, setFilterHasModel] = useState<TriState>('any')
  const [filterShape, setFilterShape] = useState<'any' | AddableShapeType>('any')
  const [filterHasTransformers, setFilterHasTransformers] = useState<TriState>('any')
  const [filterSizeMin, setFilterSizeMin] = useState('')
  const [filterSizeMax, setFilterSizeMax] = useState('')
  const [leftSidebarWidth, setLeftSidebarWidth] = useLocalStorageState('leftSidebarWidth', 240)
  const addEntitySelectRef = useRef<HTMLSelectElement>(null)

  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false)
  const [avatarDialogEntityId, setAvatarDialogEntityId] = useState<string | null>(null)

  const avatarRosterEntityIds = useMemo(() => getAvatarRosterEntityIds(entities), [entities])
  const avatarRosterEntities = useMemo(() => {
    const byId = new Map(entities.map((e) => [e.id, e] as const))
    return avatarRosterEntityIds.map((id) => byId.get(id)!).filter((e) => Boolean(e))
  }, [avatarRosterEntityIds, entities])

  const avatarRosterFocusEntityId = useMemo(() => {
    if (cameraTarget && avatarRosterEntityIds.includes(cameraTarget)) return cameraTarget
    return avatarRosterEntityIds[0] ?? null
  }, [cameraTarget, avatarRosterEntityIds])

  const hasActiveEntityFilters = useMemo(
    () =>
      filterHasModel !== 'any' ||
      filterShape !== 'any' ||
      filterHasTransformers !== 'any' ||
      filterSizeMin.trim() !== '' ||
      filterSizeMax.trim() !== '',
    [filterHasModel, filterShape, filterHasTransformers, filterSizeMin, filterSizeMax]
  )

  const clearEntityFilters = useCallback(() => {
    setFilterHasModel('any')
    setFilterShape('any')
    setFilterHasTransformers('any')
    setFilterSizeMin('')
    setFilterSizeMax('')
  }, [])

  const filteredEntities = useMemo(() => {
    let list = entities
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((e) => {
        const name = (e.name ?? e.id).toLowerCase()
        return name.includes(q)
      })
    }
    if (filterHasModel === 'yes') {
      list = list.filter((e) => Boolean(e.model?.trim()))
    } else if (filterHasModel === 'no') {
      list = list.filter((e) => !e.model?.trim())
    }
    if (filterShape !== 'any') {
      list = list.filter((e) => e.shape?.type === filterShape)
    }
    if (filterHasTransformers === 'yes') {
      list = list.filter((e) => (e.transformers?.length ?? 0) > 0)
    } else if (filterHasTransformers === 'no') {
      list = list.filter((e) => (e.transformers?.length ?? 0) === 0)
    }
    const minParsed = parseFloat(filterSizeMin)
    const maxParsed = parseFloat(filterSizeMax)
    const hasMin = filterSizeMin.trim() !== '' && !Number.isNaN(minParsed)
    const hasMax = filterSizeMax.trim() !== '' && !Number.isNaN(maxParsed)
    if (hasMin || hasMax) {
      list = list.filter((e) => {
        const sz = getEntityApproximateSize(e)
        if (hasMin && sz < minParsed) return false
        if (hasMax && sz > maxParsed) return false
        return true
      })
    }
    return list
  }, [
    entities,
    searchQuery,
    filterHasModel,
    filterShape,
    filterHasTransformers,
    filterSizeMin,
    filterSizeMax,
  ])

  const entityListEmptyMessage = useMemo(() => {
    if (entities.length === 0) return 'No entities'
    if (filteredEntities.length > 0) return ''
    const q = searchQuery.trim()
    const hasSearch = Boolean(q)
    if (hasSearch && hasActiveEntityFilters) {
      return `No entities match "${q}" or the current filters`
    }
    if (hasSearch) return `No entities match "${q}"`
    if (hasActiveEntityFilters) return 'No entities match the current filters'
    return 'No entities'
  }, [entities.length, filteredEntities.length, searchQuery, hasActiveEntityFilters])
  
  const handleAddEntity = useCallback(
    (shapeType: AddableShapeType) => {
      onAddEntity(shapeType)
      if (addEntitySelectRef.current) {
        addEntitySelectRef.current.value = ''
      }
    },
    [onAddEntity]
  )

  const handleTabChange = (tab: string) => {
    uiLogger.click('Builder', 'Switch left panel tab', { tab })
    setLeftTab(tab as LeftTab)
  }

  return (
    <>
    <Sidebar
      side="left"
      isOpen={isOpen}
      onToggle={onToggle}
      tabConfig={[
        { id: 'entities', icon: TabIcons.entities, label: 'Entities' },
        { id: 'camera', icon: TabIcons.camera, label: 'Camera' },
        { id: 'actions', icon: TabIcons.actions, label: 'Actions' },
        { id: 'world', icon: TabIcons.world, label: 'World' },
        { id: 'sound', icon: TabIcons.sound, label: 'Sound' },
      ]}
      activeTab={leftTab}
      onTabChange={handleTabChange}
      width={leftSidebarWidth}
      onWidthChange={setLeftSidebarWidth}
      toggleLogContext="Toggle left drawer"
    >
      <div style={{ padding: 10 }}>
        {leftTab === 'entities' && (
              <CopyableArea
                copyPayload={entities.map((e) => ({
                  id: e.id,
                  name: e.name,
                  shape: e.shape?.type,
                  bodyType: e.bodyType,
                  position: e.position,
                  scripts: e.scripts,
                }))}
              >
                <>
                <label
                  style={{ ...fieldLabelStyle, cursor: 'help' }}
                  title="Pick a primitive to insert a new entity at the default spawn point."
                >
                  Add
                  <select
                    ref={addEntitySelectRef}
                    value=""
                    onChange={(e) => {
                      const v = e.target.value as AddableShapeType
                      if (v) handleAddEntity(v)
                    }}
                    style={{ display: 'block', width: '100%', marginTop: 4 }}
                    title="Add entity"
                  >
                    <option value="">—</option>
                    <option value="box">Box</option>
                    <option value="sphere">Sphere</option>
                    <option value="cylinder">Cylinder</option>
                    <option value="capsule">Capsule</option>
                    <option value="cone">Cone</option>
                    <option value="pyramid">Pyramid</option>
                    <option value="ring">Ring</option>
                    <option value="plane">Plane</option>
                  </select>
                </label>
                <div style={{ marginTop: 8, marginBottom: 8, position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Search by name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search entities"
                    style={{
                      width: '100%',
                      padding: searchQuery ? '8px 32px 8px 32px' : '8px 12px 8px 32px',
                      borderRadius: 6,
                      background: theme.bg.panelAlt,
                      border: `1px solid ${theme.border.default}`,
                      color: theme.text.primary,
                      fontSize: 14,
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      left: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: theme.text.muted,
                      pointerEvents: 'none',
                    }}
                    aria-hidden
                  >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
                  </span>
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                      title="Clear search"
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        color: theme.text.muted,
                        cursor: 'pointer',
                        padding: 4,
                        display: 'flex',
                        alignItems: 'center',
                        opacity: 0.8,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = theme.text.primary }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.color = theme.text.muted }}
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                <CollapsibleSection
                  title="Filters"
                  titleTooltip="Narrow the entity list by model presence, shape type, transformers, or approximate size."
                  defaultCollapsed
                  trailing={
                    hasActiveEntityFilters ? (
                      <button
                        type="button"
                        onClick={clearEntityFilters}
                        style={{
                          ...secondaryButtonStyle,
                          fontSize: 11,
                          padding: '2px 8px',
                        }}
                      >
                        Clear filters
                      </button>
                    ) : undefined
                  }
                >
                  <div style={sidebarRowStyle}>
                    <label
                      htmlFor="entity-filter-model"
                      style={{ ...sidebarLabelStyle, cursor: 'help' }}
                      title="Filter by whether the entity has a separate visual GLB in the 3D Model slot (not the trimesh shape model)."
                    >
                      3D model
                    </label>
                    <select
                      id="entity-filter-model"
                      value={filterHasModel}
                      onChange={(e) => setFilterHasModel(e.target.value as TriState)}
                      style={{ display: 'block', width: '100%' }}
                      aria-label="Filter by entity 3D model"
                    >
                      <option value="any">Any</option>
                      <option value="yes">Has model</option>
                      <option value="no">No model</option>
                    </select>
                  </div>
                  <div style={sidebarRowStyle}>
                    <label
                      htmlFor="entity-filter-shape"
                      style={{ ...sidebarLabelStyle, cursor: 'help' }}
                      title="Restrict the list to one collider primitive type."
                    >
                      Shape
                    </label>
                    <select
                      id="entity-filter-shape"
                      value={filterShape}
                      onChange={(e) =>
                        setFilterShape(e.target.value as 'any' | AddableShapeType)
                      }
                      style={{ display: 'block', width: '100%' }}
                      aria-label="Filter by shape type"
                    >
                      {SHAPE_FILTER_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={sidebarRowStyle}>
                    <label
                      htmlFor="entity-filter-transformers"
                      style={{ ...sidebarLabelStyle, cursor: 'help' }}
                      title="Filter by whether the entity has any transformer stack entries."
                    >
                      Transformers
                    </label>
                    <select
                      id="entity-filter-transformers"
                      value={filterHasTransformers}
                      onChange={(e) => setFilterHasTransformers(e.target.value as TriState)}
                      style={{ display: 'block', width: '100%' }}
                      aria-label="Filter by transformers"
                    >
                      <option value="any">Any</option>
                      <option value="yes">Has transformers</option>
                      <option value="no">No transformers</option>
                    </select>
                  </div>
                  <div style={sidebarRowStyle}>
                    <label
                      htmlFor="entity-filter-size-min"
                      style={{ ...sidebarLabelStyle, cursor: 'help' }}
                      title="Approximate largest bounding dimension of the entity (shape + scale); entities smaller than this are hidden."
                    >
                      Size (min)
                    </label>
                    <input
                      id="entity-filter-size-min"
                      type="text"
                      inputMode="decimal"
                      placeholder="—"
                      value={filterSizeMin}
                      onChange={(e) => setFilterSizeMin(e.target.value)}
                      aria-label="Minimum approximate size"
                      style={{ display: 'block', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={sidebarRowStyle}>
                    <label
                      htmlFor="entity-filter-size-max"
                      style={{ ...sidebarLabelStyle, cursor: 'help' }}
                      title="Approximate largest bounding dimension; entities larger than this are hidden."
                    >
                      Size (max)
                    </label>
                    <input
                      id="entity-filter-size-max"
                      type="text"
                      inputMode="decimal"
                      placeholder="—"
                      value={filterSizeMax}
                      onChange={(e) => setFilterSizeMax(e.target.value)}
                      aria-label="Maximum approximate size"
                      style={{ display: 'block', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                </CollapsibleSection>
                <EntityExplorerTree
                  world={world}
                  visibleEntities={filteredEntities}
                  selectedEntityIds={selectedEntityIds}
                  selectedGroupIds={selectedGroupIds}
                  onSelectEntity={(id, options) => onSelectEntity(id, options)}
                  onSelectGroup={onSelectGroup}
                  onCreateGroupFromSelection={onCreateGroupFromSelection}
                  onUngroup={onUngroup}
                  onAddSelectedToGroup={onAddSelectedToGroup}
                  onRemoveSelectedFromGroup={onRemoveSelectedFromGroup}
                  onToggleGroupCollapsed={onToggleGroupCollapsed}
                  onRenameGroup={onRenameGroup}
                  emptyMessage={entityListEmptyMessage}
                />
                </>
              </CopyableArea>
            )}
            {leftTab === 'camera' && (
              <CopyableArea
                copyPayload={{ control: cameraControl, target: cameraTarget, mode: cameraMode }}
              >
                <>
                <div style={sidebarRowStyle}>
                  <label
                    htmlFor="camera-control"
                    style={{ ...sidebarLabelStyle, cursor: 'help' }}
                    title="Free fly with WASD; Follow orbits a target entity; Top/Front/Right are axis-aligned views."
                  >
                    Control
                  </label>
                  <select
                    id="camera-control"
                    value={cameraControl}
                    onChange={(e) => {
                      const value = e.target.value as 'free' | 'follow' | 'top' | 'front' | 'right'
                      uiLogger.change('Builder', 'Change camera control', { control: value })
                      onCameraControlChange(value)
                    }}
                    style={{ display: 'block', width: '100%' }}
                  >
                    <option value="free">Free (WASD)</option>
                    <option value="follow">Follow</option>
                    <option value="top">Top</option>
                    <option value="front">Front</option>
                    <option value="right">Right</option>
                  </select>
                </div>
                {cameraControl === 'follow' && (
                  <>
                    {avatarRosterEntities.length > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <div
                          style={{ fontSize: 12, color: theme.text.muted, minWidth: 54, cursor: 'help' }}
                          title="Entities marked playable (avatar). Click a letter to focus the follow camera; Edit opens avatar settings."
                        >
                          Avatars
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {avatarRosterEntities.map((e) => {
                            const active = e.id === avatarRosterFocusEntityId
                            return (
                              <button
                                key={e.id}
                                type="button"
                                onClick={() => onCameraTargetChange(e.id)}
                                title={`Camera target: ${e.name ?? e.id}`}
                                aria-label={`Select avatar ${e.name ?? e.id}`}
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 14,
                                  background: active ? theme.bg.primarySubtle : theme.bg.inactiveTile,
                                  border: `1px solid ${active ? theme.border.dropZoneActive : theme.border.default}`,
                                  color: theme.text.primary,
                                  fontSize: 12,
                                  cursor: 'pointer',
                                }}
                              >
                                {avatarEntityIconLetter(e)}
                              </button>
                            )
                          })}
                        </div>
                        <button
                          type="button"
                          aria-label="Edit avatar settings"
                          onClick={() => {
                            if (!avatarRosterFocusEntityId) return
                            setAvatarDialogEntityId(avatarRosterFocusEntityId)
                            setAvatarDialogOpen(true)
                          }}
                          disabled={!avatarRosterFocusEntityId}
                          style={{
                            marginLeft: 'auto',
                            padding: '6px 10px',
                            fontSize: 12,
                            background: theme.bg.dropZoneActive,
                            border: `1px solid ${theme.button.infoBorder}`,
                            color: theme.text.accentBlue,
                            borderRadius: 6,
                            cursor: avatarRosterFocusEntityId ? 'pointer' : 'not-allowed',
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    ) : null}
                    <div style={sidebarRowStyle}>
                      <label
                        htmlFor="camera-target"
                        style={{ ...sidebarLabelStyle, cursor: 'help' }}
                        title="Entity the follow camera looks at (usually a playable avatar)."
                      >
                        Target
                      </label>
                      <select
                        id="camera-target"
                        value={cameraTarget}
                        onChange={(e) => {
                          uiLogger.change('Builder', 'Change camera target', { target: e.target.value })
                          onCameraTargetChange(e.target.value)
                        }}
                        style={{ display: 'block', width: '100%' }}
                      >
                        <option value="">— None —</option>
                        {entities.map((e) => (
                          <option key={e.id} value={e.id}>{e.name ?? e.id}</option>
                        ))}
                      </select>
                    </div>
                    <div style={sidebarRowStyle}>
                      <label
                        htmlFor="camera-mode"
                        style={{ ...sidebarLabelStyle, cursor: 'help' }}
                        title="Follow camera behavior: orbit, first-person, chase, etc. (same modes as world default unless overridden per avatar)."
                      >
                        Mode
                      </label>
                      <select
                        id="camera-mode"
                        value={cameraMode}
                        onChange={(e) => {
                          uiLogger.change('Builder', 'Change camera mode', { mode: e.target.value })
                          onCameraModeChange(e.target.value as CameraMode)
                        }}
                        style={{ display: 'block', width: '100%' }}
                      >
                        {CAMERA_MODE_CYCLE_ORDER.map((mode) => (
                          <option key={mode} value={mode}>
                            {CAMERA_MODE_LABELS[mode]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                </>
              </CopyableArea>
            )}
            {leftTab === 'actions' && <BulkSpawnForm onBulkAddEntities={onBulkAddEntities} />}
            {leftTab === 'world' && (
              <WorldPanel world={world} onWorldChange={onWorldChange} />
            )}
            {leftTab === 'sound' && (
              <SoundPanel
                world={world}
                onWorldChange={onWorldChange}
                onPlaybackCommand={onSoundPlaybackCommand}
              />
            )}
      </div>
    </Sidebar>
    {avatarDialogOpen && avatarDialogEntityId ? (
      <AvatarDialog
        isOpen={avatarDialogOpen}
        onClose={() => {
          setAvatarDialogOpen(false)
          setAvatarDialogEntityId(null)
        }}
        world={world}
        entityId={avatarDialogEntityId}
        onWorldChange={onWorldChange}
        cameraTarget={cameraTarget}
        onCameraTargetChange={onCameraTargetChange}
        onEditingEntityIdChange={(id) => setAvatarDialogEntityId(id)}
        onRequestAvatarFocusSnapshot={getAvatarFocusSnapshot}
        cameraControl={cameraControl}
      />
    ) : null}
    </>
  )
}
