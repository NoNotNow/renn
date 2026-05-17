import { useEffect, useState } from 'react'
import Modal from '@/components/Modal'
import { theme } from '@/config/theme'

export type WorkspaceConflictChoice = 'overwrite' | 'rename'

export interface WorkspaceConflictDialogProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  message: string
  conflictingId: string
  onResolve: (choice: WorkspaceConflictChoice, newId?: string) => void
}

/**
 * When copying or promoting registry items, the target ID may already exist.
 * Overwrite replaces the definition; Rename lets the user confirm a different ID.
 */
export default function WorkspaceConflictDialog({
  isOpen,
  onClose,
  title = 'ID already exists',
  message,
  conflictingId,
  onResolve,
}: WorkspaceConflictDialogProps) {
  const [renameDraft, setRenameDraft] = useState(conflictingId)

  useEffect(() => {
    if (isOpen) setRenameDraft(`${conflictingId}_copy`)
  }, [isOpen, conflictingId])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} width={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ margin: 0, fontSize: 13, color: theme.text.secondary, lineHeight: 1.45 }}>{message}</p>
        <div
          style={{
            padding: '8px 10px',
            borderRadius: 6,
            background: theme.bg.panelAlt,
            border: `1px solid ${theme.border.default}`,
            fontSize: 12,
            fontFamily: 'ui-monospace, monospace',
            color: theme.text.primary,
          }}
        >
          {conflictingId}
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: theme.text.muted }}>
          New ID (when choosing Rename)
          <input
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: `1px solid ${theme.border.default}`,
              background: theme.bg.panel,
              color: theme.text.primary,
              fontSize: 13,
            }}
            data-testid="workspace-conflict-rename-input"
          />
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: `1px solid ${theme.border.default}`,
              background: theme.bg.surface,
              color: theme.text.primary,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onResolve('overwrite')}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: `1px solid ${theme.border.default}`,
              background: 'rgba(201, 162, 39, 0.12)',
              color: theme.text.warning,
              cursor: 'pointer',
              fontSize: 12,
            }}
            data-testid="workspace-conflict-overwrite"
          >
            Overwrite
          </button>
          <button
            type="button"
            onClick={() => {
              const next = renameDraft.trim()
              if (!next) return
              onResolve('rename', next)
            }}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: `1px solid ${theme.feedback.successBorder}`,
              background: theme.feedback.successBg,
              color: theme.feedback.successText,
              cursor: 'pointer',
              fontSize: 12,
            }}
            data-testid="workspace-conflict-rename"
          >
            Rename & continue
          </button>
        </div>
      </div>
    </Modal>
  )
}
