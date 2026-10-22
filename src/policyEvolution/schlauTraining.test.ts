import { describe, expect, it } from 'vitest'
import { pointPolyGap, rectPoly, type V2 } from '@/avEvolution/eval/geometry'
import type { RennWorld } from '@/types/world'
import { polylineLength } from './chains'
import { CAR_START_Y } from './episode'
import { NOSE_M } from './policy'
import type { SchlauTask } from './schlauCourses'
import { SCHLAU_INFLATE_M } from './schlauScore'
import { genomeLengthSchlau, hiddenOfSchlau, SCHLAU_ACTUATOR_ID, SCHLAU_STAGE_ID } from './schlauPolicy'
import {
  applySchlauCandidate,
  buildSchlauTrainingWorld,
  focusSchlauGoal,
  PLACEHOLDER_SCHLAU_TRAINING_CANDIDATE,
  placeholderSchlauGenome,
  SCHLAU_GOAL_Y,
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
  it('six worlds: ids schlau_1..6, 3x goal_open + 3x goal_box, unique seeds', () => {
    expect(SCHLAU_TRAINING_WORLDS.map((s) => s.id)).toEqual(['schlau_1', 'schlau_2', 'schlau_3', 'schlau_4', 'schlau_5', 'schlau_6'])
    const kinds = SCHLAU_TRAINING_WORLDS.map((s) => s.kind)
    expect(kinds.filter((k) => k === 'goal_open')).toHaveLength(3)
    expect(kinds.filter((k) => k === 'goal_box')).toHaveLength(3)
    expect(new Set(SCHLAU_TRAINING_WORLDS.map((s) => s.seed)).size).toBe(6)
    for (const spec of SCHLAU_TRAINING_WORLDS) expect(spec.name.length).toBeGreaterThan(0)
  })
})

describe('schlauTrainingSetup: task + geodesic nose -> goal path + wall polys', () => {
  it('over all six worlds: a path from the start nose to the goal that keeps the car width off every box', () => {
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
      // the open worlds have no boxes: a straight-ish path no longer than the euclidean nose -> goal distance + slack
      if (task.boxes.length === 0) {
        expect(polylineLength(path)).toBeLessThanOrEqual(task.distM + 2 * NOSE_M + 2)
      }
    }
  })
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
      const drive = registry(world)[SCHLAU_STAGE_ID]!
      expect(drive.params?.w).toEqual(genome)
      expect(drive.params?.goal).toEqual([task.goal[0], task.goal[1]])
      // the score stage: the geodesic path as its chain, the wall polys, the score constants
      const score = registry(world)[schlauScoreStageId(0)]!
      expect(score.params?.chain).toEqual(path)
      expect(score.params?.chains).toEqual([path])
      expect(score.params?.walls).toEqual(walls)
      expect(score.params?.cars).toEqual([schlauCarId(0)])
      expect(score.params?.idx).toBe(0)
      expect(score.params?.hud).toBe(true)
      // the camera follows the car
      expect(world.world.camera?.target).toBe(schlauCarId(0))
      expect(world.world.debugTargetLineEntityId).toBe(schlauCarId(0))
    }
  })

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
