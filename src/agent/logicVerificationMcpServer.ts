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

const timedMacroInputKeysSchema = z.object({
  w: z.boolean().optional(),
  a: z.boolean().optional(),
  s: z.boolean().optional(),
  d: z.boolean().optional(),
  space: z.boolean().optional(),
  shift: z.boolean().optional(),
})

const timedVerificationMacroConfigSchema = z.object({
  startDelaySimSec: z.number().min(0).optional(),
  holdInputDuringDelay: timedMacroInputKeysSchema.optional(),
  durationSimSec: z.number().positive(),
  steps: z
    .array(
      z.object({
        atSimTime: z.number().min(0),
        inputKeys: timedMacroInputKeysSchema.optional(),
      }),
    )
    .optional(),
  samples: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(['entityPose', 'entityBody', 'trace']),
        entityId: z.string(),
        intervalMs: z.number().positive().optional(),
      }),
    )
    .optional(),
  segmentWallPauseMs: z.number().min(0).optional(),
  carryOverTimeline: z.boolean().optional(),
})

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
        'Headless: load_project_bundle | load_fixture | load_example_world | load_world_json → apply_world_patch / patch_entity_material_color → export_project_bundle → start_verification_run → run_for_sim_time | run_timed_macro | step → get_observation → stop_run. Builder attach: attach_browser → load_saved_project, load_example_world, export_saved_project_to_example_world, save_project*, patch_entity_material_color, get_saved_entity_material_color, get_entity_authoring_summary, get_world_authoring_snapshot, get_pipe_authoring_summary, av_evolution_list/best/apply, run_timed_macro (segmentWallPauseMs for visible pacing). Headless load/export unavailable while attached.',
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
    'load_example_world',
    {
      description:
        'Load a pinned public example world by id (File → Example Worlds). Headless or Builder attach.',
      inputSchema: {
        devToken: devTokenSchema,
        exampleWorldId: z.string(),
        dt: z.number().positive().optional(),
        warmupSteps: z.number().int().min(0).optional(),
        controlledEntityId: z.string().optional(),
      },
    },
    withAuth(async (input) => jsonText(await session.loadExampleWorld(input))),
  )

  server.registerTool(
    'load_saved_project',
    {
      description:
        'Builder attach only: Open an IndexedDB project by display name (File → Open list)',
      inputSchema: {
        devToken: devTokenSchema,
        projectName: z.string(),
      },
    },
    withAuth(async (input) => jsonText(await session.loadSavedProject(input))),
  )

  server.registerTool(
    'save_project_as',
    {
      description: 'Builder attach only: Save current world as a new IndexedDB project name',
      inputSchema: {
        devToken: devTokenSchema,
        projectName: z.string(),
      },
    },
    withAuth(async (input) => jsonText(await session.saveProjectAs(input))),
  )

  server.registerTool(
    'save_project',
    {
      description: 'Builder attach only: Save current world to IndexedDB (existing or untitled flow)',
      inputSchema: {
        devToken: devTokenSchema,
      },
    },
    withAuth(async () => jsonText(await session.saveProject())),
  )

  server.registerTool(
    'export_saved_project_to_example_world',
    {
      description:
        'Builder attach only: Export an IndexedDB project zip to public/exampleWorlds/<exampleWorldId>/ on disk (no browser download)',
      inputSchema: {
        devToken: devTokenSchema,
        projectName: z.string(),
        exampleWorldId: z.string(),
      },
    },
    withAuth(async (input) => jsonText(await session.exportSavedProjectToExampleWorld(input))),
  )

  const materialColorSchema = z.union([
    z.string().describe('Hex color e.g. #00ff00'),
    z.tuple([z.number(), z.number(), z.number()]),
    z.tuple([z.number(), z.number(), z.number(), z.number()]),
  ])

  server.registerTool(
    'patch_entity_material_color',
    {
      description:
        'Set entity material RGB(A) (0–1 components or hex). Updates live Builder doc when attached; headless uses apply_world_patch.',
      inputSchema: {
        devToken: devTokenSchema,
        entityId: z.string(),
        color: materialColorSchema,
      },
    },
    withAuth(async (input) => jsonText(await session.patchEntityMaterialColor(input))),
  )

  server.registerTool(
    'get_saved_entity_material_color',
    {
      description: 'Builder attach only: Read material color from a saved IndexedDB project by name',
      inputSchema: {
        devToken: devTokenSchema,
        projectName: z.string(),
        entityId: z.string(),
      },
    },
    withAuth(async (input) => jsonText(await session.getSavedEntityMaterialColor(input))),
  )

  server.registerTool(
    'av_evolution_list',
    {
      description:
        'List evolutionary parameter-search runs: Builder IndexedDB when attached, else exported JSON files (schema renn.av-evolution/1) under test-results/av-evolution.',
      inputSchema: { devToken: devTokenSchema },
    },
    withAuth(async () => jsonText(await session.avEvolutionList())),
  )

  server.registerTool(
    'av_evolution_best',
    {
      description:
        'Best N candidates (lowest fitness first) of a run, or across all runs. Attached: Builder IndexedDB; otherwise exported JSON files on disk.',
      inputSchema: {
        devToken: devTokenSchema,
        runId: z.string().optional(),
        topN: z.number().int().positive().optional(),
        minEpisodes: z.number().int().min(0).optional(),
      },
    },
    withAuth(async (input) => jsonText(await session.avEvolutionBest(input))),
  )

  server.registerTool(
    'av_evolution_apply',
    {
      description:
        'Builder attach only: merge a stored candidate params into an entity pipe binding (explicit entityId required; uses the apply_world_patch path). Call save_project afterwards to persist.',
      inputSchema: {
        devToken: devTokenSchema,
        runId: z.string(),
        candidateId: z.string(),
        entityId: z.string(),
        pipeId: z.string().optional(),
        stackIndex: z.number().int().min(0).optional(),
      },
    },
    withAuth(async (input) => jsonText(await session.avEvolutionApply(input))),
  )

  server.registerTool(
    'get_entity_authoring_summary',
    {
      description:
        'Read entity pipe stack and transformer stages from the live Builder doc (attach) or headless host. Optional projectName reads IndexedDB save without switching the open doc.',
      inputSchema: {
        devToken: devTokenSchema,
        entityId: z.string(),
        includeCode: z.boolean().optional(),
        codeMaxChars: z.number().int().positive().optional(),
        projectName: z.string().optional(),
      },
    },
    withAuth(async (input) => jsonText(await session.getEntityAuthoringSummary(input))),
  )

  server.registerTool(
    'get_world_authoring_snapshot',
    {
      description:
        'Bounded authoring snapshot (entity summaries). Attach or headless. Optional entityIds filter and projectName for IndexedDB.',
      inputSchema: {
        devToken: devTokenSchema,
        entityIds: z.array(z.string()).optional(),
        includeCode: z.boolean().optional(),
        codeMaxChars: z.number().int().positive().optional(),
        maxEntities: z.number().int().positive().optional(),
        projectName: z.string().optional(),
      },
    },
    withAuth(async (input) => jsonText(await session.getWorldAuthoringSnapshot(input))),
  )

  server.registerTool(
    'get_pipe_authoring_summary',
    {
      description:
        'Pipe definition, linked entities (pipe stack bindings), and per-stage registry usage counts across the world.',
      inputSchema: {
        devToken: devTokenSchema,
        pipeId: z.string(),
        projectName: z.string().optional(),
      },
    },
    withAuth(async (input) => jsonText(await session.getPipeAuthoringSummary(input))),
  )

  server.registerTool(
    'load_project_bundle',
    {
      description:
        'Load a pinned on-disk agent project bundle by id (e.g. agent-starter) into headless host',
      inputSchema: {
        devToken: devTokenSchema,
        bundleId: z.string(),
        dt: z.number().positive().optional(),
        warmupSteps: z.number().int().min(0).optional(),
        controlledEntityId: z.string().optional(),
      },
    },
    withAuth(async (input) => jsonText(await session.loadProjectBundle(input))),
  )

  server.registerTool(
    'export_project_bundle',
    {
      description:
        'Write the headless host world JSON back to an allowlisted on-disk bundle (requires load_project_bundle)',
      inputSchema: {
        devToken: devTokenSchema,
        bundleId: z.string().optional(),
      },
    },
    withAuth(async (input) => jsonText(await session.exportProjectBundle(input))),
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

  const entityJsonSchema = z.record(z.string(), z.json())

  server.registerTool(
    'apply_world_patch',
    {
      description:
        'Pose-safe world patch: transformer registry, pipe definitions, entity pipe-stack params, and/or entity add-update-remove (requires loaded host)',
      inputSchema: {
        devToken: devTokenSchema,
        transformers: z
          .record(z.string(), z.record(z.string(), z.json()))
          .optional()
          .describe('Partial transformer defs keyed by registry id'),
        transformerPipes: z
          .record(
            z.string(),
            z.object({
              name: z.string().optional(),
              stagePatches: z
                .array(
                  z.object({
                    match: z.object({
                      stageId: z.string().optional(),
                      name: z.string().optional(),
                      stageIndex: z.number().int().min(0).optional(),
                    }),
                    patch: z.record(z.string(), z.json()),
                  }),
                )
                .optional(),
            }),
          )
          .optional()
          .describe('Patch pipe defs (inline stage snapshots by name/id/index)'),
        entityPipeStack: z
          .array(
            z.object({
              entityId: z.string(),
              stackIndex: z.number().int().min(0).optional(),
              pipeId: z.string().optional(),
              mergeBindingParams: z.record(z.string(), z.json()).optional(),
              enabled: z.boolean().optional(),
            }),
          )
          .optional()
          .describe('Merge binding-level params on an entity pipe stack entry'),
        entities: z
          .object({
            add: z.array(entityJsonSchema).optional(),
            update: z.record(z.string(), entityJsonSchema).optional(),
            remove: z.array(z.string()).optional(),
          })
          .optional(),
        allowSceneRebuild: z.boolean().optional(),
      },
    },
    withAuth(async (input) => {
      const patch: LogicVerificationWorldPatch = {
        transformers: input.transformers as LogicVerificationWorldPatch['transformers'],
        transformerPipes:
          input.transformerPipes as LogicVerificationWorldPatch['transformerPipes'],
        entityPipeStack: input.entityPipeStack as LogicVerificationWorldPatch['entityPipeStack'],
        entities: input.entities as LogicVerificationWorldPatch['entities'],
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
    'run_timed_macro',
    {
      description:
        'Run a sim-time input schedule with optional probe samples in one call; returns macro log (timeline + events). Works headless or on attached Builder (segmentWallPauseMs for visible pacing).',
      inputSchema: {
        devToken: devTokenSchema,
        macro: timedVerificationMacroConfigSchema,
      },
    },
    withAuth(async ({ macro }) => jsonText(await session.runTimedMacroAsync(macro))),
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
