/**
 * Unit tests of the cross-kind decision eval's CORE LOGIC (the pure parts of eval-schlau-candidate.ts):
 * resolveSchlauCandidate (run file / latest-best / candidates export, the v3 policy-tag refusal, the shape
 * check), assertDecisionGradeHoldout (the NIE-3-setup rule), schlauKindReports (the per-kind aggregation of the
 * 8-holdout band) and schlauShipBarVerdict (the night session's ship bar). The FULL eval (worker pool +
 * headless episodes) stays covered by the live decision runs, not by tests.
 */
import { describe, expect, it } from 'vitest'
import type { PolicyEpisodeMetrics } from '@/policyEvolution/episode'
import {
  assertDecisionGradeHoldout,
  resolveSchlauCandidate,
  SCHLAU_EVAL_HOLDOUT_FLOOR,
  schlauKindReports,
  schlauShipBarVerdict,
} from './eval-schlau-candidate'

/** A valid schlau genome: len = 29 H + 2 with H = 2 (the smallest non-trivial shape hiddenOfSchlau accepts). */
const genome = (fill = 0.5): number[] => Array.from({ length: 60 }, (_, i) => (i % 7 === 0 ? fill : i / 100))

/** One schlau holdout metrics fixture (key `kind:seed~variant`, progress / length drive the aggregates). */
const m = (key: string, outcome: PolicyEpisodeMetrics['outcome'], progress: number, length = 100, over: Partial<PolicyEpisodeMetrics> = {}): PolicyEpisodeMetrics =>
  ({ key, outcome, progress, timeS: 10, meanSpeed: progress / 10, score: (progress * progress) / 10, norm: progress / 100, wallMs: 1, length, touchWallFrames: 0, touchObjectFrames: 0, peakNorm: progress / 100, ...over }) as PolicyEpisodeMetrics

describe('assertDecisionGradeHoldout', () => {
  it('accepts the decision-grade 8 and anything larger; refuses the 3-setup smoke band (NIE the 3-Setup)', () => {
    expect(SCHLAU_EVAL_HOLDOUT_FLOOR).toBe(8)
    expect(assertDecisionGradeHoldout(8)).toBe(8)
    expect(assertDecisionGradeHoldout(12)).toBe(12)
    expect(() => assertDecisionGradeHoldout(3)).toThrow(/decision-grade/)
    expect(() => assertDecisionGradeHoldout(7)).toThrow(/never evaluate a ship decision/)
  })
})

describe('resolveSchlauCandidate', () => {
  it('resolves a run file best (best.genome) with gen and label', () => {
    const src = resolveSchlauCandidate({ policy: 'schlau', best: { gen: 45600, genome: genome() } }, { source: 'schlau.json' })
    expect(src.genome).toHaveLength(60)
    expect(src.gen).toBe(45600)
    expect(src.label).toBe('schlau gen 45600')
    expect(src.source).toBe('schlau.json')
  })

  it('resolves a plain { genome } file and a latest-best export (top-level genome wins, then epochBest, then best)', () => {
    expect(resolveSchlauCandidate({ genome: genome(0.1) }).id).toBe('genome')
    expect(resolveSchlauCandidate({ genome: genome(0.1), best: { genome: genome(0.9) } }).genome[0]).toBe(0.1)
    expect(resolveSchlauCandidate({ epochBest: { genome: genome(0.2) }, best: { genome: genome(0.9) } }).genome[0]).toBe(0.2)
    expect(resolveSchlauCandidate({ best: { genome: genome(0.9) } }).genome[0]).toBe(0.9)
  })

  it('picks a candidates export entry by id AND by numeric index, carrying id/label/gen', () => {
    const doc = {
      schema: 'renn.policy-evolution.candidates/1',
      policy: 'schlau',
      candidates: [
        { id: 'island-0', label: 'I1', gen: 10827, genome: genome(0.1) },
        { id: 'island-1', label: 'I2', gen: 10827, genome: genome(0.2) },
      ],
    }
    const byId = resolveSchlauCandidate(doc, { candidate: 'island-1', source: 'schlau-candidates.json' })
    expect(byId.label).toBe('I2')
    expect(byId.genome[0]).toBe(0.2)
    expect(byId.source).toBe('schlau-candidates.json#island-1')
    expect(resolveSchlauCandidate(doc, { candidate: '0', source: 'c.json' }).genome[0]).toBe(0.1)
    expect(() => resolveSchlauCandidate(doc, { candidate: 'island-9' })).toThrow(/no candidate/)
    expect(() => resolveSchlauCandidate({ genome: genome() }, { candidate: 'island-0' })).toThrow(/candidates\[\]/)
  })

  it('REFUSES a file whose policy tag is not schlau (schlau genomes are length-identical to v3 — the tag is the only mark)', () => {
    expect(() => resolveSchlauCandidate({ policy: 'v3', best: { genome: genome() } }, { source: 'v3-run.json' })).toThrow(/not 'schlau'/)
  })

  it('accepts BOTH nets: a deep schlau2 genome (H^2 + 30 H + 2) resolves exactly like a 1-layer one', () => {
    const deep = Array.from({ length: 6 * 6 + 30 * 6 + 2 }, (_, i) => (i % 7 === 0 ? 0.5 : i / 100))
    const r = resolveSchlauCandidate({ policy: 'schlau', genome: deep }, { source: 'schlau2.json' })
    expect(r.genome).toEqual(deep)
    expect(r.source).toBe('schlau2.json')
    // the 1-layer fallback still resolves (the disjoint length sets can never mix the two up)
    expect(resolveSchlauCandidate({ genome: genome() }).genome).toEqual(genome())
  })

  it('refuses genomes without a schlau shape and non-array / non-finite genomes', () => {
    expect(() => resolveSchlauCandidate({ genome: [0.1, 0.2] })).toThrow(/29 H \+ 2/)
    expect(() => resolveSchlauCandidate({})).toThrow(/no schlau genome/)
    expect(() => resolveSchlauCandidate({ genome: 'nope' })).toThrow(/no schlau genome/)
    expect(() => resolveSchlauCandidate({ genome: [0.1, Number.NaN] })).toThrow()
  })
})

describe('schlauKindReports', () => {
  const kinds = ['goal_open', 'goal_box', 'goal_wall'] as const
  it('slices the band per kind and aggregates finishes, outcomes, progress share, norm, touch usage', () => {
    const metrics = [
      m('goal_open:1001~1', 'finish', 100),
      m('goal_open:1002~1', 'stall', 30),
      m('goal_box:1001~1', 'finish', 100),
      m('goal_box:1002~1', 'offcourse', 10, 100, { touchWallFrames: 60 }),
      m('goal_wall:1001~1', 'finish', 100),
      m('goal_wall:1002~1', 'crash', 40, 100, { touchWallFrames: 120 }),
    ]
    const reports = schlauKindReports(metrics, kinds)
    expect(reports.map((r) => r.kind)).toEqual([...kinds])
    const [open, box, wall] = reports
    expect(open).toMatchObject({ episodes: 2, finished: 1, finishRate: 0.5, stalls: 1, meanProgressShare: 0.65, meanTouchWallFrames: 0, touchedShare: 0 })
    expect(box).toMatchObject({ episodes: 2, finished: 1, offcourse: 1, meanProgressShare: 0.55, meanTouchWallFrames: 30, touchedShare: 0.5 })
    expect(wall).toMatchObject({ episodes: 2, finished: 1, crashes: 1, meanProgressShare: 0.7, meanTouchWallFrames: 60, touchedShare: 0.5 })
    // the weakest link of a kind is the MIN over its episode values (a finish's peakNorm 1.0 vs a crash's halved 0.2)
    expect(wall!.minLink).toBeCloseTo(0.2, 5)
  })

  it('returns a zeroed report for a kind with no episodes, and counts flips / timeouts separately from stalls', () => {
    const reports = schlauKindReports([m('goal_box:1001~1', 'flip', 20)], kinds)
    expect(reports.find((r) => r.kind === 'goal_open')!).toMatchObject({ episodes: 0, finished: 0, meanProgressShare: 0 })
    expect(reports.find((r) => r.kind === 'goal_box')!).toMatchObject({ episodes: 1, flips: 1, stalls: 0, crashes: 0 })
  })
})

describe('schlauShipBarVerdict', () => {
  const statusQuo = { finishes: 0, wallFinishes: 0, meanProgressShare: 0.1 }
  it('ships only when better than the status quo AND the wall kind finishes measurably > 0', () => {
    expect(schlauShipBarVerdict({ finishes: 6, wallFinishes: 2, meanProgressShare: 0.6 }, statusQuo).ship).toBe(true)
    // wall 0 finishes: no ship even with strong box/open numbers (the WF lesson)
    expect(schlauShipBarVerdict({ finishes: 8, wallFinishes: 0, meanProgressShare: 0.8 }, statusQuo).ship).toBe(false)
    // equal finishes but more progress than the placeholder: better, yet still gated by the wall bar
    const tie = schlauShipBarVerdict({ finishes: 0, wallFinishes: 0, meanProgressShare: 0.5 }, statusQuo)
    expect(tie.betterThanStatusQuo).toBe(true)
    expect(tie.ship).toBe(false)
  })
  it('a candidate that is NOT better than the status quo never ships, even with wall finishes', () => {
    const worse = schlauShipBarVerdict({ finishes: 0, wallFinishes: 1, meanProgressShare: 0.05 }, statusQuo)
    expect(worse.betterThanStatusQuo).toBe(false)
    expect(worse.wallAboveZero).toBe(true)
    expect(worse.ship).toBe(false)
  })
})
