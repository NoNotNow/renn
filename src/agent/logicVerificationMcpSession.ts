/**
 * In-process session for MCP tools → LogicVerificationHost or attached Builder tab.
 */

import type { RennWorld } from '@/types/world'
import {
  createLogicVerificationHost,
  DEFAULT_LOGIC_VERIFICATION_DT,
  type LogicVerificationHost,
} from '@/agent/logicVerificationHost'
import type { AgentObservationProbe } from '@/agent/agentObservationSession'
import type {
  ApplyLogicVerificationWorldPatchResult,
  LogicVerificationWorldPatch,
} from '@/agent/applyLogicVerificationWorldPatch'
import { LogicVerificationBrowserMcpClient } from '@/agent/logicVerificationBrowserMcpClient'
import {
  ensureSharedLogicVerificationBrowserBridge,
  getSharedLogicVerificationBrowserBridge,
} from '@/agent/logicVerificationBrowserBridgeServer'
import { DEFAULT_LOGIC_VERIFICATION_BROWSER_PORT } from '@/agent/logicVerificationBrowserProtocol'
import {
  createBrowserRpcLogicVerificationRunBackend,
  createInProcessLogicVerificationRunBackend,
  LogicVerificationRunController,
  type StartVerificationRunInput,
} from '@/agent/logicVerificationRunController'
import { validateCustomTransformerSource } from '@/transformers/customCodeTransformer'
import {
  resolveBundleVerificationProject,
  resolveFixtureVerificationProject,
  resolveInlineVerificationProject,
} from '@/agent/logicVerificationProjectSource'

export type LoadWorldJsonInput = {
  world: RennWorld
  dt?: number
  warmupSteps?: number
  controlledEntityId?: string | null
}

export type LoadFixtureInput = {
  fixtureId: string
  dt?: number
  warmupSteps?: number
  controlledEntityId?: string | null
}

export type LoadProjectBundleInput = {
  bundleId: string
  dt?: number
  warmupSteps?: number
  controlledEntityId?: string | null
}

export type AttachBrowserInput = {
  devToken: string
  port?: number
  host?: string
  /** Wait for an open Builder tab to register (default 8000 ms). */
  waitForBrowserMs?: number
}

async function waitForBrowserSceneViaClient(
  client: LogicVerificationBrowserMcpClient,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const status = (await client.invoke('get_status')) as { ready?: boolean }
      if (status.ready) return
    } catch {
      // Bridge up but Builder scene not adopted yet
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('Timed out waiting for Builder browser attach')
}

export class LogicVerificationMcpSession {
  private host: LogicVerificationHost | null = null
  private browserClient: LogicVerificationBrowserMcpClient | null = null
  private runController: LogicVerificationRunController | null = null
  private dt = DEFAULT_LOGIC_VERIFICATION_DT

  get hasHost(): boolean {
    return this.host != null || this.browserClient != null
  }

  get isBrowserAttached(): boolean {
    return this.browserClient != null
  }

  get isRunActive(): boolean {
    return this.runController?.isRunActive ?? false
  }

  private ensureRunController(): LogicVerificationRunController {
    if (this.runController) return this.runController
    if (this.browserClient) {
      this.runController = new LogicVerificationRunController(
        createBrowserRpcLogicVerificationRunBackend(this.browserClient, () => this.dt),
      )
      return this.runController
    }
    if (this.host) {
      this.runController = new LogicVerificationRunController(
        createInProcessLogicVerificationRunBackend(
          () => this.requireHeadlessHost(),
          () => this.dt,
        ),
      )
      return this.runController
    }
    throw new Error(
      'No world loaded — call load_world_json, load_fixture, load_project_bundle, or attach_browser',
    )
  }

  private resetRunController(): void {
    this.runController = null
  }

  async attachBrowser(input: AttachBrowserInput): Promise<{ attached: true }> {
    await this.disposeHeadlessHost()
    this.browserClient?.dispose()
    this.resetRunController()
    const port = input.port ?? DEFAULT_LOGIC_VERIFICATION_BROWSER_PORT
    const host = input.host ?? '127.0.0.1'
    const waitMs = input.waitForBrowserMs ?? 8_000

    const client = new LogicVerificationBrowserMcpClient({
      port,
      host,
      devToken: input.devToken,
    })

    let localBridge = getSharedLogicVerificationBrowserBridge()
    try {
      await client.connect()
    } catch {
      if (!localBridge?.isListening) {
        localBridge = await ensureSharedLogicVerificationBrowserBridge({
          port,
          host,
          devToken: input.devToken,
        })
      }
      await client.connect()
    }

    this.browserClient = client

    if (localBridge?.isListening) {
      await localBridge.waitForBrowser(waitMs)
    } else {
      await waitForBrowserSceneViaClient(client, waitMs)
    }

    this.ensureRunController().resetRunState()
    return { attached: true }
  }

  private async loadResolvedProject(input: {
    world: RennWorld
    assets?: Map<string, Blob>
    dt?: number
    warmupSteps?: number
    controlledEntityId?: string | null
  }): Promise<void> {
    this.assertHeadlessMode('load')
    await this.disposeHeadlessHost()
    this.dt = input.dt ?? DEFAULT_LOGIC_VERIFICATION_DT
    this.host = await createLogicVerificationHost({
      world: input.world,
      assets: input.assets,
      dt: this.dt,
      warmupSteps: input.warmupSteps,
      controlledEntityId: input.controlledEntityId,
    })
    this.resetRunController()
  }

  async loadWorldJson(input: LoadWorldJsonInput): Promise<{ loaded: true }> {
    const resolved = resolveInlineVerificationProject(input.world)
    await this.loadResolvedProject({
      world: resolved.world,
      dt: input.dt,
      warmupSteps: input.warmupSteps,
      controlledEntityId: input.controlledEntityId,
    })
    return { loaded: true }
  }

  async loadFixture(input: LoadFixtureInput): Promise<{ loaded: true; fixtureId: string }> {
    const resolved = resolveFixtureVerificationProject(input.fixtureId)
    const warmup = input.warmupSteps ?? resolved.defaultWarmupSteps ?? undefined
    await this.loadResolvedProject({
      world: resolved.world,
      dt: input.dt,
      warmupSteps: warmup,
      controlledEntityId: input.controlledEntityId,
    })
    return { loaded: true, fixtureId: input.fixtureId }
  }

  async loadProjectBundle(
    input: LoadProjectBundleInput,
  ): Promise<{ loaded: true; bundleId: string; assetCount: number }> {
    const resolved = await resolveBundleVerificationProject(input.bundleId)
    await this.loadResolvedProject({
      world: resolved.world,
      assets: resolved.assets,
      dt: input.dt,
      warmupSteps: input.warmupSteps,
      controlledEntityId: input.controlledEntityId,
    })
    return {
      loaded: true,
      bundleId: resolved.bundleId ?? input.bundleId,
      assetCount: resolved.assets?.size ?? 0,
    }
  }

  validateStageCode(code: string, configKey = 'stage'): { ok: true } | { ok: false; message: string } {
    const message = validateCustomTransformerSource(code, configKey)
    if (message) return { ok: false, message }
    return { ok: true }
  }

  applyWorldPatch(
    patch: LogicVerificationWorldPatch,
  ): Promise<ApplyLogicVerificationWorldPatchResult> {
    return this.ensureRunController().applyWorldPatch(patch)
  }

  registerProbes(probes: AgentObservationProbe[]): void {
    void this.ensureRunController().registerProbes(probes)
  }

  async registerProbesAsync(probes: AgentObservationProbe[]): Promise<{ registered: number }> {
    return this.ensureRunController().registerProbes(probes)
  }

  async startVerificationRunAsync(
    input: StartVerificationRunInput = {},
  ): Promise<{ started: true }> {
    return this.ensureRunController().startVerificationRun(input)
  }

  startVerificationRun(input: StartVerificationRunInput = {}): { started: true } {
    if (this.browserClient) {
      throw new Error(
        'startVerificationRun async required in browser attach — use startVerificationRunAsync',
      )
    }
    return this.ensureRunController().startVerificationRunOnHost(this.requireHeadlessHost(), input)
  }

  runSteps(count: number): ReturnType<LogicVerificationHost['runSteps']> {
    if (this.browserClient) {
      throw new Error('runSteps async required in browser attach mode — use runStepsAsync')
    }
    return this.ensureRunController().runStepsOnHost(this.requireHeadlessHost(), count)
  }

  async runStepsAsync(count: number): Promise<ReturnType<LogicVerificationHost['runSteps']>> {
    return this.ensureRunController().runSteps(count)
  }

  runForSimTime(seconds: number): ReturnType<LogicVerificationHost['runSteps']> {
    if (this.browserClient) {
      throw new Error('runForSimTime async required in browser attach mode — use runForSimTimeAsync')
    }
    const steps = Math.max(0, Math.ceil(seconds / this.dt))
    return this.ensureRunController().runStepsOnHost(this.requireHeadlessHost(), steps)
  }

  async runForSimTimeAsync(
    seconds: number,
  ): Promise<ReturnType<LogicVerificationHost['runSteps']>> {
    return this.ensureRunController().runForSimTime(seconds)
  }

  getObservation(): {
    timeline: ReturnType<LogicVerificationHost['getObservationTimeline']>
    snapshot: ReturnType<LogicVerificationHost['snapshot']>
    compileErrors: ReturnType<LogicVerificationHost['getObservationSession']>['getCompileErrors'] extends () => infer R
      ? R
      : never
    runtimeErrors: ReturnType<LogicVerificationHost['getObservationSession']>['getRuntimeErrors'] extends () => infer R
      ? R
      : never
    runtimeErrorList: unknown[]
  } {
    if (this.browserClient) {
      throw new Error('getObservation async required in browser attach mode — use getObservationAsync')
    }
    const host = this.requireHeadlessHost()
    const session = host.getObservationSession()
    return {
      timeline: host.getObservationTimeline(),
      snapshot: host.snapshot(),
      compileErrors: session.getCompileErrors(),
      runtimeErrors: session.getRuntimeErrors(),
      runtimeErrorList: [...session.getRuntimeErrors().values()],
    }
  }

  async getObservationAsync() {
    return this.ensureRunController().getObservation()
  }

  stopRun(): { stopped: true } {
    if (this.browserClient) {
      void this.ensureRunController().stopRun()
      return { stopped: true }
    }
    if (this.host) {
      this.ensureRunController().stopRunOnHost(this.host)
    }
    return { stopped: true }
  }

  async dispose(): Promise<void> {
    await this.disposeHeadlessHost()
    this.browserClient?.dispose()
    this.browserClient = null
    this.resetRunController()
  }

  private assertHeadlessMode(tool: string): void {
    if (this.browserClient) {
      throw new Error(`${tool} is unavailable while attached to Builder — detach first`)
    }
  }

  private requireHeadlessHost(): LogicVerificationHost {
    if (!this.host) {
      throw new Error(
        'No world loaded — call load_world_json, load_fixture, load_project_bundle, or attach_browser',
      )
    }
    return this.host
  }

  private async disposeHeadlessHost(): Promise<void> {
    if (this.host) {
      this.host.dispose()
      this.host = null
    }
    this.resetRunController()
  }
}
