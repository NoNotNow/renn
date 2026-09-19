/**
 * Run orchestration for logic verification: input script, observation runs, stepping.
 * Backends: in-process host or browser RPC (see adapters below).
 */

import {
  buildScriptedRawInput,
  type LogicVerificationHost,
  type LogicVerificationInputScript,
} from '@/agent/logicVerificationHost'
import type { AgentObservationProbe, AgentObservationSession } from '@/agent/agentObservationSession'
import type {
  ApplyLogicVerificationWorldPatchHostResult,
  LogicVerificationWorldPatch,
} from '@/agent/applyLogicVerificationWorldPatch'
import { validateCustomTransformerSource } from '@/transformers/customCodeTransformer'
import type { LogicVerificationBrowserMcpClient } from '@/agent/logicVerificationBrowserMcpClient'

export type StartVerificationRunInput = {
  carryOverTimeline?: boolean
  inputKeys?: Partial<{
    w: boolean
    a: boolean
    s: boolean
    d: boolean
    space: boolean
    shift: boolean
  }>
}

export interface LogicVerificationRunBackend {
  getDt(): number
  registerProbes(probes: AgentObservationProbe[]): Promise<{ registered: number }>
  applyWorldPatch(patch: LogicVerificationWorldPatch): Promise<ApplyLogicVerificationWorldPatchHostResult>
  startObservationRun(input: StartVerificationRunInput, inputScript: LogicVerificationInputScript | undefined): Promise<{ started: true }>
  stopObservationRun(): Promise<{ stopped: true }>
  runSteps(count: number, inputScript: LogicVerificationInputScript | undefined): Promise<ReturnType<LogicVerificationHost['runSteps']>>
  runForSimTime(seconds: number, inputScript: LogicVerificationInputScript | undefined): Promise<ReturnType<LogicVerificationHost['runSteps']>>
  getObservation(): Promise<{
    timeline: ReturnType<LogicVerificationHost['getObservationTimeline']>
    snapshot: ReturnType<LogicVerificationHost['snapshot']>
    compileErrors: ReturnType<AgentObservationSession['getCompileErrors']>
    runtimeErrors: ReturnType<AgentObservationSession['getRuntimeErrors']>
    runtimeErrorList: unknown[]
  }>
}

export class LogicVerificationRunController {
  private inputScript: LogicVerificationInputScript | undefined
  private runActive = false

  constructor(private readonly backend: LogicVerificationRunBackend) {}

  get isRunActive(): boolean {
    return this.runActive
  }

  resetRunState(): void {
    this.runActive = false
    this.inputScript = undefined
  }

  validateStageCode(code: string, configKey = 'stage'): { ok: true } | { ok: false; message: string } {
    const message = validateCustomTransformerSource(code, configKey)
    if (message) return { ok: false, message }
    return { ok: true }
  }

  resolveInputScript(input: StartVerificationRunInput): LogicVerificationInputScript | undefined {
    if (input.inputKeys) {
      const keys = input.inputKeys
      return () => buildScriptedRawInput(keys)
    }
    return undefined
  }

  async registerProbes(probes: AgentObservationProbe[]): Promise<{ registered: number }> {
    return this.backend.registerProbes(probes)
  }

  async applyWorldPatch(
    patch: LogicVerificationWorldPatch,
  ): Promise<ApplyLogicVerificationWorldPatchHostResult> {
    return this.backend.applyWorldPatch(patch)
  }

  async startVerificationRun(input: StartVerificationRunInput = {}): Promise<{ started: true }> {
    this.inputScript = this.resolveInputScript(input)
    const result = await this.backend.startObservationRun(input, this.inputScript)
    this.runActive = true
    return result
  }

  async stopRun(): Promise<{ stopped: true }> {
    const result = await this.backend.stopObservationRun()
    this.runActive = false
    this.inputScript = undefined
    return result
  }

  async runSteps(count: number): Promise<ReturnType<LogicVerificationHost['runSteps']>> {
    return this.backend.runSteps(count, this.inputScript)
  }

  async runForSimTime(seconds: number): Promise<ReturnType<LogicVerificationHost['runSteps']>> {
    return this.backend.runForSimTime(seconds, this.inputScript)
  }

  async getObservation(): Promise<ReturnType<LogicVerificationRunBackend['getObservation']>> {
    return this.backend.getObservation()
  }

  /** Synchronous headless MCP paths (in-process host only). */
  startVerificationRunOnHost(
    host: LogicVerificationHost,
    input: StartVerificationRunInput = {},
  ): { started: true } {
    this.inputScript = this.resolveInputScript(input)
    host.startObservationRun({ carryOverTimeline: input.carryOverTimeline })
    this.runActive = true
    return { started: true }
  }

  runStepsOnHost(host: LogicVerificationHost, count: number): ReturnType<LogicVerificationHost['runSteps']> {
    return host.runSteps(count, this.inputScript)
  }

  stopRunOnHost(host: LogicVerificationHost): { stopped: true } {
    host.stopObservationRun()
    this.runActive = false
    this.inputScript = undefined
    return { stopped: true }
  }
}

export function createInProcessLogicVerificationRunBackend(
  getHost: () => LogicVerificationHost,
  getDt: () => number,
  options?: {
    beforeStep?: () => void
    afterStep?: () => void
  },
): LogicVerificationRunBackend {
  const wrapStep = <T>(fn: () => T): T => {
    options?.beforeStep?.()
    try {
      return fn()
    } finally {
      options?.afterStep?.()
    }
  }

  return {
    getDt,
    async registerProbes(probes) {
      getHost().registerObservationProbes(probes)
      return { registered: probes.length }
    },
    async applyWorldPatch(patch) {
      return getHost().applyWorldPatch(patch)
    },
    async startObservationRun(input, inputScript) {
      getHost().startObservationRun({ carryOverTimeline: input.carryOverTimeline })
      void inputScript
      return { started: true }
    },
    async stopObservationRun() {
      getHost().stopObservationRun()
      return { stopped: true }
    },
    async runSteps(count, inputScript) {
      return wrapStep(() => getHost().runSteps(count, inputScript))
    },
    async runForSimTime(seconds, inputScript) {
      const steps = Math.max(0, Math.ceil(seconds / getDt()))
      return wrapStep(() => getHost().runSteps(steps, inputScript))
    },
    async getObservation() {
      const host = getHost()
      const session = host.getObservationSession()
      return {
        timeline: host.getObservationTimeline(),
        snapshot: host.snapshot(),
        compileErrors: session.getCompileErrors(),
        runtimeErrors: session.getRuntimeErrors(),
        runtimeErrorList: [...session.getRuntimeErrors().values()],
      }
    },
  }
}

export function createBrowserRpcLogicVerificationRunBackend(
  client: LogicVerificationBrowserMcpClient,
  getDt: () => number,
): LogicVerificationRunBackend {
  return {
    getDt,
    async registerProbes(probes) {
      return (await client.invoke('register_probes', { probes })) as { registered: number }
    },
    async applyWorldPatch(patch) {
      return (await client.invoke('apply_world_patch', patch)) as ApplyLogicVerificationWorldPatchHostResult
    },
    async startObservationRun(input, _inputScript) {
      await client.invoke('start_verification_run', input)
      return { started: true }
    },
    async stopObservationRun() {
      await client.invoke('stop_observation_run')
      return { stopped: true }
    },
    async runSteps(count, _inputScript) {
      return (await client.invoke('run_steps', { count })) as ReturnType<LogicVerificationHost['runSteps']>
    },
    async runForSimTime(seconds, _inputScript) {
      return (await client.invoke('run_for_sim_time', { seconds })) as ReturnType<
        LogicVerificationHost['runSteps']
      >
    },
    async getObservation() {
      const obs = (await client.invoke('get_observation')) as {
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
    },
  }
}
