import type { Vec3, MaterialRef } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { clampUnit } from '@/utils/numberUtils'
import { colorToHex, hexToColor } from '@/utils/colorUtils'
import NumberInput from './form/NumberInput'
import { sidebarRowStyle, sidebarLabelStyle } from './sharedStyles'

export interface MaterialEditorProps {
  entityId: string
  material: MaterialRef | undefined
  onMaterialChange: (material: MaterialRef) => void
  disabled?: boolean
}

export default function MaterialEditor({
  entityId,
  material,
  onMaterialChange,
  disabled = false,
}: MaterialEditorProps) {
  const color: Vec3 = (material?.color ?? [0.7, 0.7, 0.7]).slice(0, 3) as Vec3
  const roughness = material?.roughness ?? 0.5
  const metalness = material?.metalness ?? 0
  const colorHex = colorToHex(color)

  return (
    <>
      <h4 style={{ margin: '12px 0 8px' }}>Material</h4>
      <div style={sidebarRowStyle}>
        <label htmlFor={`${entityId}-material-color`} style={sidebarLabelStyle}>
          Color
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            id={`${entityId}-material-color`}
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
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
            disabled={disabled}
          />
          <span style={{ fontSize: 12, color: '#9aa4b2' }}>
            {color.map((c) => clampUnit(c).toFixed(2)).join(', ')}
          </span>
        </div>
      </div>
      <NumberInput
        id={`${entityId}-roughness`}
        label="Roughness"
        value={roughness}
        onChange={(value) => onMaterialChange({ ...material, roughness: value })}
        min={0}
        max={1}
        step={0.1}
        defaultValue={0.5}
        disabled={disabled}
        entityId={entityId}
        propertyName="roughness"
      />
      <NumberInput
        id={`${entityId}-metalness`}
        label="Metalness"
        value={metalness}
        onChange={(value) => onMaterialChange({ ...material, metalness: value })}
        min={0}
        max={1}
        step={0.1}
        defaultValue={0}
        disabled={disabled}
        entityId={entityId}
        propertyName="metalness"
      />
    </>
  )
}
