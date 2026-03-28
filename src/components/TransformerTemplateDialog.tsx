import { useState, useCallback, useEffect } from 'react'
import type { TransformerConfig } from '@/types/transformer'
import type { PresetTransformerType } from '@/data/transformerPresets/loader'
import { listPresetNames, loadPreset } from '@/data/transformerPresets/loader'
import Modal from './Modal'

const PRESET_TYPES: PresetTransformerType[] = [
  'input',
  'car2',
  'person',
  'targetPoseInput',
  'kinematicMovement',
  'wanderer',
  'follow',
]

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
  background: '#1a1a1a',
  border: '1px solid #2f3545',
  color: '#e6e9f2',
  fontSize: 14,
}

const cardStyle = (selected: boolean): React.CSSProperties => ({
  padding: '10px 12px',
  borderRadius: 6,
  border: selected ? '2px solid #4a9eff' : '1px solid #2f3545',
  background: selected ? '#1e2a3a' : 'transparent',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  fontSize: 13,
  color: '#e6e9f2',
})

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

  const presetNames = listPresetNames(dialogType)
  const filteredIds = presetNames.filter((name) =>
    name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  useEffect(() => {
    if (isOpen) {
      setDialogType(transformerType)
      setSearchQuery('')
      setSelectedId(null)
      setSaveExpanded(false)
      setSaveName('')
    }
  }, [isOpen, transformerType])

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
      width={500}
      height={520}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#9aa4b2' }}>Type:</span>
          {PRESET_TYPES.map((type) => {
            const active = dialogType === type
            return (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeChange(type)}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  borderRadius: 6,
                  border: active ? '1px solid #4a9eff' : '1px solid #2f3545',
                  background: active ? '#1e2a3a' : 'transparent',
                  color: active ? '#e6e9f2' : '#9aa4b2',
                  cursor: 'pointer',
                }}
              >
                {type}
              </button>
            )
          })}
        </div>

        <div>
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#e6e9f2' }}>
            Load template
          </h3>
          {filteredIds.length === 0 ? (
            <div style={{ color: '#9aa4b2', fontSize: 13 }}>
              {searchQuery ? 'No templates match your search' : 'No templates available'}
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {filteredIds.map((name) => {
                const selected = selectedId === name
                return (
                  <div
                    key={name}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(name)}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedId(name)}
                    style={cardStyle(selected)}
                    onMouseEnter={(e) => {
                      if (!selected) {
                        e.currentTarget.style.background = '#2a2a2a'
                        e.currentTarget.style.borderColor = '#3f4f5f'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.borderColor = '#2f3545'
                      }
                    }}
                  >
                    {name}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div
          style={{
            padding: 12,
            borderRadius: 6,
            border: '1px solid #2f3545',
            background: '#1a1a1a',
          }}
        >
          <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#e6e9f2' }}>
            Save as template
          </h3>
          <p style={{ margin: '0 0 8px', fontSize: 11, color: '#9aa4b2' }}>
            Download or copy the current config as JSON. Add the file under{' '}
            <code style={{ fontSize: 10 }}>src/data/transformerPresets/{currentConfig.type}/</code> to
            use it as a preset.
          </p>
          {!saveExpanded ? (
            <button
              type="button"
              onClick={() => setSaveExpanded(true)}
              style={{
                padding: '6px 12px',
                background: 'transparent',
                border: '1px solid #2f3545',
                color: '#9aa4b2',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
              }}
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
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleSaveDownload}
                  style={{
                    padding: '6px 12px',
                    background: '#2d4a2d',
                    border: '1px solid #4a6a4a',
                    color: '#a4d4a4',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  Download JSON
                </button>
                <button
                  type="button"
                  onClick={handleSaveCopy}
                  style={{
                    padding: '6px 12px',
                    background: '#1e3a5f',
                    border: '1px solid #3b6ea8',
                    color: '#93c5fd',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  Copy to clipboard
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSaveExpanded(false)
                    setSaveName('')
                  }}
                  style={{
                    padding: '6px 12px',
                    background: 'transparent',
                    border: '1px solid #2f3545',
                    color: '#9aa4b2',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
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
            borderTop: '1px solid #2f3545',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid #2f3545',
              color: '#9aa4b2',
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
              background: selectedId ? '#2d4a2d' : '#2a2a2a',
              border: selectedId ? '1px solid #4a6a4a' : '1px solid #2f3545',
              color: selectedId ? '#a4d4a4' : '#666',
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
