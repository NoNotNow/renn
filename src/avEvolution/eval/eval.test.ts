// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { validateSpec } from '@/avEvolution/core/genes'
import { AV_GENOME_SPEC, avDefaultParams } from '@/avEvolution/genes'
import { buildArenaWorldFrom, AV_CAR_SOURCE_ID } from '@/avEvolution/maze/arenaWorld'
import { listMazeEpisodes, mazeArenaSpec, MAZE_EPISODE_SECONDS } from '@/avEvolution/maze/episodes'
import { loadLabWorld, yawOf } from '@/test/avLab/lab'
import { ARENA_CAR_ID, CAR_SIZE, polyGap, rectPoly } from '@/test/fixtures/avEvasionArena'
import { CONTACT_GAP, runScenario } from '@/test/fixtures/avEvasionRunner'
import { createEvaluator } from './evaluator'
import { runMazeEpisode } from './episode'
import { loadSourceWorld } from '../../../tools/av-evolution/loadSource'
import { EpisodePool } from '../../../tools/av-evolution/pool'

// the baseline path: shipped car, source world upgraded with the freshly built library (loadLabWorld)
const source = loadLabWorld({ exampleId: 'self_hunt_flexible' })
const tr1 = listMazeEpisodes().legacyTrain[0]!

type Binding = { params: Record<string, unknown> }
const bindingOf = (w: { entities: unknown[] }): Binding => (w.entities as { id: string; transformerPipeStack: Binding[] }[]).find((e) => e.id === AV_CAR_SOURCE_ID)!.transformerPipeStack[0]!

describe('AV gene spec', () => {
  it('is a valid spec of the M1 + P1 + maze genes (no threat / flee genes)', () => {
    expect(validateSpec(AV_GENOME_SPEC)).toEqual([])
    expect(AV_GENOME_SPEC.genes.length).toBe(132)
    expect(AV_GENOME_SPEC.specVersion).toBe('3')
    expect(new Set(AV_GENOME_SPEC.genes.map((g) => g.key)).size).toBe(AV_GENOME_SPEC.genes.length)
    expect(AV_GENOME_SPEC.genes.some((g) => /threat|flee/i.test(g.key))).toBe(false)
  })

  it('defaults equal the car binding values; applying the default genome leaves the binding params unchanged', () => {
    const spec = mazeArenaSpec(tr1)
    const plain = bindingOf(buildArenaWorldFrom(source, spec)).params
    const withDefaults = bindingOf(buildArenaWorldFrom(source, spec, avDefaultParams())).params
    const defaults = avDefaultParams()
    // genes the car binds explicitly: default == bound value, and applying it is a no-op
    const bound = AV_GENOME_SPEC.genes.filter((g) => g.key in plain)
    expect(bound.length).toBeGreaterThan(10)
    for (const g of bound) expect(plain[g.key], g.key).toEqual(g.default)
    expect(Object.fromEntries(bound.map((g) => [g.key, withDefaults[g.key]]))).toEqual(Object.fromEntries(bound.map((g) => [g.key, plain[g.key]])))
    // everything the car does not bind keeps the stage-code default: the only difference is the explicit (equal) value
    for (const k of Object.keys(plain)) expect(withDefaults[k], k).toEqual(plain[k])
    for (const k of Object.keys(withDefaults)) if (!(k in plain)) expect(withDefaults[k], k).toEqual(defaults[k])
  })
})

interface Baseline {
  exitT: number
  contacts: number
  frames: number
  minGap: number
}

async function baselineOf(): Promise<Baseline> {
  const spec = mazeArenaSpec(tr1)
  const polys = spec.boxes.map((b) => rectPoly(b.at[0], b.at[1], ((b.yawDeg ?? 0) * Math.PI) / 180, b.size[0], b.size[1]))
  let events = 0
  let inContact = false
  const m = await runScenario(spec, MAZE_EPISODE_SECONDS, {
    onFrame: ({ sim }) => {
      const p = sim.getPosition(ARENA_CAR_ID)
      const hull = rectPoly(p[0], p[2], yawOf(sim.getRotation(ARENA_CAR_ID)), CAR_SIZE[0], CAR_SIZE[1])
      const touch = polys.some((w) => polyGap(hull, w) < CONTACT_GAP)
      if (touch && !inContact) events++
      inContact = touch
    },
  })
  return { exitT: m.goalReachT, contacts: events, frames: m.staticContactFrames, minGap: m.minStaticGap }
}

describe('maze episode evaluator', () => {
  it('matches the W1 baseline path (default params, TRAIN tr1) and is identical serially vs in a worker', async () => {
    const base = await baselineOf()
    expect(Number.isFinite(base.exitT)).toBe(true)

    const full = await runMazeEpisode(source, avDefaultParams(), tr1, { stopOnReach: false })
    expect(full.reached).toBe(true)
    expect(full.exitT).toBe(base.exitT)
    expect(full.contactEvents).toBe(base.contacts)
    expect(full.contactFrames).toBe(base.frames)
    expect(full.minStaticGap).toBeCloseTo(base.minGap, 9)

    // evaluator API (stop-on-reach): same exit time, contacts up to the exit are a prefix of the full-run ones
    const [early] = await createEvaluator(source)(avDefaultParams(), [tr1.key])
    expect(early!.exitT).toBe(base.exitT)
    expect(early!.contactEvents).toBeLessThanOrEqual(base.contacts)
    // no params at all (shipped car) == default genome
    const [bare] = await createEvaluator(source)({}, [tr1.key])
    expect(bare!.exitT).toBe(early!.exitT)
    expect(bare!.contactFrames).toBe(early!.contactFrames)

    // worker_threads (node pool) gives the same numbers as the serial in-thread evaluation
    const pool = new EpisodePool({ workers: 1 })
    try {
      const w = await pool.episode(avDefaultParams(), tr1.key)
      expect(w.exitT).toBe(early!.exitT)
      expect(w.contactEvents).toBe(early!.contactEvents)
      expect(w.contactFrames).toBe(early!.contactFrames)
      expect(w.minStaticGap).toBeCloseTo(early!.minStaticGap, 9)
    } finally {
      await pool.close()
    }
  }, 180_000)

  it('source world from the shipped library JSON on disk == source world from the freshly built bundle', () => {
    expect(loadSourceWorld()).toEqual(source)
  })
})
