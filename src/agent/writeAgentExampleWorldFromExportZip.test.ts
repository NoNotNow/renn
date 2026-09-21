import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'
import {
  writeAgentExampleWorldFromExportZip,
  isValidExampleWorldFolderId,
} from '@/agent/writeAgentExampleWorldFromExportZip'
import { resolveAgentExampleWorldDirectory } from '@/agent/loadAgentExampleWorldFromDisk'
import { resetAgentDevExampleWorldIdCacheForTests } from '@/agent/agentDevExampleWorlds'

describe('writeAgentExampleWorldFromExportZip', () => {
  const testId = 'agent-export-test-world'

  beforeEach(() => {
    resetAgentDevExampleWorldIdCacheForTests()
  })

  afterEach(async () => {
    resetAgentDevExampleWorldIdCacheForTests()
    const dir = resolveAgentExampleWorldDirectory(testId)
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('rejects invalid folder ids', () => {
    expect(isValidExampleWorldFolderId('ok_name-1')).toBe(true)
    expect(isValidExampleWorldFolderId('../evil')).toBe(false)
    expect(isValidExampleWorldFolderId('')).toBe(false)
  })

  it('unpacks world.json and assets into public/exampleWorlds', async () => {
    const zip = new JSZip()
    zip.file('world.json', JSON.stringify({ version: '1.0', world: {}, entities: [] }))
    zip.file('assets/test-asset.glb', 'fake-glb-bytes')
    const bytes = await zip.generateAsync({ type: 'nodebuffer' })

    const result = await writeAgentExampleWorldFromExportZip(testId, bytes)
    expect(result.exampleWorldId).toBe(testId)
    expect(result.assetFileCount).toBe(1)

    const worldRaw = await fs.readFile(path.join(result.folderPath, 'world.json'), 'utf8')
    expect(JSON.parse(worldRaw).version).toBe('1.0')
    const asset = await fs.readFile(path.join(result.folderPath, 'assets/test-asset.glb'), 'utf8')
    expect(asset).toBe('fake-glb-bytes')
  })
})
