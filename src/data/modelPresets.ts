import type { Entity, ModelPreset, Shape, MaterialRef, Rotation, Vec3 } from '@/types/world'
import { generateModelPresetId } from '@/utils/idGenerator'

const PRESET_ENTITY_KEYS = [
  'model',
  'modelRotation',
  'modelScale',
  'modelSimplification',
  'material',
  'shape',
  'scale',
] as const

type PresetEntityKey = (typeof PRESET_ENTITY_KEYS)[number]

function cloneShape(shape: Shape | undefined): Shape | undefined {
  if (!shape) return undefined
  return structuredClone(shape) as Shape
}

function cloneMaterial(m: MaterialRef | undefined): MaterialRef | undefined {
  if (!m) return undefined
  return structuredClone(m) as MaterialRef
}

/**
 * Build a preset from the current entity appearance (model, material, shape, scales).
 * Only fields that are defined on the entity are included (partial presets).
 */
export function extractPresetFromEntity(entity: Entity, name: string, now = Date.now()): ModelPreset {
  const preset: ModelPreset = {
    id: generateModelPresetId(),
    name,
    createdAt: now,
  }
  if (entity.model !== undefined) preset.model = entity.model
  if (entity.modelRotation !== undefined) preset.modelRotation = [...entity.modelRotation] as Entity['modelRotation']
  if (entity.modelScale !== undefined) preset.modelScale = [...entity.modelScale] as Entity['modelScale']
  if (entity.modelSimplification !== undefined) {
    preset.modelSimplification = structuredClone(entity.modelSimplification)
  }
  if (entity.material !== undefined) preset.material = cloneMaterial(entity.material)
  if (entity.shape !== undefined) preset.shape = cloneShape(entity.shape)
  if (entity.scale !== undefined) preset.scale = [...entity.scale] as Entity['scale']
  return preset
}

/**
 * Apply preset fields onto an entity. Only keys present on `preset` (own property) are written;
 * other entity fields are unchanged (supports partial presets).
 */
export function applyPresetToEntity(entity: Entity, preset: ModelPreset): Entity {
  const next: Entity = { ...entity }
  const remove = (k: PresetEntityKey) => {
    delete (next as Partial<Entity>)[k]
  }

  for (const key of PRESET_ENTITY_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(preset, key)) continue
    const value = preset[key as PresetEntityKey]
    if (value === undefined) {
      remove(key)
      continue
    }
    switch (key) {
      case 'model':
        next.model = value as string
        break
      case 'modelRotation':
        next.modelRotation = [...(value as Rotation)] as Rotation
        break
      case 'modelScale':
        next.modelScale = [...(value as Vec3)] as Vec3
        break
      case 'scale':
        next.scale = [...(value as Vec3)] as Vec3
        break
      case 'modelSimplification':
        next.modelSimplification = structuredClone(value) as NonNullable<Entity['modelSimplification']>
        break
      case 'material':
        next.material = cloneMaterial(value as MaterialRef)!
        break
      case 'shape':
        next.shape = cloneShape(value as Shape)!
        break
      default:
        break
    }
  }
  return next
}
