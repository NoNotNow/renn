import type { RennWorld, ModelPreset } from '@/types/world'

export interface ProjectMeta {
  id: string
  name: string
  updatedAt: number
}

export interface LoadedProject {
  world: RennWorld
  assets: Map<string, Blob>
}

export interface PersistenceAPI {
  listProjects(): Promise<ProjectMeta[]>
  loadProject(id: string): Promise<LoadedProject>
  saveProject(id: string, name: string, data: { world: RennWorld; assets: Map<string, Blob> }): Promise<void>
  deleteProject(id: string): Promise<void>
  exportProject(id: string): Promise<Blob>
  importProject(file: File): Promise<{ id: string }>
  /** Stash current world for `/play?session=1` (large worlds; not a substitute for Save). */
  savePlaySessionWorld(world: RennWorld): Promise<void>
  loadPlaySessionWorld(): Promise<RennWorld | null>
  // Global asset management
  saveAsset(assetId: string, blob: Blob, previewBlob?: Blob | null): Promise<void>
  deleteAsset(assetId: string): Promise<void>
  listAllAssets(): Promise<Array<{ assetId: string; type: string; size: number }>>
  loadAllAssets(): Promise<Map<string, Blob>>
  loadAssetPreview(assetId: string): Promise<Blob | null>
  /** Global 3D model / material / shape presets (not tied to a project). */
  listModelPresets(): Promise<ModelPreset[]>
  saveModelPreset(preset: ModelPreset): Promise<void>
  deleteModelPreset(id: string): Promise<void>
}
