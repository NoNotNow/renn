import type { RennWorld } from '@/types/world'

/**
 * Asset IDs needed to load a world: entity textures/models, registry keys, skybox, ambient sound.
 * Used by static world loading and project ZIP export.
 */
export function collectReferencedAssetIds(world: RennWorld): Set<string> {
  const ids = new Set<string>()
  for (const entity of world.entities ?? []) {
    const map = entity.material?.map
    if (map && typeof map === 'string') ids.add(map)
    const shapeModel = entity.shape && entity.shape.type === 'trimesh' ? entity.shape.model : undefined
    if (shapeModel && typeof shapeModel === 'string') ids.add(shapeModel)
    const entityModel = entity.model
    if (entityModel && typeof entityModel === 'string') ids.add(entityModel)
  }
  for (const id of Object.keys(world.assets ?? {})) {
    ids.add(id)
  }
  const skybox = world.world?.skybox
  if (skybox && typeof skybox === 'string' && skybox.trim()) {
    ids.add(skybox.trim())
  }
  const soundAssetId = world.world?.sound?.assetId
  if (soundAssetId && typeof soundAssetId === 'string' && soundAssetId.trim()) {
    ids.add(soundAssetId.trim())
  }
  return ids
}
