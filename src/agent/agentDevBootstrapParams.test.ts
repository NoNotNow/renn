import { describe, it, expect } from 'vitest'
import {
  appendAgentDevBootstrapToUrl,
  agentDevProjectBundleApiPath,
  parseAgentDevBootstrapTarget,
  RENN_AGENT_BUNDLE_QUERY,
  RENN_AGENT_FIXTURE_QUERY,
} from '@/agent/agentDevBootstrapParams'

describe('agentDevBootstrapParams', () => {
  it('parses bundle query param', () => {
    const params = new URLSearchParams(`${RENN_AGENT_BUNDLE_QUERY}=agent-starter`)
    expect(parseAgentDevBootstrapTarget(params)).toEqual({
      kind: 'bundle',
      bundleId: 'agent-starter',
    })
  })

  it('rejects multiple bootstrap params', () => {
    const params = new URLSearchParams(
      `${RENN_AGENT_BUNDLE_QUERY}=agent-starter&${RENN_AGENT_FIXTURE_QUERY}=agentVerificationCarWorld`,
    )
    expect(() => parseAgentDevBootstrapTarget(params)).toThrow(/only one/)
  })

  it('parses example world query param', () => {
    const params = new URLSearchParams('rennAgentExampleWorld=world1')
    expect(parseAgentDevBootstrapTarget(params)).toEqual({
      kind: 'exampleWorld',
      exampleWorldId: 'world1',
    })
  })

  it('appends bundle to builder URL', () => {
    const url = appendAgentDevBootstrapToUrl('http://localhost:5173/renn/', {
      kind: 'bundle',
      bundleId: 'agent-starter',
    })
    expect(url).toContain(`${RENN_AGENT_BUNDLE_QUERY}=agent-starter`)
  })

  it('builds dev middleware API path', () => {
    expect(agentDevProjectBundleApiPath('agent-starter')).toBe(
      '/__renn-agent/dev/project-bundle/agent-starter',
    )
  })
})
