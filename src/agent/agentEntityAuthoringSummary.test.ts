import { describe, it, expect } from 'vitest'
import { buildEntityAuthoringSummary } from '@/agent/agentEntityAuthoringSummary'
import {
  AGENT_VERIFICATION_CAR_ENTITY_ID,
  loadAgentVerificationCarWorld,
} from '@/agent/fixtures/agentVerificationCarWorld'

describe('buildEntityAuthoringSummary', () => {
  it('returns pipe stack and stage metadata for a piped entity', () => {
    const world = loadAgentVerificationCarWorld()
    const car = world.entities.find((e) => e.id === AGENT_VERIFICATION_CAR_ENTITY_ID)
    expect(car).toBeDefined()

    const summary = buildEntityAuthoringSummary(world, car!.id, { includeCode: false })
    expect(summary.entityId).toBe(AGENT_VERIFICATION_CAR_ENTITY_ID)
    expect(summary.stages.length).toBeGreaterThan(0)
    expect(summary.runtimeStageOrder.length).toBeGreaterThan(0)
  })

  it('throws when entity id is missing', () => {
    const world = loadAgentVerificationCarWorld()
    expect(() => buildEntityAuthoringSummary(world, 'missing')).toThrow(/Entity not found/)
  })
})
