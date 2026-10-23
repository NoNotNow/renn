import { describe, expect, it } from 'vitest'
import {
  CRUX_TRAINING_SET,
  MAZE_TRAINING_SET,
  SCHLAU_MAZE_TRAINING_SET,
  SCHLAU_TRAINING_SET,
  TRAINING_CARS,
  TRAINING_SETS,
  TRAINING_SET_EXAMPLE_WORLD_IDS,
  WF_TRAINING_SET,
  trainingCarOfSet,
  trainingSetByKey,
  trainingSetOfWorldId,
  trainingSetsOfCar,
  type TrainingSet,
} from './trainingSets'
import { fetchSchlauCandidates } from '@/policyEvolution/schlauCandidates'
import { applySchlauCandidate, placeholderSchlauGenome } from '@/policyEvolution/schlauTraining'
import {
  SCHLAU_MAZE_WORLDS,
  buildSchlauMazeWorld,
  focusSchlauMazeRoute,
  schlauMazeCarId,
  type SchlauMazeTrainingMeta,
} from '@/policyEvolution/schlauMaze'
import { SCHLAU_TRAINING_WORLDS } from '@/policyEvolution/schlauTraining'
import { MAZE_TRAINING_WORLDS } from '@/policyEvolution/mazeTraining'
import { CRUX_TRAINING_WORLDS } from '@/policyEvolution/cruxTraining'
import type { MazeCandidate } from '@/policyEvolution/mazeCandidates'

/** Maze-shaped meta fixture of one schlau maze world (1 forward + 1 reversed way, per-route scores). */
function makeSchlauMazeMeta(spec: (typeof SCHLAU_MAZE_WORLDS)[number], bestScore: number | null): SchlauMazeTrainingMeta {
  return {
    id: spec.id,
    seed: spec.seed,
    name: spec.name,
    candidate: { policy: 'schlau', label: 'schlau shipped (gen 45600)', gen: 45600, source: 'shippedPolicySchlau.json' },
    bestScore,
    chain: { points: 10, lengthM: 134.9 },
    routes: { forward: 1, reversed: 1 },
    tileSvg: {
      w: 206,
      h: 220,
      routes: [
        { pts: [[10, 10], [40, 50], [70, 30]], score: 94.4 },
        { pts: [[70, 30], [40, 50], [10, 10]], score: 36.3 },
      ],
    },
  }
}

describe('SCHLAU_MAZE_TRAINING_SET (the Schlau Mazes tab of the training dialog)', () => {
  it('describes the set: key / title / tab / testid, the ten maze-bridge worlds with seed info chips', () => {
    expect(SCHLAU_MAZE_TRAINING_SET.key).toBe('schlauMaze')
    expect(SCHLAU_MAZE_TRAINING_SET.title).toBe('Schlau Mazes')
    expect(SCHLAU_MAZE_TRAINING_SET.tab).toBe('Schlau Mazes')
    expect(SCHLAU_MAZE_TRAINING_SET.testid).toBe('schlauMaze')
    expect(SCHLAU_MAZE_TRAINING_SET.worlds).toEqual(
      SCHLAU_MAZE_WORLDS.map((spec) => ({ id: spec.id, name: spec.name, info: `seed ${spec.seed}` })),
    )
    expect(SCHLAU_MAZE_TRAINING_SET.worlds.map((w) => w.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `schlau_maze_${i + 1}`),
    )
  })

  it('targets the per-copy maze car ids, the schlau watch labels, the way noun and its own focus helper', () => {
    expect(SCHLAU_MAZE_TRAINING_SET.carId(2)).toBe(schlauMazeCarId(2))
    expect(SCHLAU_MAZE_TRAINING_SET.watch).toEqual({ score: 'schlau.score', seg: 'schlau.seg' })
    expect(SCHLAU_MAZE_TRAINING_SET.noun).toBe('way')
    expect(SCHLAU_MAZE_TRAINING_SET.focus).toBe(focusSchlauMazeRoute)
    expect(SCHLAU_MAZE_TRAINING_SET.loadLogLabel).toBe('Load schlau maze world into builder')
  })

  it('serves maze-style route tiles: forward first then reversed, "way" wording, the ways badge', () => {
    const meta = makeSchlauMazeMeta(SCHLAU_MAZE_WORLDS[0]!, 94.4)
    expect(SCHLAU_MAZE_TRAINING_SET.tileCount(meta)).toBe(2)
    expect(SCHLAU_MAZE_TRAINING_SET.tileText(meta, 0)).toEqual({ name: 'Way 1', short: '(fwd)', long: 'forward' })
    expect(SCHLAU_MAZE_TRAINING_SET.tileText(meta, 1)).toEqual({ name: 'Way 2', short: '(rev)', long: 'reversed' })
    expect(SCHLAU_MAZE_TRAINING_SET.badge(meta)).toBe('1 ways · 1 reversed')
    // an older meta without the routes field: no tiles, no badge
    const old = { ...meta, routes: undefined } as unknown as Parameters<typeof SCHLAU_MAZE_TRAINING_SET.tileCount>[0]
    expect(SCHLAU_MAZE_TRAINING_SET.tileCount(old)).toBe(0)
    expect(SCHLAU_MAZE_TRAINING_SET.badge(old)).toBeNull()
  })

  it('carries the SAME schlau candidates file + swap as the schlau set: any schlau model drives any maze task', () => {
    expect(SCHLAU_MAZE_TRAINING_SET.candidates?.fetch).toBe(fetchSchlauCandidates)
    expect(SCHLAU_MAZE_TRAINING_SET.candidates?.apply).toBeDefined()
    expect(SCHLAU_TRAINING_SET.candidates?.fetch).toBe(fetchSchlauCandidates)
    // the apply swaps EVERY per-copy schlau_drive_* stage of a multi-car maze world to the candidate's genome
    const baked = placeholderSchlauGenome()
    const world = buildSchlauMazeWorld(SCHLAU_MAZE_WORLDS[0]!, baked)
    const replacement = placeholderSchlauGenome().map((v) => v + 1)
    const candidate = { id: 'best', label: 'schlau best', gen: 10, genome: replacement, detail: 'd' } as MazeCandidate
    const swapped = SCHLAU_MAZE_TRAINING_SET.candidates!.apply(world, candidate) as typeof world
    const transformers = (w: typeof world) => (w as unknown as { transformers: Record<string, { params?: { w?: number[] } }> }).transformers
    const driveIds = Object.keys(transformers(world)).filter((id) => id.startsWith('schlau_drive_'))
    expect(driveIds.length).toBeGreaterThanOrEqual(2)
    for (const id of driveIds) {
      expect(transformers(swapped)[id]!.params!.w).toEqual(replacement)
      expect(transformers(swapped)[id]!.params!.w).not.toEqual(baked)
    }
    // the set's apply IS applySchlauCandidate (the schlau-shaped swap, never the v3 one)
    expect(transformers(SCHLAU_MAZE_TRAINING_SET.candidates!.apply(world, { ...candidate, genome: replacement } as MazeCandidate))).toEqual(
      transformers(applySchlauCandidate(world, replacement)),
    )
  })
})

describe('trainingSetOfWorldId (the Builder load path picks the set)', () => {
  it('maps schlau_maze_* to the Schlau Mazes set and plain schlau_* to the Schlau set', () => {
    expect(trainingSetOfWorldId('schlau_maze_1')).toBe(SCHLAU_MAZE_TRAINING_SET)
    expect(trainingSetOfWorldId('schlau_maze_10')).toBe(SCHLAU_MAZE_TRAINING_SET)
    expect(trainingSetOfWorldId('schlau_3')).toBe(SCHLAU_TRAINING_SET)
    // the other sets keep their mapping
    expect(trainingSetOfWorldId('maze_train_1')).toBe(MAZE_TRAINING_SET)
    expect(trainingSetOfWorldId('crux_train_1')).toBe(CRUX_TRAINING_SET)
    expect(trainingSetOfWorldId('wf_maze_1')).toBe(WF_TRAINING_SET)
    expect(trainingSetOfWorldId('hunt')).toBe(MAZE_TRAINING_SET)
  })

  it('trainingSetByKey resolves every set key (unknown keys fall back to the mazes)', () => {
    for (const set of TRAINING_SETS) expect(trainingSetByKey(set.key)).toBe(set)
    expect(trainingSetByKey('nope' as TrainingSet['key'])).toBe(MAZE_TRAINING_SET)
  })
})

describe('the training cars (the dialog header\'s car switch)', () => {
  it('both schlau sets belong to the schlau car; everything else is the renn car', () => {
    expect(trainingCarOfSet('schlau')).toBe('schlau')
    expect(trainingCarOfSet('schlauMaze')).toBe('schlau')
    expect(trainingCarOfSet('maze')).toBe('renn')
    expect(trainingCarOfSet('crux')).toBe('renn')
    expect(trainingCarOfSet('wf')).toBe('renn')
    expect(TRAINING_CARS.map((c) => c.key)).toEqual(['renn', 'schlau'])
  })

  it('each car owns its tab bar: renn = Mazes / Crux / Widen-freeze, schlau = Schlau / Schlau Mazes', () => {
    expect(trainingSetsOfCar('renn')).toEqual([MAZE_TRAINING_SET, CRUX_TRAINING_SET, WF_TRAINING_SET])
    expect(trainingSetsOfCar('schlau')).toEqual([SCHLAU_TRAINING_SET, SCHLAU_MAZE_TRAINING_SET])
    // TRAINING_SETS carries every set exactly once, renn sets first
    expect(TRAINING_SETS).toEqual([...trainingSetsOfCar('renn'), ...trainingSetsOfCar('schlau')])
  })
})

describe('TRAINING_SET_EXAMPLE_WORLD_IDS (the File → Example Worlds exclusion, single source)', () => {
  it('contains EVERY training-set world id — the maze/crux/wf/schlau sets and the ten schlau_maze_* ids', () => {
    const allSetWorldIds = [
      ...MAZE_TRAINING_WORLDS,
      ...CRUX_TRAINING_WORLDS,
      ...SCHLAU_TRAINING_WORLDS,
    ].map((spec) => spec.id)
    for (const id of allSetWorldIds) expect(TRAINING_SET_EXAMPLE_WORLD_IDS.has(id)).toBe(true)
    for (const spec of SCHLAU_MAZE_WORLDS) expect(TRAINING_SET_EXAMPLE_WORLD_IDS.has(spec.id)).toBe(true)
    for (const world of WF_TRAINING_SET.worlds) expect(TRAINING_SET_EXAMPLE_WORLD_IDS.has(world.id)).toBe(true)
    // the schlau EXAMPLE worlds (schlau_open / schlau_box) are NOT training worlds — they stay in the menu
    expect(TRAINING_SET_EXAMPLE_WORLD_IDS.has('schlau_open')).toBe(false)
    expect(TRAINING_SET_EXAMPLE_WORLD_IDS.has('schlau_box')).toBe(false)
    expect(TRAINING_SET_EXAMPLE_WORLD_IDS.has('hunt')).toBe(false)
  })

  it('derives from TRAINING_SETS (a new set\'s worlds join the exclusion automatically)', () => {
    const fromSets = new Set(TRAINING_SETS.flatMap((set) => set.worlds.map((w) => w.id)))
    expect([...TRAINING_SET_EXAMPLE_WORLD_IDS]).toEqual([...fromSets])
  })
})
