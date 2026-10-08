import { describe, expect, it } from 'vitest'
import { buildShippedGlobalBehaviorLibraryBundle } from '@/globalPipeline/buildSelfDrivingGlobalBehaviorLibrary'
import { copyGlobalPipeIntoWorld } from '@/globalPipeline/copyGlobalPipeIntoWorld'
import { mergeShippedGlobalBehaviorLibrary } from '@/globalPipeline/mergeShippedGlobalBehaviorLibrary'
import { AV_GLOBAL_STACK_PIPE_ID } from '@/globalPipeline/buildAvStackGlobalBehaviorLibrary'
import { EMPTY_GLOBAL_BEHAVIOR_LIBRARY } from '@/types/globalBehaviorLibrary'
import { assignPipeToEntity } from '@/utils/commitTransformerConfigsToWorld'
import { updateBindingParams } from '@/utils/pipeNavMutations'
import { setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { watchValues } from '@/test/avLab/lab'
import { WorldSimulator } from '@/test/helpers/worldSimulator'
import type { RennWorld } from '@/types/world'

/**
 * Keyboard manual override of the AV car (feature-av-stack.md, "Manual keyboard override"): synthetic key events through the real
 * `input` stage of the shipped pipe (WorldSimulator.setInput). A key suspends the autopilot's steering / throttle for `overrideHold` s
 * (restarted while held), the autopilot resumes afterwards, the AEB never yields.
 */
const library = mergeShippedGlobalBehaviorLibrary(EMPTY_GLOBAL_BEHAVIOR_LIBRARY, buildShippedGlobalBehaviorLibraryBundle())

function buildWorld(opts: { manualOverride?: boolean; overrideHold?: number; wallZ?: number; startZ?: number; disableAeb?: boolean }): RennWorld {
  let world = {
    version: '1.0',
    world: { gravity: [0, -100, 0] },
    entities: [
      { id: 'floor', name: 'Floor', bodyType: 'static', shape: { type: 'box', width: 600, height: 1, depth: 600 }, position: [0, -0.5, 0], rotation: [0, 0, 0] },
      { id: 'buggy', name: 'Buggy', bodyType: 'dynamic', shape: { type: 'box', width: 2, height: 1, depth: 4 }, position: [0, 0.55, opts.startZ ?? 200], rotation: [0, 0, 0], mass: 2, friction: 0.8 },
      ...(opts.wallZ !== undefined
        ? [{ id: 'wall', name: 'Wall', bodyType: 'static', shape: { type: 'box', width: 60, height: 4, depth: 2 }, position: [0, 2, opts.wallZ], rotation: [0, 0, 0] }]
        : []),
    ],
  } as unknown as RennWorld
  world = copyGlobalPipeIntoWorld(world, library, AV_GLOBAL_STACK_PIPE_ID)
  world = assignPipeToEntity(world, 'buggy', world.transformerPipes![AV_GLOBAL_STACK_PIPE_ID]!, 'linked')
  // goal far ahead on the straight line (the wall, if any, is NOT known to the mission: the AEB is what stops the manual driver)
  world.transformers!.global_av_mission!.params = { waypoints: [[0, -250]], acceptRadius: 9, mode: 'stop' }
  if (opts.disableAeb) world.transformers!.global_av_aeb!.enabled = false
  return updateBindingParams(world, 'buggy', 0, {
    cruiseSpeed: 10,
    ...(opts.manualOverride !== undefined ? { manualOverride: opts.manualOverride } : {}),
    ...(opts.overrideHold !== undefined ? { overrideHold: opts.overrideHold } : {}),
  })
}

const manual = (): string => String(watchValues('buggy')['av.manual'] ?? 'n/a')
const speedOf = (sim: WorldSimulator): number => {
  const v = sim.getVelocity('buggy')
  return Math.hypot(v[0], v[2])
}
const dt = 1 / 60
const frames = (s: number): number => Math.round(s / dt)

describe('AV manual keyboard override', () => {
  it('declares the pipe params and ships the input stage ahead of the autopilot (first member, priority 1)', () => {
    const pipe = library.transformerPipes!.global_av_autopilot!
    expect(pipe.paramDefs!.map((p) => p.key)).toEqual(expect.arrayContaining(['manualOverride', 'overrideHold']))
    const first = pipe.members![0]!
    expect(first).toEqual({ kind: 'stage', stageId: 'global_av_input' })
    expect(library.transformers!.global_av_input!.type).toBe('input')
    expect(library.transformers!.global_av_input!.priority!).toBeLessThan(library.transformers!.global_av_ego!.priority!)
  })

  it('a key suspends the autopilot for overrideHold s (restarted while held), then the autopilot resumes', async () => {
    setAgentObservationWatchActive(true)
    const sim = await WorldSimulator.create(buildWorld({ manualOverride: true, overrideHold: 1 }), 15)
    try {
      sim.runFrames(frames(4))
      expect(manual()).toBe('off')
      const vCruise = speedOf(sim)
      expect(vCruise).toBeGreaterThan(5) // the autopilot drives

      // hold the throttle key 1 s: autopilot yields, the keys win, the car goes far beyond the autopilot's cruise speed
      sim.setInput({ w: true })
      sim.runFrames(frames(1))
      expect(manual()).toBe('keys')
      const vKeys = speedOf(sim)
      expect(vKeys).toBeGreaterThan(vCruise + 10)

      // release: still manual for ~1 s (timer restarted on the last key frame)
      sim.clearInput()
      sim.runFrames(frames(0.6))
      expect(manual()).not.toBe('off')
      sim.runFrames(frames(0.3))
      expect(manual()).not.toBe('off') // 0.9 s after the last key
      const vYielded = speedOf(sim)
      sim.runFrames(frames(0.3)) // 1.2 s after the last key
      expect(manual()).toBe('off')

      // autopilot resumes: it brakes the car back down toward cruise speed (it would never have done that while yielding)
      sim.runFrames(frames(4))
      expect(speedOf(sim)).toBeLessThan(vYielded - 10)
    } finally {
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
  }, 120_000)

  it('every key event restarts the timer: a tap every 0.5 s keeps the override on', async () => {
    setAgentObservationWatchActive(true)
    const sim = await WorldSimulator.create(buildWorld({ manualOverride: true, overrideHold: 1 }), 15)
    try {
      sim.runFrames(frames(1))
      for (let i = 0; i < 6; i++) {
        sim.setInput({ a: true })
        sim.runFrames(2)
        sim.clearInput()
        sim.runFrames(frames(0.5))
        expect(manual()).not.toBe('off')
      }
      sim.runFrames(frames(1.2))
      expect(manual()).toBe('off')
    } finally {
      sim.dispose()
      setAgentObservationWatchActive(false)
    }
  }, 120_000)

  it('manualOverride off (default): keys change nothing, av.manual stays off', async () => {
    const run = async (keys: boolean): Promise<[number, number, number]> => {
      setAgentObservationWatchActive(true)
      const sim = await WorldSimulator.create(buildWorld({}), 15)
      try {
        sim.runFrames(frames(3))
        if (keys) sim.setInput({ s: true, a: true })
        sim.runFrames(frames(1))
        if (keys) {
          expect(manual()).not.toBe('keys')
          sim.clearInput()
        }
        sim.runFrames(frames(3))
        return sim.getPosition('buggy')
      } finally {
        sim.dispose()
        setAgentObservationWatchActive(false)
      }
    }
    const a = await run(false)
    const b = await run(true)
    expect(b).toEqual(a) // bit-identical: the key actions are dropped by the ego stage
  }, 120_000)

  it('the AEB stays active while overriding: full throttle toward a wall stops short of it (red check: without AEB it hits)', async () => {
    const drive = async (disableAeb: boolean): Promise<{ minGap: number; aeb: boolean; speedAtMin: number }> => {
      setAgentObservationWatchActive(true)
      // car starts at z 60 facing -Z, wall face at z -29 (centre -30, depth 2); keys held the whole time (override never lapses)
      const sim = await WorldSimulator.create(buildWorld({ manualOverride: true, wallZ: -30, startZ: 60, disableAeb }), 15)
      try {
        sim.setInput({ w: true })
        let minGap = Infinity
        let speedAtMin = 0
        let aeb = false
        for (let f = 0; f < frames(12); f++) {
          sim.runFrames(1)
          const p = sim.getPosition('buggy')
          const gap = p[2] - 2 - -29 // nose to wall face
          if (gap < minGap) {
            minGap = gap
            speedAtMin = speedOf(sim)
          }
          if (watchValues('buggy')['av.aeb'] !== undefined) aeb = true
        }
        expect(manual()).toBe('keys')
        return { minGap, aeb, speedAtMin }
      } finally {
        sim.dispose()
        setAgentObservationWatchActive(false)
      }
    }
    const safe = await drive(false)
    expect(safe.aeb).toBe(true)
    expect(safe.minGap).toBeGreaterThan(0.3)
    const crash = await drive(true)
    expect(crash.minGap).toBeLessThan(0.3) // the user alone drives into the wall: the test is sensitive to the AEB
  }, 120_000)
})
