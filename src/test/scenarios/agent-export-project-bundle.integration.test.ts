/**
 * export_project_bundle writes world JSON for the loaded bundle (restores file after test).
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createLogicVerificationMcpServer } from '@/agent/logicVerificationMcpServer'
import { LogicVerificationMcpSession } from '@/agent/logicVerificationMcpSession'
import { AGENT_PROJECT_BUNDLES_DIR } from '@/agent/loadAgentProjectBundle'

const DEV_TOKEN = 'vitest-mcp-token'
const WORLD_PATH = path.join(AGENT_PROJECT_BUNDLES_DIR, 'agent-starter', 'world.json')

function toolText(result: unknown): string {
  const r = result as { content?: Array<{ type: string; text?: string }> }
  const block = r.content?.find((c) => c.type === 'text')
  if (!block || typeof block.text !== 'string') {
    throw new Error('Expected text tool result')
  }
  return block.text
}

describe('export_project_bundle (integration)', () => {
  let originalWorldJson: string

  afterAll(async () => {
    await fs.writeFile(WORLD_PATH, originalWorldJson, 'utf8')
  })

  it('writes patched metadata to allowlisted bundle world.json', async () => {
    originalWorldJson = await fs.readFile(WORLD_PATH, 'utf8')
    const parsed = JSON.parse(originalWorldJson) as { world?: { title?: string } }
    const marker = parsed.world?.title ?? 'Agent starter'

    const session = new LogicVerificationMcpSession()
    const mcp = createLogicVerificationMcpServer({ devToken: DEV_TOKEN, session })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await mcp.connect(serverTransport)

    const client = new Client({ name: 'vitest', version: '1.0.0' })
    await client.connect(clientTransport)

    await client.callTool({
      name: 'load_project_bundle',
      arguments: { devToken: DEV_TOKEN, bundleId: 'agent-starter', warmupSteps: 0 },
    })

    await client.callTool({
      name: 'apply_world_patch',
      arguments: {
        devToken: DEV_TOKEN,
        entities: { update: { 'agent-box': { name: 'Export probe box' } } },
      },
    })

    const exportText = toolText(
      await client.callTool({
        name: 'export_project_bundle',
        arguments: { devToken: DEV_TOKEN },
      }),
    )
    const exported = JSON.parse(exportText) as { exported: boolean; bundleId: string }
    expect(exported.exported).toBe(true)
    expect(exported.bundleId).toBe('agent-starter')

    const onDisk = JSON.parse(await fs.readFile(WORLD_PATH, 'utf8')) as {
      entities: Array<{ id: string; name?: string }>
    }
    expect(onDisk.entities.find((e) => e.id === 'agent-box')?.name).toBe('Export probe box')

    // Restore name in memory is fine; afterAll restores full file including marker sanity
    expect(marker.length).toBeGreaterThan(0)

    await client.callTool({ name: 'stop_run', arguments: { devToken: DEV_TOKEN } })
    await client.close()
  })
})
