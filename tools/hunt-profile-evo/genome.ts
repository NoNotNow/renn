/**
 * Genome of a maze profile: which AV params the `mazeProfile` overrides (per-key on/off) + their values + the hold time.
 * Pure (no sim): encode/decode, bounds, mutation/crossover, canonical hash. Values are normalised 0..1 per AV_GENOME_SPEC bounds
 * (log genes are normalised on the log scale). Absent keys inherit the binding (= base).
 */
import { createHash } from 'node:crypto'
import { AV_GENOME_SPEC } from '@/avEvolution/genes'
import { denormaliseGene, normaliseGene, type GeneSpec } from '@/avEvolution/core/genes'
import { gaussian, type Rng } from '@/avEvolution/core/rng'

/** LMnoC's 29 keys (maze/maneuver/reverse/turn/trigger families) + the four low-risk cusp genes. No CPU-budget / saver keys. */
export const LM_KEYS: string[] = [
  'mazeManeuverSpeed', 'maneuverRunSpeed', 'maneuverRunDecel', 'maneuverRunOffset', 'mazeReversePenalty', 'mazeMaxReverseRun', 'mazeDeviate',
  'turnManeuverSpeed', 'mazeTurnCos', 'mazeWpMin', 'mazeArriveR', 'mazeOffRoute', 'mazeGoalW', 'planMargin', 'tightMargin', 'guardMargin',
  'reversePenalty', 'gearSwitchPenalty', 'maxReverseRun', 'reverseSpeed', 'turnRoom', 'revCruiseBehind', 'maneuverSpeed', 'crawlTime', 'stuckSpeed',
  'lookahead', 'carrotLookT', 'carrotPullCos', 'fieldBlockCost',
  'cuspHeadW', 'cuspReachW', 'cuspLook', 'gearIncW',
]
const FORBIDDEN = /^(sweep|saver|budget|tickEvery|eco)/i

export const HOLD_MIN = 0.5
export const HOLD_MAX = 6
export const HOLD_STEP = 0.25
export const HOLD_DEFAULT = 3

const SPEC_BY_KEY = new Map<string, GeneSpec>(AV_GENOME_SPEC.genes.map((g) => [g.key, g]))
export const geneOf = (key: string): GeneSpec => {
  const g = SPEC_BY_KEY.get(key)
  if (!g) throw new Error(`gene ${key} not in AV_GENOME_SPEC`)
  return g
}
export function assertKeysValid(keys: string[] = LM_KEYS): void {
  for (const k of keys) {
    geneOf(k)
    if (FORBIDDEN.test(k)) throw new Error(`CPU-budget/saver key ${k} must not be in the profile`)
  }
}

export interface Genome {
  /** key present in the profile */
  on: boolean[]
  /** normalised 0..1 value per key (kept even when off, so toggling on restores a sensible value) */
  v: number[]
  /** normalised 0..1 hold time (0 => HOLD_MIN, 1 => HOLD_MAX) */
  h: number
}
export interface Profile { mazeProfile: Record<string, number>; mazeProfileHold?: number }

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const reflect = (x: number) => { let y = x; for (let k = 0; k < 4 && (y < 0 || y > 1); k++) y = y < 0 ? -y : 2 - y; return clamp01(y) }
export const sig4 = (x: number): number => (x === 0 ? 0 : Number(x.toPrecision(4)))

export function keyValue(key: string, u: number): number {
  const g = geneOf(key)
  const val = Number(denormaliseGene(g, clamp01(u)))
  return g.type === 'int' ? Math.round(val) : sig4(Math.min(g.max!, Math.max(g.min!, val)))
}
export const holdValue = (h: number): number => Math.round((HOLD_MIN + clamp01(h) * (HOLD_MAX - HOLD_MIN)) / HOLD_STEP) * HOLD_STEP
const holdNorm = (s: number) => clamp01((s - HOLD_MIN) / (HOLD_MAX - HOLD_MIN))

export function emptyGenome(keys: string[] = LM_KEYS): Genome {
  return { on: keys.map(() => false), v: keys.map((k) => normaliseGene(geneOf(k), geneOf(k).default)), h: holdNorm(HOLD_DEFAULT) }
}

/** Profile (e.g. a seed JSON: flat keys or {mazeProfile, mazeProfileHold}) -> genome. Unknown / out-of-LM keys throw. */
export function encodeProfile(p: Record<string, unknown>, keys: string[] = LM_KEYS): Genome {
  const flat = (p.mazeProfile && typeof p.mazeProfile === 'object' ? p.mazeProfile : Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'mazeProfileHold'))) as Record<string, number>
  const g = emptyGenome(keys)
  for (const [k, val] of Object.entries(flat)) {
    const i = keys.indexOf(k)
    if (i < 0) throw new Error(`profile key ${k} is not a genome key`)
    g.on[i] = true
    g.v[i] = normaliseGene(geneOf(k), val)
  }
  if (typeof p.mazeProfileHold === 'number') g.h = holdNorm(p.mazeProfileHold)
  return g
}

/** Genome -> profile (quantised: 4 significant digits, hold on a 0.25 s grid). Empty profile has no hold (= base). */
export function decodeGenome(g: Genome, keys: string[] = LM_KEYS): Profile {
  const mazeProfile: Record<string, number> = {}
  keys.forEach((k, i) => { if (g.on[i]) mazeProfile[k] = keyValue(k, g.v[i]!) })
  return Object.keys(mazeProfile).length ? { mazeProfile, mazeProfileHold: holdValue(g.h) } : { mazeProfile }
}

export const isBaseProfile = (p: Profile): boolean => Object.keys(p.mazeProfile).length === 0

/** Canonical hash: sorted keys, quantised values; every empty profile hashes to 'base'. */
export function profileHash(p: Profile): string {
  if (isBaseProfile(p)) return 'base'
  const sorted = Object.keys(p.mazeProfile).sort().map((k) => [k, p.mazeProfile[k]])
  return createHash('sha1').update(JSON.stringify([sorted, p.mazeProfileHold ?? HOLD_DEFAULT])).digest('hex').slice(0, 12)
}

/** Params merged over the AV binding by the harness (episode world builder) / extraParams of the proxy. */
export function profileParams(p: Profile): Record<string, unknown> {
  return isBaseProfile(p) ? {} : { mazeProfile: p.mazeProfile, mazeProfileHold: p.mazeProfileHold ?? HOLD_DEFAULT }
}
export function proxyExtra(p: Profile): Record<string, unknown> {
  return isBaseProfile(p) ? { mazeProfile: undefined } : profileParams(p)
}

export interface MutCfg { pOn: number; pOff: number; pVal: number; sigma: number; pHold: number; sigmaHold: number; initSpread: number }
export const DEFAULT_MUT: MutCfg = { pOn: 0.04, pOff: 0.08, pVal: 0.15, sigma: 0.12, pHold: 0.15, sigmaHold: 0.12, initSpread: 0.25 }

export function mutate(g: Genome, rng: Rng, cfg: MutCfg = DEFAULT_MUT, strength = 1): Genome {
  const out: Genome = { on: [...g.on], v: [...g.v], h: g.h }
  for (let i = 0; i < out.on.length; i++) {
    if (out.on[i]) {
      if (rng.next() < cfg.pOff * strength) { out.on[i] = false; continue }
      if (rng.next() < cfg.pVal * strength) out.v[i] = reflect(out.v[i]! + gaussian(rng) * cfg.sigma)
    } else if (rng.next() < cfg.pOn * strength) {
      out.on[i] = true
      out.v[i] = reflect(out.v[i]! + gaussian(rng) * cfg.initSpread)
    }
  }
  if (rng.next() < cfg.pHold * strength) out.h = reflect(out.h + gaussian(rng) * cfg.sigmaHold)
  return out
}

/** Uniform crossover per key (on flag and value travel together) + hold from a random parent. */
export function crossover(a: Genome, b: Genome, rng: Rng): Genome {
  const pick = a.on.map(() => rng.next() < 0.5)
  return { on: a.on.map((_, i) => (pick[i] ? a.on[i]! : b.on[i]!)), v: a.v.map((_, i) => (pick[i] ? a.v[i]! : b.v[i]!)), h: rng.next() < 0.5 ? a.h : b.h }
}

export const activeKeys = (g: Genome): number => g.on.filter(Boolean).length
