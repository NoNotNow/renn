import { useState, useMemo } from 'react'
import { useProjectContext } from '@/hooks/useProjectContext'
import { extractPresetFromEntity, applyPresetToEntity } from '@/data/modelPresets'
import type { Entity, ModelPreset } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { useEditorUndo } from '@/contexts/EditorUndoContext'
import { sectionStyle, sectionTitleStyle, sidebarTextInputStyle, fieldLabelStyle } from './sharedStyles'
import { theme } from '@/config/theme'

export interface ModelPresetPanelProps {
  selectedEntityIds: string[]
  onAfterPresetApply?: (previews: { id: string; merged: Entity }[], preset: ModelPreset) => void | Promise<void>
}

export default function ModelPresetPanel({ selectedEntityIds, onAfterPresetApply }: ModelPresetPanelProps) {
  const {
    world,
    modelPresets,
    saveModelPreset,
    deleteModelPreset,
    applyModelPresetToEntities,
  } = useProjectContext()
  const undo = useEditorUndo()
  const [presetName, setPresetName] = useState('')

  const primaryEntityId = selectedEntityIds.length === 1 ? selectedEntityIds[0] : null
  const primaryEntity = useMemo(() => {
    if (!primaryEntityId) return null
    return world.entities.find((e) => e.id === primaryEntityId) ?? null
  }, [world.entities, primaryEntityId])

  const handleSaveFromSelection = async () => {
    const name = presetName.trim()
    if (!primaryEntity || !name) return
    uiLogger.click('ModelPresetPanel', 'Save preset from entity', { entityId: primaryEntity.id, name })
    const preset = extractPresetFromEntity(primaryEntity, name)
    try {
      await saveModelPreset(preset)
      setPresetName('')
    } catch (e) {
      console.error('Failed to save model preset:', e)
      alert('Could not save preset. Check the console or try again.')
    }
  }

  const handleApply = async (presetId: string) => {
    const preset = modelPresets.find((p) => p.id === presetId)
    if (!preset || selectedEntityIds.length === 0) return
    uiLogger.click('ModelPresetPanel', 'Apply preset to entities', {
      presetId,
      entityCount: selectedEntityIds.length,
    })
    undo?.pushBeforeEdit()
    const previews = selectedEntityIds
      .map((id) => {
        const e = world.entities.find((x) => x.id === id)
        if (!e) return null
        return { id, merged: applyPresetToEntity(e, preset) }
      })
      .filter((p): p is { id: string; merged: Entity } => p !== null)
    applyModelPresetToEntities(selectedEntityIds, preset)
    await onAfterPresetApply?.(previews, preset)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this global preset?')) return
    uiLogger.delete('ModelPresetPanel', 'Delete model preset', { presetId: id })
    try {
      await deleteModelPreset(id)
    } catch (e) {
      console.error('Failed to delete model preset:', e)
      alert('Could not delete preset. Check the console or try again.')
    }
  }

  const shapeLabel = (shapeType: string | undefined) => shapeType ?? '—'

  return (
    <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 12, color: theme.text.secondary }}>
        Presets are stored in your browser (all projects). They include model, material, shape, and scale — not
        position or physics.
      </p>

      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Save from selection</h3>
        {!primaryEntity ? (
          <p style={{ margin: 0, fontSize: 12, color: theme.text.muted }}>Select exactly one entity.</p>
        ) : (
          <>
            <label
              style={{ ...fieldLabelStyle, cursor: 'help' }}
              title="Label for this reusable bundle (model, material, shape, scale) saved to browser storage."
            >
              Preset name
            </label>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="e.g. Red crate"
              style={{
                ...sidebarTextInputStyle,
                border: `1px solid ${theme.border.default}`,
                background: theme.bg.input,
                color: theme.text.primary,
              }}
            />
            <button
              type="button"
              disabled={!presetName.trim()}
              onClick={() => void handleSaveFromSelection()}
              style={{
                marginTop: 8,
                padding: '6px 10px',
                borderRadius: 6,
                border: `1px solid ${theme.border.default}`,
                background: theme.button.primary,
                color: theme.text.primary,
                cursor: presetName.trim() ? 'pointer' : 'not-allowed',
                opacity: presetName.trim() ? 1 : 0.5,
              }}
            >
              Save preset
            </button>
          </>
        )}
      </div>

      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Library</h3>
        {modelPresets.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: theme.text.muted }}>No presets yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {modelPresets.map((p) => (
              <li
                key={p.id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 8,
                  padding: 8,
                  borderRadius: 6,
                  border: `1px solid ${theme.border.default}`,
                  background: theme.bg.surface,
                }}
              >
                <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: theme.text.primary }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: theme.text.muted }}>
                    {shapeLabel(p.shape?.type)} · {p.model ? `model: ${p.model}` : 'no model'}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={selectedEntityIds.length === 0}
                  onClick={() => void handleApply(p.id)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: `1px solid ${theme.border.default}`,
                    background: theme.button.primary,
                    color: theme.text.primary,
                    cursor: selectedEntityIds.length ? 'pointer' : 'not-allowed',
                    opacity: selectedEntityIds.length ? 1 : 0.5,
                  }}
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(p.id)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: `1px solid ${theme.border.default}`,
                    background: 'transparent',
                    color: theme.text.secondary,
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
