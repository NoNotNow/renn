import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { theme } from '@/config/theme'
import { entityPanelIconButtonStyle } from './sharedStyles'
import { EntityPanelIcons } from './EntityPanelIcons'
import { extractJsonErrorPosition, lineColFromPosition } from '@/utils/jsonParseErrorLocation'
import { jsonTextareaRows } from '@/utils/jsonTextareaRows'

/**
 * Result of an optional content-level (e.g. schema) validation run on the parsed JSON.
 * `error` is shown to the user; Apply is disabled when `ok` is false.
 */
export type JsonContentValidation = { ok: true } | { ok: false; error: string }

export interface ValidatedJsonTextareaProps {
  /**
   * Serialized JSON used to seed the editor. Resynced when this string changes.
   * Callers that want to preserve unapplied user edits should keep this stable
   * (e.g. compute it only when an external "open" / "entity-id" signal changes).
   */
  value: string
  /** Called with the successfully parsed value when the user clicks Apply. */
  onApply: (parsed: unknown) => void
  /** Optional content-level validator run on the parsed value after JSON.parse succeeds. */
  validate?: (parsed: unknown) => JsonContentValidation
  disabled?: boolean
  /** Apply control rendering: full-width text button (default) or compact icon button. */
  applyVariant?: 'text' | 'icon'
  /**
   * With `applyVariant="icon"`, optional content shown in the same row as the apply button,
   * left of it, using remaining width (e.g. live I/O summaries).
   */
  applyRowAccessory?: ReactNode
  /** Label for the text-variant Apply button. */
  applyLabel?: string
  textareaTestId?: string
  applyTestId?: string
}

const baseTextareaStyle: CSSProperties = {
  margin: 0,
  padding: 8,
  background: theme.bg.codeOverlay,
  borderRadius: 4,
  fontSize: 11,
  overflow: 'auto',
  fontFamily: 'monospace',
  whiteSpace: 'pre',
  resize: 'vertical',
  width: '100%',
  boxSizing: 'border-box',
}

export default function ValidatedJsonTextarea({
  value,
  onApply,
  validate,
  disabled = false,
  applyVariant = 'text',
  applyRowAccessory,
  applyLabel = 'Apply',
  textareaTestId,
  applyTestId,
}: ValidatedJsonTextareaProps) {
  const [draft, setDraft] = useState<string>(value)
  const [parsed, setParsed] = useState<unknown>(() => safeInitialParse(value))
  const [parseError, setParseError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(value)
    setParsed(safeInitialParse(value))
    setParseError(null)
  }, [value])

  const isParseValid = parseError === null
  const contentResult: JsonContentValidation | null =
    isParseValid && validate ? validate(parsed) : null
  const canApply = !disabled && isParseValid && (contentResult === null || contentResult.ok)

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value
    setDraft(next)
    try {
      const p = JSON.parse(next) as unknown
      setParsed(p)
      setParseError(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setParseError(msg || 'Invalid JSON')
      setParsed(null)
    }
  }

  const onApplyClick = () => {
    if (!canApply) return
    onApply(parsed)
  }

  const pos = parseError ? extractJsonErrorPosition(parseError) : null
  const { line, col, lineText } =
    pos != null ? lineColFromPosition(draft, pos) : { line: 0, col: 0, lineText: '' }

  const textareaStyle: CSSProperties = {
    ...baseTextareaStyle,
    color: isParseValid ? theme.text.secondary : theme.text.error,
    border: `1px solid ${isParseValid ? theme.border.default : theme.border.error}`,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <textarea
        value={draft}
        onChange={onChange}
        disabled={disabled}
        rows={jsonTextareaRows(draft)}
        style={textareaStyle}
        spellCheck={false}
        data-testid={textareaTestId}
      />

      {!isParseValid && parseError ? (
        <div style={{ fontSize: 10, color: theme.text.error }}>
          <div>Invalid JSON: {parseError}</div>
          {pos != null ? (
            <pre style={{ margin: '6px 0 0', color: theme.text.error, fontFamily: 'monospace' }}>
              {`Line ${line}, Col ${col}\n${lineText}\n${' '.repeat(Math.max(0, col - 1))}^`}
            </pre>
          ) : null}
        </div>
      ) : null}

      {isParseValid && contentResult && contentResult.ok === false ? (
        <div style={{ fontSize: 10, color: theme.text.error }}>
          <div>Validation error:</div>
          <pre style={{ margin: '6px 0 0', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
            {contentResult.error}
          </pre>
        </div>
      ) : null}

      {applyVariant === 'icon' ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            minWidth: 0,
          }}
        >
          <div
            style={{
              flex: '1 1 auto',
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            {applyRowAccessory}
          </div>
          <button
            type="button"
            onClick={onApplyClick}
            disabled={!canApply}
            title="Apply"
            aria-label="Apply configuration"
            style={{
              ...entityPanelIconButtonStyle,
              flexShrink: 0,
              background: canApply ? theme.button.info : theme.bg.surface,
              border: `1px solid ${canApply ? theme.button.infoBorder : theme.button.disabledBorder}`,
              color: canApply ? theme.text.accentBlue : theme.text.disabled,
              cursor: canApply ? 'pointer' : 'not-allowed',
            }}
            data-testid={applyTestId}
          >
            {EntityPanelIcons.check}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={onApplyClick}
            disabled={!canApply}
            aria-label={applyLabel}
            data-testid={applyTestId}
            style={{
              padding: '6px 12px',
              background: canApply ? theme.button.info : theme.bg.surface,
              border: `1px solid ${canApply ? theme.button.infoBorder : theme.button.disabledBorder}`,
              color: canApply ? theme.text.accentBlue : theme.text.disabled,
              borderRadius: 6,
              cursor: canApply ? 'pointer' : 'not-allowed',
              fontSize: 12,
            }}
          >
            {applyLabel}
          </button>
        </div>
      )}
    </div>
  )
}

function safeInitialParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}
