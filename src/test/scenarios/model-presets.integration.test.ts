/**
 * Integration: global model presets (IndexedDB) + extract/apply helpers across entity fields.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { createIndexedDbPersistence } from '@/persistence/indexedDb'
import { extractPresetFromEntity, applyPresetToEntity } from '@/data/modelPresets'
import type { Entity, ModelPreset } from '@/types/world'

describe('model presets (integration)', () => {
  describe('IndexedDB persistence', () => {
    let persistence: ReturnType<typeof createIndexedDbPersistence>

    beforeEach(() => {
      persistence = createIndexedDbPersistence()
    })

    it('save then list returns preset with correct fields', async () => {
      const entity: Entity = {
        id: 'e1',
        shape: { type: 'box', width: 2, height: 1, depth: 3 },
        scale: [1, 2, 3],
        model: 'm1',
        modelRotation: [0, 1, 0],
        modelScale: [0.5, 0.5, 0.5],
        material: { color: [0.1, 0.2, 0.3], roughness: 0.4 },
      }
      const preset = extractPresetFromEntity(entity, 'My preset', 1_700_000_000_000)
      await persistence.saveModelPreset(preset)

      const list = await persistence.listModelPresets()
      const found = list.find((p) => p.id === preset.id)
      expect(found).toBeDefined()
      expect(found!.name).toBe('My preset')
      expect(found!.createdAt).toBe(1_700_000_000_000)
      expect(found!.model).toBe('m1')
      expect(found!.shape).toEqual({ type: 'box', width: 2, height: 1, depth: 3 })
      expect(found!.scale).toEqual([1, 2, 3])
      expect(found!.modelRotation).toEqual([0, 1, 0])
      expect(found!.modelScale).toEqual([0.5, 0.5, 0.5])
      expect(found!.material?.color).toEqual([0.1, 0.2, 0.3])
      expect(found!.material?.roughness).toBe(0.4)
    })

    it('delete removes preset so list no longer contains it', async () => {
      const preset = extractPresetFromEntity(
        { id: 'x', shape: { type: 'sphere', radius: 1 } },
        'To remove',
        2,
      )
      await persistence.saveModelPreset(preset)
      expect((await persistence.listModelPresets()).some((p) => p.id === preset.id)).toBe(true)

      await persistence.deleteModelPreset(preset.id)
      expect((await persistence.listModelPresets()).some((p) => p.id === preset.id)).toBe(false)
    })

    it('two presets with the same name are separate records with different ids', async () => {
      const base: Entity = {
        id: 'e',
        shape: { type: 'cylinder', radius: 0.5, height: 1 },
        material: { color: [1, 0, 0] },
      }
      const a = extractPresetFromEntity(base, 'Duplicate name', 100)
      const b = extractPresetFromEntity(base, 'Duplicate name', 200)
      expect(a.id).not.toBe(b.id)

      await persistence.saveModelPreset(a)
      await persistence.saveModelPreset(b)

      const list = await persistence.listModelPresets()
      const named = list.filter((p) => p.name === 'Duplicate name')
      expect(named.length).toBeGreaterThanOrEqual(2)
      const ids = new Set(named.map((p) => p.id))
      expect(ids.has(a.id)).toBe(true)
      expect(ids.has(b.id)).toBe(true)
    })
  })

  describe('applyPresetToEntity', () => {
    it('full preset replaces model, material, shape, scale; preserves id, position, physics', () => {
      const target: Entity = {
        id: 'keep-me',
        position: [1, 2, 3],
        rotation: [0.1, 0.2, 0.3],
        mass: 5,
        shape: { type: 'sphere', radius: 0.5 },
        scale: [1, 1, 1],
        model: 'old',
        material: { color: [0, 0, 1] },
        scripts: ['s1'],
      }
      const source: Entity = {
        id: 'source',
        shape: { type: 'box', width: 4, height: 4, depth: 4 },
        scale: [2, 2, 2],
        model: 'new-model',
        modelRotation: [0, 0, 0.5],
        material: { color: [1, 0, 0], metalness: 0.9 },
      }
      const preset = extractPresetFromEntity(source, 'full', 1)

      const out = applyPresetToEntity(target, preset)

      expect(out.id).toBe('keep-me')
      expect(out.position).toEqual([1, 2, 3])
      expect(out.rotation).toEqual([0.1, 0.2, 0.3])
      expect(out.mass).toBe(5)
      expect(out.scripts).toEqual(['s1'])

      expect(out.model).toBe('new-model')
      expect(out.shape).toEqual({ type: 'box', width: 4, height: 4, depth: 4 })
      expect(out.scale).toEqual([2, 2, 2])
      expect(out.modelRotation).toEqual([0, 0, 0.5])
      expect(out.material?.color).toEqual([1, 0, 0])
      expect(out.material?.metalness).toBe(0.9)
    })

    it('partial preset with only material updates material; shape unchanged', () => {
      const target: Entity = {
        id: 't',
        shape: { type: 'cone', radius: 1, height: 2 },
        scale: [3, 3, 3],
        model: 'cone-model',
        material: { color: [0.5, 0.5, 0.5] },
      }
      const partial: ModelPreset = {
        id: 'p1',
        name: 'mat only',
        createdAt: 0,
        material: { color: [0.2, 0.8, 0.2], map: 'tex-a' },
      }

      const out = applyPresetToEntity(target, partial)

      expect(out.shape).toEqual({ type: 'cone', radius: 1, height: 2 })
      expect(out.scale).toEqual([3, 3, 3])
      expect(out.model).toBe('cone-model')
      expect(out.material?.color).toEqual([0.2, 0.8, 0.2])
      expect(out.material?.map).toBe('tex-a')
    })
  })
})
