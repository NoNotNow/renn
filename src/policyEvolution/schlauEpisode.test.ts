import { describe, expect, it } from 'vitest'
import { createRng } from '@/avEvolution/core/rng'
import type { V2 } from '@/avEvolution/eval/geometry'
import { CAR2_PARAMS, CAR_BODY, CAR_START_Y } from './episode'
import { freshGenome } from './islands'
import { NOSE_M } from './policy'
import { buildSchlauTask, type SchlauTask } from './schlauCourses'
import { N_IN_SCHLAU, SCHLAU_ACTUATOR_ID, SCHLAU_CAR_BODY_ID, SCHLAU_STAGE_ID, SCHLAU_STAGE_PRIORITY } from './schlauPolicy'
import {
  SCHLAU_OBJECT_TOUCH_PENALTY_PER_FRAME,
  SCHLAU_WALL_TOUCH_PENALTY_PER_FRAME,
  schlauDistanceField,
  schlauTouchPenaltyNorm,
} from './schlauScore'
import { buildSchlauWorld, runSchlauEpisode, schlauEpisodeSeconds, SCHLAU_GOAL_REACH_M, SCHLAU_OFFCOURSE_M, SCHLAU_STALL_WINDOW_S } from './schlauEpisode'

/** start nose: start + headingDir(yaw) * NOSE_M (0 deg = -Z, positive left) */
const startNose = (task: SchlauTask): V2 => {
  const yawRad = (task.startYawDeg * Math.PI) / 180
  return [task.start[0] - Math.sin(yawRad) * NOSE_M, task.start[1] - Math.cos(yawRad) * NOSE_M]
}

describe('schlau episode', () => {
  it('pins the episode constants', () => {
    expect(SCHLAU_GOAL_REACH_M).toBe(6)
    expect(SCHLAU_OFFCOURSE_M).toBe(25)
    expect(SCHLAU_STALL_WINDOW_S).toBe(10)
    // the episode's touch penalties track the 2026-10-23 decision (wall 12 -> 30, object 4 -> 15 pts/s): the old
    // v3 borrow (0.0125 / 0.005 per frame) scaled by the same factors — the schlau episode no longer imports the
    // v3 constants, maze / crux / v3 stay untouched
    expect(SCHLAU_WALL_TOUCH_PENALTY_PER_FRAME).toBeCloseTo(0.03125, 12)
    expect(SCHLAU_OBJECT_TOUCH_PENALTY_PER_FRAME).toBeCloseTo(0.01875, 12)
    expect(schlauTouchPenaltyNorm(60, 0)).toBeCloseTo(1.875, 12)
    expect(schlauTouchPenaltyNorm(0, 60)).toBeCloseTo(1.125, 12)
  })

  it('schlauEpisodeSeconds clamps 25 + d0 / 3 to 45..150', () => {
    expect(schlauEpisodeSeconds(0)).toBe(45)
    expect(schlauEpisodeSeconds(60)).toBe(45)
    expect(schlauEpisodeSeconds(300)).toBe(125)
    expect(schlauEpisodeSeconds(375)).toBe(150)
    expect(schlauEpisodeSeconds(1000)).toBe(150)
  })

  it('buildSchlauWorld: ground + car + one box per task box, the car at the start pose, drive stage + car2 actuator', () => {
    const task = buildSchlauTask('goal_box', 3)
    const genome = freshGenome(createRng(1), 0.5, N_IN_SCHLAU, 10)
    const world = buildSchlauWorld(task, genome, { noise: 0.02, noiseSeed: 7 })
    expect(world.entities.length).toBe(2 + task.boxes.length)
    expect(world.entities[0]!.id).toBe('ground')
    const car = world.entities[1]!
    expect(car.id).toBe(SCHLAU_CAR_BODY_ID)
    expect(car.bodyType).toBe('dynamic')
    expect(car.shape).toEqual({ type: 'box', width: 4, height: 1, depth: 8 })
    expect(car.position).toEqual([task.start[0], CAR_START_Y, task.start[1]])
    expect(car.rotation![1]).toBeCloseTo((task.startYawDeg * Math.PI) / 180, 12)
    expect(car.transformers).toEqual([SCHLAU_STAGE_ID, SCHLAU_ACTUATOR_ID])
    task.boxes.forEach((b, i) => {
      const e = world.entities[2 + i]!
      expect(e.id).toBe(`box_${i}`)
      expect(e.bodyType).toBe('static')
      expect(e.shape).toEqual({ type: 'box', width: b.size[0], height: 6, depth: b.size[1] })
      expect(e.position).toEqual([b.at[0], 3, b.at[1]])
      expect(e.rotation![1]).toBeCloseTo((b.yawDeg * Math.PI) / 180, 12)
      expect(e.friction).toBe(0.5)
    })
    const stage = world.transformers![SCHLAU_STAGE_ID]!
    expect(stage.type).toBe('custom')
    expect(stage.priority).toBe(SCHLAU_STAGE_PRIORITY)
    expect(stage.params!.w).toEqual(genome)
    expect(stage.params!.goal).toEqual([task.goal[0], task.goal[1]])
    expect(stage.params!.gain).toBe(CAR2_PARAMS.power / CAR_BODY.mass)
    expect(stage.params!.noise).toBe(0.02)
    expect(stage.params!.noiseSeed).toBe(7)
    const act = world.transformers![SCHLAU_ACTUATOR_ID]!
    expect(act.type).toBe('car2')
    expect(act.priority).toBe(11)
    expect(act.enabled).toBe(true)
    expect(act.params).toEqual(CAR2_PARAMS)
    // goal_open has no boxes; without noise the stage gets no noise params
    const open = buildSchlauWorld(buildSchlauTask('goal_open', 1), genome)
    expect(open.entities.length).toBe(2)
    expect(open.transformers![SCHLAU_STAGE_ID]!.params!.noise).toBeUndefined()
  })

  it('rejects a genome that has no schlau shape', async () => {
    await expect(runSchlauEpisode(new Array<number>(10).fill(0), 'goal_open:1')).rejects.toThrow(/schlau genome/)
  })

  it('smoke: a fresh random genome on goal_open:1 (5 s) ends with a sane outcome and sane metrics', async () => {
    const genome = freshGenome(createRng(1), 0.5, N_IN_SCHLAU, 10)
    const m = await runSchlauEpisode(genome, 'goal_open:1', { seconds: 5 })
    console.log(JSON.stringify(m))
    expect(['timeout', 'stall', 'crash', 'offcourse', 'finish']).toContain(m.outcome)
    expect(m.progress).toBeGreaterThanOrEqual(0)
    expect(m.length).toBeGreaterThan(0)
    expect(Number.isFinite(m.norm)).toBe(true)
    expect(m.norm).toBeGreaterThanOrEqual(0)
    expect(m.norm).toBeLessThan(2)
    expect(m.peakNorm).toBeGreaterThanOrEqual(0)
    expect(m.peakNorm).toBeGreaterThanOrEqual(m.norm - schlauTouchPenaltyNorm(m.touchWallFrames, m.touchObjectFrames))
  }, 60_000)

  it('goal_open scores the full euclidean start->goal distance (no field edge clamp)', async () => {
    const task = buildSchlauTask('goal_open', 1)
    const nose = startNose(task)
    const euclid = Math.hypot(nose[0] - task.goal[0], nose[1] - task.goal[1])
    const genome = freshGenome(createRng(1), 0.5, N_IN_SCHLAU, 10)
    const m = await runSchlauEpisode(genome, 'goal_open:1', { seconds: 5 })
    // open ground: the shortest drivable distance IS the euclidean nose->goal distance — the field grids only the
    // goal +/- margin, so its clamped edge read would cap length at ~the margin instead
    expect(m.length).toBeCloseTo(euclid, 6)
    expect(m.length).toBeGreaterThan(50)
  }, 60_000)

  it('is deterministic: two identical runs produce identical metrics', async () => {
    const genome = freshGenome(createRng(2), 0.5, N_IN_SCHLAU, 10)
    const a = await runSchlauEpisode(genome, 'goal_box:2', { seconds: 5 })
    const b = await runSchlauEpisode(genome, 'goal_box:2', { seconds: 5 })
    expect({ ...a, wallMs: 0 }).toEqual({ ...b, wallMs: 0 })
  }, 120_000)

  it('goal_turn headless smoke: the dead-end shunt task runs (a FRESH world per call — the reload rule), ends sane and deterministic', async () => {
    const genome = freshGenome(createRng(3), 0.5, N_IN_SCHLAU, 10)
    // every runSchlauEpisode call builds a fresh world from the task document (all entities at their document
    // poses) — the headless-defined-start rule holds per run by construction
    const m = await runSchlauEpisode(genome, 'goal_turn:2', { seconds: 10 })
    expect(['timeout', 'stall', 'crash', 'offcourse', 'finish']).toContain(m.outcome)
    expect(m.progress).toBeGreaterThanOrEqual(0)
    // the task's drivable start distance: the route must swing around the wall — well above the euclidean band
    expect(m.length).toBeGreaterThan(40)
    expect(Number.isFinite(m.norm)).toBe(true)
    expect(m.peakNorm).toBeGreaterThanOrEqual(m.norm - schlauTouchPenaltyNorm(m.touchWallFrames, m.touchObjectFrames))
    // deterministic: the same key, run again from a fresh world, identical metrics
    const b = await runSchlauEpisode(genome, 'goal_turn:2', { seconds: 10 })
    expect({ ...m, wallMs: 0 }).toEqual({ ...b, wallMs: 0 })
  }, 120_000)

  it('the field never undercuts the euclidean distance (goal_box seeds 1..10)', () => {
    let detours = 0
    for (let seed = 1; seed <= 10; seed++) {
      const task = buildSchlauTask('goal_box', seed)
      const field = schlauDistanceField(task.boxes, task.goal)
      const nose = startNose(task)
      const euclidNose = Math.hypot(nose[0] - task.goal[0], nose[1] - task.goal[1])
      const d = field.at(nose[0], nose[1])
      // never undercuts the euclidean distance of the queried point (1.5 m = the two cell-centre quantizations)
      expect(d, `seed ${seed}`).toBeGreaterThanOrEqual(euclidNose - 1.5)
      expect(d, `seed ${seed}`).toBeGreaterThanOrEqual(task.distM - 1)
      if (d > task.distM + 2) detours++
    }
    expect(detours).toBeGreaterThanOrEqual(5)
  })
})
