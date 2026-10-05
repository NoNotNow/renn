import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getValidationErrors } from './validate'

// world_default is skipped: it still stores legacy inline transformers (migrated on load, not schema-valid as stored).
// Guards the world schema against pipe/stage metadata the shipped worlds carry (e.g. extended paramDefs).
describe('shipped example worlds validate against the world schema', () => {
  const root = join(process.cwd(), 'public/exampleWorlds')
  const ids = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'world_default').map((d) => d.name)
  it.each(ids)('%s', (id) => {
    const world = JSON.parse(readFileSync(join(root, id, 'world.json'), 'utf8'))
    expect(getValidationErrors(world)).toEqual([])
  })
})
