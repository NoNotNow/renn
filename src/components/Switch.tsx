export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}

export default function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: SwitchProps) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {label != null && <span>{label}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          border: '1px solid #2f3545',
          background: checked ? '#2f9d6a' : '#2a303d',
          cursor: disabled ? 'not-allowed' : 'pointer',
          position: 'relative',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 20 : 2,
            width: 16,
            height: 16,
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
