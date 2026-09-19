/**
 * Agent observation session: platform probes, watch/trace bridge lift, capped timeline.
 * Inactive by default; Builder Workspace gates stay unchanged for humans.
 */

import type { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import type { PhysicsWorld } from '@/physics/rapierPhysics'
import type { Rotation, Vec3 } from '@/types/world'
import {
  getTransformerWatchEntries,
  setAgentObservationWatchActive,
  subscribeTransformerWatch,
} from '@/runtime/transformerWatchBridge'
import {
  getTransformerLiveTraceSnapshot,
  setAgentObservationTraceEntityIds,
  setTransformerTraceTargetEntityId,
  subscribeTransformerLiveTrace,
} from '@/runtime/transformerTraceBridge'
import {
  getCustomTransformerRuntimeErrors,
  subscribeCustomTransformerRuntimeError,
  type CustomTransformerRuntimeErrorSnapshot,
} from '@/runtime/customTransformerErrorBridge'

export type AgentObservationProbe =
  | {
      id: string
      kind: 'entityPose'
      entityId: string
      /** Wall-clock ms between samples; default 200. */
      intervalMs?: number
    }
  | {
      id: string
      kind: 'entityBody'
      entityId: string
      intervalMs?: number
    }
  | { id: string; kind: 'trace'; entityId: string }

export type ObservationTimelineRow = {
  simTime: number
  dt: number
  rows: Record<string, unknown>
}

export class ObservationTimelineBuffer {
  private readonly maxRows: number
  private rows: ObservationTimelineRow[] = []

  constructor(maxRows: number) {
    this.maxRows = Math.max(1, Math.floor(maxRows))
  }

  append(row: ObservationTimelineRow): void {
    this.rows.push(row)
    if (this.rows.length > this.maxRows) {
      this.rows = this.rows.slice(this.rows.length - this.maxRows)
    }
  }

  clear(): void {
    this.rows = []
  }

  getRows(): readonly ObservationTimelineRow[] {
    return this.rows
  }
}

const DEFAULT_PROBE_INTERVAL_MS = 200
const DEFAULT_MAX_TIMELINE_ROWS = 1000

type ProbeState = {
  probe: AgentObservationProbe
  intervalSec: number
  lastSampleSimTime: number
}

export type AgentObservationSessionDeps = {
  registry: RenderItemRegistry
  physicsWorld: PhysicsWorld
  maxTimelineRows?: number
}

export class AgentObservationSession {
  private readonly registry: RenderItemRegistry
  private readonly physicsWorld: PhysicsWorld
  private readonly timeline: ObservationTimelineBuffer
  private probes: AgentObservationProbe[] = []
  private probeStates: ProbeState[] = []
  private running = false
  private unsubWatch: (() => void) | null = null
  private unsubTrace: (() => void) | null = null
  private unsubErrors: (() => void) | null = null
  private compileErrors: { configKey: string; message: string }[] = []

  constructor(deps: AgentObservationSessionDeps) {
    this.registry = deps.registry
    this.physicsWorld = deps.physicsWorld
    this.timeline = new ObservationTimelineBuffer(deps.maxTimelineRows ?? DEFAULT_MAX_TIMELINE_ROWS)
  }

  registerProbes(probes: AgentObservationProbe[]): void {
    this.probes = [...probes]
    this.rebuildProbeStates()
  }

  setCompileErrors(errors: { configKey: string; message: string }[]): void {
    this.compileErrors = [...errors]
  }

  getCompileErrors(): readonly { configKey: string; message: string }[] {
    return this.compileErrors
  }

  startRun(options?: { carryOverTimeline?: boolean }): void {
    if (this.running) return
    this.running = true
    if (!options?.carryOverTimeline) {
      this.timeline.clear()
    }
    this.rebuildProbeStates()
    setAgentObservationWatchActive(true)
    this.applyTraceTargets()
    this.unsubWatch = subscribeTransformerWatch(() => {})
    this.unsubTrace = subscribeTransformerLiveTrace(() => {})
    this.unsubErrors = subscribeCustomTransformerRuntimeError(() => {})
  }

  stopRun(): void {
    if (!this.running) return
    this.teardownBridgeLift()
    this.running = false
  }

  dispose(): void {
    this.stopRun()
  }

  getTimeline(): readonly ObservationTimelineRow[] {
    return this.timeline.getRows()
  }

  getRuntimeErrors(): ReadonlyMap<string, CustomTransformerRuntimeErrorSnapshot> {
    return getCustomTransformerRuntimeErrors()
  }

  recordAfterStep(ctx: { simTime: number; dt: number }): void {
    if (!this.running) return
    const rows: Record<string, unknown> = {}

    for (const state of this.probeStates) {
      if (ctx.simTime - state.lastSampleSimTime + 1e-9 < state.intervalSec) {
        continue
      }
      const sample = this.sampleProbe(state.probe)
      if (sample !== undefined) {
        rows[state.probe.id] = sample
        state.lastSampleSimTime = ctx.simTime
      }
    }

    for (const entry of getTransformerWatchEntries().values()) {
      rows[entry.label] = entry.value
    }

    const traceSnap = getTransformerLiveTraceSnapshot()
    const traceProbe = this.probes.find((p) => p.kind === 'trace')
    if (traceProbe && traceSnap?.entityId === traceProbe.entityId && traceSnap.steps.length > 0) {
      rows[traceProbe.id] = traceSnap.steps
    }

    if (Object.keys(rows).length === 0) return
    this.timeline.append({ simTime: ctx.simTime, dt: ctx.dt, rows })
  }

  private rebuildProbeStates(): void {
    this.probeStates = this.probes.map((probe) => ({
      probe,
      intervalSec:
        probe.kind === 'trace'
          ? 0
          : (probe.intervalMs ?? DEFAULT_PROBE_INTERVAL_MS) / 1000,
      lastSampleSimTime: -Infinity,
    }))
  }

  private applyTraceTargets(): void {
    const traceIds = this.probes.filter((p) => p.kind === 'trace').map((p) => p.entityId)
    setAgentObservationTraceEntityIds(traceIds)
    setTransformerTraceTargetEntityId(traceIds[0] ?? null)
  }

  private teardownBridgeLift(): void {
    this.unsubWatch?.()
    this.unsubTrace?.()
    this.unsubErrors?.()
    this.unsubWatch = null
    this.unsubTrace = null
    this.unsubErrors = null
    setAgentObservationWatchActive(false)
    setAgentObservationTraceEntityIds([])
    setTransformerTraceTargetEntityId(null)
  }

  private sampleProbe(probe: AgentObservationProbe): unknown {
    switch (probe.kind) {
      case 'entityPose': {
        const position = this.registry.getPosition(probe.entityId)
        const rotation = this.registry.getRotation(probe.entityId)
        if (!position || !rotation) return undefined
        return {
          position: cloneVec3(position),
          rotation: cloneRotation(rotation),
        }
      }
      case 'entityBody': {
        const ct = this.physicsWorld.getCachedTransform(probe.entityId)
        if (!ct) return undefined
        return {
          linvel: [ct.linvel.x, ct.linvel.y, ct.linvel.z],
          angvel: [ct.angvel.x, ct.angvel.y, ct.angvel.z],
          isSleeping: ct.isSleeping,
        }
      }
      case 'trace':
        return undefined
      default:
        return undefined
    }
  }
}

function cloneVec3(v: Vec3): Vec3 {
  return [v[0], v[1], v[2]]
}

function cloneRotation(r: Rotation): Rotation {
  return [r[0], r[1], r[2]]
}
