import { useState, useCallback, useEffect } from 'react'
import type { PresetTransformerType, TransformerConfig } from '@/types/transformer'
import { listPresetNames, loadPreset } from '@/data/transformerPresets/loader'
import { TRANSFORMER_PRESET_TYPES } from '@/transformers/transformerPresets'
import Modal from './Modal'
import { theme } from '@/config/theme'

export interface TransformerTemplateDialogProps {
  isOpen: boolean
  onClose: () => void
  transformerType: PresetTransformerType
  currentConfig: TransformerConfig
  onLoadTemplate: (config: TransformerConfig) => void
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  background: theme.bg.panelAlt,
  border: `1px solid ${theme.border.default}`,
  color: theme.text.primary,
  fontSize: 14,
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: 12,
  background: theme.bg.codeOverlay,
  border: `1px solid ${theme.border.default}`,
  borderRadius: 4,
  color: theme.text.secondary,
  cursor: 'pointer',
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: theme.text.muted,
  marginBottom: 4,
}

const ghostButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  border: `1px solid ${theme.border.default}`,
  color: theme.text.muted,
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
}

const downloadButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: theme.feedback.successBg,
  border: `1px solid ${theme.feedback.successBorder}`,
  color: theme.feedback.successText,
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
}

const copyButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: theme.button.info,
  border: `1px solid ${theme.button.infoBorder}`,
  color: theme.text.accentBlue,
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
}

export default function TransformerTemplateDialog({
  isOpen,
  onClose,
  transformerType,
  currentConfig,
  onLoadTemplate,
}: TransformerTemplateDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialogType, setDialogType] = useState<PresetTransformerType>(transformerType)
  const [saveExpanded, setSaveExpanded] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [previewText, setPreviewText] = useState('')
  const [previewError, setPreviewError] = useState<string | null>(null)

  const presetNames = listPresetNames(dialogType)
  const filteredIds = presetNames.filter((name) =>
    name.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  useEffect(() => {
    if (isOpen) {
      setDialogType(transformerType)
      setSearchQuery('')
      setSelectedId(null)
      setSaveExpanded(false)
      setSaveName('')
      setPreviewText('')
      setPreviewError(null)
    }
  }, [isOpen, transformerType])

  useEffect(() => {
    if (selectedId !== null && !filteredIds.includes(selectedId)) {
      setSelectedId(null)
    }
  }, [filteredIds, selectedId])

  useEffect(() => {
    if (!isOpen || selectedId === null) {
      setPreviewText('')
      setPreviewError(null)
      return
    }

    let cancelled = false
    ;(async () => {
      const config = await loadPreset(dialogType, selectedId)
      if (cancelled) return
      if (config) {
        setPreviewText(JSON.stringify(config, null, 2))
        setPreviewError(null)
      } else {
        setPreviewText('')
        setPreviewError('Could not load preset')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, selectedId, dialogType])

  const handleTypeChange = useCallback((type: PresetTransformerType) => {
    setDialogType(type)
    setSelectedId(null)
  }, [])

  const handleLoad = useCallback(async () => {
    if (selectedId === null) return
    const config = await loadPreset(dialogType, selectedId)
    if (config) onLoadTemplate(config)
    onClose()
  }, [selectedId, dialogType, onLoadTemplate, onClose])

  const handleSaveDownload = useCallback(() => {
    const name = (saveName.trim() || 'template').replace(/[^a-zA-Z0-9_-]/g, '_')
    const json = JSON.stringify(currentConfig, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}.json`
    a.click()
    URL.revokeObjectURL(url)
    setSaveExpanded(false)
    setSaveName('')
  }, [currentConfig, saveName])

  const handleSaveCopy = useCallback(async () => {
    const json = JSON.stringify(currentConfig, null, 2)
    await navigator.clipboard.writeText(json)
    setSaveExpanded(false)
    setSaveName('')
  }, [currentConfig])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Load transformer template"
      width={680}
      height={560}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          gap: 16,
          minHeight: 0,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 16,
            flex: 1,
            minHeight: 0,
            alignItems: 'stretch',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              minWidth: 0,
            }}
          >
            <div>
              <div style={fieldLabelStyle}>Transformer type</div>
              <select
                value={dialogType}
                onChange={(e) => handleTypeChange(e.target.value as PresetTransformerType)}
                style={selectStyle}
                data-testid="transformer-template-type-select"
                aria-label="Transformer type"
              >
                {TRANSFORMER_PRESET_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <input
                type="text"
                placeholder="Search templates…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={inputStyle}
                aria-label="Search templates"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div style={fieldLabelStyle}>Template</div>
              {filteredIds.length === 0 ? (
                <div style={{ color: theme.text.muted, fontSize: 13 }}>
                  {searchQuery ? 'No templates match your search' : 'No templates available'}
                </div>
              ) : (
                <select
                  value={selectedId ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setSelectedId(v === '' ? null : v)
                  }}
                  style={selectStyle}
                  data-testid="transformer-template-select"
                  aria-label="Template"
                >
                  <option value="">Choose a template…</option>
                  {filteredIds.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              minWidth: 0,
              minHeight: 0,
            }}
          >
            <div style={{ ...fieldLabelStyle, marginBottom: 0, fontWeight: 600, color: theme.text.primary }}>
              Preview
            </div>
            <pre
              data-testid="transformer-template-preview"
              style={{
                flex: 1,
                minHeight: 160,
                maxHeight: 320,
                margin: 0,
                padding: 10,
                overflow: 'auto',
                borderRadius: 6,
                border: `1px solid ${theme.border.default}`,
                background: theme.bg.codeBlock,
                fontSize: 11,
                lineHeight: 1.45,
                color: theme.text.secondary,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {previewError ? (
                <span style={{ color: theme.text.error }}>{previewError}</span>
              ) : previewText ? (
                previewText
              ) : (
                <span style={{ color: theme.hint, fontStyle: 'italic' }}>
                  Select a template to preview JSON
                </span>
              )}
            </pre>
          </div>
        </div>

        <div
          style={{
            padding: 12,
            borderRadius: 6,
            border: `1px solid ${theme.border.default}`,
            background: theme.bg.panelAlt,
            flexShrink: 0,
          }}
        >
          <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: theme.text.primary }}>
            Save as template
          </h3>
          <p style={{ margin: '0 0 8px', fontSize: 11, color: theme.text.muted }}>
            Download or copy the current config as JSON. Add the file under{' '}
            <code style={{ fontSize: 10 }}>src/data/transformerPresets/{currentConfig.type}/</code> to
            use it as a preset.
          </p>
          {!saveExpanded ? (
            <button
              type="button"
              onClick={() => setSaveExpanded(true)}
              style={ghostButtonStyle}
            >
              Save as template…
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="text"
                placeholder="Preset name (e.g. sport)"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                style={{ ...inputStyle, fontSize: 12 }}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={handleSaveDownload} style={downloadButtonStyle}>
                  Download JSON
                </button>
                <button type="button" onClick={handleSaveCopy} style={copyButtonStyle}>
                  Copy to clipboard
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSaveExpanded(false)
                    setSaveName('')
                  }}
                  style={ghostButtonStyle}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            paddingTop: 8,
            borderTop: `1px solid ${theme.border.default}`,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: `1px solid ${theme.border.default}`,
              color: theme.text.muted,
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleLoad}
            disabled={selectedId === null}
            style={{
              padding: '8px 16px',
              background: selectedId ? theme.feedback.successBg : theme.bg.surface,
              border: `1px solid ${selectedId ? theme.feedback.successBorder : theme.border.default}`,
              color: selectedId ? theme.feedback.successText : theme.text.disabled,
              borderRadius: 6,
              cursor: selectedId ? 'pointer' : 'not-allowed',
              fontSize: 12,
            }}
          >
            Load
          </button>
        </div>
      </div>
    </Modal>
  )
}
