import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { RennWorld } from '@/types/world'
import { avCodeDrift, avStackVersion } from '@/globalPipeline/avStackVersion'
import { updateWorldFromGlobalLibrary } from '@/globalPipeline/globalOrigin'
import { shippedLibrary } from '@/test/avLab/lab'

/**
 * Guard: the AV stage code embedded in the example world that users load (File -> Example Worlds) must be exactly the
 * current shipped library code. Fix a failure with `npm run sync:global-pipeline` (it exports the library code into the world).
 */
describe('example worlds embed the current AV stack code', () => {
  for (const id of ['self_hunt_flexible']) {
    it(`${id}/world.json matches the shipped library (same stack version, nothing to upgrade)`, () => {
      const file = path.resolve(__dirname, '../../public/exampleWorlds', id, 'world.json')
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as RennWorld
      const lib = shippedLibrary()
      const upgraded = updateWorldFromGlobalLibrary(raw, lib).world
      expect(avCodeDrift(raw, lib)).toEqual({ stale: [], diverged: [] })
      expect(avStackVersion(raw)).toBe(avStackVersion(upgraded))
      expect(avStackVersion(raw)).not.toBe('none')
    })
  }
})
