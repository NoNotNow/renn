import type { RennWorld } from '@/types/world'

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
  // Global asset management
  saveAsset(assetId: string, blob: Blob): Promise<void>
  deleteAsset(assetId: string): Promise<void>
  listAllAssets(): Promise<Array<{ assetId: string; type: string; size: number }>>
  loadAllAssets(): Promise<Map<string, Blob>>
}
