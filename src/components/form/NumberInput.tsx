import { parseNumberInput } from '@/utils/numberUtils'
import { uiLogger } from '@/utils/uiLogger'
import { sidebarRowStyle, sidebarLabelStyle, sidebarInputStyle } from '../sharedStyles'

export interface NumberInputProps {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  defaultValue?: number
  disabled?: boolean
  entityId?: string
  propertyName?: string
  logComponent?: string
}

export default function NumberInput({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 0.1,
  defaultValue = 0,
  disabled = false,
  entityId,
  propertyName,
  logComponent = 'PropertyPanel',
}: NumberInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseNumberInput(e.target.value, defaultValue)
    
    if (propertyName && entityId) {
      uiLogger.change(logComponent, `Change ${propertyName}`, {
        entityId,
        oldValue: value,
        newValue,
      })
    }
    
    onChange(newValue)
  }

  return (
    <div style={sidebarRowStyle}>
      <label htmlFor={id} style={sidebarLabelStyle}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        style={sidebarInputStyle}
        disabled={disabled}
      />
    </div>
  )
}
