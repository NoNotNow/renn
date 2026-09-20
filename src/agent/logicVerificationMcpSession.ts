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
  ApplyLogicVerificationWorldPatchHostResult,
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
import { exportAgentProjectBundleWorld } from '@/agent/exportAgentProjectBundle'
import { loadAgentDevExampleWorldPayload } from '@/agent/agentDevProjectBundleServer'
import { parseAgentMaterialColorInput } from '@/agent/agentMaterialColorParse'

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

export type LoadExampleWorldInput = {
  exampleWorldId: string
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
  /** Per-RPC timeout when forwarding to Builder (default 30s, or RENN_MCP_BROWSER_RPC_TIMEOUT_MS). */
  rpcTimeoutMs?: number
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
  /** Set when the headless host was loaded via `load_project_bundle`. */
  private activeBundleId: string | null = null

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
      rpcTimeoutMs: input.rpcTimeoutMs,
    })

    let localBridge = getSharedLogicVerificationBrowserBridge()
    try {
      await client.connect()
    } catch (connectErr) {
      if (!localBridge?.isListening) {
        try {
          localBridge = await ensureSharedLogicVerificationBrowserBridge({
            port,
            host,
            devToken: input.devToken,
          })
        } catch (bridgeErr) {
          const code =
            typeof bridgeErr === 'object' &&
            bridgeErr != null &&
            'code' in bridgeErr &&
            (bridgeErr as { code?: string }).code
          if (code === 'EADDRINUSE') {
            await client.connect()
          } else {
            throw bridgeErr
          }
        }
      }
      if (!client.isConnected) {
        try {
          await client.connect()
        } catch {
          throw connectErr
        }
      }
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
    bundleId?: string | null
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
    this.activeBundleId = input.bundleId ?? null
    this.resetRunController()
  }

  async loadWorldJson(input: LoadWorldJsonInput): Promise<{ loaded: true }> {
    const resolved = resolveInlineVerificationProject(input.world)
    await this.loadResolvedProject({
      world: resolved.world,
      dt: input.dt,
      warmupSteps: input.warmupSteps,
      controlledEntityId: input.controlledEntityId,
      bundleId: null,
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
      bundleId: null,
    })
    return { loaded: true, fixtureId: input.fixtureId }
  }

  async loadExampleWorld(
    input: LoadExampleWorldInput,
  ): Promise<{ loaded: true; exampleWorldId: string; assetCount?: number }> {
    if (this.browserClient) {
      return (await this.browserClient.invoke('load_example_world', {
        exampleWorldId: input.exampleWorldId,
      })) as { loaded: true; exampleWorldId: string }
    }
    const resolved = await loadAgentDevExampleWorldPayload(input.exampleWorldId)
    await this.loadResolvedProject({
      world: resolved.world,
      dt: input.dt,
      warmupSteps: input.warmupSteps,
      controlledEntityId: input.controlledEntityId,
      bundleId: null,
    })
    return { loaded: true, exampleWorldId: resolved.id, assetCount: 0 }
  }

  async loadSavedProject(input: {
    projectName: string
  }): Promise<{ loaded: true; projectId: string; projectName: string }> {
    this.assertBrowserAttachMode('load_saved_project')
    return (await this.browserClient!.invoke('load_saved_project', {
      projectName: input.projectName,
    })) as { loaded: true; projectId: string; projectName: string }
  }

  async saveProjectAs(input: {
    projectName: string
  }): Promise<{ saved: true; projectId: string; projectName: string }> {
    this.assertBrowserAttachMode('save_project_as')
    return (await this.browserClient!.invoke('save_project_as', {
      projectName: input.projectName,
    })) as { saved: true; projectId: string; projectName: string }
  }

  async saveProject(): Promise<{ saved: true; projectId: string | null; projectName: string }> {
    this.assertBrowserAttachMode('save_project')
    return (await this.browserClient!.invoke('save_project', {})) as {
      saved: true
      projectId: string | null
      projectName: string
    }
  }

  async patchEntityMaterialColor(input: {
    entityId: string
    color: string | [number, number, number] | [number, number, number, number]
  }): Promise<{ patched: true; entityId: string }> {
    const rgba = parseAgentMaterialColorInput(input.color)
    if (this.browserClient) {
      await this.browserClient.invoke('patch_entity_material_color', {
        entityId: input.entityId,
        color: rgba,
      })
      await this.applyWorldPatch({
        entities: {
          update: {
            [input.entityId]: {
              material: { color: rgba },
            },
          },
        },
      })
      return { patched: true, entityId: input.entityId }
    }
    const patchResult = await this.applyWorldPatch({
      entities: {
        update: {
          [input.entityId]: {
            material: { color: rgba },
          },
        },
      },
    })
    if (!patchResult.ok) {
      throw new Error(patchResult.message)
    }
    return { patched: true, entityId: input.entityId }
  }

  async getSavedEntityMaterialColor(input: {
    projectName: string
    entityId: string
  }): Promise<{ color: [number, number, number, number] | null }> {
    this.assertBrowserAttachMode('get_saved_entity_material_color')
    return (await this.browserClient!.invoke('get_saved_entity_material_color', input)) as {
      color: [number, number, number, number] | null
    }
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
      bundleId: resolved.bundleId ?? input.bundleId,
    })
    return {
      loaded: true,
      bundleId: resolved.bundleId ?? input.bundleId,
      assetCount: resolved.assets?.size ?? 0,
    }
  }

  async exportProjectBundle(input?: {
    bundleId?: string
  }): Promise<{ exported: true; bundleId: string; worldPath: string }> {
    this.assertHeadlessMode('export_project_bundle')
    const host = this.requireHeadlessHost()
    const bundleId = input?.bundleId ?? this.activeBundleId
    if (!bundleId) {
      throw new Error(
        'No bundle loaded — call load_project_bundle first or pass bundleId for an allowlisted bundle',
      )
    }
    if (this.activeBundleId && input?.bundleId && input.bundleId !== this.activeBundleId) {
      throw new Error('bundleId does not match the loaded project bundle')
    }
    const written = await exportAgentProjectBundleWorld(bundleId, host.getWorld())
    return { exported: true, ...written }
  }

  validateStageCode(code: string, configKey = 'stage'): { ok: true } | { ok: false; message: string } {
    const message = validateCustomTransformerSource(code, configKey)
    if (message) return { ok: false, message }
    return { ok: true }
  }

  applyWorldPatch(
    patch: LogicVerificationWorldPatch,
  ): Promise<ApplyLogicVerificationWorldPatchHostResult> {
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

  async stopRunAsync(): Promise<{ stopped: true }> {
    if (this.browserClient) {
      await this.ensureRunController().stopRun()
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

  private assertBrowserAttachMode(tool: string): void {
    if (!this.browserClient) {
      throw new Error(`${tool} requires attach_browser — open Builder and attach first`)
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
    this.activeBundleId = null
    this.resetRunController()
  }
}
