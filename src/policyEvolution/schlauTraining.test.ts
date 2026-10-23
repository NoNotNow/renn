import { describe, expect, it } from 'vitest'
import { pointPolyGap, rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import type { RennWorld } from '@/types/world'
import { polylineLength } from './chains'
import { CAR_START_Y } from './episode'
import { NOSE_M } from './policy'
import { type SchlauTask, schlauLineCrosses } from './schlauCourses'
import { SCHLAU_INFLATE_M } from './schlauScore'
import { genomeLengthSchlau, hiddenOfSchlau, SCHLAU_ACTUATOR_ID, SCHLAU_GOAL_VECTOR_COLOR, SCHLAU_STAGE_ID } from './schlauPolicy'
import {
  applySchlauCandidate,
  buildSchlauTrainingWorld,
  focusSchlauGoal,
  PLACEHOLDER_SCHLAU_TRAINING_CANDIDATE,
  placeholderSchlauGenome,
  SCHLAU_GOAL_Y,
  SCHLAU_SCORE,
  SCHLAU_SCORE_STAGE_CODE,
  SCHLAU_TRAINING_WORLDS,
  schlauCarId,
  schlauGoalId,
  schlauScoreStageId,
  schlauTrainingMeta,
  schlauTrainingSetup,
} from './schlauTraining'

/** The start nose of a task: center + fwd * NOSE_M, fwd = [-sin(yaw), -cos(yaw)] for rotation [0, yaw, 0]. */
const noseOf = (task: SchlauTask): V2 => {
  const yawRad = (task.startYawDeg * Math.PI) / 180
  return [task.start[0] - Math.sin(yawRad) * NOSE_M, task.start[1] - Math.cos(yawRad) * NOSE_M]
}

/** Transformer registry internals (plain JSON in the built worlds). */
const registry = (w: RennWorld) => (w.transformers ?? {}) as Record<string, { params?: Record<string, unknown> }>

describe('SCHLAU_TRAINING_WORLDS: the registry', () => {
  it('sixteen worlds: ids schlau_1..16, unique (kind, seed) tasks, the ramp tiers + goal_wall demos (user note 2026-10-23 ~03:00)', () => {
    expect(SCHLAU_TRAINING_WORLDS.map((s) => s.id)).toEqual(Array.from({ length: 16 }, (_, i) => `schlau_${i + 1}`))
    // unique TASKS (the same seed number may back a goal_box and a goal_wall demo — different tasks)
    expect(new Set(SCHLAU_TRAINING_WORLDS.map((s) => `${s.kind}:${s.seed}`)).size).toBe(16)
    for (const spec of SCHLAU_TRAINING_WORLDS) expect(spec.name.length).toBeGreaterThan(0)
    // the original six hard-tier goal_box worlds stay first (seeds 3001-3006, never trained-on / holdout)
    expect(SCHLAU_TRAINING_WORLDS.slice(0, 6).every((s) => s.kind === 'goal_box' && s.seed >= 3001 && s.seed <= 3006)).toBe(true)
    // the ramp tiers: goal_box easy -> hard over train-band seeds, goal_wall demos easy -> blockade
    expect(SCHLAU_TRAINING_WORLDS.filter((s) => s.kind === 'goal_box' && s.seed <= 16).map((s) => s.seed)).toEqual([2, 4, 7, 11, 14, 16])
    expect(SCHLAU_TRAINING_WORLDS.filter((s) => s.kind === 'goal_wall').map((s) => s.seed)).toEqual([2, 9, 16, 3001])
  })

  it('SCHLAU_SCORE pins the touch penalties (user decision 2026-10-23: wall 30, object 15 pts/s)', () => {
    expect(SCHLAU_SCORE.vRef).toBe(20)
    expect(SCHLAU_SCORE.bonusRate).toBe(5)
    expect(SCHLAU_SCORE.wallPenaltyPerS).toBe(30)
    expect(SCHLAU_SCORE.objectPenaltyPerS).toBe(15)
  })

  it('the schlau score stage draws the route but NO carrot; the schlau.seg watch survives (user decision 2026-10-23)', () => {
    // the dialog's live overlay reads schlau.seg — independent of the drawn carrot
    expect(SCHLAU_SCORE_STAGE_CODE).toContain("api.watch('schlau.seg'")
    // the route drawing stays (green -> orange hexLerp along the geodesic path)
    expect(SCHLAU_SCORE_STAGE_CODE).toContain('hexLerp')
    // the carrot lookahead is gone from the schlau worlds: no chainPoint, no 8 m arc-ahead line
    expect(SCHLAU_SCORE_STAGE_CODE).not.toContain('chainPoint')
    expect(SCHLAU_SCORE_STAGE_CODE).not.toContain("params.cars[k3]")
    // the ONE target line is the drive stage's lila nose -> goal line instead
    expect(SCHLAU_GOAL_VECTOR_COLOR).toBe('#aa44ff')
  })
})

describe('schlauTrainingSetup: task + geodesic nose -> goal path + wall polys', () => {
  it('over all sixteen worlds: a path from the start nose to the goal that keeps the car width off every box', () => {
    for (const spec of SCHLAU_TRAINING_WORLDS) {
      const { task, path, walls } = schlauTrainingSetup(spec)
      expect(path.length).toBeGreaterThan(1)
      // the path leads from the start nose to the goal (grid tolerance)
      const nose = noseOf(task)
      expect(Math.hypot(path[0]![0] - nose[0], path[0]![1] - nose[1])).toBeLessThanOrEqual(1.5)
      const last = path[path.length - 1]!
      expect(Math.hypot(last[0] - task.goal[0], last[1] - task.goal[1])).toBeLessThanOrEqual(1.5)
      // one wall poly per task box (the score stage's line-of-sight gate)
      expect(walls).toHaveLength(task.boxes.length)
      for (const b of task.boxes) {
        const poly = rectPoly(b.at[0], b.at[1], (b.yawDeg * Math.PI) / 180, b.size[0], b.size[1])
        for (const [x, z] of path) expect(pointPolyGap(x, z, poly)).toBeGreaterThanOrEqual(SCHLAU_INFLATE_M - 0.5)
      }
      // every world's kind guarantees boxes AND the direct start -> goal line crossing at least one of them
      // (goal_box: the crossing wall; goal_wall: the sealed gate layers).
      expect(task.boxes.length).toBeGreaterThanOrEqual(1)
      expect(schlauLineCrosses(task.boxes, task.start, task.goal)).toBe(true)
    }
  }, 30000)
})

describe('buildSchlauTrainingWorld: one task per world', () => {
  it('ground + car + goal slab + all task boxes; the car carries drive stage + actuator + score stage', () => {
    const genome = placeholderSchlauGenome()
    for (const spec of SCHLAU_TRAINING_WORLDS) {
      const { task, path, walls } = schlauTrainingSetup(spec)
      const world = buildSchlauTrainingWorld(spec, genome)
      const ids = world.entities.map((e) => e.id)
      expect(ids).toContain('ground')
      expect(ids).toContain(schlauCarId(0))
      expect(ids).toContain(schlauGoalId(0))
      for (let i = 0; i < task.boxes.length; i++) expect(ids).toContain(`box_${i}`)
      expect(world.entities).toHaveLength(3 + task.boxes.length)
      // the car: at the task's start pose, yawed, with the schlau pipeline
      const car = world.entities.find((e) => e.id === schlauCarId(0))!
      expect(car.position).toEqual([task.start[0], CAR_START_Y, task.start[1]])
      expect(car.transformers).toEqual([SCHLAU_STAGE_ID, SCHLAU_ACTUATOR_ID, schlauScoreStageId(0)])
      // the goal slab floats above the task's goal
      const goal = world.entities.find((e) => e.id === schlauGoalId(0))!
      expect(goal.position).toEqual([task.goal[0], SCHLAU_GOAL_Y, task.goal[1]])
      // the drive stage: the genome, the task's goal, the car2 gain
      const drive = registry(world)[SCHLAU_STAGE_ID] as { params?: Record<string, unknown>; code?: string }
      expect(drive.params?.w).toEqual(genome)
      expect(drive.params?.goal).toEqual([task.goal[0], task.goal[1]])
      // the drive stage code draws the ONE lila nose -> goal target line (the carrot is gone)
      expect(String(drive.code)).toContain(`'${SCHLAU_GOAL_VECTOR_COLOR}'`)
      expect(String(drive.code)).toContain('visualizeLine')
      // the score stage: the geodesic path as its chain, the wall polys, the score constants (30/15 touch penalties)
      const score = registry(world)[schlauScoreStageId(0)]!
      expect(score.params?.chain).toEqual(path)
      expect(score.params?.chains).toEqual([path])
      expect(score.params?.walls).toEqual(walls)
      expect(score.params?.cars).toEqual([schlauCarId(0)])
      expect(score.params?.idx).toBe(0)
      expect(score.params?.hud).toBe(true)
      expect(score.params?.vRef).toBe(SCHLAU_SCORE.vRef)
      expect(score.params?.bonusRate).toBe(SCHLAU_SCORE.bonusRate)
      expect(score.params?.wallPenaltyPerS).toBe(30)
      expect(score.params?.objectPenaltyPerS).toBe(15)
      // the camera follows the car
      expect(world.world.camera?.target).toBe(schlauCarId(0))
      expect(world.world.debugTargetLineEntityId).toBe(schlauCarId(0))
    }
  }, 30000)

  it('throws on an empty / non-schlau genome', () => {
    const spec = SCHLAU_TRAINING_WORLDS[0]!
    expect(() => buildSchlauTrainingWorld(spec, [])).toThrow(/schlau genome/)
    expect(() => buildSchlauTrainingWorld(spec, [1, 2, 3, 4, 5])).toThrow(/schlau genome/)
  })
})

describe('schlauTrainingMeta: the dialog card data', () => {
  it('carries id/seed/name/kind/candidate/bestScore and the chain stats of the geodesic path', () => {
    const spec = SCHLAU_TRAINING_WORLDS[3]!
    const { path } = schlauTrainingSetup(spec)
    const meta = schlauTrainingMeta(spec, path, 123.4)
    expect(meta.id).toBe('schlau_4')
    expect(meta.seed).toBe(spec.seed)
    expect(meta.name).toBe(spec.name)
    expect(meta.kind).toBe('goal_box')
    expect(meta.candidate).toEqual(PLACEHOLDER_SCHLAU_TRAINING_CANDIDATE)
    expect(meta.bestScore).toBe(123.4)
    expect(meta.chain.points).toBe(path.length)
    expect(meta.chain.lengthM).toBeGreaterThan(0)
    expect(meta.chain.lengthM).toBe(Math.round(polylineLength(path) * 10) / 10)
    // bestScore null until measured; an explicit candidate overrides the placeholder
    const candidate = { policy: 'schlau' as const, label: 'schlau island-0 (gen 42)', gen: 42, source: 'run.json' }
    expect(schlauTrainingMeta(spec, path, null, candidate)).toMatchObject({ bestScore: null, candidate })
  })
})

describe('focusSchlauGoal: focus the single task', () => {
  it('routeIndex 0 focuses the car (camera target + visualize line) and enables only its score stage HUD', () => {
    const world = buildSchlauTrainingWorld(SCHLAU_TRAINING_WORLDS[0]!, placeholderSchlauGenome())
    // defocus first, so the focus has something to restore
    const defocused = JSON.parse(JSON.stringify(world)) as RennWorld
    defocused.world.camera!.target = 'somewhere_else'
    defocused.world.debugTargetLineEntityId = 'somewhere_else'
    registry(defocused)[schlauScoreStageId(0)]!.params!.hud = false
    const focused = focusSchlauGoal(defocused, 0)
    expect(focused.world.camera?.target).toBe(schlauCarId(0))
    expect(focused.world.debugTargetLineEntityId).toBe(schlauCarId(0))
    expect(registry(focused)[schlauScoreStageId(0)]!.params!.hud).toBe(true)
    // pure: the input world keeps its defocused state
    expect(defocused.world.camera?.target).toBe('somewhere_else')
  })

  it('any other route index is a no-op (one task per world)', () => {
    const world = buildSchlauTrainingWorld(SCHLAU_TRAINING_WORLDS[0]!, placeholderSchlauGenome())
    expect(focusSchlauGoal(world, 1)).toEqual(world)
    expect(focusSchlauGoal(world, -1)).toEqual(world)
  })
})

describe('applySchlauCandidate: swap the drive-stage weights', () => {
  it('swaps params.w of the schlau drive stage on a clone (the input world is unchanged)', () => {
    const world = buildSchlauTrainingWorld(SCHLAU_TRAINING_WORLDS[0]!, placeholderSchlauGenome())
    const genome = placeholderSchlauGenome().map((v, i) => v + (i % 5))
    const next = applySchlauCandidate(world, genome)
    expect(next).not.toBe(world)
    expect(registry(next)[SCHLAU_STAGE_ID]!.params!.w).toEqual(genome)
    // the actuator and the score stage stay untouched
    expect(registry(next)[SCHLAU_ACTUATOR_ID]!.params).toEqual(registry(world)[SCHLAU_ACTUATOR_ID]!.params)
    expect(registry(next)[schlauScoreStageId(0)]!.params).toEqual(registry(world)[schlauScoreStageId(0)]!.params)
    // pure: the input world keeps the placeholder genome
    expect(registry(world)[SCHLAU_STAGE_ID]!.params!.w).toEqual(placeholderSchlauGenome())
    // the genome is copied, not shared with the caller's array
    expect(registry(next)[SCHLAU_STAGE_ID]!.params!.w).not.toBe(genome)
  })

  it('throws on a non-schlau genome (a v3-shaped genome cannot drive the schlau stage)', () => {
    const world = buildSchlauTrainingWorld(SCHLAU_TRAINING_WORLDS[0]!, placeholderSchlauGenome())
    expect(() => applySchlauCandidate(world, [1, 2, 3])).toThrow(/not schlau-shaped/)
  })

  it('throws on a world without a schlau drive stage', () => {
    const world = buildSchlauTrainingWorld(SCHLAU_TRAINING_WORLDS[0]!, placeholderSchlauGenome())
    const noDrive = JSON.parse(JSON.stringify(world)) as RennWorld
    delete registry(noDrive)[SCHLAU_STAGE_ID]
    expect(() => applySchlauCandidate(noDrive, placeholderSchlauGenome())).toThrow(/no schlau drive stage/)
  })
})

describe('placeholderSchlauGenome: the untrained placeholder', () => {
  it('is deterministic and schlau-shaped (10 hidden units)', () => {
    const a = placeholderSchlauGenome()
    const b = placeholderSchlauGenome()
    expect(a).toEqual(b)
    expect(a).toHaveLength(genomeLengthSchlau(10))
    expect(hiddenOfSchlau(a.length)).toBe(10)
  })
})
