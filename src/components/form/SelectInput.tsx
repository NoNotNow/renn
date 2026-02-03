import { uiLogger } from '@/utils/uiLogger'
import { sidebarRowStyle, sidebarLabelStyle, sidebarInputStyle } from '../sharedStyles'

export interface SelectInputProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  disabled?: boolean
  entityId?: string
  propertyName?: string
  logComponent?: string
}

export default function SelectInput({
  id,
  label,
  value,
  onChange,
  options,
  disabled = false,
  entityId,
  propertyName,
  logComponent = 'PropertyPanel',
}: SelectInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value
    
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
      <select
        id={id}
        value={value}
        onChange={handleChange}
        style={sidebarInputStyle}
        disabled={disabled}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
