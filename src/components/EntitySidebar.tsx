import { useRef, useCallback, useState, useMemo } from 'react'
import {
  type Entity,
  type CameraMode,
  type RennWorld,
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

export interface EntitySidebarProps {
  entities: Entity[]
  selectedEntityIds: string[]
  cameraControl: 'free' | 'follow' | 'top' | 'front' | 'right'
  cameraTarget: string
  cameraMode: CameraMode
  world: RennWorld
  onSelectEntity: (id: string | null, options?: { additive?: boolean }) => void
  onAddEntity: (shapeType: AddableShapeType) => void
  onBulkAddEntities: (params: BulkEntityParams) => void
  onCameraControlChange: (control: 'free' | 'follow' | 'top' | 'front' | 'right') => void
  onCameraTargetChange: (target: string) => void
  onCameraModeChange: (mode: CameraMode) => void
  onWorldChange: (world: RennWorld) => void
  onSoundPlaybackCommand?: (action: 'play' | 'stop') => void
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
  cameraControl,
  cameraTarget,
  cameraMode,
  world,
  onSelectEntity,
  onAddEntity,
  onBulkAddEntities,
  onCameraControlChange,
  onCameraTargetChange,
  onCameraModeChange,
  onWorldChange,
  onSoundPlaybackCommand,
  isOpen,
  onToggle,
}: EntitySidebarProps) {
  const selectedSet = useMemo(() => new Set(selectedEntityIds), [selectedEntityIds])
  const [leftTab, setLeftTab] = useState<LeftTab>('camera')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterHasModel, setFilterHasModel] = useState<TriState>('any')
  const [filterShape, setFilterShape] = useState<'any' | AddableShapeType>('any')
  const [filterHasTransformers, setFilterHasTransformers] = useState<TriState>('any')
  const [filterSizeMin, setFilterSizeMin] = useState('')
  const [filterSizeMax, setFilterSizeMax] = useState('')
  const [leftSidebarWidth, setLeftSidebarWidth] = useLocalStorageState('leftSidebarWidth', 240)
  const addEntitySelectRef = useRef<HTMLSelectElement>(null)

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
                <label style={fieldLabelStyle}>
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
                      background: '#1a1a1a',
                      border: '1px solid #2f3545',
                      color: '#e6e9f2',
                      fontSize: 14,
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      left: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#9aa4b2',
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
                        color: '#9aa4b2',
                        cursor: 'pointer',
                        padding: 4,
                        display: 'flex',
                        alignItems: 'center',
                        opacity: 0.8,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#e6e9f2' }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.color = '#9aa4b2' }}
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                <CollapsibleSection
                  title="Filters"
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
                    <label htmlFor="entity-filter-model" style={sidebarLabelStyle}>
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
                    <label htmlFor="entity-filter-shape" style={sidebarLabelStyle}>
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
                    <label htmlFor="entity-filter-transformers" style={sidebarLabelStyle}>
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
                    <label htmlFor="entity-filter-size-min" style={sidebarLabelStyle}>
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
                    <label htmlFor="entity-filter-size-max" style={sidebarLabelStyle}>
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
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 0 0' }}>
                  {filteredEntities.length === 0 ? (
                    <li style={{ color: '#9aa4b2', fontSize: 13, padding: '8px 0' }}>
                      {entityListEmptyMessage}
                    </li>
                  ) : (
                    filteredEntities.map((e) => (
                    <li key={e.id}>
                      <CopyableArea copyPayload={e} style={{ display: 'block' }}>
                      <button
                        type="button"
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '4px 8px',
                          background: selectedSet.has(e.id) ? '#2b3550' : 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                        onClick={(ev) => {
                          uiLogger.click('Builder', 'Select entity', { entityId: e.id, entityName: e.name })
                          onSelectEntity(e.id, { additive: ev.shiftKey || ev.metaKey || ev.ctrlKey })
                        }}
                        onMouseEnter={(ev) => {
                          if (!selectedSet.has(e.id)) {
                            ev.currentTarget.style.background = '#20263a'
                          }
                        }}
                        onMouseLeave={(ev) => {
                          if (!selectedSet.has(e.id)) {
                            ev.currentTarget.style.background = 'transparent'
                          }
                        }}
                      >
                        {e.locked && <span style={{ fontSize: 11, opacity: 0.7 }}>🔒</span>}
                        <span>{e.name ?? e.id}</span>
                      </button>
                      </CopyableArea>
                    </li>
                    ))
                  )}
                </ul>
                </>
              </CopyableArea>
            )}
            {leftTab === 'camera' && (
              <CopyableArea
                copyPayload={{ control: cameraControl, target: cameraTarget, mode: cameraMode }}
              >
                <>
                <div style={sidebarRowStyle}>
                  <label htmlFor="camera-control" style={sidebarLabelStyle}>
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
                    <div style={sidebarRowStyle}>
                      <label htmlFor="camera-target" style={sidebarLabelStyle}>
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
                      <label htmlFor="camera-mode" style={sidebarLabelStyle}>
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
  )
}
