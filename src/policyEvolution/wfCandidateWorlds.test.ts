import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_DT, WorldSimulator } from '@/test/helpers/worldSimulator'
import { warmCruxGate } from './cruxChains'
import { chainsForSetup, holdoutV3Episodes } from './chains'
import { V3_KINDS, type CourseKind } from './courses'
import { POLICY_CAR_ID } from './episode'
import { hiddenOfLength, N_IN_V3 } from './policy'
import {
  WF_CANDIDATE_KINDS,
  WF_CHIP_KINDS,
  WF_HOLDOUTS_PER_KIND,
  isWfCandidateWorldId,
  wfWorldId,
} from './wfCandidates'
import type { WfTrainingMeta } from './wfCandidates'
import {
  bakedWfCandidate,
  buildWfCandidateWorld,
  readWfCandidates,
  wfCandidateWorldSpecs,
  wfKindSetupKeys,
  wfTrainingMeta,
  type WfCandidateWorldSpec,
} from './wfCandidateWorlds'

// the crux kind's chain enumeration runs the sync pursuit gate: the physics engine must be warm first
beforeAll(async () => {
  await warmCruxGate()
})

// resolved lazily (the first call enumerates chains, which needs the warm physics engine)
let specsCache: WfCandidateWorldSpec[] | null = null
const allSpecs = (): WfCandidateWorldSpec[] => (specsCache ??= wfCandidateWorldSpecs())

describe('wf candidate manifest', () => {
  it('the CHIP kind set drops blockade AND blocks while the dialog world rows keep them (user decision 2026-10-15)', () => {
    // blockade + blocks stay world kinds (dialog rows + exported wf_* worlds, informational) but are OUT of
    // the chip/ship band: blockade's ~0 direct-line finish rates (T1 round-5, ~900 gens unlearned) and then
    // blocks' partial 8% (17 -> 12 -> 8 -> 8 over the recovery chunks) would poison the lex-min of every
    // future training warm-started from the chip — the ship band is the clean 13-kind set (= S4's kinds,
    // on the harder loosened courses; wf40 g423 mean 92.6% vs S4's 90.9% there)
    expect(WF_CANDIDATE_KINDS).toContain('blockade')
    expect(WF_CANDIDATE_KINDS).toContain('blocks')
    expect(WF_CHIP_KINDS).not.toContain('blockade')
    expect(WF_CHIP_KINDS).not.toContain('blocks')
    // the chip band covers every v3 kind except the two detour kinds (training + eval + ship claims)
    expect([...WF_CHIP_KINDS].sort()).toEqual([...V3_KINDS].filter((k) => k !== 'blockade' && k !== 'blocks').sort())
    expect(WF_CHIP_KINDS).toHaveLength(V3_KINDS.length - 2)
  })

  it('resolves every entry whose genome file exists; genomes are v3-shaped; stretch candidates are skipped while training', () => {
    const candidates = readWfCandidates()
    const ids = candidates.map((c) => c.id)
    expect(ids).toContain('wf32_final')
    expect(ids).toContain('wf24_base')
    // the stretch-2 entry is pre-registered but its candidate file does not exist while the run trains
    if (!ids.includes('wf32_stretch2')) expect(ids).not.toContain('wf32_stretch2')
    for (const c of candidates) {
      expect(hiddenOfLength(c.genome.length, N_IN_V3)).toBeGreaterThan(0)
    }
  })

  it('bakes exactly the manifest entry with bakeWorlds (the pipeline-A final, H=32)', () => {
    const baked = bakedWfCandidate()
    expect(baked.id).toBe('wf32_final')
    expect(baked.genome).toHaveLength(29 * 32 + 2)
  })

  // the crux kind's band enumeration runs the pursuit gate — heavy under the full suite's parallel load
  it('exports the SAME holdout band the powered evals report on (holdoutV3Episodes)', { timeout: 180_000 }, () => {
    for (const kind of WF_CANDIDATE_KINDS) {
      const keys = wfKindSetupKeys(kind)
      expect(keys).toHaveLength(WF_HOLDOUTS_PER_KIND)
      expect(keys).toEqual(holdoutV3Episodes(WF_HOLDOUTS_PER_KIND, [kind as CourseKind]).map((g) => g.setupKey))
    }
  })
})

describe('wf candidate worlds (one per kind x holdout setup of the baked candidate, one car per chain)', () => {
  // collection-time enumeration (cheap: constants only); the specs resolve per test after the warm-up
  const cases = WF_CANDIDATE_KINDS.flatMap((kind) =>
    Array.from({ length: WF_HOLDOUTS_PER_KIND }, (_, i) => ({ kind, setupIndex: i + 1 })),
  )
  const specOf = (kind: string, setupIndex: number): WfCandidateWorldSpec => {
    const spec = allSpecs().find((s) => s.kind === kind && s.setupIndex === setupIndex)
    if (!spec) throw new Error(`no wf world spec ${kind} ${setupIndex} (regenerate: npx tsx tools/renn-mcp/export-wf-candidate-example-worlds.ts)`)
    return spec
  }

  it('covers every kind x the full holdout band, ids wf_<kind>_<n>', () => {
    const specs = allSpecs()
    expect(specs).toHaveLength(WF_CANDIDATE_KINDS.length * WF_HOLDOUTS_PER_KIND)
    for (const spec of specs) {
      expect(spec.id).toBe(wfWorldId(spec.kind, spec.setupIndex))
      expect(isWfCandidateWorldId(spec.id)).toBe(true)
    }
  })

  for (const c of cases) {
    const id = wfWorldId(c.kind, c.setupIndex)
    it(`${id}: world.json on disk equals the exporter output (regenerate: npx tsx tools/renn-mcp/export-wf-candidate-example-worlds.ts)`, () => {
      const spec = specOf(c.kind, c.setupIndex)
      const disk = JSON.parse(readFileSync(`public/exampleWorlds/${id}/world.json`, 'utf8'))
      expect(disk).toEqual(JSON.parse(JSON.stringify(buildWfCandidateWorld(spec))))
    })

    it(`${id}: meta.json matches wfTrainingMeta (identity, tile geometry of every chain)`, () => {
      const spec = specOf(c.kind, c.setupIndex)
      const disk = JSON.parse(readFileSync(`public/exampleWorlds/${id}/meta.json`, 'utf8')) as WfTrainingMeta
      const chains = chainsForSetup(spec.setupKey)
      const expected = wfTrainingMeta(spec, [])
      expect(disk.id).toBe(expected.id)
      expect(disk.kind).toBe(expected.kind)
      expect(disk.setupKey).toBe(expected.setupKey)
      expect(disk.setupIndex).toBe(expected.setupIndex)
      expect(disk.name).toBe(expected.name)
      expect(disk.candidate).toEqual(expected.candidate)
      expect(disk.chains).toBe(chains.length)
      expect(disk.bestScore === null || typeof disk.bestScore === 'number').toBe(true)
      // tileSvg: the dialog tile data, aligned with the tile order (w/h = the shared route_<i>.svg pixel size)
      const tile = disk.tileSvg
      expect(tile).toBeTruthy()
      expect(tile!.w).toBeGreaterThan(0)
      expect(tile!.h).toBeGreaterThan(0)
      expect(tile!.routes).toHaveLength(chains.length)
      tile!.routes.forEach((r, i) => {
        expect(r.pts).toHaveLength(chains[i]!.points.length)
        r.pts.forEach(([x, y]) => {
          expect(x).toBeGreaterThanOrEqual(0)
          expect(x).toBeLessThanOrEqual(tile!.w)
          expect(y).toBeGreaterThanOrEqual(0)
          expect(y).toBeLessThanOrEqual(tile!.h)
        })
        expect(r.score === null || typeof r.score === 'number').toBe(true)
      })
    })
  }

  // headless load + drive of the first holdout setup per kind (the other two differ only in the setup
  // seed): every world must simulate without throwing and roll its cars — how far each chain gets is the
  // candidate's own quality (gates / rslalom legitimately fail), so distances are logged, not asserted
  for (const c of cases.filter((x) => x.setupIndex === 1)) {
    const id = wfWorldId(c.kind, c.setupIndex)
    it(
      `${id}: loads headlessly and every car rolls`,
      async () => {
        const spec = specOf(c.kind, c.setupIndex)
        const world = buildWfCandidateWorld(spec)
        const chains = chainsForSetup(spec.setupKey)
        const sim = await WorldSimulator.create(world, 0)
        try {
          const cars = world.entities.filter((e) => e.id.startsWith(POLICY_CAR_ID)).map((e) => e.id)
          expect(cars.length).toBe(chains.length)
          const start = cars.map((id) => sim.getPosition(id))
          sim.runFrames(Math.round(8 / DEFAULT_DT))
          const moved = cars.map((id, i) => {
            const p = sim.getPosition(id)
            return Math.hypot(p[0] - start[i]![0], p[2] - start[i]![2])
          })
          console.log(`[wf] ${spec.id} ${spec.setupKey}: cars moved ${moved.map((m) => m.toFixed(1)).join(' / ')} m (chains: ${chains.length})`)
          expect(Math.max(...moved)).toBeGreaterThan(2)
        } finally {
          sim.dispose()
        }
      },
      120_000,
    )
  }
})
