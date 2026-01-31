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
          border: '1px solid #888',
          background: checked ? '#4a9' : '#ccc',
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
            background: '#fff',
            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
            transition: 'left 0.15s ease',
          }}
        />
      </button>
    </label>
  )
}
