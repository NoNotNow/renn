import { useReducer, useCallback, useMemo } from 'react'
import type { Color } from '@/types/world'
import type { AddableShapeType, BulkEntityParams } from '@/data/entityDefaults'
import { uiLogger } from '@/utils/uiLogger'
import CopyableArea from '@/components/CopyableArea'
import {
  sidebarRowStyle,
  sidebarLabelStyle,
  sectionStyle,
  sectionTitleStyle,
} from '@/components/sharedStyles'
import { theme } from '@/config/theme'

export interface BulkSpawnFormProps {
  onBulkAddEntities: (params: BulkEntityParams) => void
}

/** Defaults tuned for stress-testing collisions. */
export interface BulkSpawnState {
  bulkCount: number
  bulkShape: AddableShapeType | 'random'
  bulkBodyType: 'static' | 'dynamic' | 'kinematic' | 'random'
  sizeMode: 'fixed' | 'random'
  sizeFixed: number
  sizeMin: number
  sizeMax: number
  positionMode: 'fixed' | 'random'
  positionX: number
  positionY: number
  positionZ: number
  spawnRadius: number
  spawnYMin: number
  spawnYMax: number
  colorMode: 'fixed' | 'random'
  colorR: number
  colorG: number
  colorB: number
  rotationMode: 'default' | 'random'
  massMode: 'fixed' | 'random' | 'none'
  massFixed: number
  massMin: number
  massMax: number
  frictionMode: 'fixed' | 'random' | 'none'
  frictionFixed: number
  frictionMin: number
  frictionMax: number
  restitutionMode: 'fixed' | 'random' | 'none'
  restitutionFixed: number
  restitutionMin: number
  restitutionMax: number
}

const initialBulkSpawnState: BulkSpawnState = {
  bulkCount: 50,
  bulkShape: 'random',
  bulkBodyType: 'dynamic',
  sizeMode: 'random',
  sizeFixed: 1.0,
  sizeMin: 0.5,
  sizeMax: 2.0,
  positionMode: 'random',
  positionX: 0,
  positionY: 0,
  positionZ: 0,
  spawnRadius: 10,
  spawnYMin: 5,
  spawnYMax: 25,
  colorMode: 'random',
  colorR: 0.86,
  colorG: 0.2,
  colorB: 0.2,
  rotationMode: 'random',
  massMode: 'random',
  massFixed: 1.0,
  massMin: 0.5,
  massMax: 5.0,
  frictionMode: 'random',
  frictionFixed: 0.5,
  frictionMin: 0.2,
  frictionMax: 0.8,
  restitutionMode: 'random',
  restitutionFixed: 0.3,
  restitutionMin: 0.1,
  restitutionMax: 0.9,
}

function bulkEntityParamsFromState(s: BulkSpawnState): BulkEntityParams {
  return {
    count: s.bulkCount,
    shape: s.bulkShape,
    bodyType: s.bulkBodyType,
    size:
      s.sizeMode === 'fixed'
        ? { mode: 'fixed', value: s.sizeFixed }
        : { mode: 'random', min: s.sizeMin, max: s.sizeMax },
    position:
      s.positionMode === 'fixed'
        ? { mode: 'fixed', x: s.positionX, y: s.positionY, z: s.positionZ }
        : { mode: 'random', radius: s.spawnRadius, yMin: s.spawnYMin, yMax: s.spawnYMax },
    color:
      s.colorMode === 'fixed'
        ? { mode: 'fixed', value: [s.colorR, s.colorG, s.colorB] as Color }
        : { mode: 'random' },
    rotation: s.rotationMode === 'default' ? { mode: 'default' } : { mode: 'random' },
    physics: {
      ...(s.massMode !== 'none' && {
        mass:
          s.massMode === 'fixed'
            ? { mode: 'fixed', value: s.massFixed }
            : { mode: 'random', min: s.massMin, max: s.massMax },
      }),
      ...(s.frictionMode !== 'none' && {
        friction:
          s.frictionMode === 'fixed'
            ? { mode: 'fixed', value: s.frictionFixed }
            : { mode: 'random', min: s.frictionMin, max: s.frictionMax },
      }),
      ...(s.restitutionMode !== 'none' && {
        restitution:
          s.restitutionMode === 'fixed'
            ? { mode: 'fixed', value: s.restitutionFixed }
            : { mode: 'random', min: s.restitutionMin, max: s.restitutionMax },
      }),
    },
  }
}

function bulkCreateCopyPayload(s: BulkSpawnState) {
  return {
    bulkCreate: {
      count: s.bulkCount,
      shape: s.bulkShape,
      bodyType: s.bulkBodyType,
      size:
        s.sizeMode === 'fixed'
          ? { mode: 'fixed' as const, value: s.sizeFixed }
          : { mode: 'random' as const, min: s.sizeMin, max: s.sizeMax },
      position:
        s.positionMode === 'fixed'
          ? { mode: 'fixed' as const, x: s.positionX, y: s.positionY, z: s.positionZ }
          : { mode: 'random' as const, radius: s.spawnRadius, yMin: s.spawnYMin, yMax: s.spawnYMax },
      color:
        s.colorMode === 'fixed'
          ? { mode: 'fixed' as const, value: [s.colorR, s.colorG, s.colorB] as Color }
          : { mode: 'random' as const },
      rotation: s.rotationMode === 'default' ? { mode: 'default' as const } : { mode: 'random' as const },
      physics: {
        ...(s.massMode !== 'none' && {
          mass:
            s.massMode === 'fixed'
              ? { mode: 'fixed' as const, value: s.massFixed }
              : { mode: 'random' as const, min: s.massMin, max: s.massMax },
        }),
        ...(s.frictionMode !== 'none' && {
          friction:
            s.frictionMode === 'fixed'
              ? { mode: 'fixed' as const, value: s.frictionFixed }
              : { mode: 'random' as const, min: s.frictionMin, max: s.frictionMax },
        }),
        ...(s.restitutionMode !== 'none' && {
          restitution:
            s.restitutionMode === 'fixed'
              ? { mode: 'fixed' as const, value: s.restitutionFixed }
              : { mode: 'random' as const, min: s.restitutionMin, max: s.restitutionMax },
        }),
      },
    },
  }
}

/**
 * Bulk entity creation form (Actions tab). State is a single reducer for fewer update bugs.
 */
export default function BulkSpawnForm({ onBulkAddEntities }: BulkSpawnFormProps) {
  const [state, patch] = useReducer(
    (s: BulkSpawnState, p: Partial<BulkSpawnState>) => ({ ...s, ...p }),
    initialBulkSpawnState,
  )

  const copyPayload = useMemo(() => bulkCreateCopyPayload(state), [state])

  const handleBulkCreate = useCallback(() => {
    const params = bulkEntityParamsFromState(state)
    uiLogger.select('Builder', 'Bulk add entities', { count: state.bulkCount })
    onBulkAddEntities(params)
  }, [state, onBulkAddEntities])

  const {
    bulkCount,
    bulkShape,
    bulkBodyType,
    sizeMode,
    sizeFixed,
    sizeMin,
    sizeMax,
    positionMode,
    positionX,
    positionY,
    positionZ,
    spawnRadius,
    spawnYMin,
    spawnYMax,
    colorMode,
    colorR,
    colorG,
    colorB,
    rotationMode,
    massMode,
    massFixed,
    massMin,
    massMax,
    frictionMode,
    frictionFixed,
    frictionMin,
    frictionMax,
    restitutionMode,
    restitutionFixed,
    restitutionMin,
    restitutionMax,
  } = state

  return (
    <CopyableArea copyPayload={copyPayload}>
      <div style={{ padding: '0 10px 10px 10px', overflowY: 'auto', maxHeight: 'calc(100vh - 100px)' }}>
        <h3 style={{ margin: '10px 0', fontSize: 14, color: theme.text.primary }}>Bulk Create Entities</h3>

        <div style={sidebarRowStyle}>
          <label htmlFor="bulk-count" style={sidebarLabelStyle}>
            Count
          </label>
          <input
            id="bulk-count"
            type="number"
            min={1}
            max={1000}
            value={bulkCount}
            onChange={(e) =>
              patch({ bulkCount: Math.max(1, Math.min(1000, parseInt(e.target.value, 10) || 1)) })
            }
            style={{ display: 'block', width: '100%' }}
          />
        </div>

        <div style={sidebarRowStyle}>
          <label htmlFor="bulk-shape" style={sidebarLabelStyle}>
            Shape
          </label>
          <select
            id="bulk-shape"
            value={bulkShape}
            onChange={(e) => patch({ bulkShape: e.target.value as AddableShapeType | 'random' })}
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

        <div style={sidebarRowStyle}>
          <label htmlFor="bulk-body-type" style={sidebarLabelStyle}>
            Body Type
          </label>
          <select
            id="bulk-body-type"
            value={bulkBodyType}
            onChange={(e) =>
              patch({ bulkBodyType: e.target.value as 'static' | 'dynamic' | 'kinematic' | 'random' })
            }
            style={{ display: 'block', width: '100%' }}
          >
            <option value="static">Static</option>
            <option value="dynamic">Dynamic</option>
            <option value="kinematic">Kinematic</option>
            <option value="random">Random</option>
          </select>
        </div>

        <div style={{ ...sectionStyle, marginTop: 12 }}>
          <h4 style={sectionTitleStyle}>Transform</h4>

          <div style={sidebarRowStyle}>
            <label htmlFor="size-mode" style={sidebarLabelStyle}>
              Size
            </label>
            <select
              id="size-mode"
              value={sizeMode}
              onChange={(e) => patch({ sizeMode: e.target.value as 'fixed' | 'random' })}
              style={{ display: 'block', width: '100%', marginBottom: 4 }}
            >
              <option value="fixed">Fixed</option>
              <option value="random">Random Range</option>
            </select>
          </div>
          {sizeMode === 'fixed' ? (
            <div style={sidebarRowStyle}>
              <label htmlFor="size-fixed" style={sidebarLabelStyle}>
                Value
              </label>
              <input
                id="size-fixed"
                type="number"
                min={0.1}
                step={0.1}
                value={sizeFixed}
                onChange={(e) => patch({ sizeFixed: parseFloat(e.target.value) || 1.0 })}
                style={{ display: 'block', width: '100%' }}
              />
            </div>
          ) : (
            <>
              <div style={sidebarRowStyle}>
                <label htmlFor="size-min" style={sidebarLabelStyle}>
                  Min
                </label>
                <input
                  id="size-min"
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={sizeMin}
                  onChange={(e) => patch({ sizeMin: parseFloat(e.target.value) || 0.5 })}
                  style={{ display: 'block', width: '100%' }}
                />
              </div>
              <div style={sidebarRowStyle}>
                <label htmlFor="size-max" style={sidebarLabelStyle}>
                  Max
                </label>
                <input
                  id="size-max"
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={sizeMax}
                  onChange={(e) => patch({ sizeMax: parseFloat(e.target.value) || 2.0 })}
                  style={{ display: 'block', width: '100%' }}
                />
              </div>
            </>
          )}

          <div style={{ ...sidebarRowStyle, marginTop: 8 }}>
            <label htmlFor="position-mode" style={sidebarLabelStyle}>
              Position
            </label>
            <select
              id="position-mode"
              value={positionMode}
              onChange={(e) => patch({ positionMode: e.target.value as 'fixed' | 'random' })}
              style={{ display: 'block', width: '100%', marginBottom: 4 }}
            >
              <option value="fixed">Fixed Point</option>
              <option value="random">Random (Radius)</option>
            </select>
          </div>
          {positionMode === 'fixed' ? (
            <>
              <div style={sidebarRowStyle}>
                <label htmlFor="pos-x" style={sidebarLabelStyle}>
                  X
                </label>
                <input
                  id="pos-x"
                  type="number"
                  step={0.1}
                  value={positionX}
                  onChange={(e) => patch({ positionX: parseFloat(e.target.value) || 0 })}
                  style={{ display: 'block', width: '100%' }}
                />
              </div>
              <div style={sidebarRowStyle}>
                <label htmlFor="pos-y" style={sidebarLabelStyle}>
                  Y
                </label>
                <input
                  id="pos-y"
                  type="number"
                  step={0.1}
                  value={positionY}
                  onChange={(e) => patch({ positionY: parseFloat(e.target.value) || 0 })}
                  style={{ display: 'block', width: '100%' }}
                />
              </div>
              <div style={sidebarRowStyle}>
                <label htmlFor="pos-z" style={sidebarLabelStyle}>
                  Z
                </label>
                <input
                  id="pos-z"
                  type="number"
                  step={0.1}
                  value={positionZ}
                  onChange={(e) => patch({ positionZ: parseFloat(e.target.value) || 0 })}
                  style={{ display: 'block', width: '100%' }}
                />
              </div>
            </>
          ) : (
            <>
              <div style={sidebarRowStyle}>
                <label htmlFor="spawn-radius" style={sidebarLabelStyle}>
                  Radius
                </label>
                <input
                  id="spawn-radius"
                  type="number"
                  min={0}
                  step={0.1}
                  value={spawnRadius}
                  onChange={(e) => patch({ spawnRadius: Math.max(0, parseFloat(e.target.value) || 10) })}
                  style={{ display: 'block', width: '100%' }}
                />
              </div>
              <div style={sidebarRowStyle}>
                <label htmlFor="spawn-y-min" style={sidebarLabelStyle}>
                  Y Min
                </label>
                <input
                  id="spawn-y-min"
                  type="number"
                  step={0.1}
                  value={spawnYMin}
                  onChange={(e) => patch({ spawnYMin: parseFloat(e.target.value) || 5 })}
                  style={{ display: 'block', width: '100%' }}
                />
              </div>
              <div style={sidebarRowStyle}>
                <label htmlFor="spawn-y-max" style={sidebarLabelStyle}>
                  Y Max
                </label>
                <input
                  id="spawn-y-max"
                  type="number"
                  step={0.1}
                  value={spawnYMax}
                  onChange={(e) => patch({ spawnYMax: parseFloat(e.target.value) || 25 })}
                  style={{ display: 'block', width: '100%' }}
                />
              </div>
            </>
          )}

          <div style={{ ...sidebarRowStyle, marginTop: 8 }}>
            <label htmlFor="rotation-mode" style={sidebarLabelStyle}>
              Rotation
            </label>
            <select
              id="rotation-mode"
              value={rotationMode}
              onChange={(e) => patch({ rotationMode: e.target.value as 'default' | 'random' })}
              style={{ display: 'block', width: '100%' }}
            >
              <option value="default">Default</option>
              <option value="random">Random</option>
            </select>
          </div>
        </div>

        <div style={{ ...sectionStyle, marginTop: 12 }}>
          <h4 style={sectionTitleStyle}>Appearance</h4>

          <div style={sidebarRowStyle}>
            <label htmlFor="color-mode" style={sidebarLabelStyle}>
              Color
            </label>
            <select
              id="color-mode"
              value={colorMode}
              onChange={(e) => patch({ colorMode: e.target.value as 'fixed' | 'random' })}
              style={{ display: 'block', width: '100%', marginBottom: 4 }}
            >
              <option value="fixed">Fixed</option>
              <option value="random">Random</option>
            </select>
          </div>
          {colorMode === 'fixed' && (
            <>
              <div style={sidebarRowStyle}>
                <label htmlFor="color-r" style={sidebarLabelStyle}>
                  R (0-1)
                </label>
                <input
                  id="color-r"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={colorR}
                  onChange={(e) =>
                    patch({ colorR: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) })
                  }
                  style={{ display: 'block', width: '100%' }}
                />
              </div>
              <div style={sidebarRowStyle}>
                <label htmlFor="color-g" style={sidebarLabelStyle}>
                  G (0-1)
                </label>
                <input
                  id="color-g"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={colorG}
                  onChange={(e) =>
                    patch({ colorG: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) })
                  }
                  style={{ display: 'block', width: '100%' }}
                />
              </div>
              <div style={sidebarRowStyle}>
                <label htmlFor="color-b" style={sidebarLabelStyle}>
                  B (0-1)
                </label>
                <input
                  id="color-b"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={colorB}
                  onChange={(e) =>
                    patch({ colorB: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) })
                  }
                  style={{ display: 'block', width: '100%' }}
                />
              </div>
            </>
          )}
        </div>

        <div style={{ ...sectionStyle, marginTop: 12 }}>
          <h4 style={sectionTitleStyle}>Physics</h4>

          <div style={sidebarRowStyle}>
            <label htmlFor="mass-mode" style={sidebarLabelStyle}>
              Mass
            </label>
            <select
              id="mass-mode"
              value={massMode}
              onChange={(e) => patch({ massMode: e.target.value as 'fixed' | 'random' | 'none' })}
              style={{ display: 'block', width: '100%', marginBottom: 4 }}
            >
              <option value="none">None</option>
              <option value="fixed">Fixed</option>
              <option value="random">Random Range</option>
            </select>
          </div>
          {massMode === 'fixed' ? (
            <div style={sidebarRowStyle}>
              <label htmlFor="mass-fixed" style={sidebarLabelStyle}>
                Value
              </label>
              <input
                id="mass-fixed"
                type="number"
                min={0.1}
                step={0.1}
                value={massFixed}
                onChange={(e) => patch({ massFixed: Math.max(0.1, parseFloat(e.target.value) || 1.0) })}
                style={{ display: 'block', width: '100%' }}
              />
            </div>
          ) : massMode === 'random' ? (
            <>
              <div style={sidebarRowStyle}>
                <label htmlFor="mass-min" style={sidebarLabelStyle}>
                  Min
                </label>
                <input
                  id="mass-min"
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={massMin}
                  onChange={(e) => patch({ massMin: Math.max(0.1, parseFloat(e.target.value) || 0.5) })}
                  style={{ display: 'block', width: '100%' }}
                />
              </div>
              <div style={sidebarRowStyle}>
                <label htmlFor="mass-max" style={sidebarLabelStyle}>
                  Max
                </label>
                <input
                  id="mass-max"
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={massMax}
                  onChange={(e) => patch({ massMax: Math.max(0.1, parseFloat(e.target.value) || 5.0) })}
                  style={{ display: 'block', width: '100%' }}
                />
              </div>
            </>
          ) : null}

          <div style={{ ...sidebarRowStyle, marginTop: massMode !== 'none' ? 8 : 0 }}>
            <label htmlFor="friction-mode" style={sidebarLabelStyle}>
              Friction
            </label>
            <select
              id="friction-mode"
              value={frictionMode}
              onChange={(e) => patch({ frictionMode: e.target.value as 'fixed' | 'random' | 'none' })}
              style={{ display: 'block', width: '100%', marginBottom: 4 }}
            >
              <option value="none">None</option>
              <option value="fixed">Fixed</option>
              <option value="random">Random Range</option>
            </select>
          </div>
          {frictionMode === 'fixed' ? (
            <div style={sidebarRowStyle}>
              <label htmlFor="friction-fixed" style={sidebarLabelStyle}>
                Value (0-1)
              </label>
              <input
                id="friction-fixed"
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={frictionFixed}
                onChange={(e) =>
                  patch({ frictionFixed: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0.5)) })
                }
                style={{ display: 'block', width: '100%' }}
              />
            </div>
          ) : frictionMode === 'random' ? (
            <>
              <div style={sidebarRowStyle}>
                <label htmlFor="friction-min" style={sidebarLabelStyle}>
                  Min (0-1)
                </label>
                <input
                  id="friction-min"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={frictionMin}
                  onChange={(e) =>
                    patch({ frictionMin: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) })
                  }
                  style={{ display: 'block', width: '100%' }}
                />
              </div>
              <div style={sidebarRowStyle}>
                <label htmlFor="friction-max" style={sidebarLabelStyle}>
                  Max (0-1)
                </label>
                <input
                  id="friction-max"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={frictionMax}
                  onChange={(e) =>
                    patch({ frictionMax: Math.max(0, Math.min(1, parseFloat(e.target.value) || 1)) })
                  }
                  style={{ display: 'block', width: '100%' }}
                />
              </div>
            </>
          ) : null}

          <div style={{ ...sidebarRowStyle, marginTop: frictionMode !== 'none' ? 8 : 0 }}>
            <label htmlFor="restitution-mode" style={sidebarLabelStyle}>
              Restitution
            </label>
            <select
              id="restitution-mode"
              value={restitutionMode}
              onChange={(e) =>
                patch({ restitutionMode: e.target.value as 'fixed' | 'random' | 'none' })
              }
              style={{ display: 'block', width: '100%', marginBottom: 4 }}
            >
              <option value="none">None</option>
              <option value="fixed">Fixed</option>
              <option value="random">Random Range</option>
            </select>
          </div>
          {restitutionMode === 'fixed' ? (
            <div style={sidebarRowStyle}>
              <label htmlFor="restitution-fixed" style={sidebarLabelStyle}>
                Value (0-1)
              </label>
              <input
                id="restitution-fixed"
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={restitutionFixed}
                onChange={(e) =>
                  patch({
                    restitutionFixed: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0.3)),
                  })
                }
                style={{ display: 'block', width: '100%' }}
              />
            </div>
          ) : restitutionMode === 'random' ? (
            <>
              <div style={sidebarRowStyle}>
                <label htmlFor="restitution-min" style={sidebarLabelStyle}>
                  Min (0-1)
                </label>
                <input
                  id="restitution-min"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={restitutionMin}
                  onChange={(e) =>
                    patch({ restitutionMin: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) })
                  }
                  style={{ display: 'block', width: '100%' }}
                />
              </div>
              <div style={sidebarRowStyle}>
                <label htmlFor="restitution-max" style={sidebarLabelStyle}>
                  Max (0-1)
                </label>
                <input
                  id="restitution-max"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={restitutionMax}
                  onChange={(e) =>
                    patch({ restitutionMax: Math.max(0, Math.min(1, parseFloat(e.target.value) || 1)) })
                  }
                  style={{ display: 'block', width: '100%' }}
                />
              </div>
            </>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleBulkCreate}
          style={{
            width: '100%',
            marginTop: 16,
            padding: '8px 16px',
            background: theme.button.primary,
            border: `1px solid ${theme.button.primaryBorder}`,
            borderRadius: 6,
            color: theme.text.primary,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
            transition: 'background 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = theme.button.primaryHover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = theme.button.primary
          }}
        >
          Create {bulkCount} Entities
        </button>
      </div>
    </CopyableArea>
  )
}
