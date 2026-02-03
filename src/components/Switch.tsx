export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
  size?: 'normal' | 'compact'
}

export default function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  size = 'normal',
}: SwitchProps) {
  const isCompact = size === 'compact'
  const buttonWidth = isCompact ? 32 : 40
  const buttonHeight = isCompact ? 18 : 22
  const knobSize = isCompact ? 12 : 16
  const knobOffset = 2
  const knobCheckedLeft = buttonWidth - knobSize - knobOffset
  const fontSize = isCompact ? 12 : 14
  const gap = isCompact ? 4 : 6

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap }}>
      {label != null && <span style={{ fontSize }}>{label}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={{
          width: buttonWidth,
          height: buttonHeight,
          borderRadius: buttonHeight / 2,
          border: '1px solid #2f3545',
          background: checked ? '#2f9d6a' : '#2a303d',
          cursor: disabled ? 'not-allowed' : 'pointer',
          position: 'relative',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: knobOffset,
            left: checked ? knobCheckedLeft : knobOffset,
            width: knobSize,
            height: knobSize,
            borderRadius: '50%',
            background: '#e6e9f2',
            boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
            transition: 'left 0.15s ease',
          }}
        />
      </button>
    </label>
  )
}
