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
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
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
        <button
          type="button"
          title="Reset rotation to 0,0,0"
          onClick={() => {
            uiLogger.change('PropertyPanel', 'Reset rotation', { entityId })
            onRotationChange([0, 0, 0])
          }}
          disabled={disabled}
          style={{
            flexShrink: 0,
            padding: '4px 8px',
            fontSize: 11,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          Reset
        </button>
      </div>
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
