/**
 * Node-only: unpack an export-shaped project zip into public/exampleWorlds/<id>/.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'
import { resolveAgentExampleWorldDirectory } from '@/agent/loadAgentExampleWorldFromDisk'
import { invalidateAgentDevExampleWorldIdCache } from '@/agent/agentDevExampleWorlds'

const EXAMPLE_WORLD_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

export function isValidExampleWorldFolderId(exampleWorldId: string): boolean {
  const trimmed = exampleWorldId.trim()
  if (!trimmed || trimmed.length > 120) return false
  return EXAMPLE_WORLD_ID_PATTERN.test(trimmed)
}

function assertSafeZipEntryPath(relPath: string): void {
  const normalized = relPath.replace(/\\/g, '/')
  if (path.isAbsolute(normalized) || normalized.split('/').includes('..')) {
    throw new Error(`Unsafe zip entry path: ${relPath}`)
  }
}

export type WriteAgentExampleWorldResult = {
  exampleWorldId: string
  folderPath: string
  worldJsonPath: string
  assetFileCount: number
}

export async function writeAgentExampleWorldFromExportZip(
  exampleWorldId: string,
  zipBytes: Buffer | Uint8Array,
): Promise<WriteAgentExampleWorldResult> {
  const trimmed = exampleWorldId.trim()
  if (!isValidExampleWorldFolderId(trimmed)) {
    throw new Error(
      `Invalid exampleWorldId "${exampleWorldId}" — use letters, digits, hyphen, underscore`,
    )
  }

  const zip = await JSZip.loadAsync(zipBytes)
  const worldFile = zip.file('world.json')
  if (!worldFile) {
    throw new Error('Invalid export zip: missing world.json at zip root')
  }

  const folderPath = resolveAgentExampleWorldDirectory(trimmed)
  await fs.mkdir(folderPath, { recursive: true })

  let assetFileCount = 0
  const entries = Object.values(zip.files)
  for (const entry of entries) {
    if (entry.dir) continue
    assertSafeZipEntryPath(entry.name)
    const destPath = path.join(folderPath, entry.name)
    const resolvedDest = path.resolve(destPath)
    const resolvedRoot = path.resolve(folderPath)
    if (resolvedDest !== resolvedRoot && !resolvedDest.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new Error(`Zip entry escapes example world folder: ${entry.name}`)
    }
    await fs.mkdir(path.dirname(resolvedDest), { recursive: true })
    const data = await entry.async('nodebuffer')
    await fs.writeFile(resolvedDest, data)
    if (entry.name.startsWith('assets/') && entry.name !== 'assets/') {
      assetFileCount += 1
    }
  }

  invalidateAgentDevExampleWorldIdCache()

  return {
    exampleWorldId: trimmed,
    folderPath,
    worldJsonPath: path.join(folderPath, 'world.json'),
    assetFileCount,
  }
}
