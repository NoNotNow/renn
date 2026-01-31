import type { Vec3, MaterialRef } from '@/types/world'
import Vec3Field from './Vec3Field'
import { uiLogger } from '@/utils/uiLogger'

const labelStyle = { display: 'block', marginBottom: 8 }
const inputStyle = { display: 'block', width: '100%' }

export interface MaterialEditorProps {
  entityId: string
  material: MaterialRef | undefined
  onMaterialChange: (material: MaterialRef) => void
}

export default function MaterialEditor({
  entityId,
  material,
  onMaterialChange,
}: MaterialEditorProps) {
  const color: Vec3 = (material?.color ?? [0.7, 0.7, 0.7]).slice(0, 3) as Vec3
  const roughness = material?.roughness ?? 0.5
  const metalness = material?.metalness ?? 0

  return (
    <>
      <h4 style={{ margin: '12px 0 8px' }}>Material</h4>
      <Vec3Field
        label="Color (R, G, B 0–1)"
        value={color}
        onChange={(c) => {
          uiLogger.change('PropertyPanel', 'Change color', { entityId, oldValue: color, newValue: c })
          onMaterialChange({ ...material, color: c })
        }}
        min={0}
        max={1}
        step={0.01}
        sensitivity={0.005}
        axisLabels={['R', 'G', 'B']}
        idPrefix={`${entityId}-color`}
      />
      <label style={labelStyle}>
        Roughness
        <input
          type="number"
          min={0}
          max={1}
          step={0.1}
          value={roughness}
          onChange={(e) => {
            const newValue = parseFloat(e.target.value) ?? 0.5
            uiLogger.change('PropertyPanel', 'Change roughness', { entityId, oldValue: roughness, newValue })
            onMaterialChange({ ...material, roughness: newValue })
          }}
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        Metalness
        <input
          type="number"
          min={0}
          max={1}
          step={0.1}
          value={metalness}
          onChange={(e) => {
            const newValue = parseFloat(e.target.value) ?? 0
            uiLogger.change('PropertyPanel', 'Change metalness', { entityId, oldValue: metalness, newValue })
            onMaterialChange({ ...material, metalness: newValue })
          }}
          style={inputStyle}
        />
      </label>
    </>
  )
}
