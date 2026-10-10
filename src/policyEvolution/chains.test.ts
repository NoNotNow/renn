import { describe, expect, it } from 'vitest'
import { CHAIN_KINDS, COURSE_LENGTH, courseKey, type CourseKind, buildSetupCourse } from './courses'
import {
  acceptedSetupKeys,
  CHAINS_PER_SETUP,
  chainClearance,
  chainEpisodeKey,
  chainEpisodeKeys,
  directedHausdorff,
  chainsForSetup,
  flattenChainKeys,
  hausdorff,
  holdoutChainEpisodes,
  isChainEpisodeKey,
  MIN_CHAINS,
  MIN_CLEARANCE,
  MIN_HAUSDORFF_M,
  parseChainEpisodeKey,
  trainChainEpisodes,
  CHAIN_FIELD_DIFFICULTY,
} from './chains'
import { runPolicyEpisode } from './episode'
import { pursuitV2 } from './handWired'
import { GENOME_LENGTH, GENOME_LENGTH_V2, N_OUT } from './policy'

const SAMPLE: Array<[CourseKind, number]> = [["slalom", 8], ["field", 8], ["crowd", 8], ["maze", 8]]
/** polyline sampled every 2 m (directedHausdorff measures vertices only) */
function densifyForTest(points: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [points[0]!]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2))
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  }
  return out
}
const keyOf = (kind: CourseKind, seed: number) => courseKey(kind, seed, 0, kind === 'field' ? CHAIN_FIELD_DIFFICULTY : 1)

describe('chain generation', () => {
  it('keys round-trip', () => {
    expect(chainEpisodeKey('field:3@0.5', 2)).toBe('field:3@0.5#2')
    expect(parseChainEpisodeKey('field:3~1@0.5#2')).toEqual({ setupKey: 'field:3~1@0.5', chainIndex: 2 })
    expect(isChainEpisodeKey('field:3')).toBe(false)
    expect(() => parseChainEpisodeKey('field:3#x')).toThrow()
  })

  it('is deterministic', () => {
    for (const [kind] of SAMPLE) {
      const k = keyOf(kind, 3)
      const a = chainsForSetup(k)
      expect(JSON.stringify(a)).toBe(JSON.stringify(chainsForSetup(k)))
    }
  })

  it('every kind yields setups with >= 2 chains, clear of the obstacles, pairwise Hausdorff >= 10 m', () => {
    for (const [kind, n] of SAMPLE) {
      const keys = acceptedSetupKeys(n, [kind], 1)
      expect(keys.length, kind).toBe(n)
      const counts: number[] = []
      for (const k of keys) {
        const chains = chainsForSetup(k)
        counts.push(chains.length)
        expect(chains.length).toBeGreaterThanOrEqual(MIN_CHAINS)
        expect(chains.length).toBeLessThanOrEqual(CHAINS_PER_SETUP)
        const course = buildSetupCourse(k)
        chains.forEach((c, i) => {
          expect(c.points[0]).toEqual(course.startAt ?? [0, 0])
          expect(chainClearance(course.boxes, c.points), `${k}#${i}`).toBeGreaterThanOrEqual(MIN_CLEARANCE - 1e-6)
          for (let j = 0; j < i; j++) expect(hausdorff(chains[j]!.points, c.points), `${k} ${j}/${i}`).toBeGreaterThanOrEqual(MIN_HAUSDORFF_M)
        })
      }
      console.log(`chains/setup ${kind}: ${counts.join(',')}  mean ${(counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(2)}`)
    }
  }, 120_000)

  it('train and holdout chain setups are disjoint and listed grouped by setup', () => {
    const tr = trainChainEpisodes(2)
    const ho = holdoutChainEpisodes(2)
    expect(tr.length).toBe(2 * CHAIN_KINDS.length)
    expect(tr.some((a) => ho.some((b) => b.setupKey === a.setupKey))).toBe(false)
    for (const g of [...tr, ...ho]) {
      expect(g.keys).toEqual(chainEpisodeKeys(g.setupKey))
      expect(g.keys.length).toBeGreaterThanOrEqual(MIN_CHAINS)
    }
    expect(flattenChainKeys(tr).length).toBe(tr.reduce((a, g) => a + g.keys.length, 0))
    expect(ho[0]!.setupKey).toContain('~1')
  }, 60_000) // pure CPU (chain generation for 16 setups); slow when a training run shares the cores

  it('the crowd setup is closed (continuous side walls, back and end wall)', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const c = buildSetupCourse(keyOf('crowd', seed))
      for (const side of [-1, 1]) {
        for (let z = 18; z > -COURSE_LENGTH - 30; z -= 1) {
          const covered = c.boxes.some((b) => b.size[1] >= 39 && Math.abs(Math.abs(b.at[0]) - 22) < 1e-9 && Math.sign(b.at[0]) === side && Math.abs(z - b.at[1]) <= b.size[1] / 2)
          expect(covered, `seed ${seed} side ${side} z ${z}`).toBe(true)
        }
      }
      expect(c.boxes.some((b) => b.at[1] > 20 && b.size[0] > 44)).toBe(true)
      expect(c.boxes.some((b) => b.at[1] < -COURSE_LENGTH && b.size[0] > 44)).toBe(true)
    }
  })
})

describe('chain episodes', () => {
  it('pure pursuit on the dynamic command finishes >= 70 % of the chains of every kind', async () => {
    const w = pursuitV2()
    for (const [kind, n] of SAMPLE) {
      const keys = acceptedSetupKeys(Math.min(n, 5), [kind], 1).flatMap(chainEpisodeKeys)
      const res = await Promise.all(keys.map((k) => runPolicyEpisode(w, k)))
      const fin = res.filter((m) => m.outcome === 'finish').length
      console.log(`SOLVABILITY ${kind}: ${fin}/${keys.length} = ${((100 * fin) / keys.length).toFixed(0)} %  outcomes ${res.map((m) => m.outcome[0]).join('')}`)
      expect(fin / keys.length, kind).toBeGreaterThanOrEqual(0.7)
    }
  }, 600_000)

  it('exploit guard: following chain B while chain A is commanded/scored ends offcourse (the score counts along the commanded chain only)', async () => {
    let pairs = 0
    for (const setup of acceptedSetupKeys(2, ['slalom', 'crowd'], 1)) {
      const chains = chainsForSetup(setup)
      // a pair whose chain B leaves chain A by at least 12 m somewhere (so B can not be mistaken for A)
      let pair: [number, number] | undefined
      for (let i = 0; i < chains.length && !pair; i++) {
        for (let j = 0; j < chains.length && !pair; j++) {
          if (i !== j && directedHausdorff(densifyForTest(chains[j]!.points), chains[i]!.points) >= 12) pair = [i, j]
        }
      }
      if (!pair) continue
      pairs++
      const [ia, ib] = pair
      const own = await runPolicyEpisode(pursuitV2(), chainEpisodeKey(setup, ia))
      // the stage is commanded along chain B, the episode scores chain A
      const swapped = await runPolicyEpisode(pursuitV2(), chainEpisodeKey(setup, ia), { stageChain: chains[ib]!.points })
      expect(own.outcome, setup).toBe('finish')
      expect(swapped.outcome, setup).not.toBe('finish')
      expect(swapped.progress, setup).toBeLessThan(own.progress)
    }
    expect(pairs).toBeGreaterThan(0)
  }, 120_000)

  it('exploit guard: driving straight ahead never finishes a field / crowd chain', async () => {
    const w = new Array<number>(GENOME_LENGTH_V2).fill(0)
    w[GENOME_LENGTH_V2 - N_OUT + 1] = 0.35
    for (const kind of ['field', 'crowd'] as const) {
      for (const key of acceptedSetupKeys(2, [kind], 1).flatMap(chainEpisodeKeys)) {
        const m = await runPolicyEpisode(w, key)
        expect(m.outcome, key).not.toBe('finish')
        expect(m.progress, key).toBeLessThan(m.length! - 5)
      }
    }
  }, 120_000)

  it('is deterministic, needs a v2 genome and reports the chain length', async () => {
    const mazeKey = acceptedSetupKeys(1, ['maze'], 1)[0]!
    const key = chainEpisodeKeys(mazeKey)[0]!
    const a = await runPolicyEpisode(pursuitV2(), key)
    const b = await runPolicyEpisode(pursuitV2(), key)
    expect({ ...a, wallMs: 0 }).toEqual({ ...b, wallMs: 0 })
    expect(a.length).toBeCloseTo(chainsForSetup(mazeKey)[0]!.length, 6)
    await expect(runPolicyEpisode(new Array<number>(GENOME_LENGTH).fill(0), key)).rejects.toThrow(/v2 genome/)
  }, 120_000)
})
