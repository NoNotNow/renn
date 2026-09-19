/**
 * In-process headless recipe (parity with npm run agent:recipe-headless) without exec tsx.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createLogicVerificationMcpServer } from '@/agent/logicVerificationMcpServer'
import { LogicVerificationMcpSession } from '@/agent/logicVerificationMcpSession'
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

describe('Agent headless recipe (integration)', () => {
  afterEach(() => {
    resetTransformerWatchBridgeForTests()
    resetTransformerTraceBridgeForTests()
  })

  it('runs load → probe → step → observe → stop on agent-starter', async () => {
    const session = new LogicVerificationMcpSession()
    const mcp = createLogicVerificationMcpServer({ devToken: DEV_TOKEN, session })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await mcp.connect(serverTransport)

    const client = new Client({ name: 'vitest', version: '1.0.0' })
    await client.connect(clientTransport)

    const loadText = toolText(
      await client.callTool({
        name: 'load_project_bundle',
        arguments: { devToken: DEV_TOKEN, bundleId: 'agent-starter', warmupSteps: 2 },
      }),
    )
    const loaded = JSON.parse(loadText) as { bundleId: string }
    expect(loaded.bundleId).toBe('agent-starter')

    await client.callTool({
      name: 'register_probes',
      arguments: {
        devToken: DEV_TOKEN,
        probes: [{ id: 'pose', kind: 'entityPose', entityId: 'agent-box', intervalMs: 50 }],
      },
    })

    await client.callTool({
      name: 'start_verification_run',
      arguments: { devToken: DEV_TOKEN },
    })

    const stepText = toolText(
      await client.callTool({
        name: 'step',
        arguments: { devToken: DEV_TOKEN, count: 5 },
      }),
    )
    const stepped = JSON.parse(stepText) as { poses: Record<string, unknown> }
    expect(stepped.poses['agent-box']).toBeDefined()

    const obsText = toolText(
      await client.callTool({
        name: 'get_observation',
        arguments: { devToken: DEV_TOKEN },
      }),
    )
    const obs = JSON.parse(obsText) as { timeline: unknown[] }
    expect(obs.timeline.length).toBeGreaterThan(0)

    await client.callTool({ name: 'stop_run', arguments: { devToken: DEV_TOKEN } })
    await client.close()
  })
})
