import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  AgentObservationSession,
  ObservationTimelineBuffer,
  type AgentObservationProbe,
} from './agentObservationSession'
import {
  getTransformerWatchEntries,
  publishTransformerWatchEntry,
  resetTransformerWatchBridgeForTests,
  setTransformerWatchEnabled,
} from '@/runtime/transformerWatchBridge'
import {
  getTransformerTraceTargetEntityId,
  resetTransformerTraceBridgeForTests,
} from '@/runtime/transformerTraceBridge'
import {
  clearCustomTransformerRuntimeError,
  publishCustomTransformerRuntimeError,
} from '@/runtime/customTransformerErrorBridge'
import type { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import type { PhysicsWorld } from '@/physics/rapierPhysics'

describe('ObservationTimelineBuffer', () => {
  it('caps length and drops oldest rows', () => {
    const buf = new ObservationTimelineBuffer(3)
    buf.append({ simTime: 1, dt: 0.1, rows: { a: 1 } })
    buf.append({ simTime: 2, dt: 0.1, rows: { a: 2 } })
    buf.append({ simTime: 3, dt: 0.1, rows: { a: 3 } })
    buf.append({ simTime: 4, dt: 0.1, rows: { a: 4 } })
    const rows = buf.getRows()
    expect(rows).toHaveLength(3)
    expect(rows[0]?.simTime).toBe(2)
    expect(rows[2]?.simTime).toBe(4)
  })
})

describe('AgentObservationSession probe scheduler', () => {
  const registry = {
    getPosition: vi.fn(() => [0, 1, 2] as const),
    getRotation: vi.fn(() => [0, 0, 0] as const),
  } as unknown as RenderItemRegistry

  const physicsWorld = {
    getCachedTransform: vi.fn(() => ({
      linvel: { x: 1, y: 0, z: 0 },
      angvel: { x: 0, y: 0, z: 0 },
      isSleeping: false,
    })),
  } as unknown as PhysicsWorld

  beforeEach(() => {
    resetTransformerWatchBridgeForTests()
    resetTransformerTraceBridgeForTests()
    clearCustomTransformerRuntimeError()
    vi.clearAllMocks()
  })

  it('samples entityPose probe on interval in sim time', () => {
    const session = new AgentObservationSession({ registry, physicsWorld, maxTimelineRows: 50 })
    const probes: AgentObservationProbe[] = [
      { id: 'carPose', kind: 'entityPose', entityId: 'car', intervalMs: 100 },
    ]
    session.registerProbes(probes)
    session.startRun()

    session.recordAfterStep({ simTime: 0, dt: 1 / 60 })
    expect(session.getTimeline()).toHaveLength(1)
    expect(session.getTimeline()[0]?.rows.carPose).toEqual({
      position: [0, 1, 2],
      rotation: [0, 0, 0],
    })

    session.recordAfterStep({ simTime: 1 / 60, dt: 1 / 60 })
    expect(session.getTimeline()).toHaveLength(1)

    session.recordAfterStep({ simTime: 0.11, dt: 1 / 60 })
    expect(session.getTimeline()).toHaveLength(2)
    expect(registry.getPosition).toHaveBeenCalledWith('car')

    session.dispose()
  })

  it('enables watch publishing without Builder watchEnabled', () => {
    setTransformerWatchEnabled(false)
    const session = new AgentObservationSession({ registry, physicsWorld })
    session.startRun()

    publishTransformerWatchEntry({
      entityId: 'e1',
      configStackIndex: 0,
      label: 'speed',
      value: '42',
    })
    expect(getTransformerWatchEntries().size).toBe(1)

    session.recordAfterStep({ simTime: 0.1, dt: 0.016 })
    const row = session.getTimeline()[0]
    expect(row?.rows.speed).toBe('42')

    session.dispose()
    publishTransformerWatchEntry({
      entityId: 'e1',
      configStackIndex: 0,
      label: 'ignored',
      value: 'x',
    })
    expect(getTransformerWatchEntries().size).toBe(1)
  })

  it('registers trace probe target on startRun', () => {
    const session = new AgentObservationSession({ registry, physicsWorld })
    session.registerProbes([{ id: 't1', kind: 'trace', entityId: 'car' }])
    session.startRun()
    expect(getTransformerTraceTargetEntityId()).toBe('car')
    session.dispose()
    expect(getTransformerTraceTargetEntityId()).toBeNull()
  })

  it('surfaces runtime errors on the run handle', () => {
    const session = new AgentObservationSession({ registry, physicsWorld })
    session.startRun()
    publishCustomTransformerRuntimeError({
      entityId: 'e1',
      configStackIndex: 0,
      message: 'boom',
      code: 'return {}',
    })
    expect(session.getRuntimeErrors().get('e1:0')?.message).toBe('boom')
    session.dispose()
  })
})
