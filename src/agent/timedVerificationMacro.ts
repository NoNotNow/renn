/**
 * Timed verification macro: sim-time input schedule + platform probe samples in one run.
 */

import type {
  AgentObservationProbe,
  ObservationTimelineRow,
} from '@/agent/agentObservationSession'
import {
  buildScriptedRawInput,
  type LogicVerificationHost,
  type LogicVerificationInputScript,
  type LogicVerificationStepResult,
} from '@/agent/logicVerificationHost'
import type { RawKeyboardState } from '@/types/transformer'

export const MAX_TIMED_MACRO_DURATION_SIM_SEC = 120
export const MAX_TIMED_MACRO_INPUT_STEPS = 64
export const MAX_TIMED_MACRO_SAMPLES = 32

export type TimedMacroInputKeys = Partial<
  Pick<RawKeyboardState, 'w' | 'a' | 's' | 'd' | 'space' | 'shift'>
>

export type TimedMacroInputStep = {
  /** Seconds from macro trigger (after optional start delay). */
  atSimTime: number
  inputKeys?: TimedMacroInputKeys
}

export type TimedMacroSampleProbe = {
  id: string
  kind: 'entityPose' | 'entityBody' | 'trace'
  entityId: string
  intervalMs?: number
}

export type TimedVerificationMacroConfig = {
  /** Sim seconds to advance with empty/hold input before the schedule (default 0). */
  startDelaySimSec?: number
  /** Keys held during start delay (default none). */
  holdInputDuringDelay?: TimedMacroInputKeys
  /** Sim seconds to run after start delay (required). */
  durationSimSec: number
  /** Input changes keyed to macro-relative sim time. */
  steps?: TimedMacroInputStep[]
  /** Platform probes registered for this macro (merged with any prior register_probes). */
  samples?: TimedMacroSampleProbe[]
  /**
   * Wall ms to pause after each input-step boundary when running on attached Builder (default 0).
   * Ignored in headless (max speed).
   */
  segmentWallPauseMs?: number
  carryOverTimeline?: boolean
}

export type TimedMacroEvent =
  | { simTime: number; kind: 'macroStart'; macroStartSimTime: number }
  | { simTime: number; kind: 'inputChange'; atSimTime: number; inputKeys: TimedMacroInputKeys }
  | { simTime: number; kind: 'segmentWallPause'; pauseMs: number }

export type TimedVerificationMacroResult = {
  macroStartSimTime: number
  endedSimTime: number
  events: TimedMacroEvent[]
  timeline: readonly ObservationTimelineRow[]
  snapshot: LogicVerificationStepResult
  compileErrors: readonly { configKey: string; message: string }[]
  runtimeErrorList: unknown[]
}

export type TimedMacroRunner = {
  getDt(): number
  getSimTime(): number
  registerProbes(probes: AgentObservationProbe[]): void | Promise<void>
  startObservationRun(options?: { carryOverTimeline?: boolean }): void | Promise<void>
  runSteps(
    count: number,
    inputScript: LogicVerificationInputScript,
  ): LogicVerificationStepResult | Promise<LogicVerificationStepResult>
  getObservation(): {
    timeline: readonly ObservationTimelineRow[]
    snapshot: LogicVerificationStepResult
    compileErrors: readonly { configKey: string; message: string }[]
    runtimeErrorList: unknown[]
  } | Promise<{
    timeline: readonly ObservationTimelineRow[]
    snapshot: LogicVerificationStepResult
    compileErrors: readonly { configKey: string; message: string }[]
    runtimeErrorList: unknown[]
  }>
}

export function validateTimedVerificationMacroConfig(
  config: TimedVerificationMacroConfig,
): string | null {
  if (!Number.isFinite(config.durationSimSec) || config.durationSimSec <= 0) {
    return 'durationSimSec must be a positive number'
  }
  const startDelay = config.startDelaySimSec ?? 0
  if (!Number.isFinite(startDelay) || startDelay < 0) {
    return 'startDelaySimSec must be a non-negative number'
  }
  const total = startDelay + config.durationSimSec
  if (total > MAX_TIMED_MACRO_DURATION_SIM_SEC) {
    return `macro duration (${total}s sim) exceeds max ${MAX_TIMED_MACRO_DURATION_SIM_SEC}s`
  }
  const steps = config.steps ?? []
  if (steps.length > MAX_TIMED_MACRO_INPUT_STEPS) {
    return `too many input steps (max ${MAX_TIMED_MACRO_INPUT_STEPS})`
  }
  for (const step of steps) {
    if (!Number.isFinite(step.atSimTime) || step.atSimTime < 0) {
      return 'each step.atSimTime must be a non-negative number'
    }
    if (step.atSimTime > total + 1e-6) {
      return 'step.atSimTime must not exceed startDelaySimSec + durationSimSec'
    }
  }
  const samples = config.samples ?? []
  if (samples.length > MAX_TIMED_MACRO_SAMPLES) {
    return `too many samples (max ${MAX_TIMED_MACRO_SAMPLES})`
  }
  for (const sample of samples) {
    if (!sample.id?.trim()) return 'each sample needs a non-empty id'
    if (!sample.entityId?.trim()) return 'each sample needs entityId'
  }
  const pause = config.segmentWallPauseMs ?? 0
  if (!Number.isFinite(pause) || pause < 0) {
    return 'segmentWallPauseMs must be a non-negative number'
  }
  return null
}

function macroSamplesToProbes(samples: TimedMacroSampleProbe[]): AgentObservationProbe[] {
  return samples.map((s) => ({
    id: s.id,
    kind: s.kind,
    entityId: s.entityId,
    intervalMs: s.intervalMs,
  }))
}

export function buildTimedMacroInputScript(
  macroStartSimTime: number,
  config: TimedVerificationMacroConfig,
): LogicVerificationInputScript {
  const startDelay = config.startDelaySimSec ?? 0
  const sorted = [...(config.steps ?? [])].sort((a, b) => a.atSimTime - b.atSimTime)
  const holdDelay = config.holdInputDuringDelay ?? {}

  return (ctx) => {
    const macroT = ctx.simTime - macroStartSimTime
    if (macroT < startDelay - 1e-9) {
      return buildScriptedRawInput(holdDelay)
    }
    let keys: TimedMacroInputKeys = {}
    for (const step of sorted) {
      if (step.atSimTime <= macroT + 1e-9) {
        keys = step.inputKeys ?? {}
      } else {
        break
      }
    }
    return buildScriptedRawInput(keys)
  }
}

function collectInputBoundaryStepIndices(
  dt: number,
  totalSteps: number,
  macroStartSimTime: number,
  config: TimedVerificationMacroConfig,
): number[] {
  const startDelay = config.startDelaySimSec ?? 0
  const boundaries = new Set<number>([0, totalSteps])
  for (const step of config.steps ?? []) {
    const targetSim = macroStartSimTime + step.atSimTime
    const macroLocal = step.atSimTime
    if (macroLocal < startDelay - 1e-9 || macroLocal > startDelay + config.durationSimSec + 1e-9) {
      continue
    }
    const stepIndex = Math.ceil((targetSim - macroStartSimTime) / dt)
    if (stepIndex >= 0 && stepIndex <= totalSteps) {
      boundaries.add(stepIndex)
    }
  }
  return [...boundaries].sort((a, b) => a - b)
}

async function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function executeTimedVerificationMacro(
  runner: TimedMacroRunner,
  config: TimedVerificationMacroConfig,
): Promise<TimedVerificationMacroResult> {
  const err = validateTimedVerificationMacroConfig(config)
  if (err) throw new Error(err)

  const dt = runner.getDt()
  const macroStartSimTime = runner.getSimTime()
  const startDelay = config.startDelaySimSec ?? 0
  const totalSimSec = startDelay + config.durationSimSec
  const totalSteps = Math.max(0, Math.ceil(totalSimSec / dt))
  const pauseMs = config.segmentWallPauseMs ?? 0

  const samples = config.samples ?? []
  if (samples.length > 0) {
    await runner.registerProbes(macroSamplesToProbes(samples))
  }

  await runner.startObservationRun({ carryOverTimeline: config.carryOverTimeline })

  const events: TimedMacroEvent[] = [
    { simTime: macroStartSimTime, kind: 'macroStart', macroStartSimTime },
  ]

  const inputScript = buildTimedMacroInputScript(macroStartSimTime, config)

  if (pauseMs > 0 && totalSteps > 0) {
    const boundaries = collectInputBoundaryStepIndices(dt, totalSteps, macroStartSimTime, config)
    let prev = 0
    for (const boundary of boundaries) {
      const chunk = boundary - prev
      if (chunk > 0) {
        await runner.runSteps(chunk, inputScript)
      }
      if (boundary > 0 && boundary < totalSteps) {
        events.push({ simTime: macroStartSimTime + boundary * dt, kind: 'segmentWallPause', pauseMs })
        await sleepMs(pauseMs)
      }
      prev = boundary
    }
    if (prev < totalSteps) {
      await runner.runSteps(totalSteps - prev, inputScript)
    }
  } else {
    await runner.runSteps(totalSteps, inputScript)
  }

  for (const step of [...(config.steps ?? [])].sort((a, b) => a.atSimTime - b.atSimTime)) {
    events.push({
      simTime: macroStartSimTime + step.atSimTime,
      kind: 'inputChange',
      atSimTime: step.atSimTime,
      inputKeys: step.inputKeys ?? {},
    })
  }

  const obs = await runner.getObservation()
  return {
    macroStartSimTime,
    endedSimTime: obs.snapshot.simTime,
    events,
    timeline: obs.timeline,
    snapshot: obs.snapshot,
    compileErrors: obs.compileErrors,
    runtimeErrorList: obs.runtimeErrorList,
  }
}

export function createHostTimedMacroRunner(host: LogicVerificationHost): TimedMacroRunner {
  return {
    getDt: () => host.getDt(),
    getSimTime: () => host.getSimTime(),
    registerProbes: (probes) => {
      host.registerObservationProbes(probes)
    },
    startObservationRun: (options) => {
      host.startObservationRun(options)
    },
    runSteps: (count, script) => host.runSteps(count, script),
    getObservation: () => {
      const session = host.getObservationSession()
      return {
        timeline: host.getObservationTimeline(),
        snapshot: host.snapshot(),
        compileErrors: session.getCompileErrors(),
        runtimeErrorList: [...session.getRuntimeErrors().values()],
      }
    },
  }
}
