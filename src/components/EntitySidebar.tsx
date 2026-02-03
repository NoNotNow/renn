import { useRef, useCallback, useState } from 'react'
import type { Entity, CameraMode, Color, RennWorld } from '@/types/world'
import type { AddableShapeType, BulkEntityParams } from '@/data/entityDefaults'
import { uiLogger } from '@/utils/uiLogger'
import Sidebar from './layout/Sidebar'
import WorldPanel from './WorldPanel'
import { sidebarRowStyle, sidebarLabelStyle, fieldLabelStyle, sectionStyle, sectionTitleStyle } from './sharedStyles'

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
  const addEntitySelectRef = useRef<HTMLSelectElement>(null)
  
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
      tabs={['entities', 'camera', 'actions', 'world'] as const}
      activeTab={leftTab}
      onTabChange={handleTabChange}
      toggleLogContext="Toggle left drawer"
    >
      <div style={{ padding: 10 }}>
        {leftTab === 'entities' && (
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
                    <option value="plane">Plane</option>
                  </select>
                </label>
                <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0 0' }}>
                  {entities.map((e) => (
                    <li key={e.id}>
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
                    </li>
                  ))}
                </ul>
              </>
            )}
            {leftTab === 'camera' && (
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
                        <option value="follow">Follow</option>
                        <option value="thirdPerson">Third person</option>
                        <option value="firstPerson">First person</option>
                      </select>
                    </div>
                  </>
                )}
              </>
            )}
            {leftTab === 'actions' && (
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
            )}
            {leftTab === 'world' && (
              <WorldPanel world={world} onWorldChange={onWorldChange} />
            )}
      </div>
    </Sidebar>
  )
}
