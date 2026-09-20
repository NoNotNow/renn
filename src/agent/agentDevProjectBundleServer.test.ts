import { describe, it, expect } from 'vitest'
import {
  loadAgentDevExampleWorldPayload,
  loadAgentDevFixturePayload,
  loadAgentDevProjectBundlePayload,
} from '@/agent/agentDevProjectBundleServer'
import { listAgentDevExampleWorldIds } from '@/agent/agentDevExampleWorlds'

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

  it('loads allowlisted example world payload', async () => {
    const ids = await listAgentDevExampleWorldIds()
    expect(ids.length).toBeGreaterThan(0)
    const exampleWorldId = ids[0]!
    const payload = await loadAgentDevExampleWorldPayload(exampleWorldId)
    expect(payload.kind).toBe('exampleWorld')
    expect(payload.id).toBe(exampleWorldId)
    expect(payload.world.entities.length).toBeGreaterThan(0)
  })
})
