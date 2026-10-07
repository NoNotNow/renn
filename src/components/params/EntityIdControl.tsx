import { useState, type CSSProperties, type ReactNode } from 'react'
import type { Entity } from '@/types/world'
import { theme } from '@/config/theme'
import EntitySearchPicker from '@/components/entitySearch/EntitySearchPicker'
import { useParamEntities } from './ParamEntityContext'

const chipButton: CSSProperties = {
  padding: '0 6px',
  borderRadius: 4,
  border: `1px solid ${theme.pipeNav.accentMuted}`,
  background: theme.bg.input,
  color: theme.text.secondary,
  fontSize: 11,
  cursor: 'pointer',
}

/** Search popover shared by the single and list controls; only rendered when a world context exists. */
function PickerPopover({
  selectedId,
  onPick,
  testId,
}: {
  selectedId: string | null
  onPick: (id: string) => void
  testId: string
}) {
  const ctx = useParamEntities()
  if (!ctx) return null
  return (
    <div style={{ marginTop: 4, minWidth: 200 }}>
      <EntitySearchPicker
        entities={ctx.entities as Entity[]}
        entityWorkHistory={ctx.entityWorkHistory}
        selectedEntityId={selectedId}
        onSelectEntity={onPick}
        variant="panel"
        autoFocus
        placeholder="Search entities…"
        testId={testId}
      />
    </div>
  )
}

/**
 * `entityId` control: the id text (editable, so ids of entities not in the world still work) plus a picker button
 * that opens the shared entity search. Without a world context only the text input remains.
 */
export function EntityIdPicker({
  id,
  textInput,
  onChange,
  disabled,
  testId,
}: {
  id: string
  /** The plain text input the caller already renders (kept as the no-context fallback). */
  textInput: ReactNode
  onChange?: (id: string) => void
  disabled: boolean
  testId: string
}) {
  const ctx = useParamEntities()
  const [open, setOpen] = useState(false)
  if (!ctx) return <>{textInput}</>
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column' }}>
      <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
        {textInput}
        <button
          type="button"
          data-testid={`${testId}-pick`}
          title="Pick an entity"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          style={chipButton}
        >
          ⌖
        </button>
      </span>
      {open && onChange ?
        <PickerPopover
          selectedId={id || null}
          testId={`${testId}-search`}
          onPick={(picked) => {
            onChange(picked)
            setOpen(false)
          }}
        />
      : null}
    </span>
  )
}

/** List of entity ids: removable chips plus the same search to append. Without a world context a comma list input. */
export function EntityIdListPicker({
  ids,
  textInput,
  onChange,
  disabled,
  testId,
}: {
  ids: string[]
  textInput: ReactNode
  onChange?: (ids: string[]) => void
  disabled: boolean
  testId: string
}) {
  const ctx = useParamEntities()
  const [open, setOpen] = useState(false)
  if (!ctx) return <>{textInput}</>
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3 }}>
      <span data-testid={testId} style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
        {ids.map((id) => (
          <span key={id} style={{ ...chipButton, cursor: 'default', display: 'inline-flex', gap: 3 }}>
            {id}
            {onChange ?
              <button
                type="button"
                data-testid={`${testId}-remove-${id}`}
                title="Remove"
                onClick={() => onChange(ids.filter((x) => x !== id))}
                style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0 }}
              >
                ×
              </button>
            : null}
          </span>
        ))}
        <button
          type="button"
          data-testid={`${testId}-pick`}
          title="Add an entity"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          style={chipButton}
        >
          +
        </button>
      </span>
      {open && onChange ?
        <PickerPopover
          selectedId={null}
          testId={`${testId}-search`}
          onPick={(picked) => {
            if (!ids.includes(picked)) onChange([...ids, picked])
            setOpen(false)
          }}
        />
      : null}
    </span>
  )
}
