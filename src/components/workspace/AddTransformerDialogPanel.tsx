import { useEffect, useMemo, useState } from 'react'
import type { TransformerConfig } from '@/types/transformer'
import { theme } from '@/config/theme'
import { TRANSFORMER_PRESET_OPTIONS } from '@/transformers/transformerPresets'
import {
  groupRegistryTransformersByTitle,
  transformerOrganizeTitle,
  type GroupedRegistryTransformer,
} from '@/transformers/transformerUtils'
import { selectableListItemHandlers } from '@/utils/selectableListItemHandlers'

export type AddExistingTransformerMode = 'link' | 'copy'

type AddTransformerTab = 'preset' | 'existing'

type AddTransformerSelection =
  | { kind: 'preset'; type: string }
  | { kind: 'existing'; registryId: string }

export interface AddTransformerDialogPanelProps {
  existingRegistry: Record<string, TransformerConfig>
  excludedIds: string[]
  onAddPreset: (type: string) => void
  onAddExisting: (registryId: string, mode: AddExistingTransformerMode) => void
  onCancel: () => void
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

const ghostButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  border: `1px solid ${theme.border.default}`,
  color: theme.text.muted,
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: '8px 14px',
    borderRadius: 6,
    border: `1px solid ${active ? theme.accent : theme.border.default}`,
    background: active ? 'rgba(0,153,255,0.12)' : theme.bg.surface,
    color: active ? theme.accent : theme.text.primary,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: active ? 600 : 500,
  }
}

function matchesPresetSearch(label: string, value: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return label.toLowerCase().includes(q) || value.toLowerCase().includes(q)
}

function groupMatchesSearch(group: GroupedRegistryTransformer, registry: Record<string, TransformerConfig>, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (group.title.toLowerCase().includes(q)) return true
  return group.ids.some((id) => {
    const config = registry[id]
    if (!config) return id.toLowerCase().includes(q)
    return config.type.toLowerCase().includes(q) || id.toLowerCase().includes(q)
  })
}

function listItemStyle(selected: boolean): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    padding: '10px 12px',
    border: 'none',
    borderBottom: `1px solid ${theme.border.default}`,
    background: selected ? 'rgba(0,153,255,0.12)' : 'transparent',
    color: theme.text.primary,
    textAlign: 'left',
    cursor: 'pointer',
  }
}

/** Shared preset/existing picker body used by AddTransformerDialog and PipeAddDialog. */
export default function AddTransformerDialogPanel({
  existingRegistry,
  excludedIds,
  onAddPreset,
  onAddExisting,
  onCancel,
}: AddTransformerDialogPanelProps) {
  const [activeTab, setActiveTab] = useState<AddTransformerTab>('preset')
  const [searchQuery, setSearchQuery] = useState('')
  const [selection, setSelection] = useState<AddTransformerSelection | null>(null)

  const groupedExisting = useMemo(
    () => groupRegistryTransformersByTitle(existingRegistry, excludedIds),
    [existingRegistry, excludedIds],
  )

  const filteredPresets = useMemo(
    () =>
      TRANSFORMER_PRESET_OPTIONS.filter((opt) => matchesPresetSearch(opt.label, opt.value, searchQuery)),
    [searchQuery],
  )

  const filteredExistingGroups = useMemo(
    () => groupedExisting.filter((group) => groupMatchesSearch(group, existingRegistry, searchQuery)),
    [groupedExisting, existingRegistry, searchQuery],
  )

  useEffect(() => {
    setActiveTab('preset')
    setSearchQuery('')
    setSelection(null)
  }, [])

  useEffect(() => {
    if (!selection) return
    const stillVisible =
      selection.kind === 'preset'
        ? activeTab === 'preset' && filteredPresets.some((opt) => opt.value === selection.type)
        : activeTab === 'existing' &&
          filteredExistingGroups.some((group) => group.representativeId === selection.registryId)
    if (!stillVisible) setSelection(null)
  }, [activeTab, filteredPresets, filteredExistingGroups, selection])

  const handleTabChange = (tab: AddTransformerTab) => {
    setActiveTab(tab)
    setSelection(null)
  }

  const confirmAddPreset = (type: string) => {
    onAddPreset(type)
  }

  const confirmAddExisting = (registryId: string, mode: AddExistingTransformerMode) => {
    onAddExisting(registryId, mode)
  }

  const handleAddPreset = () => {
    if (selection?.kind !== 'preset') return
    confirmAddPreset(selection.type)
  }

  const handleAddExisting = (mode: AddExistingTransformerMode) => {
    if (selection?.kind !== 'existing') return
    confirmAddExisting(selection.registryId, mode)
  }

  const searchPlaceholder =
    activeTab === 'preset' ? 'Search presets…' : 'Search existing transformers…'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'preset'}
          data-testid="add-transformer-tab-preset"
          onClick={() => handleTabChange('preset')}
          style={tabStyle(activeTab === 'preset')}
        >
          Preset
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'existing'}
          data-testid="add-transformer-tab-existing"
          onClick={() => handleTabChange('existing')}
          style={tabStyle(activeTab === 'existing')}
        >
          Existing
        </button>
      </div>

      <input
        type="text"
        placeholder={searchPlaceholder}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={inputStyle}
        aria-label={searchPlaceholder}
        data-testid="add-transformer-search"
        autoFocus
      />

      {activeTab === 'preset' ?
        <div
          role="listbox"
          aria-label="Transformer presets"
          data-testid="add-transformer-preset-list"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            border: `1px solid ${theme.border.default}`,
            borderRadius: 6,
            background: theme.bg.panelAlt,
          }}
        >
          {filteredPresets.length === 0 ?
            <div style={{ padding: 16, fontSize: 12, color: theme.text.muted, textAlign: 'center' }}>
              No presets match your search.
            </div>
          : filteredPresets.map((opt) => {
              const selected = selection?.kind === 'preset' && selection.type === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-testid={`add-transformer-preset-${opt.value}`}
                  {...selectableListItemHandlers(
                    () => setSelection({ kind: 'preset', type: opt.value }),
                    () => confirmAddPreset(opt.value),
                  )}
                  style={listItemStyle(selected)}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{opt.label}</div>
                </button>
              )
            })
          }
        </div>
      : <div
          role="listbox"
          aria-label="Existing transformers"
          data-testid="add-transformer-existing-list"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            border: `1px solid ${theme.border.default}`,
            borderRadius: 6,
            background: theme.bg.panelAlt,
          }}
        >
          {filteredExistingGroups.length === 0 ?
            <div style={{ padding: 16, fontSize: 12, color: theme.text.muted, textAlign: 'center' }}>
              {groupedExisting.length === 0 ?
                'No other transformers in the project registry.'
              : 'No transformers match your search.'}
            </div>
          : filteredExistingGroups.map((group) => {
              const selected =
                selection?.kind === 'existing' && selection.registryId === group.representativeId
              const sampleConfig = existingRegistry[group.representativeId]
              const typeLabel = sampleConfig ? transformerOrganizeTitle(sampleConfig) : group.title
              return (
                <button
                  key={group.title}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-testid={`add-transformer-existing-${group.representativeId}`}
                  {...selectableListItemHandlers(
                    () =>
                      setSelection({ kind: 'existing', registryId: group.representativeId }),
                    () => confirmAddExisting(group.representativeId, 'link'),
                  )}
                  style={listItemStyle(selected)}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{group.title}</div>
                  <div style={{ fontSize: 11, color: theme.text.muted, marginTop: 2 }}>
                    {group.ids.length > 1 ?
                      `${group.ids.length} transformers · ${typeLabel}`
                    : group.representativeId}
                  </div>
                </button>
              )
            })
          }
        </div>
      }

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={onCancel} style={ghostButtonStyle}>
          Cancel
        </button>
        {activeTab === 'existing' ?
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={selection?.kind !== 'existing'}
              onClick={() => handleAddExisting('link')}
              data-testid="add-transformer-link"
              style={{
                padding: '6px 12px',
                borderRadius: 4,
                border: `1px solid ${theme.accent}`,
                background: selection?.kind === 'existing' ? 'rgba(0,153,255,0.1)' : theme.bg.surface,
                color: selection?.kind === 'existing' ? theme.accent : theme.text.muted,
                cursor: selection?.kind === 'existing' ? 'pointer' : 'not-allowed',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Link
            </button>
            <button
              type="button"
              disabled={selection?.kind !== 'existing'}
              onClick={() => handleAddExisting('copy')}
              data-testid="add-transformer-copy"
              style={{
                padding: '6px 12px',
                borderRadius: 4,
                border: `1px solid ${theme.border.default}`,
                background: selection?.kind === 'existing' ? theme.bg.surface : theme.bg.panelAlt,
                color: selection?.kind === 'existing' ? theme.text.primary : theme.text.muted,
                cursor: selection?.kind === 'existing' ? 'pointer' : 'not-allowed',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Copy
            </button>
          </div>
        : <button
            type="button"
            disabled={selection?.kind !== 'preset'}
            onClick={handleAddPreset}
            data-testid="add-transformer-add-preset"
            style={{
              padding: '6px 12px',
              borderRadius: 4,
              border: `1px solid ${theme.accent}`,
              background: selection?.kind === 'preset' ? theme.accent : theme.bg.surface,
              color: selection?.kind === 'preset' ? '#fff' : theme.text.muted,
              cursor: selection?.kind === 'preset' ? 'pointer' : 'not-allowed',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Add
          </button>
        }
      </div>
    </div>
  )
}
