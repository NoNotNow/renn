#!/usr/bin/env node
/**
 * In-process logic verification CLI — same tools as MCP stdio, for shell agents and CI
 * without Cursor's MCP panel. Each invocation uses a fresh session (no shared attach state).
 *
 * Usage:
 *   agent-cli.ts list
 *   agent-cli.ts call <toolName> '<json args without devToken>'
 *   agent-cli.ts recipe headless --bundle agent-starter [--steps N] [--sim-seconds S] [--probe-entity id]
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createLogicVerificationMcpServer } from '../../src/agent/logicVerificationMcpServer.ts'
import { resolveMcpDevToken } from '../../src/agent/logicVerificationMcpAuth.ts'
import { LogicVerificationMcpSession } from '../../src/agent/logicVerificationMcpSession.ts'

function toolText(result: unknown): string {
  const r = result as { content?: Array<{ type: string; text?: string }>; isError?: boolean }
  const block = r.content?.find((c) => c.type === 'text')
  if (!block || typeof block.text !== 'string') {
    throw new Error('Expected text tool result')
  }
  if (r.isError) {
    throw new Error(block.text)
  }
  return block.text
}

async function createInProcessClient(): Promise<{ client: Client; devToken: string }> {
  const devToken = resolveMcpDevToken()
  const session = new LogicVerificationMcpSession()
  const mcp = createLogicVerificationMcpServer({ devToken, session })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await mcp.connect(serverTransport)
  const client = new Client({ name: 'agent-cli', version: '1.0.0' })
  await client.connect(clientTransport)
  return { client, devToken }
}

async function callTool(
  client: Client,
  devToken: string,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = await client.callTool({
    name,
    arguments: { devToken, ...args },
  })
  return toolText(result)
}

function parseRecipeArgs(argv: string[]): {
  bundle?: string
  fixture?: string
  steps: number
  simSeconds?: number
  probeEntity?: string
  warmupSteps: number
} {
  let bundle: string | undefined
  let fixture: string | undefined
  let steps = 5
  let simSeconds: number | undefined
  let probeEntity: string | undefined
  let warmupSteps = 2

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--bundle' && argv[i + 1]) {
      bundle = argv[++i]
    } else if (a === '--fixture' && argv[i + 1]) {
      fixture = argv[++i]
    } else if (a === '--steps' && argv[i + 1]) {
      steps = Number(argv[++i])
    } else if (a === '--sim-seconds' && argv[i + 1]) {
      simSeconds = Number(argv[++i])
    } else if (a === '--probe-entity' && argv[i + 1]) {
      probeEntity = argv[++i]
    } else if (a === '--warmup-steps' && argv[i + 1]) {
      warmupSteps = Number(argv[++i])
    }
  }

  if (!bundle && !fixture) {
    bundle = 'agent-starter'
  }
  if (bundle && fixture) {
    throw new Error('Use only one of --bundle or --fixture')
  }
  if (simSeconds != null && !Number.isFinite(simSeconds)) {
    throw new Error('--sim-seconds must be a positive number')
  }
  if (!Number.isInteger(steps) || steps < 1) {
    throw new Error('--steps must be a positive integer')
  }

  return { bundle, fixture, steps, simSeconds, probeEntity, warmupSteps }
}

async function runHeadlessRecipe(argv: string[]): Promise<void> {
  const opts = parseRecipeArgs(argv)
  const { client, devToken } = await createInProcessClient()

  try {
    let loadSummary: Record<string, unknown>
    if (opts.fixture) {
      const text = await callTool(client, devToken, 'load_fixture', {
        fixtureId: opts.fixture,
        warmupSteps: opts.warmupSteps,
      })
      loadSummary = JSON.parse(text) as Record<string, unknown>
    } else {
      const text = await callTool(client, devToken, 'load_project_bundle', {
        bundleId: opts.bundle!,
        warmupSteps: opts.warmupSteps,
      })
      loadSummary = JSON.parse(text) as Record<string, unknown>
    }

    const probeEntity =
      opts.probeEntity ??
      (opts.bundle === 'agent-starter' ? 'agent-box' : undefined)

    if (probeEntity) {
      await callTool(client, devToken, 'register_probes', {
        probes: [{ id: 'pose', kind: 'entityPose', entityId: probeEntity, intervalMs: 50 }],
      })
    }

    await callTool(client, devToken, 'start_verification_run', {})

    let stepSummary: Record<string, unknown> | undefined
    if (opts.simSeconds != null && opts.simSeconds > 0) {
      const text = await callTool(client, devToken, 'run_for_sim_time', {
        seconds: opts.simSeconds,
      })
      stepSummary = JSON.parse(text) as Record<string, unknown>
    } else {
      const text = await callTool(client, devToken, 'step', { count: opts.steps })
      stepSummary = JSON.parse(text) as Record<string, unknown>
    }

    const obsText = await callTool(client, devToken, 'get_observation', {})
    const observation = JSON.parse(obsText) as Record<string, unknown>

    await callTool(client, devToken, 'stop_run', {})

    console.log(
      JSON.stringify(
        {
          ok: true,
          recipe: 'headless',
          load: loadSummary,
          step: stepSummary,
          observation: {
            timelineLength: Array.isArray(observation.timeline)
              ? observation.timeline.length
              : 0,
            compileErrors: observation.compileErrors,
            runtimeErrors: observation.runtimeErrors,
            snapshotEntityIds: observation.snapshot
              ? Object.keys(
                  (observation.snapshot as { poses?: Record<string, unknown> }).poses ?? {},
                ).sort()
              : [],
          },
        },
        null,
        2,
      ),
    )
  } finally {
    await client.close()
  }
}

async function runAttachInspectRecipe(argv: string[]): Promise<void> {
  let entityId = ''
  let includeCode = false
  let projectName: string | undefined
  let waitForBrowserMs = 60_000

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--entity' && argv[i + 1]) {
      entityId = argv[++i]!
    } else if (a === '--include-code') {
      includeCode = true
    } else if (a === '--project' && argv[i + 1]) {
      projectName = argv[++i]
    } else if (a === '--wait-ms' && argv[i + 1]) {
      waitForBrowserMs = Number(argv[++i])
    }
  }

  if (!entityId.trim()) {
    throw new Error('Usage: agent-cli.ts recipe attach-inspect --entity <id> [--include-code] [--project name]')
  }

  const session = new LogicVerificationMcpSession()
  const devToken = resolveMcpDevToken()
  try {
    await session.attachBrowser({ devToken, waitForBrowserMs })
    const summary = await session.getEntityAuthoringSummary({
      entityId: entityId.trim(),
      includeCode,
      projectName,
    })
    console.log(JSON.stringify(summary, null, 2))
  } finally {
    await session.dispose()
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)

  if (!command || command === '--help' || command === '-h') {
    console.log(`Usage:
  agent-cli.ts list
  agent-cli.ts call <toolName> '<json>'
  agent-cli.ts recipe headless [--bundle id | --fixture id] [--steps N] [--sim-seconds S] [--probe-entity id]
  agent-cli.ts recipe attach-inspect --entity <id> [--include-code] [--project name] [--wait-ms N]

RENN_MCP_DEV_TOKEN defaults to renn-dev-mcp-local in non-production.`)
    return
  }

  if (command === 'list') {
    const { client } = await createInProcessClient()
    try {
      const { tools } = await client.listTools()
      console.log(tools.map((t) => t.name).sort().join('\n'))
    } finally {
      await client.close()
    }
    return
  }

  if (command === 'recipe' && rest[0] === 'headless') {
    await runHeadlessRecipe(rest.slice(1))
    return
  }

  if (command === 'recipe' && rest[0] === 'attach-inspect') {
    await runAttachInspectRecipe(rest.slice(1))
    return
  }

  if (command === 'call') {
    const toolName = rest[0]
    const jsonRaw = rest[1]
    if (!toolName || jsonRaw == null) {
      throw new Error('Usage: agent-cli.ts call <toolName> \'<json>\'')
    }
    const args = JSON.parse(jsonRaw) as Record<string, unknown>
    const { client, devToken } = await createInProcessClient()
    try {
      const text = await callTool(client, devToken, toolName, args)
      console.log(text)
    } finally {
      await client.close()
    }
    return
  }

  throw new Error(`Unknown command: ${command}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
