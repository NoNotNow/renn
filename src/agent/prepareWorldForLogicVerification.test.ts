import { describe, it, expect } from 'vitest'
import { prepareWorldForLogicVerification } from '@/agent/prepareWorldForLogicVerification'
import { loadAgentVerificationCarWorld } from '@/agent/fixtures/agentVerificationCarWorld'

describe('prepareWorldForLogicVerification', () => {
  it('migrates fixture world the same as bundle import prep', () => {
    const raw = structuredClone(loadAgentVerificationCarWorld()) as unknown as Record<string, unknown>
    const prepared = prepareWorldForLogicVerification(raw)
    expect(prepared.entities.some((e) => e.id === 'car')).toBe(true)
    expect(prepared.transformers).toBeDefined()
  })
})
