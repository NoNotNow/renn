import { describe, it, expect } from 'vitest'
import {
  isValidAgentProjectBundleId,
  listAgentProjectBundleIds,
  loadAgentProjectBundle,
  resolveAgentProjectBundleDirectory,
} from '@/agent/loadAgentProjectBundle'

describe('loadAgentProjectBundle', () => {
  it('lists agent-starter among known bundle ids', async () => {
    const ids = await listAgentProjectBundleIds()
    expect(ids).toContain('agent-starter')
  })

  it('loads agent-starter world with pipe-bound custom stage', async () => {
    const bundle = await loadAgentProjectBundle('agent-starter')
    expect(bundle.world.entities.some((e) => e.id === 'agent-box')).toBe(true)
    expect(bundle.world.transformers?.author_stage?.type).toBe('custom')
    expect(bundle.world.transformerPipes?.agent_pipe?.stageIds).toContain('author_stage')
    expect(bundle.world.transformerPipes?.agent_pipe?.stages?.[0]?.type).toBe('custom')
    expect(bundle.assets.size).toBe(0)
  })

  it('rejects invalid and traversal-like bundle ids', () => {
    expect(isValidAgentProjectBundleId('../evil')).toBe(false)
    expect(isValidAgentProjectBundleId('')).toBe(false)
    expect(() => resolveAgentProjectBundleDirectory('../evil')).toThrow(/Invalid bundle id/)
    expect(() => resolveAgentProjectBundleDirectory('..')).toThrow(/Invalid bundle id/)
  })

  it('throws for unknown bundle id', async () => {
    await expect(loadAgentProjectBundle('no-such-bundle-xyz')).rejects.toThrow(/not found/)
  })
})
