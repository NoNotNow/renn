import { describe, it, expect } from 'vitest'
import { discoverExampleWorldIdsFromBuild } from '@/utils/discoverExampleWorldIds'
import {
  listAgentDevExampleWorldIds,
  resetAgentDevExampleWorldIdCacheForTests,
} from '@/agent/agentDevExampleWorlds'
import { loadAgentExampleWorldFromDisk } from '@/agent/loadAgentExampleWorldFromDisk'

describe('agent dev example worlds', () => {
  it('lists ids from public/exampleWorlds on disk', async () => {
    resetAgentDevExampleWorldIdCacheForTests()
    const ids = await listAgentDevExampleWorldIds()
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9][a-z0-9_-]*$/i)
    }
  })

  it('build-time discovery matches disk list (world.json folders)', () => {
    const fromGlob = discoverExampleWorldIdsFromBuild()
    expect(fromGlob.length).toBeGreaterThan(0)
    expect(fromGlob).toContain('hunt')
    expect(fromGlob).toContain('self_drive_cube')
  })

  it('includes self_drive_cube on disk after export', async () => {
    resetAgentDevExampleWorldIdCacheForTests()
    const ids = await listAgentDevExampleWorldIds()
    expect(ids).toContain('self_drive_cube')
  })

  it('loads hunt example world with at least one asset when assets/ exists', async () => {
    const ids = await listAgentDevExampleWorldIds()
    if (!ids.includes('hunt')) return
    const loaded = await loadAgentExampleWorldFromDisk('hunt')
    expect(loaded.world.entities.length).toBeGreaterThan(0)
    expect(loaded.assets.size).toBeGreaterThan(0)
  })
})
