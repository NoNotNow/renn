/**
 * Widen-freeze candidate manifest + world naming (app-safe, no node imports): the trained widen-freeze
 * candidates (public/policy-evolution/wf-candidates.json — pipeline-A final H=32, warm baseline H=24, later
 * stretches) drive the exported holdout worlds `wf_<kind>_<n>` (one per kind x holdout setup of the eval
 * band) and the candidate chips of the training dialogs (export-maze-candidates.ts merges them into
 * candidates.json). The worlds are reachable through the Widen-freeze tab of the merged training dialog only
 * (File -> "Training…" -> tab "Widen-freeze") — never through the generic Example Worlds menu.
 *
 * The node-side world builder + exporter: wfCandidateWorlds.ts / tools/renn-mcp/export-wf-candidate-example-worlds.ts.
 */

import type { RennWorld } from '@/types/world'
import { V3_KINDS } from './courses'
import { POLICY_CAR_ID } from './episode'

/** Kinds exported per candidate: the widen-freeze kinds (where final and baseline differ most) + the key originals + the obstacle-fluency detour kinds (blockade / blocks, commit 8673d411). */
export const WF_CANDIDATE_KINDS: readonly string[] = ['rslalom', 'deadend', 'gates', 'dense', 'maze', 'crux', 'bay', 'crowd', 'free', 'blockade', 'blocks']

/**
 * The CHIP / SHIP kind set (user decision 2026-10-15, critic rounds 6-7): the kinds every chip candidate is
 * TRAINED, EVALUATED and shipped on — all v3 kinds EXCEPT the two detour kinds. `blockade`: direct-line finish
 * rates sit at ~0 (the detour never was learned — T1 round-5 fired at gen 800, meanProg 0.266; ~900 gens of
 * pursuit, three geometries), and a ~0 kind would poison the weakest-link lex-min of every future training
 * warm-started from the chip. `blocks`: dropped at the ship decision (user 2026-10-15) — partial at 8 %
 * (17 -> 12 -> 8 -> 8 % over the recovery chunks), out of the clean 13-kind ship band (= S4's kind set, on the
 * harder loosened courses; wf40 g423 mean 92.6 % vs S4's 90.9 % there). The DIALOG world rows keep BOTH
 * (`WF_CANDIDATE_KINDS` above, informational rows + the exported wf_* worlds stay). Both remain parked for the
 * FITNESS-SHAPING revisit (see ESCALATION.md / the RESULTS block).
 */
export const WF_CHIP_KINDS: readonly string[] = V3_KINDS.filter((kind) => kind !== 'blockade' && kind !== 'blocks')

/** Holdout setups per kind — the same band the powered evals report on (holdoutV3Episodes(3, kinds)). */
export const WF_HOLDOUTS_PER_KIND = 3

/** One manifest entry (see public/policy-evolution/wf-candidates.json). */
export interface WfCandidateManifestEntry {
  /** Stable chip id in the training dialogs (also the localStorage key of the dialog selection). */
  id: string
  /** Human label of the candidate (notes, tooltips). */
  label: string
  /** Short chip label in the training dialogs (defaults to `label`). */
  chipLabel?: string
  /** Repo-relative genome file ({ genome } / { best: { genome } } / { epochBest: { genome } }); skipped while missing. */
  genome: string
  /** Generation of the genome (null while unknown, e.g. a stretch still training). */
  gen: number | null
  /** Expected hidden size; the exporter throws when the genome disagrees. */
  hidden?: number
  /** Tooltip line of the chip (provenance + headline holdout numbers). */
  detail?: string
  /** When true the exported wf_* worlds bake this candidate's genome in (the deployed default of the dialog). */
  bakeWorlds?: boolean
}

/** Shape of `public/policy-evolution/wf-candidates.json`. */
export interface WfCandidatesManifest {
  schema: string
  candidates: WfCandidateManifestEntry[]
}

/** Example-world folder id of kind x holdout setup (`wf_<kind>_<n>`) — the dialog loads these, the global menu hides them. */
export const wfWorldId = (kind: string, setupIndex: number): string => `wf_${kind}_${setupIndex}`

/** True for the exported widen-freeze candidate world ids (excluded from the generic Example Worlds menu). */
export const isWfCandidateWorldId = (id: string): boolean => /^wf_[a-z]+_\d+$/.test(id)

/** True for the ids of the FIRST export round (per-candidate worlds `wf32_final_*` / `wf24_base_*`, now retired). */
export const isLegacyWfCandidateWorldId = (id: string): boolean => /^wf\d+_(?:[a-z][a-z0-9]*_)+\d+$/.test(id)

/** Car entity id of chain copy i — the same id scheme as the maze training worlds (focus target + live watch). */
export const wfCarId = (i: number): string => `${POLICY_CAR_ID}_${i}`

/** meta.json of a wf candidate world (the shared training dialog reads the common fields; `kind` is the set discriminant). */
export interface WfTrainingMeta {
  id: string
  /** setup kind of the world (discriminant of the shared dialog's per-set helpers). */
  kind: string
  /** holdout setup key (`<kind>:<seed>~<variant>`) — the SAME setups the powered evals report on. */
  setupKey: string
  /** 1-based holdout setup index (the `_n` id suffix). */
  setupIndex: number
  name: string
  candidate: { label: string; gen?: number | null }
  /** best headless score of the baked candidate on this setup (max over all chain cars; points = chain progress in m); null until measured */
  bestScore: number | null
  /** number of chain copies (one car per chain — the dialog's tile count) */
  chains: number
  /**
   * Dialog tile data, aligned with the tile order (one chain per tile): `w`/`h` = the shared pixel size of every
   * route_<i>.svg, `pts` = that chain's polyline in svg pixel space (the dialog overlays the live vector on it),
   * `score` = the chain's own headless progress score.
   */
  tileSvg?: { w: number; h: number; routes: Array<{ pts: Array<[number, number]>; score: number | null }> }
}

/**
 * Focuses the wf world on chain `routeIndex`'s car (camera + visualize target; no score stage to gate — the
 * worlds carry none, so unlike focusMazeRoute there is nothing else to switch).
 */
export function focusWfWorldRoute(world: RennWorld, routeIndex: number): RennWorld {
  const car = wfCarId(routeIndex)
  const w = JSON.parse(JSON.stringify(world)) as RennWorld & { world: { camera: { target?: string }; debugTargetLineEntityId?: string } }
  w.world.camera.target = car
  w.world.debugTargetLineEntityId = car
  return w
}

/** World rows of the Widen-freeze Worlds training set (id / name / info of every kind x holdout setup). */
export function wfTrainingWorldViews(): Array<{ id: string; name: string; info: string }> {
  const views: Array<{ id: string; name: string; info: string }> = []
  for (const kind of WF_CANDIDATE_KINDS) {
    for (let n = 1; n <= WF_HOLDOUTS_PER_KIND; n++) {
      views.push({ id: wfWorldId(kind, n), name: `WF ${kind} ${n}`, info: `widen-freeze holdout ${n} of ${WF_HOLDOUTS_PER_KIND}` })
    }
  }
  return views
}
