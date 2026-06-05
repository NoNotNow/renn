import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PresetTransformerType, TransformerDef } from '@/types/transformer'
import ValidatedJsonTextarea from '@/components/ValidatedJsonTextarea'
import TransformerTemplateDialog from '@/components/TransformerTemplateDialog'
import TransformerFieldReference from '@/components/TransformerFieldReference'
import { EntityPanelIcons } from '@/components/EntityPanelIcons'
import { fieldLabelStyle, entityPanelIconButtonStyle } from '@/components/sharedStyles'
import { theme } from '@/config/theme'
import {
  TRANSFORMER_PRESET_OPTIONS,
  getDefaultTransformerConfig,
  isPresetTransformerType,
} from '@/transformers/transformerPresets'
import { sortAndSyncPriorities } from '@/transformers/transformerUtils'
import { effectiveCustomTransformerCode, validateCustomTransformerSource } from '@/transformers/customCodeTransformer'
import type { WorkspaceMonacoPayload } from '@/types/workspace'
import TransformerCodeErrorOverlay from '@/components/workspace/TransformerCodeErrorOverlay'
import { useDebouncedCompileErrorDisplay } from '@/hooks/useDebouncedCompileErrorDisplay'

const CODE_DEBOUNCE_MS = 350

function supportsTemplatePickers(type: string): boolean {
  return isPresetTransformerType(type) && type !== 'custom'
}

export interface WorkspaceGlobalTransformerPanelProps {
  itemId: string
  def: TransformerDef | undefined
  onDefChange: (next: TransformerDef) => void
  setMonacoPayload: (payload: WorkspaceMonacoPayload) => void
  monacoSlot: ReactNode
}

export default function WorkspaceGlobalTransformerPanel({
  itemId,
  def,
  onDefChange,
  setMonacoPayload,
  monacoSlot,
}: WorkspaceGlobalTransformerPanelProps) {
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [fieldRefOpen, setFieldRefOpen] = useState(false)
  const [codeDraft, setCodeDraft] = useState('')
  const codeColumnRef = useRef<HTMLDivElement>(null)
  const debounceTimerRef = useRef<number | null>(null)
  const defRef = useRef(def)
  defRef.current = def
  const codeDraftRef = useRef(codeDraft)
  codeDraftRef.current = codeDraft

  const onDefChangeRef = useRef(onDefChange)
  onDefChangeRef.current = onDefChange

  const flushPendingCode = useCallback(() => {
    if (debounceTimerRef.current != null) {
      window.clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    const d = defRef.current
    if (!d || d.type !== 'custom') return
    const text = codeDraftRef.current
    if (text === effectiveCustomTransformerCode(d)) return
    onDefChangeRef.current({ ...d, code: text })
  }, [])

  useEffect(() => () => flushPendingCode(), [flushPendingCode])

  const syncCodeKey =
    def?.type === 'custom' ? `${itemId}:${def.code ?? ''}:${def.name ?? ''}` : `${itemId}:noncustom`

  useEffect(() => {
    if (def?.type !== 'custom') {
      setCodeDraft('')
      return
    }
    setCodeDraft(effectiveCustomTransformerCode(def))
  }, [syncCodeKey, def])

  const scheduleCodeCommit = useCallback((text: string) => {
    if (debounceTimerRef.current != null) window.clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null
      const d = defRef.current
      if (d?.type !== 'custom') return
      if (text === effectiveCustomTransformerCode(d)) return
      onDefChangeRef.current({ ...d, code: text })
    }, CODE_DEBOUNCE_MS)
  }, [])

  const handleCodeChange = useCallback(
    (text: string) => {
      setCodeDraft(text)
      scheduleCodeCommit(text)
    },
    [scheduleCodeCommit],
  )

  const monacoIsCustom = Boolean(def?.type === 'custom')
  const monacoPayload = useMemo(() => {
    if (monacoIsCustom) {
      return {
        kind: 'transformer-ts' as const,
        value: codeDraft,
        onChange: handleCodeChange,
        disabled: false,
        refreshKey: 0,
        beforeRefresh: flushPendingCode,
      }
    }
    return {
      kind: 'placeholder' as const,
      value:
        '// Global library: select a custom transformer or switch type to custom to edit TypeScript.\n',
      onChange: () => {},
      disabled: true,
      refreshKey: 0,
      beforeRefresh: flushPendingCode,
    }
  }, [codeDraft, handleCodeChange, monacoIsCustom, flushPendingCode])

  useLayoutEffect(() => {
    setMonacoPayload(monacoPayload)
  }, [monacoPayload, setMonacoPayload])

  const compileError =
    def?.type === 'custom' ? validateCustomTransformerSource(codeDraft, `global:${itemId}`) : null

  const displayedCompileError = useDebouncedCompileErrorDisplay(compileError, codeColumnRef)

  if (!def) {
    return (
      <div style={{ padding: 16, color: theme.text.muted, fontSize: 13 }} data-testid="workspace-global-tf-missing">
        Global transformer <strong style={{ color: theme.text.secondary }}>{itemId}</strong> was not found in the library.
      </div>
    )
  }

  return (
    <div
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      data-testid="workspace-global-transformer-panel"
    >
      <div
        style={{
          flexShrink: 0,
          padding: '10px 0 12px',
          borderBottom: `1px solid ${theme.border.default}`,
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 12, color: theme.text.infoSubtle, marginBottom: 10, lineHeight: 1.45 }}>
          <strong style={{ color: theme.text.primary }}>Global library</strong> · {itemId}. Saved to IndexedDB (not in world
          JSON). Copy to the project in Organize to assign to entities.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: theme.text.secondary }}>
            Type
            <select
              value={def.type}
              onChange={(e) => {
                flushPendingCode()
                const t = e.target.value
                onDefChange(getDefaultTransformerConfig(t) as TransformerDef)
              }}
              style={{
                marginLeft: 8,
                padding: '6px 8px',
                borderRadius: 6,
                border: `1px solid ${theme.border.default}`,
                background: theme.bg.panelAlt,
                color: theme.text.primary,
                fontSize: 12,
              }}
              data-testid="workspace-global-tf-type"
            >
              {TRANSFORMER_PRESET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, color: theme.text.secondary, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={def.enabled !== false}
              onChange={() => onDefChange({ ...def, enabled: def.enabled === false })}
            />
            Enabled
          </label>
          <label style={{ fontSize: 12, color: theme.text.secondary }}>
            Priority
            <input
              type="number"
              value={def.priority ?? 10}
              onChange={(e) => onDefChange({ ...def, priority: Number(e.target.value) })}
              style={{
                marginLeft: 6,
                width: 64,
                padding: 4,
                borderRadius: 4,
                border: `1px solid ${theme.border.default}`,
                background: theme.bg.panelAlt,
                color: theme.text.primary,
              }}
            />
          </label>
        </div>
      </div>

      {def.type === 'custom' ? (
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: theme.text.secondary }}>
            Display name
            <input
              type="text"
              value={def.name ?? ''}
              onChange={(e) => onDefChange({ ...def, name: e.target.value })}
              style={{
                marginLeft: 8,
                minWidth: 200,
                padding: '6px 8px',
                borderRadius: 6,
                border: `1px solid ${theme.border.default}`,
                background: theme.bg.panelAlt,
                color: theme.text.primary,
              }}
            />
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <button type="button" onClick={() => setTemplateDialogOpen(true)} style={entityPanelIconButtonStyle}>
              Templates…
            </button>
            <button
              type="button"
              onClick={() => setFieldRefOpen((o) => !o)}
              style={{
                ...entityPanelIconButtonStyle,
                color: theme.text.accentBlue,
                border: `1px solid ${fieldRefOpen ? theme.button.infoActiveBorder : theme.button.infoBorder}`,
                background: fieldRefOpen ? theme.button.infoActive : theme.button.info,
              }}
              title="Field reference"
            >
              {EntityPanelIcons.document}
            </button>
          </div>
          {fieldRefOpen && isPresetTransformerType(def.type) ?
            <div style={{ marginTop: 4 }}>
              <TransformerFieldReference transformerType={def.type as PresetTransformerType} />
            </div>
          : null}
          <div style={{ ...fieldLabelStyle, marginTop: 4 }}>Params (JSON)</div>
          <ValidatedJsonTextarea
            value={JSON.stringify(def.params ?? {}, null, 2)}
            onApply={(updated) => {
              const patch =
                typeof updated === 'object' && updated !== null && !Array.isArray(updated) ? (updated as Record<string, unknown>) : {}
              onDefChange({ ...def, params: patch })
            }}
            disabled={false}
            applyVariant="icon"
            textareaTestId="workspace-global-tf-params"
            applyTestId="workspace-global-tf-params-apply"
          />
        </div>
      ) : (
        <div style={{ flexShrink: 0, marginBottom: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            {supportsTemplatePickers(def.type) ?
              <button type="button" onClick={() => setTemplateDialogOpen(true)} style={entityPanelIconButtonStyle}>
                Load template…
              </button>
            : null}
            <button
              type="button"
              onClick={() => setFieldRefOpen((o) => !o)}
              style={{
                ...entityPanelIconButtonStyle,
                color: theme.text.accentBlue,
                border: `1px solid ${fieldRefOpen ? theme.button.infoActiveBorder : theme.button.infoBorder}`,
                background: fieldRefOpen ? theme.button.infoActive : theme.button.info,
              }}
              title="Field reference"
            >
              {EntityPanelIcons.document}
            </button>
          </div>
          {fieldRefOpen && isPresetTransformerType(def.type) ?
            <div style={{ marginBottom: 8 }}>
              <TransformerFieldReference transformerType={def.type as PresetTransformerType} />
            </div>
          : null}
        </div>
      )}

      <div
        ref={codeColumnRef}
        style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{monacoSlot}</div>
        {def.type === 'custom' ?
          <TransformerCodeErrorOverlay compileError={displayedCompileError} compileErrorTestId="workspace-global-tf-compile-error" />
        : null}
      </div>

      {templateDialogOpen && (def.type === 'custom' || supportsTemplatePickers(def.type)) ?
        <TransformerTemplateDialog
          isOpen
          onClose={() => setTemplateDialogOpen(false)}
          transformerType={def.type as PresetTransformerType}
          currentConfig={def}
          onLoadTemplate={(config) => {
            onDefChange(sortAndSyncPriorities([config as TransformerDef])[0]!)
            setTemplateDialogOpen(false)
          }}
        />
      : null}
    </div>
  )
}
