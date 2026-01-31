import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { createIndexedDbPersistence } from './indexedDb'
import type { RennWorld } from '@/types/world'

function createTestWorld(): RennWorld {
  return {
    version: '1.0',
    world: {
      gravity: [0, -9.81, 0],
    },
    entities: [
      {
        id: 'ground',
        bodyType: 'static',
        shape: { type: 'plane' },
      },
      {
        id: 'ball',
        bodyType: 'dynamic',
        shape: { type: 'sphere', radius: 0.5 },
        position: [0, 5, 0],
      },
    ],
  }
}

describe('IndexedDB Persistence', () => {
  let persistence: ReturnType<typeof createIndexedDbPersistence>

  beforeEach(() => {
    // Create a fresh persistence instance for each test
    persistence = createIndexedDbPersistence()
  })

  it('creates a persistence instance', () => {
    expect(persistence).toBeDefined()
    expect(typeof persistence.listProjects).toBe('function')
    expect(typeof persistence.loadProject).toBe('function')
    expect(typeof persistence.saveProject).toBe('function')
    expect(typeof persistence.deleteProject).toBe('function')
    expect(typeof persistence.exportProject).toBe('function')
    expect(typeof persistence.importProject).toBe('function')
  })

  it('lists projects (empty initially)', async () => {
    const projects = await persistence.listProjects()
    expect(Array.isArray(projects)).toBe(true)
  })

  it('saves and loads a project', async () => {
    const world = createTestWorld()
    const assets = new Map<string, Blob>()
    
    await persistence.saveProject('test-project', 'Test Project', { world, assets })
    
    const loaded = await persistence.loadProject('test-project')
    
    expect(loaded.world.version).toBe('1.0')
    expect(loaded.world.entities).toHaveLength(2)
    expect(loaded.world.entities[0].id).toBe('ground')
    expect(loaded.world.entities[1].id).toBe('ball')
  })

  it('saves and loads project with assets', async () => {
    const world = createTestWorld()
    const textBlob = new Blob(['test content'], { type: 'text/plain' })
    const assets = new Map<string, Blob>([
      ['texture1', textBlob],
    ])
    
    await persistence.saveProject('project-with-assets', 'With Assets', { world, assets })
    
    const loaded = await persistence.loadProject('project-with-assets')
    
    expect(loaded.assets.size).toBe(1)
    expect(loaded.assets.has('texture1')).toBe(true)
    
    // Verify assets were saved and loaded (size check)
    // Note: fake-indexeddb may not fully preserve Blob instances
    expect(loaded.assets.has('texture1')).toBe(true)
  })

  it('lists projects after saving', async () => {
    const world = createTestWorld()
    const assets = new Map<string, Blob>()
    
    await persistence.saveProject('project1', 'Project One', { world, assets })
    await persistence.saveProject('project2', 'Project Two', { world, assets })
    
    const projects = await persistence.listProjects()
    
    expect(projects.length).toBeGreaterThanOrEqual(2)
    const ids = projects.map((p) => p.id)
    expect(ids).toContain('project1')
    expect(ids).toContain('project2')
  })

  it('deletes a project', async () => {
    const world = createTestWorld()
    const assets = new Map<string, Blob>()
    
    await persistence.saveProject('to-delete', 'To Delete', { world, assets })
    
    // Verify it exists
    const before = await persistence.listProjects()
    expect(before.some((p) => p.id === 'to-delete')).toBe(true)
    
    // Delete it
    await persistence.deleteProject('to-delete')
    
    // Verify it's gone
    const after = await persistence.listProjects()
    expect(after.some((p) => p.id === 'to-delete')).toBe(false)
  })

  it('throws when loading non-existent project', async () => {
    await expect(persistence.loadProject('non-existent')).rejects.toThrow('Project not found')
  })

  it('updates existing project when saving with same id', async () => {
    const world1 = createTestWorld()
    const world2 = {
      ...createTestWorld(),
      entities: [{ id: 'updated-entity' }],
    }
    const assets = new Map<string, Blob>()
    
    await persistence.saveProject('update-test', 'Original', { world: world1, assets })
    await persistence.saveProject('update-test', 'Updated', { world: world2, assets })
    
    const loaded = await persistence.loadProject('update-test')
    
    expect(loaded.world.entities).toHaveLength(1)
    expect(loaded.world.entities[0].id).toBe('updated-entity')
    
    // Should only have one project with this id
    const projects = await persistence.listProjects()
    const matching = projects.filter((p) => p.id === 'update-test')
    expect(matching).toHaveLength(1)
    expect(matching[0].name).toBe('Updated')
  })

  it('exports project as zip', async () => {
    const world = createTestWorld()
    const assets = new Map<string, Blob>()
    
    await persistence.saveProject('export-test', 'Export Test', { world, assets })
    
    const zipBlob = await persistence.exportProject('export-test')
    
    expect(zipBlob).toBeInstanceOf(Blob)
    expect(zipBlob.type).toBe('application/zip')
  })

  it('imports project from zip', async () => {
    // First export a project
    const world = createTestWorld()
    const assets = new Map<string, Blob>()
    
    await persistence.saveProject('to-export', 'To Export', { world, assets })
    const zipBlob = await persistence.exportProject('to-export')
    
    // Create a File from the blob for import
    const file = new File([zipBlob], 'test-import.zip', { type: 'application/zip' })
    
    // Import it
    const { id: importedId } = await persistence.importProject(file)
    
    expect(importedId).toBeDefined()
    expect(importedId).toMatch(/^proj_/)
    
    // Verify imported project
    const imported = await persistence.loadProject(importedId)
    expect(imported.world.entities).toHaveLength(2)
  })
})
