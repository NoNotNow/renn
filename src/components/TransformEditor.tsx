import type { Vec3, Rotation } from '@/types/world'
import Vec3Field from './Vec3Field'
import { uiLogger } from '@/utils/uiLogger'

export interface TransformEditorProps {
  entityId: string
  position: Vec3
  rotation: Rotation
  scale: Vec3
  onPositionChange: (position: Vec3) => void
  onRotationChange: (rotation: Rotation) => void
  onScaleChange: (scale: Vec3) => void
  getCurrentPose?: (id: string) => { position: Vec3; rotation: Rotation }
  disabled?: boolean
}

export default function TransformEditor({
  entityId,
  position,
  rotation,
  scale,
  onPositionChange,
  onRotationChange,
  onScaleChange,
  disabled = false,
}: TransformEditorProps) {
  return (
    <>
      <Vec3Field
        label="Position"
        value={position}
        onChange={(v) => {
          uiLogger.change('PropertyPanel', 'Change position', { entityId, oldValue: position, newValue: v })
          onPositionChange(v)
        }}
        sensitivity={0.05}
        idPrefix={`${entityId}-position`}
        disabled={disabled}
      />
      <Vec3Field
        label="Rotation"
        value={rotation}
        onChange={(r) => {
          uiLogger.change('PropertyPanel', 'Change rotation', { entityId, oldValue: rotation, newValue: r })
          onRotationChange(r)
        }}
        axisLabels={['X', 'Y', 'Z']}
        idPrefix={`${entityId}-rotation`}
        disabled={disabled}
      />
      <Vec3Field
        label="Scale"
        value={scale}
        onChange={(v) => {
          uiLogger.change('PropertyPanel', 'Change scale', { entityId, oldValue: scale, newValue: v })
          onScaleChange(v)
        }}
        min={0.01}
        step={0.1}
        sensitivity={0.01}
        idPrefix={`${entityId}-scale`}
        disabled={disabled}
      />
    </>
  )
}
