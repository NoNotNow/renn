import { CHAIN_KINDS, parseCourseKey, V3_KINDS, type CourseKind } from './courses'
import { parseChainEpisodeKey } from './chains'
import type { PolicyEpisodeMetrics } from './episode'
import { GENOME_LENGTH, hiddenOfLength, N_IN_V2, padV1Genome } from './policy'

export interface KindChainReport {
  kind: CourseKind
  chains: number
  finished: number
  /** finished / chains */
  finishRate: number
  setups: number
  /** setups whose chains ALL finished */
  setupsAllFinished: number
  /** setupsAllFinished / setups */
  allFinishedShare: number
  offcourse: number
  crashes: number
}

/** Per setup kind: chain finish rate, share of setups with all chains finished, offcourse and crash counts (metrics of chain episodes). */
export function chainReportByKind(metrics: Array<Pick<PolicyEpisodeMetrics, 'key' | 'outcome'>>, kinds: readonly CourseKind[] = CHAIN_KINDS): KindChainReport[] {
  const out: KindChainReport[] = []
  for (const kind of kinds) {
    const of = metrics.filter((m) => parseCourseKey(parseChainEpisodeKey(m.key).setupKey).kind === kind)
    if (!of.length) continue
    const bySetup = new Map<string, boolean>()
    for (const m of of) {
      const s = parseChainEpisodeKey(m.key).setupKey
      bySetup.set(s, (bySetup.get(s) ?? true) && m.outcome === 'finish')
    }
    const finished = of.filter((m) => m.outcome === 'finish').length
    const all = [...bySetup.values()].filter(Boolean).length
    out.push({
      kind,
      chains: of.length,
      finished,
      finishRate: finished / of.length,
      setups: bySetup.size,
      setupsAllFinished: all,
      allFinishedShare: all / bySetup.size,
      offcourse: of.filter((m) => m.outcome === 'offcourse').length,
      crashes: of.filter((m) => m.outcome === 'crash').length,
    })
  }
  return out
}

export const formatChainReport = (r: KindChainReport[]): string =>
  r.map((k) => `${k.kind} chains ${k.finished}/${k.chains} (${(100 * k.finishRate).toFixed(0)} %), all-finished setups ${k.setupsAllFinished}/${k.setups}, offcourse ${k.offcourse}, crashes ${k.crashes}`).join('; ')

/** A genome from a policy file ({ genome } like shippedPolicy.json, or a run file with { best: { genome } }), as a v2 genome (v1 ones are padded; any v2 hidden size H, len = 27 H + 2). */
export function v2GenomeFromFile(json: { genome?: number[]; best?: { genome: number[] } }): number[] {
  const g = json.genome ?? json.best?.genome
  if (!g) throw new Error('no genome in file (expected { genome } or { best: { genome } })')
  if (hiddenOfLength(g.length, N_IN_V2)) return g.slice()
  if (g.length === GENOME_LENGTH) return padV1Genome(g)
  throw new Error(`genome of ${g.length} numbers is neither v1 (${GENOME_LENGTH}) nor v2 (27 H + 2)`)
}

/** `--kinds field,crowd` -> kinds (validated against `allowed`); undefined -> all allowed. */
export function parseKinds(arg: string | true | undefined, allowed: readonly CourseKind[]): CourseKind[] {
  if (arg === undefined || arg === true) return [...allowed]
  const kinds = arg.split(',').map((s) => s.trim()).filter(Boolean)
  for (const k of kinds) if (!allowed.includes(k as CourseKind)) throw new Error(`unknown kind ${k} (allowed: ${allowed.join(', ')})`)
  return kinds as CourseKind[]
}

/** hidden size of a v2 genome (for printing) */
export const v2Hidden = (g: ArrayLike<number>): number => hiddenOfLength(g.length, N_IN_V2)

export interface KindV3Report extends KindChainReport {
  /** share of the simulated time spent driving backwards (time-weighted over the episodes of the kind) */
  reverseShare: number
  /** longest distance (m) driven backwards in one go, over the episodes of the kind */
  maxReverseM: number
  /** episodes of the kind in which the car drove backwards at all (>= 1 m in one go) */
  reversedEpisodes: number
}

/**
 * v3 report per kind (free, bay, corridor, field, slalom, maze, crowd): the chain report plus REVERSE USAGE (share of time driving backwards, max reverse distance),
 * so a net that never reverses is visible at a glance.
 */
export function v3ReportByKind(
  metrics: Array<Pick<PolicyEpisodeMetrics, 'key' | 'outcome' | 'timeS' | 'reverseShare' | 'maxReverseM'>>,
  kinds: readonly CourseKind[] = V3_KINDS,
): KindV3Report[] {
  return chainReportByKind(metrics, kinds).map((r) => {
    const of = metrics.filter((m) => parseCourseKey(parseChainEpisodeKey(m.key).setupKey).kind === r.kind)
    const time = of.reduce((a, m) => a + m.timeS, 0)
    return {
      ...r,
      reverseShare: time > 0 ? of.reduce((a, m) => a + (m.reverseShare ?? 0) * m.timeS, 0) / time : 0,
      maxReverseM: of.reduce((a, m) => Math.max(a, m.maxReverseM ?? 0), 0),
      reversedEpisodes: of.filter((m) => (m.maxReverseM ?? 0) >= 1).length,
    }
  })
}

export const formatV3Report = (r: KindV3Report[]): string =>
  r
    .map((k) => `${k.kind} ${k.finished}/${k.chains} (${(100 * k.finishRate).toFixed(0)} %) all-finished ${k.setupsAllFinished}/${k.setups} offc ${k.offcourse} crash ${k.crashes} | REVERSE ${(100 * k.reverseShare).toFixed(0)} % of time, max ${k.maxReverseM.toFixed(0)} m, ${k.reversedEpisodes}/${k.chains} eps`)
    .join('\n    ')
