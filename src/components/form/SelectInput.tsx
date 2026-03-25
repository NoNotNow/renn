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
  onBeforeCommit?: () => void
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
  onBeforeCommit,
}: SelectInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value
    if (newValue === value) return

    if (propertyName && entityId) {
      uiLogger.change(logComponent, `Change ${propertyName}`, {
        entityId,
        oldValue: value,
        newValue,
      })
    }

    onBeforeCommit?.()
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
