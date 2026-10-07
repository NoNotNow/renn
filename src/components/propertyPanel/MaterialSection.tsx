import type { RennWorld, Entity } from '@/types/world'
import { mergeMaterialFields, type MaterialUpdater } from '@/utils/mixedInspectorEdit'
import { uiLogger } from '@/utils/uiLogger'
import { theme } from '@/config/theme'
import MaterialEditor from '../MaterialEditor'
import { secondaryButtonStyle, secondaryButtonStyleDisabled } from '../sharedStyles'

export interface MaterialSectionProps {
  entities: Entity[]
  ids: string[]
  primaryEntity: Entity
  isMulti: boolean
  isModelOrTrimesh: boolean
  editorIdPrefix: string
  assets: Map<string, Blob>
  world: RennWorld
  anyLocked: boolean
  onWorldChange: (world: RennWorld) => void
  onAssetsChange?: (assets: Map<string, Blob>) => void
  onEntityMaterialChange?: (ids: string[], patch: Partial<Entity>) => void
  updateAll: (patch: Partial<Entity>) => void
  /** Per-entity patch in one world change. */
  updateEach: (patchFor: (e: Entity) => Partial<Entity>) => void
  onOpenTextureStudio?: (entityId: string) => void | Promise<void>
}

export default function MaterialSection({
  entities,
  ids,
  primaryEntity,
  isMulti,
  isModelOrTrimesh,
  editorIdPrefix,
  assets,
  world,
  anyLocked,
  onWorldChange,
  onAssetsChange,
  onEntityMaterialChange,
  updateAll,
  updateEach,
  onOpenTextureStudio,
}: MaterialSectionProps) {
  const mix = mergeMaterialFields(entities)

  /**
   * Apply a sub-field edit to EACH entity's own material, so changing only the colour leaves every
   * entity's roughness / metalness / textures intact. One call -> one world change (one undo step).
   */
  const onMaterialUpdate = (update: MaterialUpdater) => {
    const nextById = new Map(entities.map((e) => [e.id, update(e.material)] as const))
    if (onEntityMaterialChange) {
      for (const [id, material] of nextById) onEntityMaterialChange([id], { material })
    } else {
      updateEach((e) => ({ material: nextById.get(e.id) }))
    }
  }
  const editor = (
    <MaterialEditor
      entityId={editorIdPrefix}
      material={mix.material}
      mix={isMulti ? mix : undefined}
      assets={assets}
      world={world}
      onMaterialChange={(material) => onMaterialUpdate(() => material)}
      onMaterialUpdate={onMaterialUpdate}
      onWorldChange={onWorldChange}
      onAssetsChange={onAssetsChange}
      disabled={anyLocked}
      onOpenTextureStudio={
        !isMulti && onOpenTextureStudio ? () => onOpenTextureStudio(primaryEntity.id) : undefined
      }
    />
  )

  const materialAllNull = entities.every((e) => e.material == null)
  const materialAllSet = entities.every((e) => e.material != null)

  // Inconsistent layouts (not the uniform model/trimesh path below): plain editor, mixed-aware.
  if (!isModelOrTrimesh) return editor

  if (materialAllNull) {
    return (
      <>
        <p style={{ margin: '8px 0', fontSize: 12, color: theme.text.muted }}>
          Using colors from 3D file.
        </p>
        <button
          type="button"
          onClick={() => {
            uiLogger.change('PropertyPanel', 'Override with material', { entityIds: ids })
            const defaultMaterial = { color: [0.7, 0.7, 0.7] as [number, number, number] }
            if (onEntityMaterialChange) {
              onEntityMaterialChange(ids, { material: defaultMaterial })
            } else {
              updateAll({ material: defaultMaterial })
            }
          }}
          disabled={anyLocked}
          style={{
            ...secondaryButtonStyle,
            ...(anyLocked && secondaryButtonStyleDisabled),
          }}
        >
          Override with material
        </button>
      </>
    )
  }

  if (materialAllSet) {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            uiLogger.change('PropertyPanel', 'Use model colors', { entityIds: ids })
            if (onEntityMaterialChange) {
              onEntityMaterialChange(ids, { material: undefined })
            } else {
              updateAll({ material: undefined })
            }
          }}
          disabled={anyLocked}
          style={{
            fontSize: 12,
            background: 'none',
            border: 'none',
            color: theme.text.linkBlue,
            cursor: anyLocked ? 'not-allowed' : 'pointer',
            padding: '0 0 8px 0',
            marginBottom: 4,
          }}
        >
          Use model colors
        </button>
        {editor}
      </>
    )
  }

  return (
    <p style={{ fontSize: 12, color: theme.text.muted }}>
      Material override differs across selection. Set all to file colors or override on each entity type consistently.
    </p>
  )
}
