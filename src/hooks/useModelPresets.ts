import { useCallback, useState } from 'react'
import type { ModelPreset, RennWorld } from '@/types/world'
import type { PersistenceAPI } from '@/persistence/types'
import { applyPresetToEntity } from '@/data/modelPresets'

export interface UseModelPresetsResult {
  modelPresets: ModelPreset[]
  /** Refresh from persistence (called once after initial load completes). */
  refreshModelPresets: () => Promise<void>
  saveModelPreset: (preset: ModelPreset) => Promise<void>
  deleteModelPreset: (id: string) => Promise<void>
  applyModelPresetToEntities: (entityIds: string[], preset: ModelPreset) => void
}

/**
 * Owns the global model preset library (IndexedDB-backed, shared across projects).
 *
 * Optimistic state updates avoid a stale-empty list right after save: some
 * browsers can return an empty `listModelPresets()` immediately after a
 * tight save/open cycle, which would clear the in-memory library.
 */
export function useModelPresets(
  persistence: Pick<PersistenceAPI, 'listModelPresets' | 'saveModelPreset' | 'deleteModelPreset'>,
  updateWorld: (updater: (prev: RennWorld) => RennWorld) => void,
): UseModelPresetsResult {
  const [modelPresets, setModelPresets] = useState<ModelPreset[]>([])

  const refreshModelPresets = useCallback(async () => {
    try {
      const list = await persistence.listModelPresets()
      setModelPresets(list)
    } catch (e) {
      console.error('Failed to list model presets:', e)
    }
  }, [persistence])

  const saveModelPreset = useCallback(
    async (preset: ModelPreset) => {
      await persistence.saveModelPreset(preset)
      setModelPresets((prev) => {
        const rest = prev.filter((p) => p.id !== preset.id)
        return [...rest, preset].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      })
    },
    [persistence],
  )

  const deleteModelPreset = useCallback(
    async (id: string) => {
      await persistence.deleteModelPreset(id)
      setModelPresets((prev) => prev.filter((p) => p.id !== id))
    },
    [persistence],
  )

  const applyModelPresetToEntities = useCallback(
    (entityIds: string[], preset: ModelPreset) => {
      const idSet = new Set(entityIds)
      updateWorld((prev) => ({
        ...prev,
        entities: prev.entities.map((e) => {
          if (!idSet.has(e.id)) return e
          return applyPresetToEntity(e, preset)
        }),
      }))
    },
    [updateWorld],
  )

  return {
    modelPresets,
    refreshModelPresets,
    saveModelPreset,
    deleteModelPreset,
    applyModelPresetToEntities,
  }
}
