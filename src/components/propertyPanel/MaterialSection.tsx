import type { RennWorld, Entity, MaterialRef } from '@/types/world'
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
  mergedMaterial: MaterialRef | null | undefined
  editorIdPrefix: string
  assets: Map<string, Blob>
  world: RennWorld
  anyLocked: boolean
  onWorldChange: (world: RennWorld) => void
  onAssetsChange?: (assets: Map<string, Blob>) => void
  onEntityMaterialChange?: (ids: string[], patch: Partial<Entity>) => void
  updateAll: (patch: Partial<Entity>) => void
  onOpenTextureStudio?: (entityId: string) => void | Promise<void>
}

export default function MaterialSection({
  entities,
  ids,
  primaryEntity,
  isMulti,
  isModelOrTrimesh,
  mergedMaterial,
  editorIdPrefix,
  assets,
  world,
  anyLocked,
  onWorldChange,
  onAssetsChange,
  onEntityMaterialChange,
  updateAll,
  onOpenTextureStudio,
}: MaterialSectionProps) {
  const materialAllNull = entities.every((e) => e.material == null)
  const materialAllSet = entities.every((e) => e.material != null)

  if (!isModelOrTrimesh) {
    if (mergedMaterial === null) {
      return (
        <p style={{ margin: '8px 0', fontSize: 12, color: theme.text.muted }}>
          Material properties differ across selection. Edit one entity or apply a change to set all to the same material.
        </p>
      )
    }
    return (
      <MaterialEditor
        entityId={editorIdPrefix}
        material={mergedMaterial}
        assets={assets}
        world={world}
        onMaterialChange={(material) =>
          onEntityMaterialChange ? onEntityMaterialChange(ids, { material }) : updateAll({ material })
        }
        onWorldChange={onWorldChange}
        onAssetsChange={onAssetsChange}
        disabled={anyLocked}
        onOpenTextureStudio={
          !isMulti && onOpenTextureStudio ? () => onOpenTextureStudio(primaryEntity.id) : undefined
        }
      />
    )
  }

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

  if (materialAllSet && mergedMaterial != null) {
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
        <MaterialEditor
          entityId={editorIdPrefix}
          material={mergedMaterial}
          assets={assets}
          world={world}
          onMaterialChange={(material) =>
            onEntityMaterialChange ? onEntityMaterialChange(ids, { material }) : updateAll({ material })
          }
          onWorldChange={onWorldChange}
          onAssetsChange={onAssetsChange}
          disabled={anyLocked}
          onOpenTextureStudio={
            !isMulti && onOpenTextureStudio ? () => onOpenTextureStudio(primaryEntity.id) : undefined
          }
        />
      </>
    )
  }

  return (
    <p style={{ fontSize: 12, color: theme.text.muted }}>
      Material override differs across selection. Set all to file colors or override on each entity type consistently.
    </p>
  )
}
