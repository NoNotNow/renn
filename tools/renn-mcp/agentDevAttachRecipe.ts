import { LogicVerificationMcpSession } from '../../src/agent/logicVerificationMcpSession.ts'
import { resolveMcpDevToken } from '../../src/agent/logicVerificationMcpAuth.ts'

export type AgentDevAttachRecipeOptions = {
  bundle?: string
  fixture?: string
  exampleWorld?: string
  steps: number
  simSeconds?: number
  probeEntity?: string
  waitForBrowserMs: number
}

export function parseAgentDevAttachArgv(argv: string[]): AgentDevAttachRecipeOptions {
  let bundle: string | undefined
  let fixture: string | undefined
  let exampleWorld: string | undefined
  let steps = 5
  let simSeconds: number | undefined
  let probeEntity: string | undefined
  let waitForBrowserMs = 30_000

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--bundle' && argv[i + 1]) {
      bundle = argv[++i]
    } else if (a === '--fixture' && argv[i + 1]) {
      fixture = argv[++i]
    } else if (a === '--example-world' && argv[i + 1]) {
      exampleWorld = argv[++i]
    } else if (a === '--steps' && argv[i + 1]) {
      steps = Number(argv[++i])
    } else if (a === '--sim-seconds' && argv[i + 1]) {
      simSeconds = Number(argv[++i])
    } else if (a === '--probe-entity' && argv[i + 1]) {
      probeEntity = argv[++i]
    } else if (a === '--wait-browser-ms' && argv[i + 1]) {
      waitForBrowserMs = Number(argv[++i])
    }
  }

  const targetCount = [bundle, fixture, exampleWorld].filter(Boolean).length
  if (targetCount === 0) {
    bundle = 'agent-starter'
  }
  if (targetCount > 1) {
    throw new Error('Use only one of --bundle, --fixture, or --example-world')
  }
  if (simSeconds != null && !Number.isFinite(simSeconds)) {
    throw new Error('--sim-seconds must be a positive number')
  }
  if (!Number.isInteger(steps) || steps < 1) {
    throw new Error('--steps must be a positive integer')
  }

  return { bundle, fixture, exampleWorld, steps, simSeconds, probeEntity, waitForBrowserMs }
}

export async function runAgentDevAttachRecipe(
  opts: AgentDevAttachRecipeOptions,
): Promise<Record<string, unknown>> {
  const devToken = resolveMcpDevToken()
  const session = new LogicVerificationMcpSession()

  try {
    await session.attachBrowser({ devToken, waitForBrowserMs: opts.waitForBrowserMs })

    const probeEntity =
      opts.probeEntity ??
      (opts.fixture === 'agentVerificationCarWorld'
        ? 'car'
        : opts.bundle === 'agent-starter' || !opts.fixture
          ? 'agent-box'
          : undefined)

    if (probeEntity) {
      await session.registerProbesAsync([
        { id: 'pose', kind: 'entityPose', entityId: probeEntity, intervalMs: 50 },
      ])
    }

    await session.startVerificationRunAsync({})

    let stepSummary: Record<string, unknown>
    if (opts.simSeconds != null && opts.simSeconds > 0) {
      stepSummary = (await session.runForSimTimeAsync(opts.simSeconds)) as Record<string, unknown>
    } else {
      stepSummary = (await session.runStepsAsync(opts.steps)) as Record<string, unknown>
    }

    const observation = await session.getObservationAsync()
    await session.stopRunAsync()

    const stepPoses = (stepSummary.poses ?? {}) as Record<string, unknown>

    return {
      ok: true,
      recipe: 'dev-attach',
      attach: { bundle: opts.bundle, fixture: opts.fixture, exampleWorld: opts.exampleWorld },
      step: stepSummary,
      observation: {
        timelineLength: observation.timeline.length,
        snapshotEntityIds: Object.keys(observation.snapshot.poses ?? {}).sort(),
      },
      ...(probeEntity && !(probeEntity in stepPoses)
        ? { warning: `Probe entity "${probeEntity}" missing from step poses` }
        : {}),
    }
  } finally {
    await session.dispose()
  }
}
