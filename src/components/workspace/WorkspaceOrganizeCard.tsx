import type { CSSProperties } from 'react'
import { theme } from '@/config/theme'

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 12,
  borderRadius: 8,
  border: `1px solid ${theme.border.default}`,
  background: theme.bg.panelAlt,
  minWidth: 0,
}

const actionRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}

const smallBtn = (primary?: boolean): CSSProperties => ({
  padding: '4px 10px',
  borderRadius: 5,
  border: `1px solid ${primary ? theme.feedback.successBorder : theme.border.default}`,
  background: primary ? theme.feedback.successBg : theme.bg.surface,
  color: primary ? theme.feedback.successText : theme.text.primary,
  cursor: 'pointer',
  fontSize: 11,
})

export interface WorkspaceOrganizeCardProps {
  title: string
  subtitle: string
  usageLine: string
  assignments: { id: string; name: string }[]
  showAssign: boolean
  showDetach: boolean
  showDelete: boolean
  showCopy: boolean
  showRename: boolean
  showPromote?: boolean
  onEdit: () => void
  onAssign: () => void
  onDetach: () => void
  onCopy: () => void
  onRename: () => void
  onDelete: () => void
  onPromote?: () => void
  onSelectEntity?: (id: string) => void
  testId?: string
}

export default function WorkspaceOrganizeCard({
  title,
  subtitle,
  usageLine,
  assignments,
  showAssign,
  showDetach,
  showDelete,
  showCopy,
  showRename,
  showPromote = false,
  onEdit,
  onAssign,
  onDetach,
  onCopy,
  onRename,
  onDelete,
  onPromote,
  onSelectEntity,
  testId,
}: WorkspaceOrganizeCardProps) {
  return (
    <div style={cardStyle} data-testid={testId}>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: theme.text.primary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={title}
        >
          {title}
        </div>
        <div style={{ fontSize: 11, color: theme.text.muted, marginTop: 2 }}>{subtitle}</div>
        <div style={{ fontSize: 11, color: theme.text.secondary, marginTop: 6 }}>{usageLine}</div>
      </div>
      {assignments.length > 0 && (
        <div
          style={{
            fontSize: 11,
            color: theme.text.dim,
            lineHeight: 1.4,
            maxHeight: 56,
            overflow: 'auto',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0 4px',
          }}
        >
          {assignments.map((u, i) => (
            <span key={u.id}>
              <button
                type="button"
                onClick={() => onSelectEntity?.(u.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  margin: 0,
                  fontSize: 'inherit',
                  color: onSelectEntity ? theme.accent : 'inherit',
                  cursor: onSelectEntity ? 'pointer' : 'default',
                  textDecoration: onSelectEntity ? 'underline' : 'none',
                  textAlign: 'left',
                }}
                title={`Select entity: ${u.name} (${u.id})`}
              >
                {u.name}
              </button>
              {i < assignments.length - 1 ? ',' : ''}
            </span>
          ))}
        </div>
      )}
      <div style={actionRowStyle}>
        <button type="button" onClick={onEdit} style={smallBtn(true)} data-testid={testId ? `${testId}-edit` : undefined}>
          Edit
        </button>
        {showCopy && (
          <button type="button" onClick={onCopy} style={smallBtn()} data-testid={testId ? `${testId}-copy` : undefined}>
            Copy
          </button>
        )}
        {showRename && (
          <button type="button" onClick={onRename} style={smallBtn()} data-testid={testId ? `${testId}-rename` : undefined}>
            Rename
          </button>
        )}
        {showPromote && onPromote && (
          <button
            type="button"
            onClick={onPromote}
            style={smallBtn()}
            data-testid={testId ? `${testId}-promote` : undefined}
          >
            Promote
          </button>
        )}
        {showAssign && (
          <button type="button" onClick={onAssign} style={smallBtn()} data-testid={testId ? `${testId}-assign` : undefined}>
            Assign
          </button>
        )}
        {showDetach && (
          <button type="button" onClick={onDetach} style={smallBtn()} data-testid={testId ? `${testId}-detach` : undefined}>
            Detach
          </button>
        )}
        {showDelete && (
          <button
            type="button"
            onClick={onDelete}
            style={{
              ...smallBtn(),
              borderColor: theme.border.destructive,
              color: theme.text.destructive,
            }}
            data-testid={testId ? `${testId}-delete` : undefined}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
