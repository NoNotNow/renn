/**
 * MCP tool registration for logic verification (thin layer over LogicVerificationMcpSession).
 */

import * as z from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  assertMcpDevGuardrails,
  resolveMcpDevToken,
  verifyMcpDevToken,
} from '@/agent/logicVerificationMcpAuth'
import { LogicVerificationMcpSession } from '@/agent/logicVerificationMcpSession'
import type { LogicVerificationWorldPatch } from '@/agent/applyLogicVerificationWorldPatch'

const devTokenSchema = z.string().describe('Must match RENN_MCP_DEV_TOKEN')

function jsonText(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
  }
}

export type CreateLogicVerificationMcpServerOptions = {
  devToken?: string
  session?: LogicVerificationMcpSession
}

export function createLogicVerificationMcpServer(
  options: CreateLogicVerificationMcpServerOptions = {},
): McpServer {
  assertMcpDevGuardrails()
  const expectedToken = resolveMcpDevToken(options.devToken)
  const session = options.session ?? new LogicVerificationMcpSession()

  const server = new McpServer(
    { name: 'renn-logic-verification', version: '0.1.0' },
    {
      instructions:
        'Headless Renn logic verification. load_world_json → apply_world_patch (pose-safe) → start_verification_run → run_for_sim_time or step → get_observation → stop_run.',
    },
  )

  const withAuth = <T extends { devToken: string }>(
    handler: (args: Omit<T, 'devToken'>) => Promise<ReturnType<typeof jsonText>>,
  ) => {
    return async (args: T) => {
      verifyMcpDevToken(args.devToken, expectedToken)
      const { devToken: _ignored, ...rest } = args
      return handler(rest as Omit<T, 'devToken'>)
    }
  }

  server.registerTool(
    'validate_stage_code',
    {
      description: 'Compile-check custom transformer source without loading a world',
      inputSchema: {
        devToken: devTokenSchema,
        code: z.string(),
        configKey: z.string().optional(),
      },
    },
    withAuth(async ({ code, configKey }) => jsonText(session.validateStageCode(code, configKey))),
  )

  server.registerTool(
    'load_fixture',
    {
      description:
        'Load a pinned repo fixture by id (e.g. agentVerificationCarWorld) into headless host',
      inputSchema: {
        devToken: devTokenSchema,
        fixtureId: z.string(),
        dt: z.number().positive().optional(),
        warmupSteps: z.number().int().min(0).optional(),
        controlledEntityId: z.string().optional(),
      },
    },
    withAuth(async (input) => jsonText(await session.loadFixture(input))),
  )

  server.registerTool(
    'attach_browser',
    {
      description:
        'Dev only: attach to an open Builder tab via localhost WebSocket (same observation API)',
      inputSchema: {
        devToken: devTokenSchema,
        port: z.number().int().positive().optional(),
        waitForBrowserMs: z.number().int().positive().optional(),
      },
    },
    withAuth(async (input) =>
      jsonText(
        await session.attachBrowser({
          devToken: expectedToken,
          port: input.port,
          waitForBrowserMs: input.waitForBrowserMs,
        }),
      ),
    ),
  )

  server.registerTool(
    'load_world_json',
    {
      description: 'Load a Renn world JSON and create a headless verification host',
      inputSchema: {
        devToken: devTokenSchema,
        world: z
          .record(z.string(), z.json())
          .describe('Renn world JSON object (plain JSON values only)'),
        dt: z.number().positive().optional(),
        warmupSteps: z.number().int().min(0).optional(),
        controlledEntityId: z.string().optional(),
      },
    },
    withAuth(async (input) =>
      jsonText(
        await session.loadWorldJson({
          ...input,
          world: input.world as unknown as import('@/types/world').RennWorld,
        }),
      ),
    ),
  )

  server.registerTool(
    'apply_world_patch',
    {
      description: 'Pose-safe transformer registry patch (requires loaded host)',
      inputSchema: {
        devToken: devTokenSchema,
        transformers: z
          .record(z.string(), z.record(z.string(), z.json()))
          .describe('Partial transformer defs keyed by registry id'),
        allowSceneRebuild: z.boolean().optional(),
      },
    },
    withAuth(async (input) => {
      const patch: LogicVerificationWorldPatch = {
        transformers: input.transformers as LogicVerificationWorldPatch['transformers'],
        allowSceneRebuild: input.allowSceneRebuild,
      }
      return jsonText(await session.applyWorldPatch(patch))
    }),
  )

  server.registerTool(
    'register_probes',
    {
      description: 'Register platform observation probes for the loaded world',
      inputSchema: {
        devToken: devTokenSchema,
        probes: z.array(
          z.object({
            id: z.string(),
            kind: z.enum(['entityPose', 'entityBody', 'trace']),
            entityId: z.string(),
            intervalMs: z.number().optional(),
          }),
        ),
      },
    },
    withAuth(async ({ probes }) => jsonText(await session.registerProbesAsync(probes))),
  )

  server.registerTool(
    'start_verification_run',
    {
      description: 'Start observation run (optional scripted keyboard input)',
      inputSchema: {
        devToken: devTokenSchema,
        carryOverTimeline: z.boolean().optional(),
        inputKeys: z
          .object({
            w: z.boolean().optional(),
            a: z.boolean().optional(),
            s: z.boolean().optional(),
            d: z.boolean().optional(),
            space: z.boolean().optional(),
            shift: z.boolean().optional(),
          })
          .optional(),
      },
    },
    withAuth(async (input) => jsonText(await session.startVerificationRunAsync(input))),
  )

  server.registerTool(
    'step',
    {
      description: 'Advance the sim by a fixed number of physics steps',
      inputSchema: {
        devToken: devTokenSchema,
        count: z.number().int().positive(),
      },
    },
    withAuth(async ({ count }) => jsonText(await session.runStepsAsync(count))),
  )

  server.registerTool(
    'run_for_sim_time',
    {
      description: 'Advance the sim for approximately N seconds of sim time',
      inputSchema: {
        devToken: devTokenSchema,
        seconds: z.number().positive(),
      },
    },
    withAuth(async ({ seconds }) => jsonText(await session.runForSimTimeAsync(seconds))),
  )

  server.registerTool(
    'get_observation',
    {
      description: 'Timeline rows, pose snapshot, compile/runtime errors',
      inputSchema: {
        devToken: devTokenSchema,
      },
    },
    withAuth(async () => {
      const obs = await session.getObservationAsync()
      return jsonText({
        timeline: obs.timeline,
        snapshot: obs.snapshot,
        compileErrors: obs.compileErrors,
        runtimeErrors: obs.runtimeErrorList,
      })
    }),
  )

  server.registerTool(
    'stop_run',
    {
      description: 'Stop observation run and dispose the headless host',
      inputSchema: {
        devToken: devTokenSchema,
      },
    },
    withAuth(async () => {
      session.stopRun()
      await session.dispose()
      return jsonText({ stopped: true })
    }),
  )

  return server
}

export async function connectLogicVerificationMcpStdio(
  options: CreateLogicVerificationMcpServerOptions = {},
): Promise<McpServer> {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
  const server = createLogicVerificationMcpServer(options)
  const transport = new StdioServerTransport()
  await server.connect(transport)
  return server
}
