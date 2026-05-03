import type { Entity, Rotation, Vec3 } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { theme } from '@/config/theme'
import Switch from '../Switch'
import Vec3Field from '../Vec3Field'
import { EntityPanelIcons } from '../EntityPanelIcons'
import { entityPanelIconButtonStyle } from '../sharedStyles'
import type { Vec3UndoProps } from '../TransformEditor'

export interface ModelTransformSectionProps {
  entities: Entity[]
  ids: string[]
  editorIdPrefix: string
  mergedModelRotation: Rotation | null
  mergedModelScale: Vec3 | null
  anyLocked: boolean
  vec3Undo?: Vec3UndoProps
  onUndoBeforeEdit?: () => void
  onEntityModelTransformChange?: (
    ids: string[],
    patch: { modelRotation?: Rotation; modelScale?: Vec3; doubleSided?: boolean },
  ) => void
  updateAll: (patch: Partial<Entity>) => void
}

export default function ModelTransformSection({
  entities,
  ids,
  editorIdPrefix,
  mergedModelRotation,
  mergedModelScale,
  anyLocked,
  vec3Undo,
  onUndoBeforeEdit,
  onEntityModelTransformChange,
  updateAll,
}: ModelTransformSectionProps) {
  const showWireframeToggle = entities.every((e) => e.shape?.type !== 'trimesh' && e.model)
  const wireframeChecked = entities.every((e) => e.showShapeWireframe === true)
  const doubleSidedChecked = entities.every((e) => e.doubleSided === true)

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <Switch
          labelTitle="Renders GLTF/backfaces visible from both sides (THREE.DoubleSide). Off restores each material side from the file (or FrontSide under a shared material override)."
          checked={doubleSidedChecked}
          onChange={(checked) => {
            onUndoBeforeEdit?.()
            uiLogger.change('PropertyPanel', 'Toggle model double sided', { entityIds: ids, value: checked })
            if (onEntityModelTransformChange) {
              onEntityModelTransformChange(ids, { doubleSided: checked })
            } else {
              updateAll({ doubleSided: checked ? true : undefined })
            }
          }}
          disabled={anyLocked}
          label="Double sided (GLTF)"
        />
      </div>
      {showWireframeToggle && (
        <div style={{ marginBottom: 10 }}>
          <Switch
            labelTitle="Draws the physics primitive outline (box/sphere/etc.), not the high-poly GLTF triangles."
            checked={wireframeChecked}
            onChange={(checked) => {
              onUndoBeforeEdit?.()
              uiLogger.change('PropertyPanel', 'Toggle shape wireframe', { entityIds: ids, value: checked })
              updateAll(checked ? { showShapeWireframe: true } : { showShapeWireframe: undefined })
            }}
            disabled={anyLocked}
            label="Show shape wireframe"
          />
          <div style={{ fontSize: 10, color: theme.text.disabled, marginTop: 4, paddingLeft: 2 }}>
            Outlines the physics primitive (not the GLTF mesh)
          </div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Vec3Field
          label="Model rotation"
          labelTitle="Euler rotation offset (radians, XYZ) applied to the visual model only."
          value={mergedModelRotation}
          onChange={(r) => {
            uiLogger.change('PropertyPanel', 'Change model rotation', { entityIds: ids, newValue: r })
            if (onEntityModelTransformChange) {
              onEntityModelTransformChange(ids, { modelRotation: r })
            } else {
              updateAll({ modelRotation: r })
            }
          }}
          axisLabels={['X', 'Y', 'Z']}
          idPrefix={`${editorIdPrefix}-model-rotation`}
          disabled={anyLocked}
          onScrubStart={vec3Undo?.onScrubStart}
          onScrubEnd={vec3Undo?.onScrubEnd}
          onBeforeCommit={vec3Undo?.onBeforeCommit}
        />
        <button
          type="button"
          title="Reset model rotation to 0,0,0"
          aria-label="Reset model rotation to 0,0,0"
          onClick={() => {
            vec3Undo?.onBeforeCommit?.()
            uiLogger.change('PropertyPanel', 'Reset model rotation', { entityIds: ids })
            if (onEntityModelTransformChange) {
              onEntityModelTransformChange(ids, { modelRotation: [0, 0, 0] })
            } else {
              updateAll({ modelRotation: [0, 0, 0] })
            }
          }}
          disabled={anyLocked}
          style={{
            ...entityPanelIconButtonStyle,
            cursor: anyLocked ? 'not-allowed' : 'pointer',
            opacity: anyLocked ? 0.5 : 1,
          }}
        >
          {EntityPanelIcons.reset}
        </button>
      </div>
      <Vec3Field
        label="Model scale"
        labelTitle="Per-axis scale multiplier for the visual model relative to its file units."
        value={mergedModelScale}
        onChange={(v) => {
          uiLogger.change('PropertyPanel', 'Change model scale', { entityIds: ids, newValue: v })
          if (onEntityModelTransformChange) {
            onEntityModelTransformChange(ids, { modelScale: v })
          } else {
            updateAll({ modelScale: v })
          }
        }}
        min={0.01}
        step={0.1}
        sensitivity={0.01}
        idPrefix={`${editorIdPrefix}-model-scale`}
        disabled={anyLocked}
        onScrubStart={vec3Undo?.onScrubStart}
        onScrubEnd={vec3Undo?.onScrubEnd}
        onBeforeCommit={vec3Undo?.onBeforeCommit}
      />
    </>
  )
}
