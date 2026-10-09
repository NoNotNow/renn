import { CHAIN_KINDS, parseCourseKey, type CourseKind } from './courses'
import { parseChainEpisodeKey } from './chains'
import type { PolicyEpisodeMetrics } from './episode'
import { GENOME_LENGTH, GENOME_LENGTH_V2, padV1Genome } from './policy'

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

/** A genome from a policy file ({ genome } like shippedPolicy.json, or a run file with { best: { genome } }), as a v2 genome (v1 ones are padded). */
export function v2GenomeFromFile(json: { genome?: number[]; best?: { genome: number[] } }): number[] {
  const g = json.genome ?? json.best?.genome
  if (!g) throw new Error('no genome in file (expected { genome } or { best: { genome } })')
  if (g.length === GENOME_LENGTH_V2) return g.slice()
  if (g.length === GENOME_LENGTH) return padV1Genome(g)
  throw new Error(`genome of ${g.length} numbers is neither v1 (${GENOME_LENGTH}) nor v2 (${GENOME_LENGTH_V2})`)
}

/** `--kinds field,crowd` -> kinds (validated against `allowed`); undefined -> all allowed. */
export function parseKinds(arg: string | true | undefined, allowed: readonly CourseKind[]): CourseKind[] {
  if (arg === undefined || arg === true) return [...allowed]
  const kinds = arg.split(',').map((s) => s.trim()).filter(Boolean)
  for (const k of kinds) if (!allowed.includes(k as CourseKind)) throw new Error(`unknown kind ${k} (allowed: ${allowed.join(', ')})`)
  return kinds as CourseKind[]
}
