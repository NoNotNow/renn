import { describe, it, expect } from 'vitest'
import {
  loadAgentDevFixturePayload,
  loadAgentDevProjectBundlePayload,
} from '@/agent/agentDevProjectBundleServer'

describe('agentDevProjectBundleServer', () => {
  it('loads agent-starter bundle payload', async () => {
    const payload = await loadAgentDevProjectBundlePayload('agent-starter')
    expect(payload.kind).toBe('bundle')
    expect(payload.id).toBe('agent-starter')
    expect(payload.world.entities.some((e) => e.id === 'agent-box')).toBe(true)
  })

  it('loads verification car fixture payload', async () => {
    const payload = await loadAgentDevFixturePayload('agentVerificationCarWorld')
    expect(payload.kind).toBe('fixture')
    expect(payload.world.entities.some((e) => e.id === 'car')).toBe(true)
  })

  it('rejects unknown bundle id', async () => {
    await expect(loadAgentDevProjectBundlePayload('no-such-bundle-xyz')).rejects.toThrow(/not found/)
  })
})
