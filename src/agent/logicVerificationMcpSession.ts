/**
 * In-process session for MCP tools → LogicVerificationHost.
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

export type LoadWorldJsonInput = {
  world: RennWorld
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

export class LogicVerificationMcpSession {
  private host: LogicVerificationHost | null = null
  private inputScript: LogicVerificationInputScript | undefined
  private runActive = false
  private dt = DEFAULT_LOGIC_VERIFICATION_DT

  get hasHost(): boolean {
    return this.host != null
  }

  get isRunActive(): boolean {
    return this.runActive
  }

  async loadWorldJson(input: LoadWorldJsonInput): Promise<{ loaded: true }> {
    await this.disposeHost()
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

  validateStageCode(code: string, configKey = 'stage'): { ok: true } | { ok: false; message: string } {
    const message = validateCustomTransformerSource(code, configKey)
    if (message) return { ok: false, message }
    return { ok: true }
  }

  applyWorldPatch(
    patch: LogicVerificationWorldPatch,
  ): Promise<ApplyLogicVerificationWorldPatchResult> {
    return this.requireHost().applyWorldPatch(patch)
  }

  registerProbes(probes: AgentObservationProbe[]): void {
    this.requireHost().registerObservationProbes(probes)
  }

  startVerificationRun(input: StartVerificationRunInput = {}): { started: true } {
    const host = this.requireHost()
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
    return this.requireHost().runSteps(count, this.inputScript)
  }

  runForSimTime(seconds: number): ReturnType<LogicVerificationHost['runSteps']> {
    const host = this.requireHost()
    const steps = Math.max(0, Math.ceil(seconds / this.dt))
    return host.runSteps(steps, this.inputScript)
  }

  getObservation(): {
    timeline: ReturnType<LogicVerificationHost['getObservationTimeline']>
    snapshot: ReturnType<LogicVerificationHost['snapshot']>
    compileErrors: ReturnType<AgentObservationSession['getCompileErrors']>
    runtimeErrors: ReturnType<AgentObservationSession['getRuntimeErrors']>
  } {
    const host = this.requireHost()
    const session = host.getObservationSession()
    return {
      timeline: host.getObservationTimeline(),
      snapshot: host.snapshot(),
      compileErrors: session.getCompileErrors(),
      runtimeErrors: session.getRuntimeErrors(),
    }
  }

  stopRun(): { stopped: true } {
    if (this.host) {
      this.host.stopObservationRun()
    }
    this.runActive = false
    this.inputScript = undefined
    return { stopped: true }
  }

  async dispose(): Promise<void> {
    await this.disposeHost()
  }

  private requireHost(): LogicVerificationHost {
    if (!this.host) {
      throw new Error('No world loaded — call load_world_json first')
    }
    return this.host
  }

  private async disposeHost(): Promise<void> {
    if (this.host) {
      this.host.dispose()
      this.host = null
    }
    this.runActive = false
    this.inputScript = undefined
  }
}
