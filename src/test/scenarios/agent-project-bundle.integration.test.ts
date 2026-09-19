/**
 * Agent project bundle: loader + MCP load_project_bundle + headless step.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createLogicVerificationMcpServer } from '@/agent/logicVerificationMcpServer'
import { LogicVerificationMcpSession } from '@/agent/logicVerificationMcpSession'
import { loadAgentProjectBundle } from '@/agent/loadAgentProjectBundle'
import { resetTransformerWatchBridgeForTests } from '@/runtime/transformerWatchBridge'
import { resetTransformerTraceBridgeForTests } from '@/runtime/transformerTraceBridge'

const DEV_TOKEN = 'vitest-mcp-token'

function toolText(result: unknown): string {
  const r = result as { content?: Array<{ type: string; text?: string }> }
  const block = r.content?.find((c) => c.type === 'text')
  if (!block || typeof block.text !== 'string') {
    throw new Error('Expected text tool result')
  }
  return block.text
}

describe('Agent project bundle (integration)', () => {
  afterEach(() => {
    resetTransformerWatchBridgeForTests()
    resetTransformerTraceBridgeForTests()
  })

  it('loads starter via MCP and steps with entity pose probe', async () => {
    const bundle = await loadAgentProjectBundle('agent-starter')
    expect(bundle.world.entities.find((e) => e.id === 'agent-box')).toBeDefined()

    const session = new LogicVerificationMcpSession()
    const mcp = createLogicVerificationMcpServer({ devToken: DEV_TOKEN, session })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await mcp.connect(serverTransport)

    const client = new Client({ name: 'vitest', version: '1.0.0' })
    await client.connect(clientTransport)

    const listed = await client.listTools()
    expect(listed.tools.map((t) => t.name)).toContain('load_project_bundle')

    const loadResult = await client.callTool({
      name: 'load_project_bundle',
      arguments: { devToken: DEV_TOKEN, bundleId: 'agent-starter', warmupSteps: 2 },
    })
    const loaded = JSON.parse(toolText(loadResult)) as { bundleId: string; assetCount: number }
    expect(loaded.bundleId).toBe('agent-starter')

    await client.callTool({
      name: 'register_probes',
      arguments: {
        devToken: DEV_TOKEN,
        probes: [{ id: 'boxPose', kind: 'entityPose', entityId: 'agent-box', intervalMs: 50 }],
      },
    })

    await client.callTool({
      name: 'start_verification_run',
      arguments: { devToken: DEV_TOKEN },
    })

    const stepResult = await client.callTool({
      name: 'step',
      arguments: { devToken: DEV_TOKEN, count: 5 },
    })
    const stepped = JSON.parse(toolText(stepResult)) as {
      poses: { 'agent-box'?: { position: [number, number, number] } }
    }
    expect(stepped.poses['agent-box']?.position[1]).toBeGreaterThan(0)

    const obsResult = await client.callTool({
      name: 'get_observation',
      arguments: { devToken: DEV_TOKEN },
    })
    const obs = JSON.parse(toolText(obsResult)) as { timeline: unknown[] }
    expect(obs.timeline.length).toBeGreaterThan(0)

    await client.callTool({ name: 'stop_run', arguments: { devToken: DEV_TOKEN } })
    await client.close()
  })
})
