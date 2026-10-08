/** CLI helpers shared by run.ts and compare.ts: arg parsing, train / held-out spec sets, named profile resolution. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSourceWorld } from '../av-evolution/loadSource'
import type { EpSpec, Kind } from '../hunt-maze/episode'
import { buildSpecs } from '../hunt-maze/scenarios'
import type { Profile } from './genome'

export const HERE = path.dirname(fileURLToPath(import.meta.url))
export const DEFAULT_KINDS: Kind[] = ['solo', 'flee', 'flee-real']

export function parseArgs(argv: string[]): Record<string, string[]> {
  const o: Record<string, string[]> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (!a.startsWith('--')) throw new Error(`unexpected argument ${a}`)
    const nx = argv[i + 1]
    const v = nx !== undefined && !nx.startsWith('--') ? (i++, nx) : 'true'
    ;(o[a.slice(2)] ??= []).push(v)
  }
  return o
}

/** Train (heldOut=false) or held-out start set on the given world; `starts` = only the first N starts per maze. */
export function specSet(opts: { world?: string; kinds?: Kind[]; mazes?: string[]; starts?: number; heldOut?: boolean }): EpSpec[] {
  const src = loadSourceWorld(opts.world)
  const { specs } = buildSpecs(src, opts.kinds ?? DEFAULT_KINDS, opts.mazes, opts.heldOut ?? false)
  const n = opts.starts ?? 3
  return specs.filter((s) => Number(s.id.slice(-1)) <= n)
}

/** start poses of two spec lists never coincide (>= minDist m apart) */
export function disjointStarts(a: EpSpec[], b: EpSpec[], minDist = 12): boolean {
  return a.every((x) => b.every((y) => x.maze !== y.maze || Math.hypot(x.start.x - y.start.x, x.start.z - y.start.z) >= minDist))
}

/** name | path | best:<outDir>[:rank] -> {name, profile}. base => {mazeProfile:{}} ; seeds live in tools/hunt-profile-evo/seeds. */
export function resolveProfile(spec: string): { name: string; profile: Record<string, unknown> } {
  const eq = spec.indexOf('=')
  const name = eq > 0 ? spec.slice(0, eq) : spec
  const ref = eq > 0 ? spec.slice(eq + 1) : spec
  if (ref === 'base') return { name, profile: { mazeProfile: {} } }
  if (ref.startsWith('best:')) {
    const [, dir, rank] = ref.split(':')
    const b = JSON.parse(fs.readFileSync(path.join(dir!, 'best.json'), 'utf8')) as { top: Record<string, unknown>[] }
    const t = b.top[Number(rank ?? 0)]
    if (!t) throw new Error(`no feasible candidate #${rank ?? 0} in ${dir}/best.json`)
    return { name: eq > 0 ? name : `best-${(t.hash as string) ?? ''}`, profile: { mazeProfile: t.mazeProfile, mazeProfileHold: t.mazeProfileHold } }
  }
  const seedFile = path.join(HERE, 'seeds', `${ref}.json`)
  const file = fs.existsSync(seedFile) ? seedFile : ref
  if (!fs.existsSync(file)) throw new Error(`profile ${spec}: not base, not a seed (${seedFile}), not a file`)
  const j = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
  return { name, profile: j }
}

/** normalise any profile JSON (flat keys or {mazeProfile, mazeProfileHold}) to a Profile */
export function toProfile(j: Record<string, unknown>): Profile {
  const mp = (j.mazeProfile ?? Object.fromEntries(Object.entries(j).filter(([k]) => k !== 'mazeProfileHold'))) as Record<string, number>
  return { mazeProfile: mp, mazeProfileHold: typeof j.mazeProfileHold === 'number' ? j.mazeProfileHold : 3 }
}
