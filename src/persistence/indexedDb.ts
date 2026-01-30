import { openDB, type IDBPDatabase } from 'idb'
import type { RennWorld } from '@/types/world'
import type { ProjectMeta, LoadedProject, PersistenceAPI } from './types'

const DB_NAME = 'renn-worlds'
const DB_VERSION = 1
const STORE_PROJECTS = 'projects'
const STORE_ASSETS = 'assets'

function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        db.createObjectStore(STORE_ASSETS, { keyPath: ['projectId', 'assetId'] })
      }
    },
  })
}

function generateId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
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
      const assets = new Map<string, Blob>()
      const assetKeys = await db.getAllKeys(STORE_ASSETS)
      for (const key of assetKeys) {
        const [projectId, assetId] = key as [string, string]
        if (projectId === id) {
          const a = await db.get(STORE_ASSETS, key)
          if (a?.blob) assets.set(assetId, a.blob as Blob)
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
      await db.put(STORE_PROJECTS, { id, name, world: data.world, updatedAt })
      const existingKeys = await db.getAllKeys(STORE_ASSETS)
      for (const key of existingKeys) {
        const [projectId] = key as [string, string]
        if (projectId === id) await db.delete(STORE_ASSETS, key)
      }
      for (const [assetId, blob] of data.assets) {
        await db.put(STORE_ASSETS, { projectId: id, assetId, blob })
      }
      await db.close()
    },

    async deleteProject(id: string): Promise<void> {
      const db = await getDB()
      await db.delete(STORE_PROJECTS, id)
      const keys = await db.getAllKeys(STORE_ASSETS)
      for (const key of keys) {
        const [projectId] = key as [string, string]
        if (projectId === id) await db.delete(STORE_ASSETS, key)
      }
      await db.close()
    },

    async exportProject(id: string): Promise<Blob> {
      const { JSZip } = await import('jszip')
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
      const { JSZip } = await import('jszip')
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
      const id = generateId()
      const name = file.name.replace(/\.zip$/i, '') || `Imported ${new Date().toLocaleString()}`
      const api = createIndexedDbPersistence()
      await api.saveProject(id, name, { world, assets })
      return { id }
    },
  }
}
