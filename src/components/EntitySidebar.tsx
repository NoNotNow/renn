import { useRef, useCallback, useState, useMemo } from 'react'
import {
  type Entity,
  type CameraMode,
  type Color,
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
import CopyableArea from './CopyableArea'
import CollapsibleSection from './CollapsibleSection'
import { sidebarRowStyle, sidebarLabelStyle, fieldLabelStyle, sectionStyle, sectionTitleStyle, secondaryButtonStyle } from './sharedStyles'

export interface EntitySidebarProps {
  entities: Entity[]
  selectedEntityId: string | null
  cameraControl: 'free' | 'follow' | 'top' | 'front' | 'right'
  cameraTarget: string
  cameraMode: CameraMode
  world: RennWorld
  onSelectEntity: (id: string) => void
  onAddEntity: (shapeType: AddableShapeType) => void
  onBulkAddEntities: (params: BulkEntityParams) => void
  onCameraControlChange: (control: 'free' | 'follow' | 'top' | 'front' | 'right') => void
  onCameraTargetChange: (target: string) => void
  onCameraModeChange: (mode: CameraMode) => void
  onWorldChange: (world: RennWorld) => void
  isOpen: boolean
  onToggle: () => void
}

type LeftTab = 'entities' | 'camera' | 'actions' | 'world'

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
  selectedEntityId,
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
  
  // Bulk creation form state - defaults optimized for maximum collisions
  const [bulkCount, setBulkCount] = useState(50)
  const [bulkShape, setBulkShape] = useState<AddableShapeType | 'random'>('random')
  const [bulkBodyType, setBulkBodyType] = useState<'static' | 'dynamic' | 'kinematic' | 'random'>('dynamic')
  const [sizeMode, setSizeMode] = useState<'fixed' | 'random'>('random')
  const [sizeFixed, setSizeFixed] = useState(1.0)
  const [sizeMin, setSizeMin] = useState(0.5)
  const [sizeMax, setSizeMax] = useState(2.0)
  const [positionMode, setPositionMode] = useState<'fixed' | 'random'>('random')
  const [positionX, setPositionX] = useState(0)
  const [positionY, setPositionY] = useState(0)
  const [positionZ, setPositionZ] = useState(0)
  const [spawnRadius, setSpawnRadius] = useState(10)
  const [spawnYMin, setSpawnYMin] = useState(5)
  const [spawnYMax, setSpawnYMax] = useState(25)
  const [colorMode, setColorMode] = useState<'fixed' | 'random'>('random')
  const [colorR, setColorR] = useState(0.86)
  const [colorG, setColorG] = useState(0.2)
  const [colorB, setColorB] = useState(0.2)
  const [rotationMode, setRotationMode] = useState<'default' | 'random'>('random')
  const [massMode, setMassMode] = useState<'fixed' | 'random' | 'none'>('random')
  const [massFixed, setMassFixed] = useState(1.0)
  const [massMin, setMassMin] = useState(0.5)
  const [massMax, setMassMax] = useState(5.0)
  const [frictionMode, setFrictionMode] = useState<'fixed' | 'random' | 'none'>('random')
  const [frictionFixed, setFrictionFixed] = useState(0.5)
  const [frictionMin, setFrictionMin] = useState(0.2)
  const [frictionMax, setFrictionMax] = useState(0.8)
  const [restitutionMode, setRestitutionMode] = useState<'fixed' | 'random' | 'none'>('random')
  const [restitutionFixed, setRestitutionFixed] = useState(0.3)
  const [restitutionMin, setRestitutionMin] = useState(0.1)
  const [restitutionMax, setRestitutionMax] = useState(0.9)

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

  const handleBulkCreate = useCallback(() => {
    const params: BulkEntityParams = {
      count: bulkCount,
      shape: bulkShape,
      bodyType: bulkBodyType,
      size: sizeMode === 'fixed' 
        ? { mode: 'fixed', value: sizeFixed }
        : { mode: 'random', min: sizeMin, max: sizeMax },
      position: positionMode === 'fixed'
        ? { mode: 'fixed', x: positionX, y: positionY, z: positionZ }
        : { mode: 'random', radius: spawnRadius, yMin: spawnYMin, yMax: spawnYMax },
      color: colorMode === 'fixed'
        ? { mode: 'fixed', value: [colorR, colorG, colorB] as Color }
        : { mode: 'random' },
      rotation: rotationMode === 'default'
        ? { mode: 'default' }
        : { mode: 'random' },
      physics: {
        ...(massMode !== 'none' && {
          mass: massMode === 'fixed'
            ? { mode: 'fixed', value: massFixed }
            : { mode: 'random', min: massMin, max: massMax },
        }),
        ...(frictionMode !== 'none' && {
          friction: frictionMode === 'fixed'
            ? { mode: 'fixed', value: frictionFixed }
            : { mode: 'random', min: frictionMin, max: frictionMax },
        }),
        ...(restitutionMode !== 'none' && {
          restitution: restitutionMode === 'fixed'
            ? { mode: 'fixed', value: restitutionFixed }
            : { mode: 'random', min: restitutionMin, max: restitutionMax },
        }),
      },
    }
    
    uiLogger.select('Builder', 'Bulk add entities', { count: bulkCount })
    onBulkAddEntities(params)
  }, [
    bulkCount, bulkShape, bulkBodyType,
    sizeMode, sizeFixed, sizeMin, sizeMax,
    positionMode, positionX, positionY, positionZ, spawnRadius, spawnYMin, spawnYMax,
    colorMode, colorR, colorG, colorB,
    rotationMode,
    massMode, massFixed, massMin, massMax,
    frictionMode, frictionFixed, frictionMin, frictionMax,
    restitutionMode, restitutionFixed, restitutionMin, restitutionMax,
    onBulkAddEntities,
  ])

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
                          background: selectedEntityId === e.id ? '#2b3550' : 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                        onClick={() => {
                          uiLogger.click('Builder', 'Select entity', { entityId: e.id, entityName: e.name })
                          onSelectEntity(e.id)
                        }}
                        onMouseEnter={(e) => {
                          if (selectedEntityId !== e.currentTarget.textContent) {
                            e.currentTarget.style.background = '#20263a'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedEntityId !== e.currentTarget.textContent) {
                            e.currentTarget.style.background = 'transparent'
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
            {leftTab === 'actions' && (
              <CopyableArea
                copyPayload={{
                  bulkCreate: {
                    count: bulkCount,
                    shape: bulkShape,
                    bodyType: bulkBodyType,
                    size: sizeMode === 'fixed' ? { mode: 'fixed' as const, value: sizeFixed } : { mode: 'random' as const, min: sizeMin, max: sizeMax },
                    position: positionMode === 'fixed' ? { mode: 'fixed' as const, x: positionX, y: positionY, z: positionZ } : { mode: 'random' as const, radius: spawnRadius, yMin: spawnYMin, yMax: spawnYMax },
                    color: colorMode === 'fixed' ? { mode: 'fixed' as const, value: [colorR, colorG, colorB] as Color } : { mode: 'random' as const },
                    rotation: rotationMode === 'default' ? { mode: 'default' as const } : { mode: 'random' as const },
                    physics: {
                      ...(massMode !== 'none' && { mass: massMode === 'fixed' ? { mode: 'fixed' as const, value: massFixed } : { mode: 'random' as const, min: massMin, max: massMax } }),
                      ...(frictionMode !== 'none' && { friction: frictionMode === 'fixed' ? { mode: 'fixed' as const, value: frictionFixed } : { mode: 'random' as const, min: frictionMin, max: frictionMax } }),
                      ...(restitutionMode !== 'none' && { restitution: restitutionMode === 'fixed' ? { mode: 'fixed' as const, value: restitutionFixed } : { mode: 'random' as const, min: restitutionMin, max: restitutionMax } }),
                    },
                  },
                }}
              >
              <div style={{ padding: '0 10px 10px 10px', overflowY: 'auto', maxHeight: 'calc(100vh - 100px)' }}>
                <h3 style={{ margin: '10px 0', fontSize: 14, color: '#e6e9f2' }}>Bulk Create Entities</h3>
                
                {/* Count */}
                <div style={sidebarRowStyle}>
                  <label htmlFor="bulk-count" style={sidebarLabelStyle}>Count</label>
                  <input
                    id="bulk-count"
                    type="number"
                    min="1"
                    max="1000"
                    value={bulkCount}
                    onChange={(e) => setBulkCount(Math.max(1, Math.min(1000, parseInt(e.target.value) || 1)))}
                    style={{ display: 'block', width: '100%' }}
                  />
                </div>

                {/* Shape */}
                <div style={sidebarRowStyle}>
                  <label htmlFor="bulk-shape" style={sidebarLabelStyle}>Shape</label>
                  <select
                    id="bulk-shape"
                    value={bulkShape}
                    onChange={(e) => setBulkShape(e.target.value as AddableShapeType | 'random')}
                    style={{ display: 'block', width: '100%' }}
                  >
                    <option value="box">Box</option>
                    <option value="sphere">Sphere</option>
                    <option value="cylinder">Cylinder</option>
                    <option value="capsule">Capsule</option>
                    <option value="cone">Cone</option>
                    <option value="pyramid">Pyramid</option>
                    <option value="ring">Ring</option>
                    <option value="plane">Plane</option>
                    <option value="random">Random</option>
                  </select>
                </div>

                {/* Body Type */}
                <div style={sidebarRowStyle}>
                  <label htmlFor="bulk-body-type" style={sidebarLabelStyle}>Body Type</label>
                  <select
                    id="bulk-body-type"
                    value={bulkBodyType}
                    onChange={(e) => setBulkBodyType(e.target.value as 'static' | 'dynamic' | 'kinematic' | 'random')}
                    style={{ display: 'block', width: '100%' }}
                  >
                    <option value="static">Static</option>
                    <option value="dynamic">Dynamic</option>
                    <option value="kinematic">Kinematic</option>
                    <option value="random">Random</option>
                  </select>
                </div>

                {/* Transform Section */}
                <div style={{ ...sectionStyle, marginTop: 12 }}>
                  <h4 style={sectionTitleStyle}>Transform</h4>
                  
                  {/* Size */}
                  <div style={sidebarRowStyle}>
                    <label htmlFor="size-mode" style={sidebarLabelStyle}>Size</label>
                    <select
                      id="size-mode"
                      value={sizeMode}
                      onChange={(e) => setSizeMode(e.target.value as 'fixed' | 'random')}
                      style={{ display: 'block', width: '100%', marginBottom: 4 }}
                    >
                      <option value="fixed">Fixed</option>
                      <option value="random">Random Range</option>
                    </select>
                  </div>
                  {sizeMode === 'fixed' ? (
                    <div style={sidebarRowStyle}>
                      <label htmlFor="size-fixed" style={sidebarLabelStyle}>Value</label>
                      <input
                        id="size-fixed"
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={sizeFixed}
                        onChange={(e) => setSizeFixed(parseFloat(e.target.value) || 1.0)}
                        style={{ display: 'block', width: '100%' }}
                      />
                    </div>
                  ) : (
                    <>
                      <div style={sidebarRowStyle}>
                        <label htmlFor="size-min" style={sidebarLabelStyle}>Min</label>
                        <input
                          id="size-min"
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={sizeMin}
                          onChange={(e) => setSizeMin(parseFloat(e.target.value) || 0.5)}
                          style={{ display: 'block', width: '100%' }}
                        />
                      </div>
                      <div style={sidebarRowStyle}>
                        <label htmlFor="size-max" style={sidebarLabelStyle}>Max</label>
                        <input
                          id="size-max"
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={sizeMax}
                          onChange={(e) => setSizeMax(parseFloat(e.target.value) || 2.0)}
                          style={{ display: 'block', width: '100%' }}
                        />
                      </div>
                    </>
                  )}

                  {/* Position */}
                  <div style={{ ...sidebarRowStyle, marginTop: 8 }}>
                    <label htmlFor="position-mode" style={sidebarLabelStyle}>Position</label>
                    <select
                      id="position-mode"
                      value={positionMode}
                      onChange={(e) => setPositionMode(e.target.value as 'fixed' | 'random')}
                      style={{ display: 'block', width: '100%', marginBottom: 4 }}
                    >
                      <option value="fixed">Fixed Point</option>
                      <option value="random">Random (Radius)</option>
                    </select>
                  </div>
                  {positionMode === 'fixed' ? (
                    <>
                      <div style={sidebarRowStyle}>
                        <label htmlFor="pos-x" style={sidebarLabelStyle}>X</label>
                        <input
                          id="pos-x"
                          type="number"
                          step="0.1"
                          value={positionX}
                          onChange={(e) => setPositionX(parseFloat(e.target.value) || 0)}
                          style={{ display: 'block', width: '100%' }}
                        />
                      </div>
                      <div style={sidebarRowStyle}>
                        <label htmlFor="pos-y" style={sidebarLabelStyle}>Y</label>
                        <input
                          id="pos-y"
                          type="number"
                          step="0.1"
                          value={positionY}
                          onChange={(e) => setPositionY(parseFloat(e.target.value) || 0)}
                          style={{ display: 'block', width: '100%' }}
                        />
                      </div>
                      <div style={sidebarRowStyle}>
                        <label htmlFor="pos-z" style={sidebarLabelStyle}>Z</label>
                        <input
                          id="pos-z"
                          type="number"
                          step="0.1"
                          value={positionZ}
                          onChange={(e) => setPositionZ(parseFloat(e.target.value) || 0)}
                          style={{ display: 'block', width: '100%' }}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={sidebarRowStyle}>
                        <label htmlFor="spawn-radius" style={sidebarLabelStyle}>Radius</label>
                        <input
                          id="spawn-radius"
                          type="number"
                          min="0"
                          step="0.1"
                          value={spawnRadius}
                          onChange={(e) => setSpawnRadius(Math.max(0, parseFloat(e.target.value) || 10))}
                          style={{ display: 'block', width: '100%' }}
                        />
                      </div>
                      <div style={sidebarRowStyle}>
                        <label htmlFor="spawn-y-min" style={sidebarLabelStyle}>Y Min</label>
                        <input
                          id="spawn-y-min"
                          type="number"
                          step="0.1"
                          value={spawnYMin}
                          onChange={(e) => setSpawnYMin(parseFloat(e.target.value) || 5)}
                          style={{ display: 'block', width: '100%' }}
                        />
                      </div>
                      <div style={sidebarRowStyle}>
                        <label htmlFor="spawn-y-max" style={sidebarLabelStyle}>Y Max</label>
                        <input
                          id="spawn-y-max"
                          type="number"
                          step="0.1"
                          value={spawnYMax}
                          onChange={(e) => setSpawnYMax(parseFloat(e.target.value) || 25)}
                          style={{ display: 'block', width: '100%' }}
                        />
                      </div>
                    </>
                  )}

                  {/* Rotation */}
                  <div style={{ ...sidebarRowStyle, marginTop: 8 }}>
                    <label htmlFor="rotation-mode" style={sidebarLabelStyle}>Rotation</label>
                    <select
                      id="rotation-mode"
                      value={rotationMode}
                      onChange={(e) => setRotationMode(e.target.value as 'default' | 'random')}
                      style={{ display: 'block', width: '100%' }}
                    >
                      <option value="default">Default</option>
                      <option value="random">Random</option>
                    </select>
                  </div>
                </div>

                {/* Appearance Section */}
                <div style={{ ...sectionStyle, marginTop: 12 }}>
                  <h4 style={sectionTitleStyle}>Appearance</h4>
                  
                  {/* Color */}
                  <div style={sidebarRowStyle}>
                    <label htmlFor="color-mode" style={sidebarLabelStyle}>Color</label>
                    <select
                      id="color-mode"
                      value={colorMode}
                      onChange={(e) => setColorMode(e.target.value as 'fixed' | 'random')}
                      style={{ display: 'block', width: '100%', marginBottom: 4 }}
                    >
                      <option value="fixed">Fixed</option>
                      <option value="random">Random</option>
                    </select>
                  </div>
                  {colorMode === 'fixed' && (
                    <>
                      <div style={sidebarRowStyle}>
                        <label htmlFor="color-r" style={sidebarLabelStyle}>R (0-1)</label>
                        <input
                          id="color-r"
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={colorR}
                          onChange={(e) => setColorR(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
                          style={{ display: 'block', width: '100%' }}
                        />
                      </div>
                      <div style={sidebarRowStyle}>
                        <label htmlFor="color-g" style={sidebarLabelStyle}>G (0-1)</label>
                        <input
                          id="color-g"
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={colorG}
                          onChange={(e) => setColorG(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
                          style={{ display: 'block', width: '100%' }}
                        />
                      </div>
                      <div style={sidebarRowStyle}>
                        <label htmlFor="color-b" style={sidebarLabelStyle}>B (0-1)</label>
                        <input
                          id="color-b"
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={colorB}
                          onChange={(e) => setColorB(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
                          style={{ display: 'block', width: '100%' }}
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Physics Section */}
                <div style={{ ...sectionStyle, marginTop: 12 }}>
                  <h4 style={sectionTitleStyle}>Physics</h4>
                  
                  {/* Mass */}
                  <div style={sidebarRowStyle}>
                    <label htmlFor="mass-mode" style={sidebarLabelStyle}>Mass</label>
                    <select
                      id="mass-mode"
                      value={massMode}
                      onChange={(e) => setMassMode(e.target.value as 'fixed' | 'random' | 'none')}
                      style={{ display: 'block', width: '100%', marginBottom: 4 }}
                    >
                      <option value="none">None</option>
                      <option value="fixed">Fixed</option>
                      <option value="random">Random Range</option>
                    </select>
                  </div>
                  {massMode === 'fixed' ? (
                    <div style={sidebarRowStyle}>
                      <label htmlFor="mass-fixed" style={sidebarLabelStyle}>Value</label>
                      <input
                        id="mass-fixed"
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={massFixed}
                        onChange={(e) => setMassFixed(Math.max(0.1, parseFloat(e.target.value) || 1.0))}
                        style={{ display: 'block', width: '100%' }}
                      />
                    </div>
                  ) : massMode === 'random' ? (
                    <>
                      <div style={sidebarRowStyle}>
                        <label htmlFor="mass-min" style={sidebarLabelStyle}>Min</label>
                        <input
                          id="mass-min"
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={massMin}
                          onChange={(e) => setMassMin(Math.max(0.1, parseFloat(e.target.value) || 0.5))}
                          style={{ display: 'block', width: '100%' }}
                        />
                      </div>
                      <div style={sidebarRowStyle}>
                        <label htmlFor="mass-max" style={sidebarLabelStyle}>Max</label>
                        <input
                          id="mass-max"
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={massMax}
                          onChange={(e) => setMassMax(Math.max(0.1, parseFloat(e.target.value) || 5.0))}
                          style={{ display: 'block', width: '100%' }}
                        />
                      </div>
                    </>
                  ) : null}

                  {/* Friction */}
                  <div style={{ ...sidebarRowStyle, marginTop: massMode !== 'none' ? 8 : 0 }}>
                    <label htmlFor="friction-mode" style={sidebarLabelStyle}>Friction</label>
                    <select
                      id="friction-mode"
                      value={frictionMode}
                      onChange={(e) => setFrictionMode(e.target.value as 'fixed' | 'random' | 'none')}
                      style={{ display: 'block', width: '100%', marginBottom: 4 }}
                    >
                      <option value="none">None</option>
                      <option value="fixed">Fixed</option>
                      <option value="random">Random Range</option>
                    </select>
                  </div>
                  {frictionMode === 'fixed' ? (
                    <div style={sidebarRowStyle}>
                      <label htmlFor="friction-fixed" style={sidebarLabelStyle}>Value (0-1)</label>
                      <input
                        id="friction-fixed"
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                        value={frictionFixed}
                        onChange={(e) => setFrictionFixed(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0.5)))}
                        style={{ display: 'block', width: '100%' }}
                      />
                    </div>
                  ) : frictionMode === 'random' ? (
                    <>
                      <div style={sidebarRowStyle}>
                        <label htmlFor="friction-min" style={sidebarLabelStyle}>Min (0-1)</label>
                        <input
                          id="friction-min"
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={frictionMin}
                          onChange={(e) => setFrictionMin(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
                          style={{ display: 'block', width: '100%' }}
                        />
                      </div>
                      <div style={sidebarRowStyle}>
                        <label htmlFor="friction-max" style={sidebarLabelStyle}>Max (0-1)</label>
                        <input
                          id="friction-max"
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={frictionMax}
                          onChange={(e) => setFrictionMax(Math.max(0, Math.min(1, parseFloat(e.target.value) || 1)))}
                          style={{ display: 'block', width: '100%' }}
                        />
                      </div>
                    </>
                  ) : null}

                  {/* Restitution */}
                  <div style={{ ...sidebarRowStyle, marginTop: frictionMode !== 'none' ? 8 : 0 }}>
                    <label htmlFor="restitution-mode" style={sidebarLabelStyle}>Restitution</label>
                    <select
                      id="restitution-mode"
                      value={restitutionMode}
                      onChange={(e) => setRestitutionMode(e.target.value as 'fixed' | 'random' | 'none')}
                      style={{ display: 'block', width: '100%', marginBottom: 4 }}
                    >
                      <option value="none">None</option>
                      <option value="fixed">Fixed</option>
                      <option value="random">Random Range</option>
                    </select>
                  </div>
                  {restitutionMode === 'fixed' ? (
                    <div style={sidebarRowStyle}>
                      <label htmlFor="restitution-fixed" style={sidebarLabelStyle}>Value (0-1)</label>
                      <input
                        id="restitution-fixed"
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                        value={restitutionFixed}
                        onChange={(e) => setRestitutionFixed(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0.3)))}
                        style={{ display: 'block', width: '100%' }}
                      />
                    </div>
                  ) : restitutionMode === 'random' ? (
                    <>
                      <div style={sidebarRowStyle}>
                        <label htmlFor="restitution-min" style={sidebarLabelStyle}>Min (0-1)</label>
                        <input
                          id="restitution-min"
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={restitutionMin}
                          onChange={(e) => setRestitutionMin(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
                          style={{ display: 'block', width: '100%' }}
                        />
                      </div>
                      <div style={sidebarRowStyle}>
                        <label htmlFor="restitution-max" style={sidebarLabelStyle}>Max (0-1)</label>
                        <input
                          id="restitution-max"
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={restitutionMax}
                          onChange={(e) => setRestitutionMax(Math.max(0, Math.min(1, parseFloat(e.target.value) || 1)))}
                          style={{ display: 'block', width: '100%' }}
                        />
                      </div>
                    </>
                  ) : null}
                </div>

                {/* Submit Button */}
                <button
                  type="button"
                  onClick={handleBulkCreate}
                  style={{
                    width: '100%',
                    marginTop: 16,
                    padding: '8px 16px',
                    background: '#2b3550',
                    border: '1px solid #3d4a6a',
                    borderRadius: 6,
                    color: '#e6e9f2',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500,
                    transition: 'background 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#354060'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#2b3550'
                  }}
                >
                  Create {bulkCount} Entities
                </button>
              </div>
              </CopyableArea>
            )}
            {leftTab === 'world' && (
              <WorldPanel world={world} onWorldChange={onWorldChange} />
            )}
      </div>
    </Sidebar>
  )
}
