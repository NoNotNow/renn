import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { shippedGenomeV3 } from '@/policyEvolution/exampleWorld'
import { acceptedSetupKeys } from '@/policyEvolution/chains'
import { cruxClass, cruxDir, cruxEmb, parseCourseKey } from '@/policyEvolution/courses'
import { warmCruxGate } from '@/policyEvolution/cruxChains'
import {
  CRUX_CARROT_COLOR,
  CRUX_GOAL_PREFIX,
  CRUX_GOAL_REACH_M,
  CRUX_GOAL_Y,
  CRUX_SCORE_STAGE_BASE,
  CRUX_SCORE_STAGE_CODE,
  CRUX_TRAINING_WORLDS,
  CRUX_TRAIN_CHAIN_COLORS,
  CRUX_TRAIN_SPACING_M,
  buildCruxTrainingWorld,
  cruxCarId,
  cruxGoalId,
  cruxScoreStageId,
  cruxTrainingInfo,
  cruxTrainingMeta,
  cruxTrainingSetup,
  focusCruxChain,
  trialCruxTrainingCandidate,
  SHIPPED_CRUX_TRAINING_CANDIDATE,
  type CruxTrainingMeta,
} from '@/policyEvolution/cruxTraining'
import { OFF_CHAIN_M } from '@/policyEvolution/episode'
import { CRUX_LATERAL_OFF_M } from '@/policyEvolution/cruxChains'
import { getTransformerWatchEntries, setAgentObservationWatchActive } from '@/runtime/transformerWatchBridge'
import { DEFAULT_DT, WorldSimulator } from '@/test/helpers/worldSimulator'

/**
 * The 25 crux training worlds (the accepted crux band of the v3cruxnose run, 15 train + 10 holdout setups): one tiny
 * crux copy per ACCEPTED CHAIN (the base path + jittered variants — the same chains the training episodes run), the
 * shipped v3 policy driving every copy on its own chain, in-world scoring (the shared training score stage, 'crux.*'
 * watch labels) + chain rendering. Regenerate after any change to src/policyEvolution/cruxTraining.ts or a policy ship:
 *   npx tsx tools/renn-mcp/export-crux-training-worlds.ts --score
 * The chain enumeration runs the pure-pursuit gate (a synchronous simulator), so the physics engine is warmed first
 * (warmCruxGate); the headless policy runs are env-gated (CRUX_TRAIN_SIM=1): they take minutes, not milliseconds.
 */

const genome = () => shippedGenomeV3()

/** The candidate meta.json must name: the shipped policy, or the RENN_V3_GENOME_FILE trial when one is exported. */
const expectedCandidate = () => {
  const override = process.env.RENN_V3_GENOME_FILE
  if (!override) return SHIPPED_CRUX_TRAINING_CANDIDATE
  return trialCruxTrainingCandidate(
    JSON.parse(readFileSync(override, 'utf8')) as { best?: { gen?: number }; source?: string },
    override,
  )
}

// the crux chain enumeration gates every candidate through a synchronous pursuit episode (WorldSimulator.createSync):
// the physics engine must be warm before any crux chain is generated (Rapier wasm cannot load synchronously)
beforeAll(() => warmCruxGate(), 180_000)

describe('crux training worlds', () => {
  it('shipped v3 genome is available (the worlds are built from it)', () => {
    expect(genome()).toBeTruthy()
  })

  it('the registry IS the accepted band (acceptedSetupKeys) with the pinned world ids', { timeout: 180_000 }, () => {
    // source of truth: the live enumeration (the same pinned band as crux.test.ts TRAIN15 / HOLDOUT10)
    expect(CRUX_TRAINING_WORLDS.map((s) => s.setupKey)).toEqual([...acceptedSetupKeys(15, ['crux'], 1), ...acceptedSetupKeys(10, ['crux'], 1001, 1)])
    expect(CRUX_TRAINING_WORLDS.map((s) => s.id)).toEqual([
      ...Array.from({ length: 15 }, (_, i) => `crux_train_${i + 1}`),
      ...Array.from({ length: 10 }, (_, i) => `crux_holdout_${i + 1}`),
    ])
    expect(CRUX_TRAINING_WORLDS.map((s) => s.band)).toEqual([...Array<'train'>(15).fill('train'), ...Array<'holdout'>(10).fill('holdout')])
    expect(CRUX_TRAINING_WORLDS).toHaveLength(25)
  })

  for (const spec of CRUX_TRAINING_WORLDS) {
    it(`${spec.id}: on disk equals the exporter output`, { timeout: 180_000 }, () => {
      const disk = JSON.parse(readFileSync(join('public/exampleWorlds', spec.id, 'world.json'), 'utf8'))
      expect(disk).toEqual(JSON.parse(JSON.stringify(buildCruxTrainingWorld(spec, genome()!))))
    })

    it(`${spec.id}: meta.json matches cruxTrainingMeta (class band, base chain stats, chains counts)`, { timeout: 180_000 }, () => {
      const meta = JSON.parse(readFileSync(join('public/exampleWorlds', spec.id, 'meta.json'), 'utf8')) as CruxTrainingMeta
      const { chains } = cruxTrainingSetup(spec)
      const { seed } = parseCourseKey(spec.setupKey)
      expect(meta.id).toBe(spec.id)
      expect(meta.setupKey).toBe(spec.setupKey)
      expect(meta.name).toBe(spec.name)
      expect(meta.candidate).toEqual(expectedCandidate())
      expect(meta.bestScore === null || typeof meta.bestScore === 'number').toBe(true)
      // the class band: cls / emb / dir fixed by the seed (courses.ts), like the row info line
      expect(meta.cls).toBe((cruxClass(seed) === 0 ? 0 : 1) as 0 | 1)
      expect(meta.emb).toBe((cruxEmb(seed) === 0 ? 0 : 1) as 0 | 1)
      expect(meta.dir).toBe((cruxDir(seed) === -1 ? -1 : 1) as -1 | 1)
      expect(cruxTrainingInfo(spec)).toBe(
        `${cruxClass(seed) === 0 ? 'NC1 fast corner' : 'NC2 start swing'} · ${cruxClass(seed) === 0 ? (cruxEmb(seed) === 0 ? 'occluded' : 'open') : cruxEmb(seed) === 0 ? 'lateral' : 'pocket'} · ${cruxDir(seed) === -1 ? 'west' : 'east'}`,
      )
      expect(meta.chain.points).toBe(chains[0]!.points.length)
      expect(meta.chain.lengthM).toBeCloseTo(cruxTrainingMeta(spec, chains, null).chain.lengthM, 5)
      // chain 0 is the base path, the rest jittered variants (>= 2 chains per accepted setup)
      expect(chains.length).toBeGreaterThanOrEqual(2)
      expect(chains.length).toBeLessThanOrEqual(6)
      expect(meta.chains).toEqual({ base: 1, jittered: chains.length - 1 })
      // tileSvg: the dialog tile data (w/h = the shared route_<i>.svg pixel size)
      const tile = meta.tileSvg as CruxTrainingMeta['tileSvg']
      expect(tile).toBeTruthy()
      expect(tile!.w).toBeGreaterThan(0)
      expect(tile!.h).toBeGreaterThan(0)
      expect(tile!.routes).toHaveLength(chains.length)
      tile!.routes.forEach((r, i) => {
        // pts[j] is chain point j in svg pixel space, so segment j is pts[j] -> pts[j+1]
        expect(r.pts).toHaveLength(chains[i]!.points.length)
        for (const [x, y] of r.pts) {
          expect(x).toBeGreaterThanOrEqual(0)
          expect(x).toBeLessThanOrEqual(tile!.w)
          expect(y).toBeGreaterThanOrEqual(0)
          expect(y).toBeLessThanOrEqual(tile!.h)
        }
        expect(r.score === null || typeof r.score === 'number').toBe(true)
      })
      // a --score export measures every chain: bestScore is the max of the per-chain scores
      if (meta.bestScore !== null) {
        expect(Math.max(...tile!.routes.map((r) => r.score as number))).toBe(meta.bestScore)
      }
    })

    it(`${spec.id}: one car + goal slab + score stage per chain copy, car 0 draws everything`, { timeout: 180_000 }, () => {
      const { chains } = cruxTrainingSetup(spec)
      const world = buildCruxTrainingWorld(spec, genome()!) as unknown as {
        world: { debugTargetLineEntityId?: string; camera?: { target?: string } }
        entities: { id: string; transformers?: string[]; position: number[] }[]
        transformers: Record<string, { params?: Record<string, unknown> } >
      }
      const K = chains.length
      const cars = world.entities.filter((e) => e.transformers?.some((t) => t.startsWith(CRUX_SCORE_STAGE_BASE)))
      expect(K).toBeGreaterThanOrEqual(2)
      expect(cars).toHaveLength(K)
      expect(world.world.debugTargetLineEntityId).toBe(cruxCarId(0))
      expect(world.world.camera?.target).toBe(cruxCarId(0))
      const cls = cruxClass(parseCourseKey(spec.setupKey).seed)
      for (let i = 0; i < K; i++) {
        const car = world.entities.find((e) => e.id === cruxCarId(i))
        expect(car?.transformers).toContain(cruxScoreStageId(i))
        // the score stage of car i scores the SAME (shifted) chain its car is commanded on (the v3 split: the chain lives
        // on the input stage `policy_input_i`, the drive stage only runs the net on `input.av.cmd`)
        const scoreParams = world.transformers[cruxScoreStageId(i)]?.params
        expect(scoreParams?.chain).toEqual(world.transformers[`policy_input_${i}`]?.params?.chain)
        expect(scoreParams?.hud).toBe(i === 0)
        // the input stage carries the chain's own command config: the NC2 start swings' offM 16, the NC1 chains' default
        expect(world.transformers[`policy_input_${i}`]?.params?.offM).toBe(cls === 1 ? CRUX_LATERAL_OFF_M : OFF_CHAIN_M)
        // every score stage sees ALL shifted chains, all car ids and the per-chain color pairs
        expect(scoreParams?.chains).toHaveLength(K)
        expect(scoreParams?.cars).toEqual(chains.map((_, j) => cruxCarId(j)))
        const colors = scoreParams?.chainColors as unknown[]
        expect(colors).toHaveLength(K)
        chains.forEach((_, j) => {
          expect(colors[j]).toEqual(
            j === 0 ? [CRUX_TRAIN_CHAIN_COLORS.base.start, CRUX_TRAIN_CHAIN_COLORS.base.end] : [CRUX_TRAIN_CHAIN_COLORS.jitter.start, CRUX_TRAIN_CHAIN_COLORS.jitter.end],
          )
        })
        // goal slab of copy i floats at this chain's end
        const goal = world.entities.find((e) => e.id === cruxGoalId(i))
        const chainEnd = chains[i]!.points[chains[i]!.points.length - 1]!
        expect(goal?.position[0]).toBeCloseTo(chainEnd[0] + i * CRUX_TRAIN_SPACING_M, 5)
        expect(goal?.position[1]).toBe(CRUX_GOAL_Y)
        expect(goal?.position[2]).toBeCloseTo(chainEnd[1], 5)
      }
      expect(world.entities.filter((e) => e.id.startsWith(CRUX_GOAL_PREFIX))).toHaveLength(K)
      expect(world.entities.some((e) => e.id.startsWith('chain_marker'))).toBe(false)
    })

    it(`${spec.id}: route_<i>.svg tile files exist on disk for every chain, none extra`, { timeout: 180_000 }, () => {
      const { chains } = cruxTrainingSetup(spec)
      for (let i = 0; i < chains.length; i++) {
        expect(existsSync(join('public/exampleWorlds', spec.id, `route_${i}.svg`))).toBe(true)
      }
      expect(existsSync(join('public/exampleWorlds', spec.id, `route_${chains.length}.svg`))).toBe(false)
      expect(existsSync(join('public/exampleWorlds', spec.id, 'thumb.svg'))).toBe(true)
    })
  }

  it('the score stage code is the shared training stage with the crux watch labels', () => {
    for (const label of ['crux.score', 'crux.prog', 'crux.speed', 'crux.seg']) expect(CRUX_SCORE_STAGE_CODE).toContain(`'${label}'`)
    expect(CRUX_SCORE_STAGE_CODE).not.toContain('maze.')
    expect(CRUX_SCORE_STAGE_CODE).toContain(`'${CRUX_CARROT_COLOR}'`)
  })
})

// --- the in-world score stage: finish freeze + line-of-sight gate (the shared contract, 'crux.*' labels) ---------------------------

describe('crux training score stage: finish freeze and LOS gate', () => {
  const transform = new Function(`${CRUX_SCORE_STAGE_CODE}\nreturn transform`)() as (
    input: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    dt: number,
    params: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    state: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    api: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  ) => unknown
  // chain along x from (0,0) to (50,0); one wall along x at z = 4 covering the whole chain: a car NORTH of it
  // projects onto the chain across the wall (the wrong-side occlusion the gate must catch)
  const chain = [[0, 0], [50, 0]] as unknown as number[][]
  const walls = [[[-5, 3.5], [55, 3.5], [55, 4.5], [-5, 4.5]]]
  const params = {
    chain,
    chains: [chain],
    walls,
    chainColors: [],
    cars: [cruxCarId(0)],
    idx: 0,
    hud: false,
    vRef: 20,
    bonusRate: 5,
    wallPenaltyPerS: 12,
    objectPenaltyPerS: 4,
  }
  const mkApi = () => {
    const watch: Record<string, string> = {}
    return {
      watch: (k: string, v: string) => {
        watch[k] = v
      },
      getWatch: () => watch,
      // identity heading +x (the car drives along the chain): the stage anchors the projection at the NOSE (x + 4.1)
      getUpVector: () => [0, 1, 0],
      getForwardVector: () => [1, 0, 0],
      vec: {
        normalize: (v: number[]) => {
          const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1
          return [v[0]! / l, v[1]! / l, v[2]! / l]
        },
        projectOntoPlane: (v: number[], n: number[]) => {
          const d = v[0]! * n[0]! + v[1]! * n[1]! + v[2]! * n[2]!
          return [v[0]! - d * n[0]!, v[1]! - d * n[1]!, v[2]! - d * n[2]!]
        },
      },
      raycast: () => ({ hit: false }),
      setScore: () => {},
      getWorldPosition: () => null,
      visualizeLine: () => {},
    }
  }
  const stepAt = (state: Record<string, unknown>, api: ReturnType<typeof mkApi>, x: number, z: number, wall = false) =>
    transform(
      { position: [x, 1, z], velocity: [20, 0, 0], environment: wall ? { isTouchingSide: true } : {} },
      DEFAULT_DT,
      params,
      state,
      api,
    )
  const scoreOf = (api: ReturnType<typeof mkApi>) => Number(/([\d.]+)/.exec(api.getWatch()['crux.score']!)![1])

  it('freezes the score at the goal: touch penalties after the finish change nothing', () => {
    const state: Record<string, unknown> = {}
    const api = mkApi()
    stepAt(state, api, 20, 0)
    // the nose (x + 4.1) at 43.1 is within CRUX_GOAL_REACH_M (8 m) of the end -> the chain counts as cleared
    stepAt(state, api, 43, 0)
    expect(state.done).toBe(true)
    const frozen = scoreOf(api)
    expect(frozen).toBeGreaterThan(0)
    // 5 s of scraping a wall past the goal: -60 pts of penalty would show without the freeze
    for (let k = 0; k < 5 / DEFAULT_DT; k++) stepAt(state, api, 60, 0, true)
    expect(scoreOf(api)).toBe(frozen)
    expect(api.getWatch()['crux.prog']).toBe('50.0 / 50 m')
  })

  it('an occluded chain projection gives NO progress credit: the previous credit stands', () => {
    const state: Record<string, unknown> = {}
    const api = mkApi()
    stepAt(state, api, 10, 1)
    expect(api.getWatch()['crux.prog']).toBe('14.1 / 50 m')
    stepAt(state, api, 20, 8) // north of the wall: the projection (24.1, 0) is behind it
    expect(api.getWatch()['crux.prog']).toBe('14.1 / 50 m')
    expect(state.seg).toBe(0)
    // back on the chain's side of the wall: the credit jumps to the visible projection
    stepAt(state, api, 30, 2)
    expect(api.getWatch()['crux.prog']).toBe('34.1 / 50 m')
  })
})

// --- focusCruxChain (the load-time tile focus) --------------------------------------------------------------------------------------

describe('crux training worlds: focusCruxChain', () => {
  it('camera + display entity + HUD flag move to the selected chain; out-of-range is a no-op', { timeout: 180_000 }, () => {
    const spec = CRUX_TRAINING_WORLDS[0]!
    const base = buildCruxTrainingWorld(spec, shippedGenomeV3()!)
    const count = cruxTrainingSetup(spec).chains.length

    const focused = focusCruxChain(base, count - 1)
    const w = focused as unknown as {
      world: { camera: { target?: string }; debugTargetLineEntityId?: string }
      transformers: Record<string, { params?: { hud?: boolean } } >
    }
    expect(w.world.camera.target).toBe(cruxCarId(count - 1))
    expect(w.world.debugTargetLineEntityId).toBe(cruxCarId(count - 1))
    for (let i = 0; i < count; i++) expect(w.transformers[cruxScoreStageId(i)]?.params?.hud).toBe(i === count - 1)

    // the neutral on-disk world keeps its default focus (chain 0)
    const neutral = base as unknown as typeof w
    expect(neutral.world.camera.target).toBe(cruxCarId(0))
    expect(neutral.transformers[cruxScoreStageId(0)]?.params?.hud).toBe(true)
    expect(neutral.transformers[cruxScoreStageId(1)]?.params?.hud).toBe(false)

    // out-of-range indices return the world unchanged
    expect(focusCruxChain(base, -1)).toEqual(base)
    expect(focusCruxChain(base, count)).toEqual(base)
    expect(focusCruxChain(base, 99)).toEqual(base)
  })
})

// --- env-gated headless policy runs (CRUX_TRAIN_SIM=1): the crux-training progress gate ----------------------------------------------
// This gate doubles as the crux-training progress gate: it goes green when a candidate clears EVERY chain of the band
// (the goal of the v3cruxnose run). The exported worlds carry the deployed candidate, so run it right after a trial:
//   RENN_V3_GENOME_FILE=training-data/policy-evolution/latest-best.json CRUX_TRAIN_SIM=1 \
//     npx vitest run src/test/scenarios/crux-training-worlds.test.ts -t 'headless'

const GOAL_REACH_M = CRUX_GOAL_REACH_M
const MAX_SIM_S = 120

describe.skipIf(process.env.CRUX_TRAIN_SIM !== '1')('crux training worlds: headless v3 run (CRUX_TRAIN_SIM=1)', () => {
  for (const spec of CRUX_TRAINING_WORLDS) {
    it(
      `${spec.id}: EVERY car reaches its goal within ${MAX_SIM_S} s of sim and scores > 0`,
      async () => {
        const { chains } = cruxTrainingSetup(spec)
        const world = buildCruxTrainingWorld(spec, genome()!)
        const K = chains.length
        const goalPos = (world.entities as { id: string; position: number[] }[]).filter((e) => e.id.startsWith(CRUX_GOAL_PREFIX)).map((e) => e.position)
        setAgentObservationWatchActive(true)
        const sim = await WorldSimulator.create(world, 0)
        try {
          const reachedAt: Array<number | null> = new Array(K).fill(null)
          let t = 0
          for (let f = 0; f < Math.round(MAX_SIM_S / DEFAULT_DT); f++) {
            sim.runFrames(1)
            t = (f + 1) * DEFAULT_DT
            let all = true
            for (let i = 0; i < K; i++) {
              const p = sim.getPosition(cruxCarId(i))
              if (reachedAt[i] === null && Math.hypot(p[0] - goalPos[i]![0]!, p[2] - goalPos[i]![2]!) < GOAL_REACH_M) reachedAt[i] = t
              if (reachedAt[i] === null) all = false
            }
            if (all) break
          }
          for (let i = 0; i < K; i++) {
            let score: number | null = null
            let seg: number | null = null
            for (const e of getTransformerWatchEntries().values()) {
              if (e.entityId === cruxCarId(i) && e.label === 'crux.score') score = Number(/([\d.]+)/.exec(String(e.value))![1])
              if (e.entityId === cruxCarId(i) && e.label === 'crux.seg') seg = Number(e.value)
            }
            console.log(`[crux-train] ${spec.id}: chain ${i} (${i === 0 ? 'base' : 'jitter'}): reached ${reachedAt[i] !== null} at ${reachedAt[i]?.toFixed(1) ?? t.toFixed(1)} s, score ${score}, seg ${seg}`)
            expect(reachedAt[i]).not.toBeNull()
            expect(score).toBeGreaterThan(0)
            // the dialog's live active-vector highlight reads crux.seg: the own chain segment index, integer 0..n-2
            expect(seg).not.toBeNull()
            expect(Number.isInteger(seg)).toBe(true)
            expect(seg as number).toBeGreaterThanOrEqual(0)
            expect(seg as number).toBeLessThanOrEqual(chains[i]!.points.length - 2)
          }
        } finally {
          sim.dispose()
          setAgentObservationWatchActive(false)
        }
      },
      600_000,
    )
  }
})
