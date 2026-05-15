import { describe, it, expect } from 'vitest'
import { sampleWorld } from './sampleWorld'
import { validateWorldDocument } from '@/schema/validate'

describe('sampleWorld', () => {
  it('passes JSON schema validation', () => {
    expect(() => validateWorldDocument(sampleWorld)).not.toThrow()
  })

  it('declares unique entity ids', () => {
    const ids = sampleWorld.entities.map((e) => e.id)
    const set = new Set(ids)
    expect(set.size).toBe(ids.length)
  })

  it('contains the expected camera target entity', () => {
    const target = sampleWorld.world.camera?.target
    expect(target).toBeDefined()
    expect(sampleWorld.entities.some((e) => e.id === target)).toBe(true)
  })

  it('has exactly one ground entity (static plane)', () => {
    const grounds = sampleWorld.entities.filter(
      (e) => e.bodyType === 'static' && e.shape?.type === 'plane'
    )
    expect(grounds).toHaveLength(1)
    expect(grounds[0]!.id).toBe('ground')
  })

  it('player car entity has both input and car2 transformers', () => {
    const car = sampleWorld.entities.find((e) => e.id === 'car')
    expect(car).toBeDefined()
    const types = (car!.transformers ?? []).map((t) => t.type)
    expect(types).toContain('input')
    expect(types).toContain('car2')
  })

  it('all dynamic entities have a positive mass', () => {
    const dynamics = sampleWorld.entities.filter((e) => e.bodyType === 'dynamic')
    expect(dynamics.length).toBeGreaterThan(0)
    for (const d of dynamics) {
      expect(d.mass).toBeGreaterThan(0)
    }
  })

  it('declares a deterministic version string', () => {
    expect(sampleWorld.version).toBe('1.0')
  })

  it('disables distance culling by default for new worlds', () => {
    expect(sampleWorld.world.distanceCulling).toBe(false)
  })
})
