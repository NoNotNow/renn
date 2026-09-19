/**
 * In-process session for MCP tools → LogicVerificationHost or attached Builder tab.
 */

import type { RennWorld } from '@/types/world'
import {
  buildScriptedRawInput,
  createLogicVerificationHost,
  DEFAULT_LOGIC_VERIFICATION_DT,
  type LogicVerificationHost,
  type LogicVerificationInputScript,
} from '@/agent/logicVerificationHost'
import type { AgentObservationProbe, AgentObservationSession } from '@/agent/agentObservationSession'
import { validateCustomTransformerSource } from '@/transformers/customCodeTransformer'
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
  defaultWarmupStepsForFixture,
  loadLogicVerificationFixture,
} from '@/agent/logicVerificationFixtures'

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

export type StartVerificationRunInput = {
  carryOverTimeline?: boolean
  /** Keyboard keys held for each step (scripted RawInput). */
  inputKeys?: Partial<{
    w: boolean
    a: boolean
    s: boolean
    d: boolean
    space: boolean
    shift: boolean
  }>
}

export type AttachBrowserInput = {
  devToken: string
  port?: number
  host?: string
  /** Wait for an open Builder tab to register (default 8000 ms). */
  waitForBrowserMs?: number
}

export class LogicVerificationMcpSession {
  private host: LogicVerificationHost | null = null
  private browserClient: LogicVerificationBrowserMcpClient | null = null
  private inputScript: LogicVerificationInputScript | undefined
  private runActive = false
  private dt = DEFAULT_LOGIC_VERIFICATION_DT

  get hasHost(): boolean {
    return this.host != null || this.browserClient != null
  }

  get isBrowserAttached(): boolean {
    return this.browserClient != null
  }

  get isRunActive(): boolean {
    return this.runActive
  }

  async attachBrowser(input: AttachBrowserInput): Promise<{ attached: true }> {
    await this.disposeHeadlessHost()
    this.browserClient?.dispose()
    const port = input.port ?? DEFAULT_LOGIC_VERIFICATION_BROWSER_PORT
    const bridge =
      getSharedLogicVerificationBrowserBridge() ??
      (await ensureSharedLogicVerificationBrowserBridge({
        port,
        host: input.host ?? '127.0.0.1',
        devToken: input.devToken,
      }))
    await bridge.waitForBrowser(input.waitForBrowserMs ?? 8_000)
    const client = new LogicVerificationBrowserMcpClient({
      port,
      host: input.host,
      devToken: input.devToken,
    })
    await client.connect()
    this.browserClient = client
    this.runActive = false
    this.inputScript = undefined
    return { attached: true }
  }

  async loadWorldJson(input: LoadWorldJsonInput): Promise<{ loaded: true }> {
    this.assertHeadlessMode('load_world_json')
    await this.disposeHeadlessHost()
    this.dt = input.dt ?? DEFAULT_LOGIC_VERIFICATION_DT
    this.host = await createLogicVerificationHost({
      world: input.world,
      dt: this.dt,
      warmupSteps: input.warmupSteps,
      controlledEntityId: input.controlledEntityId,
    })
    this.runActive = false
    this.inputScript = undefined
    return { loaded: true }
  }

  async loadFixture(input: LoadFixtureInput): Promise<{ loaded: true; fixtureId: string }> {
    const warmup =
      input.warmupSteps ?? defaultWarmupStepsForFixture(input.fixtureId) ?? undefined
    await this.loadWorldJson({
      world: loadLogicVerificationFixture(input.fixtureId),
      dt: input.dt,
      warmupSteps: warmup,
      controlledEntityId: input.controlledEntityId,
    })
    return { loaded: true, fixtureId: input.fixtureId }
  }

  validateStageCode(code: string, configKey = 'stage'): { ok: true } | { ok: false; message: string } {
    const message = validateCustomTransformerSource(code, configKey)
    if (message) return { ok: false, message }
    return { ok: true }
  }

  applyWorldPatch(
    patch: LogicVerificationWorldPatch,
  ): Promise<ApplyLogicVerificationWorldPatchResult> {
    if (this.browserClient) {
      return this.browserClient.invoke('apply_world_patch', patch) as Promise<
        ApplyLogicVerificationWorldPatchResult
      >
    }
    return this.requireHeadlessHost().applyWorldPatch(patch)
  }

  registerProbes(probes: AgentObservationProbe[]): void {
    if (this.browserClient) {
      void this.browserClient.invoke('register_probes', { probes })
      return
    }
    this.requireHeadlessHost().registerObservationProbes(probes)
  }

  async registerProbesAsync(probes: AgentObservationProbe[]): Promise<{ registered: number }> {
    if (this.browserClient) {
      return (await this.browserClient.invoke('register_probes', { probes })) as {
        registered: number
      }
    }
    this.requireHeadlessHost().registerObservationProbes(probes)
    return { registered: probes.length }
  }

  async startVerificationRunAsync(
    input: StartVerificationRunInput = {},
  ): Promise<{ started: true }> {
    if (this.browserClient) {
      await this.browserClient.invoke('start_verification_run', input)
      this.runActive = true
      return { started: true }
    }
    return this.startVerificationRun(input)
  }

  startVerificationRun(input: StartVerificationRunInput = {}): { started: true } {
    if (this.browserClient) {
      throw new Error('startVerificationRun async required in browser attach — use startVerificationRunAsync')
    }
    const host = this.requireHeadlessHost()
    if (input.inputKeys) {
      const keys = input.inputKeys
      this.inputScript = () => buildScriptedRawInput(keys)
    } else {
      this.inputScript = undefined
    }
    host.startObservationRun({ carryOverTimeline: input.carryOverTimeline })
    this.runActive = true
    return { started: true }
  }

  runSteps(count: number): ReturnType<LogicVerificationHost['runSteps']> {
    if (this.browserClient) {
      throw new Error('runSteps async required in browser attach mode — use runStepsAsync')
    }
    return this.requireHeadlessHost().runSteps(count, this.inputScript)
  }

  async runStepsAsync(count: number): Promise<ReturnType<LogicVerificationHost['runSteps']>> {
    if (this.browserClient) {
      return (await this.browserClient.invoke('run_steps', { count })) as ReturnType<
        LogicVerificationHost['runSteps']
      >
    }
    return this.requireHeadlessHost().runSteps(count, this.inputScript)
  }

  runForSimTime(seconds: number): ReturnType<LogicVerificationHost['runSteps']> {
    if (this.browserClient) {
      throw new Error('runForSimTime async required in browser attach mode — use runForSimTimeAsync')
    }
    const host = this.requireHeadlessHost()
    const steps = Math.max(0, Math.ceil(seconds / this.dt))
    return host.runSteps(steps, this.inputScript)
  }

  async runForSimTimeAsync(
    seconds: number,
  ): Promise<ReturnType<LogicVerificationHost['runSteps']>> {
    if (this.browserClient) {
      return (await this.browserClient.invoke('run_for_sim_time', { seconds })) as ReturnType<
        LogicVerificationHost['runSteps']
      >
    }
    const host = this.requireHeadlessHost()
    const steps = Math.max(0, Math.ceil(seconds / this.dt))
    return host.runSteps(steps, this.inputScript)
  }

  getObservation(): {
    timeline: ReturnType<LogicVerificationHost['getObservationTimeline']>
    snapshot: ReturnType<LogicVerificationHost['snapshot']>
    compileErrors: ReturnType<AgentObservationSession['getCompileErrors']>
    runtimeErrors: ReturnType<AgentObservationSession['getRuntimeErrors']>
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
    }
  }

  async getObservationAsync(): Promise<{
    timeline: ReturnType<LogicVerificationHost['getObservationTimeline']>
    snapshot: ReturnType<LogicVerificationHost['snapshot']>
    compileErrors: ReturnType<AgentObservationSession['getCompileErrors']>
    runtimeErrors: ReturnType<AgentObservationSession['getRuntimeErrors']>
    runtimeErrorList: unknown[]
  }> {
    if (this.browserClient) {
      const obs = (await this.browserClient.invoke('get_observation')) as {
        timeline: ReturnType<LogicVerificationHost['getObservationTimeline']>
        snapshot: ReturnType<LogicVerificationHost['snapshot']>
        compileErrors: ReturnType<AgentObservationSession['getCompileErrors']>
        runtimeErrors: unknown[]
      }
      return {
        timeline: obs.timeline,
        snapshot: obs.snapshot,
        compileErrors: obs.compileErrors,
        runtimeErrors: new Map() as ReturnType<AgentObservationSession['getRuntimeErrors']>,
        runtimeErrorList: obs.runtimeErrors,
      }
    }
    const obs = this.getObservation()
    return {
      ...obs,
      runtimeErrorList: [...obs.runtimeErrors.values()],
    }
  }

  stopRun(): { stopped: true } {
    if (this.browserClient) {
      void this.browserClient.invoke('stop_observation_run')
      this.runActive = false
      this.inputScript = undefined
      return { stopped: true }
    }
    if (this.host) {
      this.host.stopObservationRun()
    }
    this.runActive = false
    this.inputScript = undefined
    return { stopped: true }
  }

  async dispose(): Promise<void> {
    await this.disposeHeadlessHost()
    this.browserClient?.dispose()
    this.browserClient = null
  }

  private assertHeadlessMode(tool: string): void {
    if (this.browserClient) {
      throw new Error(`${tool} is unavailable while attached to Builder — detach first`)
    }
  }

  private requireHeadlessHost(): LogicVerificationHost {
    if (!this.host) {
      throw new Error('No world loaded — call load_world_json, load_fixture, or attach_browser')
    }
    return this.host
  }

  private async disposeHeadlessHost(): Promise<void> {
    if (this.host) {
      this.host.dispose()
      this.host = null
    }
    this.runActive = false
    this.inputScript = undefined
  }
}
