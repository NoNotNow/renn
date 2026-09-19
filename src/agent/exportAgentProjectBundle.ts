/**
 * Node-only: write patched world JSON back to an allowlisted agent project bundle.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import type { RennWorld } from '@/types/world'
import { resolveAgentProjectBundleDirectory } from '@/agent/loadAgentProjectBundle'

export async function exportAgentProjectBundleWorld(
  bundleId: string,
  world: RennWorld,
): Promise<{ bundleId: string; worldPath: string }> {
  const bundlePath = resolveAgentProjectBundleDirectory(bundleId)
  const worldPath = path.join(bundlePath, 'world.json')
  await fs.writeFile(worldPath, `${JSON.stringify(world, null, 2)}\n`, 'utf8')
  return { bundleId, worldPath }
}
