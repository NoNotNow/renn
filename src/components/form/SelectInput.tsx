import { uiLogger } from '@/utils/uiLogger'
import { sidebarRowStyle, sidebarLabelStyle, sidebarInputStyle } from '../sharedStyles'

export interface SelectInputProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  /** When set, adds a first `<option value="">` for mixed / unset multi-select. */
  emptyLabel?: string
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
  emptyLabel,
  disabled = false,
  entityId,
  propertyName,
  logComponent = 'PropertyPanel',
  onBeforeCommit,
}: SelectInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value
    if (newValue === '' && emptyLabel !== undefined) return
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
        {emptyLabel !== undefined && (
          <option value="" disabled={false}>
            {emptyLabel}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
