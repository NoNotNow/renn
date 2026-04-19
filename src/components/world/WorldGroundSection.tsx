import type { RennWorld, Vec3, MaterialRef } from '@/types/world'
import { DEFAULT_SCALE } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { colorToHex, hexToColor } from '@/utils/colorUtils'
import { patchFirstPlaneEntity } from '@/utils/worldGroundPatch'
import NumberInput from '../form/NumberInput'
import Vec3Field from '../Vec3Field'
import { sidebarRowStyle, sidebarLabelStyle, sectionStyle, sectionTitleStyle } from '../sharedStyles'
import { theme } from '@/config/theme'
import type { WorldPanelEdits } from './useWorldPanelEdits'

export interface WorldGroundSectionProps {
  world: RennWorld
  onWorldChange: (world: RennWorld) => void
  edits: WorldPanelEdits
}

export default function WorldGroundSection({
  world,
  onWorldChange,
  edits,
}: WorldGroundSectionProps) {
  const { pushUndo, vec3Undo } = edits

  const groundEntity = world.entities.find((e) => e.shape?.type === 'plane')
  const groundColor: Vec3 = groundEntity?.material?.color
    ? (groundEntity.material.color.slice(0, 3) as Vec3)
    : [0.3, 0.5, 0.3]
  const groundRoughness = groundEntity?.material?.roughness ?? 0.5
  const groundMetalness = groundEntity?.material?.metalness ?? 0
  const groundOpacity = groundEntity?.material?.opacity ?? 1
  const groundFriction = groundEntity?.friction ?? 0.5
  const groundScale: Vec3 = groundEntity?.scale ?? DEFAULT_SCALE
  const groundColorHex = colorToHex(groundColor)

  const updateGroundColor = (newColor: Vec3) => {
    if (!groundEntity) {
      console.warn('No ground entity found to update color')
      return
    }

    uiLogger.change('WorldPanel', 'Change ground color', {
      entityId: groundEntity.id,
      oldValue: groundColor,
      newValue: newColor,
    })

    onWorldChange(
      patchFirstPlaneEntity(world, groundEntity, (e) => ({
        ...e,
        material: {
          ...e.material,
          color: newColor,
        },
      })),
    )
  }

  const updateGroundMaterial = (materialPatch: Partial<MaterialRef>) => {
    if (!groundEntity) {
      console.warn('No ground entity found to update material')
      return
    }

    onWorldChange(
      patchFirstPlaneEntity(world, groundEntity, (e) => ({
        ...e,
        material: {
          ...e.material,
          ...materialPatch,
        },
      })),
    )
  }

  const updateGroundFriction = (newFriction: number) => {
    if (!groundEntity) {
      console.warn('No ground entity found to update friction')
      return
    }

    uiLogger.change('WorldPanel', 'Change ground friction', {
      entityId: groundEntity.id,
      oldValue: groundFriction,
      newValue: newFriction,
    })

    onWorldChange(patchFirstPlaneEntity(world, groundEntity, (e) => ({ ...e, friction: newFriction })))
  }

  const updateGroundScale = (newScale: Vec3) => {
    if (!groundEntity) {
      console.warn('No ground entity found to update scale')
      return
    }

    uiLogger.change('WorldPanel', 'Change ground scale', {
      entityId: groundEntity.id,
      oldValue: groundScale,
      newValue: newScale,
    })

    onWorldChange(patchFirstPlaneEntity(world, groundEntity, (e) => ({ ...e, scale: newScale })))
  }

  return (
    <div style={{ ...sectionStyle, marginTop: 12 }}>
      <div style={sectionTitleStyle}>Ground</div>
      {groundEntity ? (
        <>
          {/* Color */}
          <div style={sidebarRowStyle}>
            <label htmlFor="ground-color" style={sidebarLabelStyle}>
              Color
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="ground-color"
                type="color"
                value={groundColorHex}
                onChange={(e) => {
                  pushUndo()
                  const next = hexToColor(e.target.value)
                  updateGroundColor(next)
                }}
                aria-label="Ground color"
                style={{
                  width: 28,
                  height: 22,
                  padding: 0,
                  borderRadius: 4,
                  border: `1px solid ${theme.border.default}`,
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              />
              <span style={{ fontSize: 12, color: theme.text.muted }}>
                {groundColor.map((c) => c.toFixed(2)).join(', ')}
              </span>
            </div>
          </div>

          {/* Material Properties subsection */}
          <div style={{ marginTop: 12 }}>
            <div style={{ ...sectionTitleStyle, fontSize: 11 }}>Material</div>
            <NumberInput
              onBeforeCommit={pushUndo}
              id="ground-roughness"
              label="Roughness"
              labelTitle="Ground plane PBR roughness: 0 glossy, 1 diffuse."
              value={groundRoughness}
              onChange={(value) => {
                uiLogger.change('WorldPanel', 'Change ground roughness', {
                  entityId: groundEntity.id,
                  oldValue: groundRoughness,
                  newValue: value,
                })
                updateGroundMaterial({ roughness: value })
              }}
              min={0}
              max={1}
              step={0.1}
              defaultValue={0.5}
              entityId={groundEntity.id}
              propertyName="roughness"
              logComponent="WorldPanel"
            />
            <NumberInput
              onBeforeCommit={pushUndo}
              id="ground-metalness"
              label="Metalness"
              labelTitle="Ground plane metalness: 0 non-metal, 1 fully metallic reflections."
              value={groundMetalness}
              onChange={(value) => {
                uiLogger.change('WorldPanel', 'Change ground metalness', {
                  entityId: groundEntity.id,
                  oldValue: groundMetalness,
                  newValue: value,
                })
                updateGroundMaterial({ metalness: value })
              }}
              min={0}
              max={1}
              step={0.1}
              defaultValue={0}
              entityId={groundEntity.id}
              propertyName="metalness"
              logComponent="WorldPanel"
            />
            <NumberInput
              onBeforeCommit={pushUndo}
              id="ground-opacity"
              label="Opacity"
              labelTitle="Alpha for the ground material (1 = opaque)."
              value={groundOpacity}
              onChange={(value) => {
                uiLogger.change('WorldPanel', 'Change ground opacity', {
                  entityId: groundEntity.id,
                  oldValue: groundOpacity,
                  newValue: value,
                })
                updateGroundMaterial({ opacity: value })
              }}
              min={0}
              max={1}
              step={0.05}
              defaultValue={1}
              entityId={groundEntity.id}
              propertyName="opacity"
              logComponent="WorldPanel"
            />
          </div>

          {/* Physics Properties subsection */}
          <div style={{ marginTop: 12 }}>
            <div style={{ ...sectionTitleStyle, fontSize: 11 }}>Physics</div>
            <NumberInput
              onBeforeCommit={pushUndo}
              id="ground-friction"
              label="Friction"
              labelTitle="Contact friction for the ground collider (higher = more grip)."
              value={groundFriction}
              onChange={updateGroundFriction}
              min={0}
              max={1}
              step={0.1}
              defaultValue={0.5}
              entityId={groundEntity.id}
              propertyName="friction"
              logComponent="WorldPanel"
            />
          </div>

          {/* Transform Properties subsection */}
          <div style={{ marginTop: 12 }}>
            <div style={{ ...sectionTitleStyle, fontSize: 11 }}>Transform</div>
            <Vec3Field
              label="Scale"
              labelTitle="Non-uniform scale of the ground plane mesh and collider."
              value={groundScale}
              onChange={updateGroundScale}
              step={0.1}
              axisLabels={['X', 'Y', 'Z']}
              idPrefix="ground-scale"
              {...vec3Undo}
            />
          </div>

          {/* Entity info */}
          <div style={{ fontSize: 11, color: theme.text.muted, marginTop: 8 }}>
            Entity: {groundEntity.name ?? groundEntity.id}
          </div>
        </>
      ) : (
        <p style={{ fontSize: 12, color: theme.text.muted, margin: 0 }}>
          No ground entity found. Add a plane entity to edit ground properties.
        </p>
      )}
    </div>
  )
}
