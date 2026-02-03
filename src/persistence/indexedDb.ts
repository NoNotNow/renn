import { openDB, type IDBPDatabase } from 'idb'
import type { RennWorld } from '@/types/world'
import type { ProjectMeta, LoadedProject, PersistenceAPI } from './types'
import { generateProjectId } from '@/utils/idGenerator'

const DB_NAME = 'renn-worlds'
const DB_VERSION = 2
const STORE_PROJECTS = 'projects'
const STORE_ASSETS = 'assets'

function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' })
      }
      
      // Migration from v1 (per-project assets) to v2 (global assets)
      if (oldVersion < 2 && db.objectStoreNames.contains(STORE_ASSETS)) {
        // For v1->v2 migration, we'll handle it after upgrade completes
        // Delete old store structure
        db.deleteObjectStore(STORE_ASSETS)
      }
      
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        // Create new global assets store
        const assetStore = db.createObjectStore(STORE_ASSETS, { keyPath: 'assetId' })
        assetStore.createIndex('byType', 'type', { unique: false })
      }
    },
    blocked() {
      console.warn('IndexedDB upgrade blocked - close other tabs')
    },
  })
}

export function createIndexedDbPersistence(): PersistenceAPI {
  return {
    async listProjects(): Promise<ProjectMeta[]> {
      const db = await getDB()
      const list = await db.getAll(STORE_PROJECTS) as ProjectMeta[]
      await db.close()
      return [...list].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    },

    async loadProject(id: string): Promise<LoadedProject> {
      const db = await getDB()
      const row = await db.get(STORE_PROJECTS, id)
      if (!row) {
        await db.close()
        throw new Error(`Project not found: ${id}`)
      }
      const world = row.world as RennWorld
      // Load all global assets (not filtered by project)
      const assets = new Map<string, Blob>()
      const allAssets = await db.getAll(STORE_ASSETS)
      for (const asset of allAssets) {
        if (asset?.blob && asset?.assetId) {
          assets.set(asset.assetId, asset.blob as Blob)
        }
      }
      await db.close()
      return { world, assets }
    },

    async saveProject(
      id: string,
      name: string,
      data: { world: RennWorld; assets: Map<string, Blob> }
    ): Promise<void> {
      const db = await getDB()
      const updatedAt = Date.now()
      // Save project without assets (assets are stored globally)
      await db.put(STORE_PROJECTS, { id, name, world: data.world, updatedAt })
      // Save any new assets to global store
      for (const [assetId, blob] of data.assets) {
        const assetType = blob.type.startsWith('image') ? 'texture' : 'model'
        await db.put(STORE_ASSETS, { assetId, blob, type: assetType })
      }
      await db.close()
    },

    async deleteProject(id: string): Promise<void> {
      const db = await getDB()
      // Delete project only - assets persist globally
      await db.delete(STORE_PROJECTS, id)
      await db.close()
    },

    async exportProject(id: string): Promise<Blob> {
      const JSZip = (await import('jszip')).default
      const { world, assets } = await this.loadProject(id)
      const zip = new JSZip()
      zip.file('world.json', JSON.stringify(world, null, 2))
      const assetsFolder = zip.folder('assets')
      if (assetsFolder) {
        for (const [assetId, blob] of assets) {
          const ext = blob.type.includes('png') ? 'png' : blob.type.includes('glb') ? 'glb' : 'bin'
          assetsFolder.file(`${assetId}.${ext}`, blob)
        }
      }
      return zip.generateAsync({ type: 'blob' })
    },

    async importProject(file: File): Promise<{ id: string }> {
      const JSZip = (await import('jszip')).default
      const { validateWorldDocument } = await import('@/schema/validate')
      const zip = await JSZip.loadAsync(file)
      const worldFile = zip.file('world.json')
      if (!worldFile) throw new Error('Invalid project: missing world.json')
      const worldJson = JSON.parse(await worldFile.async('string'))
      validateWorldDocument(worldJson)
      const world = worldJson as RennWorld
      const assets = new Map<string, Blob>()
      const worldAssets = world.assets ?? {}
      for (const [assetId, ref] of Object.entries(worldAssets)) {
        const path = ref.path ?? `assets/${assetId}.bin`
        const f = zip.file(path)
        if (f) {
          const blob = await f.async('blob')
          assets.set(assetId, blob)
        }
      }
      for (const path of Object.keys(zip.files)) {
        if (!path.startsWith('assets/') || path.endsWith('/')) continue
        const assetId = path.replace(/^assets\//, '').replace(/\.[^.]+$/, '')
        if (assets.has(assetId)) continue
        const f = zip.file(path)
        if (f) {
          const blob = await f.async('blob')
          assets.set(assetId, blob)
        }
      }
      const id = generateProjectId()
      const name = file.name.replace(/\.zip$/i, '') || `Imported ${new Date().toLocaleString()}`
      const api = createIndexedDbPersistence()
      await api.saveProject(id, name, { world, assets })
      return { id }
    },

    // Global asset management methods
    async saveAsset(assetId: string, blob: Blob): Promise<void> {
      const db = await getDB()
      const assetType = blob.type.startsWith('image') ? 'texture' : 'model'
      await db.put(STORE_ASSETS, { assetId, blob, type: assetType })
      await db.close()
    },

    async deleteAsset(assetId: string): Promise<void> {
      const db = await getDB()
      await db.delete(STORE_ASSETS, assetId)
      await db.close()
    },

    async listAllAssets(): Promise<Array<{ assetId: string; type: string; size: number }>> {
      const db = await getDB()
      const allAssets = await db.getAll(STORE_ASSETS)
      await db.close()
      return allAssets.map((asset) => ({
        assetId: asset.assetId,
        type: asset.type ?? 'unknown',
        size: asset.blob instanceof Blob ? asset.blob.size : 0,
      }))
    },

    async loadAllAssets(): Promise<Map<string, Blob>> {
      const db = await getDB()
      const assets = new Map<string, Blob>()
      const allAssets = await db.getAll(STORE_ASSETS)
      for (const asset of allAssets) {
        if (asset?.blob && asset?.assetId) {
          assets.set(asset.assetId, asset.blob as Blob)
        }
      }
      await db.close()
      return assets
    },
  }
}
