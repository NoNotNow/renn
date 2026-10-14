import { acceptedSetupKeys, capFieldDifficulty, parseChainEpisodeKey, v3EpisodeKeys, type SetupChains } from './chains'
import { parseCourseKey, withVariant, type CourseKind } from './courses'

/**
 * Failure-focus mode ("Crux-Fokus-Modus", see agent-context/focus-curriculum.md): when a diagnose run of the current
 * best shows individual setups failing, the trainer focuses EXCLUSIVELY on those setups — the passing ones are fully
 * ignored (not down-weighted) — until every chain of every focus setup finishes, and a driver (focus-curriculum.mjs)
 * then re-includes the full band for a validation window and keeps or rolls back the whole detour.
 *
 * The pure pieces live here (unit-tested in focusSetups.test.ts); run-islands.ts wires them behind `--focus-setups`.
 */

/**
 * Parses the `--focus-setups` flag: comma-separated SETUP keys (`crux:5`), CHAIN episode keys (`crux:5#0v3`,
 * `crux:1003~1#5v3` — the exact keys a diagnose `--list` / `--out` prints) or KIND tokens (`kind:rslalom:6` =
 * the first 6 accepted TRAIN setups of that kind — the widen-freeze phase-1 fitness: ONLY the new kinds, all their
 * chains), deduplicated in the order given. A chain key maps to its setup; a setup's focus means ALL its chains.
 * Garbage fails loud (parseCourseKey / parseChainEpisodeKey throw); a key of a kind outside `kinds` (the run's
 * `--kinds`) is refused — a focus set that silently trains kinds the run was not configured for is a mistake, not a
 * feature.
 */
export function parseFocusSetups(spec: string, kinds: readonly CourseKind[]): string[] {
  const out: string[] = []
  for (const raw of spec.split(',')) {
    const token = raw.trim()
    if (!token) continue
    if (token.startsWith('kind:')) {
      // `kind:<kind>:<perKind>`: the accepted TRAIN setups of that kind (canonical variant, seeds 1.. — exactly the
      // setups a trainV3Episodes band of that size holds)
      const parts = token.split(':')
      const kind = parts[1] as CourseKind
      const perKind = Number(parts[2])
      if (!(kinds as readonly string[]).includes(kind)) throw new Error(`--focus-setups: '${token}': kind '${kind}' is not a kind of this run (--kinds ${kinds.join(',')})`)
      if (!Number.isInteger(perKind) || perKind < 1) throw new Error(`--focus-setups: '${token}': the setup count must be a positive integer`)
      for (const key of acceptedSetupKeys(perKind, [kind], 1)) if (!out.includes(key)) out.push(key)
      continue
    }
    const setupKey = token.includes('#') ? parseChainEpisodeKey(token).setupKey : token
    const { kind } = parseCourseKey(setupKey)
    if (!kinds.includes(kind)) throw new Error(`--focus-setups: '${setupKey}' is of kind '${kind}', which is not a kind of this run (--kinds ${kinds.join(',')})`)
    if (!out.includes(setupKey)) out.push(setupKey)
  }
  if (!out.length) throw new Error(`--focus-setups: no setup keys in '${spec}'`)
  return out
}

/**
 * The setups of one focused generation: every focus setup with ALL its accepted chains, the same per-generation start
 * variant rotation and field cap as the normal v3 batch (only WHICH setups train changes, not how). A variant whose
 * jittered start loses the chain gates keeps the CANONICAL chains (exactly the `grp` fallback of v3Setups); a setup
 * without accepted canonical chains is refused loud — it would silently train on nothing.
 */
export function focusBatch(setups: readonly string[], variant: number | null): SetupChains[] {
  return setups.map((setupKey) => {
    const canonical = capFieldDifficulty(setupKey)
    const keys = v3EpisodeKeys(canonical)
    if (!keys.length) throw new Error(`--focus-setups: '${setupKey}' has no accepted chains (a setup the chain gates reject)`)
    if (variant === null) return { setupKey: canonical, keys }
    const rotated = capFieldDifficulty(withVariant(setupKey, variant))
    const rotatedKeys = v3EpisodeKeys(rotated)
    return rotatedKeys.length >= 2 ? { setupKey: rotated, keys: rotatedKeys } : { setupKey: canonical, keys }
  })
}

export interface FocusSetupPass {
  setupKey: string
  /** finished chains of the setup (of `chains`) */
  finished: number
  /** total chains of the setup (canonical variant, exactly the keys diagnose-v3 measures) */
  chains: number
}

export interface FocusPassReport {
  /** generation the pass was measured at (an epoch end) */
  gen: number
  set: string[]
  perSetup: FocusSetupPass[]
  /** every chain of every focus setup finished */
  allPass: boolean
}

/**
 * The focus exit criterion of one epoch end: which focus setups' chains finished, evaluated on the CANONICAL keys
 * (`focusBatch(setups, null)` — variant 0, the same episodes diagnose-v3 runs on the train split). A setup passes only
 * when ALL its chains finish; the phase exits when every focused setup passes. A missing metric counts as a failure
 * (safe direction: the phase keeps training).
 */
export function focusPassReport(metrics: Array<{ key: string; outcome: string }>, setups: readonly string[], gen: number): FocusPassReport {
  const finished = new Set(metrics.filter((m) => m.outcome === 'finish').map((m) => m.key))
  const perSetup = setups.map((setupKey) => {
    const keys = v3EpisodeKeys(setupKey)
    return { setupKey, finished: keys.filter((k) => finished.has(k)).length, chains: keys.length }
  })
  return { gen, set: [...setups], perSetup, allPass: perSetup.every((p) => p.chains > 0 && p.finished === p.chains) }
}
