import { describe, expect, it } from 'vitest'
import type { RennWorld } from '@/types/world'
import { createRng } from '@/avEvolution/core/rng'
import { MAZE_TRAINING_WORLDS, buildMazeTrainingWorld, mazeTrainingRoutes } from './mazeTraining'
import { freshGenome } from './islands'
import { shippedGenomeV3 } from './exampleWorld'
import { N_RAYS, NOSE_M } from './policy'
import {
  N_IN_SCHLAU,
  POLICY_STAGE_CODE_SCHLAU,
  SCHLAU_GOAL_VECTOR_COLOR,
  SCHLAU_STAGE_BODY,
} from './schlauPolicy'
import { SCHLAU_SCORE_STAGE_CODE, applySchlauCandidate, placeholderSchlauGenome } from './schlauTraining'
import {
  SCHLAU_MAZE_STAGE_BODY,
  SCHLAU_MAZE_STAGE_CODE,
  SCHLAU_MAZE_WAYPOINT_PASS_M,
  SCHLAU_MAZE_WAYPOINT_REACH_M,
  SCHLAU_MAZE_WORLDS,
  buildSchlauMazeWorld,
  focusSchlauMazeRoute,
  schlauMazeCarId,
  schlauMazeDriveStageId,
  schlauMazeGoalId,
  schlauMazeScoreStageId,
  schlauMazeWorldSpecsEqualMazeTrain,
} from './schlauMaze'

// --- stage code harness (mirrors schlauPolicy.test.ts: fwd = +z, left = +x, flat ground, rays hit at 20 m) --------------

const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!
const lineCalls: Array<{ from: number[]; to: number[]; color: string }> = []
const api = {
  getUpVector: () => [0, 1, 0],
  getForwardVector: () => [0, 0, 1],
  vec: {
    normalize: (v: number[]) => {
      const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1
      return [v[0]! / l, v[1]! / l, v[2]! / l]
    },
    projectOntoPlane: (v: number[], n: number[]) => {
      const d = dot(v, n)
      return [v[0]! - d * n[0]!, v[1]! - d * n[1]!, v[2]! - d * n[2]!]
    },
    cross: (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!],
    dot,
  },
  raycast: () => ({ hit: true, distance: 20 }),
  visualizeLine: (from: number[], to: number[], color: string) => {
    lineCalls.push({ from, to, color })
  },
}

/** The goal the maze stage feeds the net THIS frame, read from the lila nose -> goal target line it draws. */
function runMazeStage(
  params: Record<string, unknown>,
  input: (frame: number) => { position?: number[]; velocity?: number[] },
  frames = 1,
): { goal: Array<[number, number]>; state: Record<string, unknown> } {
  const transform = new Function(`${SCHLAU_MAZE_STAGE_CODE}\nreturn transform`)() as (
    i: Record<string, unknown>,
    dt: number,
    p: unknown,
    s: unknown,
    a: unknown,
  ) => unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state: any = {}
  const goals: Array<[number, number]> = []
  for (let f = 0; f < frames; f++) {
    lineCalls.length = 0
    const inp = {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      velocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
      actions: {},
      ...input(f),
    }
    transform(inp, 1 / 60, params, state, api)
    const target = lineCalls.find((l) => l.color === SCHLAU_GOAL_VECTOR_COLOR)
    expect(target).toBeDefined()
    goals.push([target!.to[0]!, target!.to[2]!])
  }
  return { goal: goals, state }
}

describe('schlau maze stage code', () => {
  it('is the schlau body with ONLY the goal block replaced (the net / rays / memory / drawing stay byte-identical)', () => {
    const marker = 'var g = params.goal || [pos[0], pos[2]]'
    const at = SCHLAU_STAGE_BODY.indexOf(marker)
    expect(at).toBeGreaterThan(0)
    expect(SCHLAU_MAZE_STAGE_BODY.startsWith(SCHLAU_STAGE_BODY.slice(0, at))).toBe(true)
    expect(SCHLAU_MAZE_STAGE_BODY.endsWith(SCHLAU_STAGE_BODY.slice(at + marker.length))).toBe(true)
    expect(SCHLAU_MAZE_STAGE_BODY).not.toContain(marker)
    // the ORIGINAL stage code is untouched (the schlau worlds keep their static params.goal feed)
    expect(POLICY_STAGE_CODE_SCHLAU).toContain(marker)
  })

  it('the head receives the NEXT waypoint as its single goal (chain[1] at the start)', () => {
    const chain: Array<[number, number]> = [
      [0, 0],
      [0, 20],
      [0, 40],
      [10, 60],
    ]
    const { goal, state } = runMazeStage({ w: placeholderSchlauGenome(), gain: 1200, chain }, () => ({}), 3)
    for (const g of goal) expect(g).toEqual([chain[1]![0], chain[1]![1]])
    // waypoint cursor starts at index 1 (chain[0] is the start pose, never a goal)
    expect((state.wpc as { wp: number }).wp).toBe(1)
  })

  it('advances the goal when the car NOSE reaches the current waypoint', () => {
    const chain: Array<[number, number]> = [
      [0, 0],
      [0, 20],
      [0, 40],
      [10, 60],
    ]
    // frame 0: at the origin, nose 15.9 m from waypoint 1 -> goal chain[1]
    // frame 1: nose (z 16 + 4.1) 0.1 m from waypoint 1 -> advance, goal chain[2]
    const { goal, state } = runMazeStage(
      { w: placeholderSchlauGenome(), gain: 1200, chain },
      (f) => (f === 0 ? {} : { position: [0, 0, 16], velocity: [0, 0, 5] }),
      2,
    )
    expect(goal[0]).toEqual(chain[1]!)
    expect(goal[1]).toEqual(chain[2]!)
    expect((state.wpc as { wp: number }).wp).toBe(2)
  })

  it('advances the goal when the nose arc PASSES the waypoint without entering its reach circle (overshoot guard)', () => {
    const chain: Array<[number, number]> = [
      [0, 0],
      [0, 20],
      [0, 40],
      [10, 60],
    ]
    // 15 m to the side of the chain, nose past waypoint 1's arc (s > cum[1] + PASS) -> goal chain[2]
    const { goal, state } = runMazeStage(
      { w: placeholderSchlauGenome(), gain: 1200, chain },
      () => ({ position: [15, 0, 19], velocity: [0, 0, 5] }),
      1,
    )
    expect(goal[0]).toEqual(chain[2]!)
    expect((state.wpc as { wp: number }).wp).toBe(2)
  })

  it('the LAST waypoint never advances (the chain end parks the goal — the finish)', () => {
    const chain: Array<[number, number]> = [
      [0, 0],
      [0, 20],
      [0, 40],
    ]
    const { goal, state } = runMazeStage(
      { w: placeholderSchlauGenome(), gain: 1200, chain },
      () => ({ position: [0, 0, 35], velocity: [0, 0, 5] }),
      2,
    )
    for (const g of goal) expect(g).toEqual(chain[2]!)
    expect((state.wpc as { wp: number }).wp).toBe(chain.length - 1)
  })

  it('without a chain the stage keeps the original static params.goal feed', () => {
    const { goal } = runMazeStage({ w: placeholderSchlauGenome(), gain: 1200, goal: [3, 4] }, () => ({}), 2)
    for (const g of goal) expect(g).toEqual([3, 4])
  })

  it('the waypoint reach / pass margins are fixed constants of the bridge', () => {
    expect(SCHLAU_MAZE_WAYPOINT_REACH_M).toBeGreaterThan(0)
    expect(SCHLAU_MAZE_WAYPOINT_PASS_M).toBeGreaterThan(0)
    expect(SCHLAU_MAZE_STAGE_CODE).toContain(`N_IN = ${N_IN_SCHLAU},`)
    expect(SCHLAU_MAZE_STAGE_CODE).toContain('params.chain')
  })
})

// --- world builder ---------------------------------------------------------------------------------------------------------

describe('buildSchlauMazeWorld', () => {
  const genome = placeholderSchlauGenome()

  it('throws on an empty or non-schlau-shaped genome', () => {
    expect(() => buildSchlauMazeWorld(SCHLAU_MAZE_WORLDS[0]!, [])).toThrow()
    expect(() => buildSchlauMazeWorld(SCHLAU_MAZE_WORLDS[0]!, [1, 2, 3])).toThrow()
  })

  it('mirrors the ten maze training worlds (same ids pattern + seeds)', () => {
    expect(schlauMazeWorldSpecsEqualMazeTrain()).toBe(true)
    expect(SCHLAU_MAZE_WORLDS.map((s) => s.seed)).toEqual(MAZE_TRAINING_WORLDS.map((s) => s.seed))
  })

  it('one schlau car per route copy, each with drive + actuator + score stage, goal slabs at the route ends', () => {
    const spec = SCHLAU_MAZE_WORLDS[0]!
    const { routes, chains } = mazeTrainingRoutes(spec)
    const world = buildSchlauMazeWorld(spec, genome) as unknown as {
      entities: Array<Record<string, unknown>>
      transformers: Record<string, Record<string, unknown>>
    }
    const spacing = 130
    routes.forEach((route, i) => {
      const car = world.entities.find((e) => e.id === schlauMazeCarId(i)) as Record<string, unknown>
      expect(car).toBeDefined()
      expect(car.transformers).toEqual([schlauMazeDriveStageId(i), `schlau_car_${i}`, schlauMazeScoreStageId(i)])
      expect((car.position as number[])[0]).toBeCloseTo(route.startAt[0] + i * spacing, 5)
      const goal = world.entities.find((e) => e.id === schlauMazeGoalId(i)) as { position: number[] }
      expect(goal).toBeDefined()
      const end = route.route[route.route.length - 1]!
      expect(goal.position[0]).toBeCloseTo(end[0] + i * spacing, 5)
      expect(goal.position[2]).toBeCloseTo(end[1], 5)
      expect(goal.position[1]).toBe(9)
      // the drive stage feeds on the OWN copy's shifted chain (the same chain the maze world's v3 input stage walks)
      const drive = world.transformers[schlauMazeDriveStageId(i)]!
      expect(drive.params).toMatchObject({ w: genome })
      expect((drive.params as { chain: number[][] }).chain).toEqual(chains[i]!.map((p) => [p[0] + i * spacing, p[1]]))
      // the score stage reuses the schlau score stage code byte-identically (watch label 'schlau.score')
      const score = world.transformers[schlauMazeScoreStageId(i)]!
      expect(score.code).toBe(SCHLAU_SCORE_STAGE_CODE)
      const scoreParams = score.params as Record<string, unknown>
      expect(scoreParams.hud).toBe(i === 0)
      expect(scoreParams.idx).toBe(i)
      expect((scoreParams.cars as string[])[i]).toBe(schlauMazeCarId(i))
      expect((scoreParams.chain as number[][])[0]).toEqual(chains[i]!.map((p) => [p[0] + i * spacing, p[1]])[0])
    })
  })

  it('scores with the MAZE metric (vRef 20, bonusRate 5, wall 12/s, object 4/s) so scores compare with the v3 maze worlds', () => {
    const world = buildSchlauMazeWorld(SCHLAU_MAZE_WORLDS[0]!, genome) as unknown as {
      transformers: Record<string, { params?: Record<string, unknown> }>
    }
    const p = world.transformers[schlauMazeScoreStageId(0)]!.params!
    expect(p).toMatchObject({ vRef: 20, bonusRate: 5, wallPenaltyPerS: 12, objectPenaltyPerS: 4 })
  })

  it('carries the SAME maze geometry as the v3 maze world (wall boxes + chains, shifted per copy)', () => {
    const spec = MAZE_TRAINING_WORLDS[2]!
    const maze = buildMazeTrainingWorld(spec, shippedGenomeV3()!) as unknown as {
      entities: Array<Record<string, unknown>>
      transformers: Record<string, Record<string, unknown>>
    }
    const schlau = buildSchlauMazeWorld(SCHLAU_MAZE_WORLDS[2]!, genome) as unknown as typeof maze
    const boxesOf = (w: typeof maze) =>
      w.entities
        .filter((e) => typeof e.id === 'string' && (e.id as string).startsWith('box_'))
        .map((e) => [String(e.id), JSON.stringify(e.position), JSON.stringify(e.shape), JSON.stringify(e.rotation)] as Array<string>)
        .sort((a, b) => a.join('|').localeCompare(b.join('|')))
    expect(boxesOf(schlau)).toEqual(boxesOf(maze))
    // the schlau drive stage of every copy walks the same chain as the maze world's v3 input stage
    for (const [id, t] of Object.entries(schlau.transformers)) {
      if (!id.startsWith('schlau_drive_')) continue
      const copy = Number(id.slice('schlau_drive_'.length))
      expect((t.params as { chain: number[][] }).chain).toEqual(
        (maze.transformers[`policy_input_${copy}`]!.params as { chain: number[][] }).chain,
      )
    }
  })

  it('bakes a real schlau genome (29 H + 2) and freshGenome shapes are accepted', () => {
    const g10 = freshGenome(createRng(7), 0.3, N_IN_SCHLAU, 10)
    expect(g10.length).toBe(29 * 10 + 2)
    const world = buildSchlauMazeWorld(SCHLAU_MAZE_WORLDS[0]!, g10) as unknown as {
      transformers: Record<string, { params?: { w?: number[] } }>
    }
    expect(world.transformers[schlauMazeDriveStageId(0)]!.params!.w).toEqual(g10)
    // the car hull + ray constants the stage relies on: 14 rays, nose 4.1 m
    expect(N_RAYS).toBe(14)
    expect(NOSE_M).toBe(4.1)
  })
})

// --- the training-dialog helpers over the built worlds (focus + candidate swap) --------------------------------------------

describe('focusSchlauMazeRoute (the training dialog\'s route focus of the maze worlds)', () => {
  const genome = placeholderSchlauGenome()
  type MazeWorldView = {
    world: { camera: { target?: string }; debugTargetLineEntityId?: string }
    transformers: Record<string, { params?: Record<string, unknown> }>
  }
  const worldOf = (spec: (typeof SCHLAU_MAZE_WORLDS)[number]) => buildSchlauMazeWorld(spec, genome)
  const viewOf = (world: RennWorld) => world as unknown as MazeWorldView

  it('focuses the clicked route copy: its car becomes the camera + visualize target, only its score stage writes the HUD', () => {
    const world = worldOf(SCHLAU_MAZE_WORLDS[0]!)
    const view = viewOf(world)
    const copies = Object.keys(view.transformers).filter((id) => /^schlau_maze_score_(\d+)$/.test(id)).length
    expect(copies).toBeGreaterThanOrEqual(2)
    const focused = viewOf(focusSchlauMazeRoute(world, 1))
    expect(focused.world.camera.target).toBe(schlauMazeCarId(1))
    expect(focused.world.debugTargetLineEntityId).toBe(schlauMazeCarId(1))
    for (let i = 0; i < copies; i++) {
      expect(focused.transformers[schlauMazeScoreStageId(i)]!.params!.hud).toBe(i === 1)
    }
    // pure JSON transform: the input world stays neutral (focused on route 0)
    expect(view.world.camera.target).toBe(schlauMazeCarId(0))
    expect(view.transformers[schlauMazeScoreStageId(0)]!.params!.hud).toBe(true)
  })

  it('an out-of-range route index is a no-op (the same world reference returns)', () => {
    const world = worldOf(SCHLAU_MAZE_WORLDS[1]!)
    expect(focusSchlauMazeRoute(world, -1)).toBe(world)
    expect(focusSchlauMazeRoute(world, 99)).toBe(world)
  })
})

describe('applySchlauCandidate on a multi-car maze world (any schlau model drives any maze task)', () => {
  it('swaps params.w of EVERY per-copy schlau_drive_* stage and touches nothing else', () => {
    const genome = placeholderSchlauGenome()
    const world = buildSchlauMazeWorld(SCHLAU_MAZE_WORLDS[0]!, genome)
    const view = world as unknown as { transformers: Record<string, { params?: Record<string, unknown> }> }
    const replacement = freshGenome(createRng(1234), 0.3, N_IN_SCHLAU, 10)
    const swapped = applySchlauCandidate(world, replacement) as unknown as typeof view
    const driveIds = Object.keys(view.transformers).filter((id) => id.startsWith('schlau_drive_'))
    expect(driveIds.length).toBeGreaterThanOrEqual(2)
    for (const id of driveIds) {
      expect(swapped.transformers[id]!.params!.w).toEqual(replacement)
      // the rest of the drive params (chain, gain) survives the swap
      expect(swapped.transformers[id]!.params!.chain).toEqual(view.transformers[id]!.params!.chain)
    }
    // the per-copy score stages and actuators carry no weights — untouched
    for (const [id, transformer] of Object.entries(swapped.transformers)) {
      if (id.startsWith('schlau_drive_')) continue
      expect(transformer).toEqual(view.transformers[id]!)
    }
    // pure JSON transform: the loaded world on disk keeps the baked-in genome
    for (const id of driveIds) expect(view.transformers[id]!.params!.w).toEqual(genome)
  })

  it('rejects a non-schlau-shaped genome (a v3 genome is length-identical but wired differently)', () => {
    const world = buildSchlauMazeWorld(SCHLAU_MAZE_WORLDS[0]!, placeholderSchlauGenome())
    expect(() => applySchlauCandidate(world, [1, 2, 3])).toThrow(/not schlau-shaped/)
  })
})
