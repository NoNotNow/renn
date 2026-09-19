import { describe, it, expect } from 'vitest'
import { parseAgentDevAttachArgv } from './agentDevAttachRecipe.ts'

describe('parseAgentDevAttachArgv', () => {
  it('defaults to agent-starter bundle', () => {
    const opts = parseAgentDevAttachArgv([])
    expect(opts.bundle).toBe('agent-starter')
    expect(opts.fixture).toBeUndefined()
    expect(opts.steps).toBe(5)
  })

  it('parses fixture flag', () => {
    const opts = parseAgentDevAttachArgv(['--fixture', 'agentVerificationCarWorld', '--steps', '3'])
    expect(opts.fixture).toBe('agentVerificationCarWorld')
    expect(opts.bundle).toBeUndefined()
    expect(opts.steps).toBe(3)
  })

  it('rejects bundle and fixture together', () => {
    expect(() =>
      parseAgentDevAttachArgv(['--bundle', 'agent-starter', '--fixture', 'agentVerificationCarWorld']),
    ).toThrow(/only one/)
  })
})
