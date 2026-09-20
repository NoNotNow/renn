/**
 * Dev-only example worlds under public/exampleWorlds/ (matches Builder File → Example Worlds).
 * Ids are discovered from disk — do not hardcode product example names in agent code.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const EXAMPLE_WORLDS_DIR = path.resolve(MODULE_DIR, '../../public/exampleWorlds')

let cachedExampleWorldIds: string[] | null = null

export async function listAgentDevExampleWorldIds(): Promise<string[]> {
  if (cachedExampleWorldIds) return [...cachedExampleWorldIds]
  try {
    const entries = await fs.readdir(EXAMPLE_WORLDS_DIR, { withFileTypes: true })
    const ids: string[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const worldPath = path.join(EXAMPLE_WORLDS_DIR, entry.name, 'world.json')
      try {
        await fs.access(worldPath)
        ids.push(entry.name)
      } catch {
        // skip folders without world.json
      }
    }
    ids.sort()
    cachedExampleWorldIds = ids
    return [...ids]
  } catch {
    cachedExampleWorldIds = []
    return []
  }
}

export async function assertAgentDevExampleWorldId(exampleWorldId: string): Promise<void> {
  const trimmed = exampleWorldId.trim()
  if (!trimmed) {
    throw new Error('exampleWorldId is required')
  }
  const ids = await listAgentDevExampleWorldIds()
  if (!ids.includes(trimmed)) {
    throw new Error(`Example world not allowlisted: ${trimmed}`)
  }
}

/** Test helper: reset cached ids after fixture changes. */
export function resetAgentDevExampleWorldIdCacheForTests(): void {
  cachedExampleWorldIds = null
}
