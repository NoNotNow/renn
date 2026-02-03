import type { Vec3, MaterialRef } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'

const labelStyle = { display: 'block', marginBottom: 8 }
const inputStyle = { display: 'block', width: '100%' }

const clampUnit = (value: number) => Math.max(0, Math.min(1, value))

const colorToHex = (color: Vec3) => {
  const [r, g, b] = color.map((c) => Math.round(clampUnit(c) * 255)) as Vec3
  return `#${[r, g, b]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`
}

const hexToColor = (hex: string): Vec3 => {
  const sanitized = hex.replace('#', '')
  if (sanitized.length !== 6) {
    return [0.7, 0.7, 0.7]
  }
  const r = parseInt(sanitized.slice(0, 2), 16) / 255
  const g = parseInt(sanitized.slice(2, 4), 16) / 255
  const b = parseInt(sanitized.slice(4, 6), 16) / 255
  return [r, g, b]
}

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
  const colorHex = colorToHex(color)

  return (
    <>
      <h4 style={{ margin: '12px 0 8px' }}>Material</h4>
      <label style={labelStyle}>
        Color
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="color"
            value={colorHex}
            onChange={(e) => {
              const next = hexToColor(e.target.value)
              uiLogger.change('PropertyPanel', 'Change color', { entityId, oldValue: color, newValue: next })
              onMaterialChange({ ...material, color: next })
            }}
            aria-label="Material color"
            style={{
              width: 28,
              height: 22,
              padding: 0,
              borderRadius: 4,
              border: '1px solid #2f3545',
              background: 'transparent',
              cursor: 'pointer',
            }}
          />
          <span style={{ fontSize: 12, color: '#9aa4b2' }}>
            {color.map((c) => clampUnit(c).toFixed(2)).join(', ')}
          </span>
        </div>
      </label>
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
