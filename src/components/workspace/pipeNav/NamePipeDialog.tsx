import Modal from '@/components/Modal'
import { theme } from '@/config/theme'

export interface NamePipeDialogProps {
  open: boolean
  title: string
  name: string
  onNameChange: (name: string) => void
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
}

export default function NamePipeDialog({
  open,
  title,
  name,
  onNameChange,
  onConfirm,
  onCancel,
  confirmLabel = 'Create',
}: NamePipeDialogProps) {
  return (
    <Modal isOpen={open} onClose={onCancel} title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 280 }}>
        <label style={{ fontSize: 12, color: theme.text.secondary }}>
          Pipe name
          <input
            autoFocus
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) onConfirm()
            }}
            placeholder="e.g. Follower car"
            style={{
              display: 'block',
              width: '100%',
              marginTop: 6,
              padding: '8px 10px',
              borderRadius: 6,
              border: `1px solid ${theme.pipeNav.accentBorder}`,
              background: theme.bg.input,
              color: theme.text.primary,
              fontSize: 13,
            }}
          />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onCancel} style={secondaryBtn}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={onConfirm}
            style={{
              ...primaryBtn,
              opacity: name.trim() ? 1 : 0.5,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}

const secondaryBtn = {
  padding: '6px 14px',
  borderRadius: 6,
  border: 'none',
  background: 'transparent',
  color: theme.text.muted,
  cursor: 'pointer',
} as const

const primaryBtn = {
  padding: '6px 14px',
  borderRadius: 6,
  border: 'none',
  background: theme.pipeNav.accent,
  color: '#1a1a1a',
  fontWeight: 700,
  cursor: 'pointer',
} as const
