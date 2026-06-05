import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import Modal from '@/components/Modal'
import { theme } from '@/config/theme'

export interface AssignEntity {
  id: string
  name?: string
}

export interface AssignEntitiesDialogProps {
  isOpen: boolean
  onClose: () => void
  title: string
  entities: AssignEntity[]
  initialSelection: Set<string>
  onApply: (selection: Set<string>) => void
  subheaderExtra?: ReactNode
  searchPlaceholder?: string
  emptyMessageNoMatch?: string
  emptyMessageNoEntities?: string
}

const SUBTAB_BTN: CSSProperties = {
  padding: '6px 12px',
  borderRadius: 6,
  border: `1px solid ${theme.border.default}`,
  background: theme.bg.surface,
  color: theme.text.primary,
  cursor: 'pointer',
  fontSize: 12,
}

function applyButtonStyle(): CSSProperties {
  return {
    ...SUBTAB_BTN,
    borderBottom: `2px solid ${theme.accent}`,
    marginBottom: -1,
    fontWeight: 600,
    background: 'rgba(43, 53, 80, 0.28)',
  }
}

export default function AssignEntitiesDialog({
  isOpen,
  onClose,
  title,
  entities,
  initialSelection,
  onApply,
  subheaderExtra,
  searchPlaceholder = 'Search entities by name or ID...',
  emptyMessageNoMatch = 'No entities match your search.',
  emptyMessageNoEntities = 'No entities in this world.',
}: AssignEntitiesDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selection, setSelection] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('')
      return
    }
    setSelection(new Set(initialSelection))
  }, [isOpen, initialSelection])

  const filteredEntities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return entities
    return entities.filter((e) => {
      const name = (e.name ?? '').toLowerCase()
      const id = e.id.toLowerCase()
      return name.includes(q) || id.includes(q)
    })
  }, [entities, searchQuery])

  const handleApply = () => {
    onApply(selection)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      width={520}
      height={640}
      subheader={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search entities"
              data-testid="assign-entities-search"
              autoFocus
              style={{
                width: '100%',
                padding: searchQuery ? '9px 34px 9px 34px' : '9px 12px 9px 34px',
                borderRadius: 8,
                background: theme.bg.input,
                border: `1px solid ${theme.border.default}`,
                color: theme.text.primary,
                fontSize: 13,
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            <span
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: theme.text.muted,
                pointerEvents: 'none',
                display: 'flex',
              }}
              aria-hidden
            >
              <svg
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </span>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                title="Clear search"
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: theme.text.muted,
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                  fontSize: 16,
                }}
              >
                ×
              </button>
            )}
          </div>
          {subheaderExtra}
        </div>
      }
      footer={
        <div
          data-testid="assign-entities-footer"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
        >
          <span style={{ fontSize: 12, color: theme.text.muted }} data-testid="assign-entities-count">
            {selection.size} selected
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={SUBTAB_BTN}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              data-testid="assign-entities-apply"
              style={applyButtonStyle()}
            >
              Apply
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', minHeight: 0 }}>
        {filteredEntities.length === 0 ? (
          <div
            style={{
              fontSize: 13,
              color: theme.text.muted,
              padding: '24px 4px',
              textAlign: 'center',
            }}
          >
            {searchQuery ? emptyMessageNoMatch : emptyMessageNoEntities}
          </div>
        ) : (
          filteredEntities.map((e) => {
            const checked = selection.has(e.id)
            return (
              <label
                key={e.id}
                data-testid={`assign-entity-${e.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: `1px solid ${checked ? theme.button.primaryBorder : theme.border.default}`,
                  background: checked ? theme.bg.primarySubtle : theme.bg.section,
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'background-color 0.12s ease, border-color 0.12s ease',
                }}
                onMouseEnter={(ev) => {
                  if (!checked) ev.currentTarget.style.background = theme.bg.listHover
                }}
                onMouseLeave={(ev) => {
                  if (!checked) ev.currentTarget.style.background = theme.bg.section
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    setSelection((prev) => {
                      const next = new Set(prev)
                      if (next.has(e.id)) next.delete(e.id)
                      else next.add(e.id)
                      return next
                    })
                  }}
                />
                <span style={{ fontSize: 13, color: theme.text.primary, fontWeight: 500 }}>
                  {e.name ?? e.id}
                </span>
                {e.name && (
                  <span style={{ fontSize: 11, color: theme.text.muted, marginLeft: 'auto' }}>
                    {e.id}
                  </span>
                )}
              </label>
            )
          })
        )}
      </div>
    </Modal>
  )
}
