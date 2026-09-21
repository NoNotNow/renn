/**
 * MCP logic verification: in-process client ↔ server, car moves + timeline rows.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createLogicVerificationMcpServer } from '@/agent/logicVerificationMcpServer'
import { LogicVerificationMcpSession } from '@/agent/logicVerificationMcpSession'
import {
  AGENT_VERIFICATION_CAR_WARMUP_STEPS,
  loadAgentVerificationCarWorld,
} from '@/agent/fixtures/agentVerificationCarWorld'
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

describe('Logic verification MCP (integration)', () => {
  afterEach(() => {
    resetTransformerWatchBridgeForTests()
    resetTransformerTraceBridgeForTests()
  })

  it('lists tools and drives car via MCP tool calls', async () => {
    const session = new LogicVerificationMcpSession()
    const mcp = createLogicVerificationMcpServer({ devToken: DEV_TOKEN, session })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await mcp.connect(serverTransport)

    const client = new Client({ name: 'vitest', version: '1.0.0' })
    await client.connect(clientTransport)

    const listed = await client.listTools()
    const names = listed.tools.map((t) => t.name).sort()
    expect(names).toContain('load_world_json')
    expect(names).toContain('run_for_sim_time')
    expect(names).toContain('run_timed_macro')
    expect(names).toContain('get_observation')

    await client.callTool({
      name: 'load_world_json',
      arguments: {
        devToken: DEV_TOKEN,
        world: loadAgentVerificationCarWorld(),
        warmupSteps: AGENT_VERIFICATION_CAR_WARMUP_STEPS,
      },
    })

    const macroResult = await client.callTool({
      name: 'run_timed_macro',
      arguments: {
        devToken: DEV_TOKEN,
        macro: {
          durationSimSec: 2,
          steps: [
            { atSimTime: 0, inputKeys: { w: true, d: true } },
            { atSimTime: 1, inputKeys: { w: true } },
          ],
          samples: [{ id: 'carPose', kind: 'entityPose', entityId: 'car', intervalMs: 50 }],
        },
      },
    })
    const macro = JSON.parse(toolText(macroResult)) as {
      snapshot: { poses: { car: { position: [number, number, number] } } }
      timeline: unknown[]
      events: Array<{ kind: string }>
    }
    expect(macro.snapshot.poses.car.position[2]).not.toBe(0)
    expect(macro.timeline.length).toBeGreaterThan(0)
    expect(macro.events.some((e) => e.kind === 'inputChange')).toBe(true)

    await client.callTool({
      name: 'stop_run',
      arguments: { devToken: DEV_TOKEN },
    })

    await client.close()
    await mcp.close()
  })
})
