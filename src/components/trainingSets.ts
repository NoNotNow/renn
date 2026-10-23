/**
 * Training-set descriptors of the training section of the right sidebar (`MazeTrainingDialog`): the tabs
 * "Mazes", "Crux" and "Widen-freeze" of ONE merged section (File → "Training…" focuses it) are the SAME
 * parameterized view — the descriptor carries everything per-set (worlds list, car ids, watch labels, tile /
 * badge texts) so the component file exports only the component (react-refresh) and the sets cannot drift
 * apart. Shared contract with the world builders: `src/policyEvolution/mazeTraining.ts` + `cruxTraining.ts`
 * + `wfCandidates.ts` (the wf worlds: `wfCandidateWorlds.ts`).
 */
import type { RennWorld } from '@/types/world'
import { MAZE_TRAINING_WORLDS, focusMazeRoute, mazeCarId, type MazeTrainingMeta } from '@/policyEvolution/mazeTraining'
import { CRUX_TRAINING_WORLDS, cruxCarId, cruxTrainingInfo, focusCruxChain, type CruxTrainingMeta } from '@/policyEvolution/cruxTraining'
import {
  focusWfWorldRoute,
  wfCarId,
  wfTrainingWorldViews,
  type WfTrainingMeta,
} from '@/policyEvolution/wfCandidates'
import {
  applySchlauCandidate,
  focusSchlauGoal,
  SCHLAU_TRAINING_WORLDS,
  schlauCarId,
  schlauTrainingMeta,
} from '@/policyEvolution/schlauTraining'
import { fetchSchlauCandidates } from '@/policyEvolution/schlauCandidates'
import {
  focusSchlauMazeRoute,
  SCHLAU_MAZE_WORLDS,
  schlauMazeCarId,
  type SchlauMazeTrainingMeta,
} from '@/policyEvolution/schlauMaze'
import type { MazeCandidate, MazeCandidatesFile } from '@/policyEvolution/mazeCandidates'

/** Meta.json of any training set (the shared dialog reads the common fields; the per-set helpers narrow the rest). */
export type TrainingMeta =
  | MazeTrainingMeta
  | CruxTrainingMeta
  | WfTrainingMeta
  | ReturnType<typeof schlauTrainingMeta>
  | SchlauMazeTrainingMeta

/** One world row of a training set (the parameterized view of a spec: id, name and the secondary info chip). */
export interface TrainingWorldView {
  id: string
  name: string
  /** secondary info on the row (maze: "seed 2001"; crux: "NC1 fast corner · occluded · west") */
  info: string
}

/**
 * One training set the shared section serves ("Training Mazes" / "Training Crux"): the worlds list, the
 * per-copy car ids, the in-world score stage's watch labels and the per-set tile / badge texts. Everything
 * else (section chrome, candidate chips, live overlay, totals) is shared. `key` prefixes the localStorage
 * slots (the candidate slot is per set), `testid` prefixes every data-testid (`${testid}-training-...`).
 */
export interface TrainingSet {
  key: 'maze' | 'crux' | 'wf' | 'schlau' | 'schlauMaze'
  /** panel title and aria label ("Training Mazes" / "Training Crux") */
  title: string
  /** tab label of the merged training dialog's tab bar ("Mazes" / "Crux" / "Widen-freeze" / "Schlau") */
  tab: string
  testid: 'maze' | 'crux' | 'wf' | 'schlau' | 'schlauMaze'
  worlds: TrainingWorldView[]
  /** car entity id of copy i (mazeCarId / cruxCarId — the live watch + focus target) */
  carId: (copy: number) => string
  /** the in-world score stage's watch labels (live score + live chain segment) */
  watch: { score: string; seg: string }
  /** number of per-copy tiles of a world (maze: forward + reversed routes; crux: base + jittered chains); 0 = no tiles */
  tileCount: (meta: TrainingMeta) => number
  /** texts of tile i: name ("Way 1" / "Chain 1"), short ("(fwd)" / "(base)"), long ("reversed" / "jittered variant") */
  tileText: (meta: TrainingMeta, i: number) => { name: string; short: string; long: string }
  /** row badge after best/worst (maze: "3 ways · 1 reversed"; crux: "6 chains"); null = no badge */
  badge: (meta: TrainingMeta) => string | null
  /** noun of the weakest-link label and the tile title ("way" / "chain") */
  noun: string
  /** focuses the loaded world on copy `routeIndex` (camera target + visualize line: focusMazeRoute / focusCruxChain / focusWfWorldRoute) */
  focus: (world: RennWorld, routeIndex: number) => RennWorld
  /** uiLogger.select label of the "load into builder" action */
  loadLogLabel: string
  /**
   * Per-set candidate models (the dialog's model dropdown + the Builder's weight swap). Absent = the shared v3
   * candidates file (candidates.json + applyTrainingCandidate). The schlau sets carry their own file
   * (schlau-candidates.json) and their own swap (applySchlauCandidate) — schlau genomes are NOT v3-shaped, and the
   * swap accepts BOTH schlau nets (1-layer fallback and deep 'schlau2', schlauDeep.ts: the stage code is
   * dual-mode, the disjoint length sets make the net unambiguous; applySchlauCandidate refuses a deep candidate
   * only for a stage that predates the deep support).
   */
  candidates?: {
    fetch: (baseUrl: string) => Promise<MazeCandidatesFile | null>
    apply: (world: RennWorld, candidate: MazeCandidate) => RennWorld
  }
}

const isMazeMeta = (meta: TrainingMeta): meta is MazeTrainingMeta => 'seed' in meta
const isCruxMeta = (meta: TrainingMeta): meta is CruxTrainingMeta => 'setupKey' in meta && !('kind' in meta)
const isWfMeta = (meta: TrainingMeta): meta is WfTrainingMeta => 'kind' in meta

/**
 * Routes block of the maze-shaped metas (maze + schlau maze): forward + reversed route counts; null when an
 * older meta.json predates the routes field. One place for the discrimination so the maze and schlau maze sets
 * cannot drift apart.
 */
function metaRoutes(meta: TrainingMeta): { forward: number; reversed: number } | null {
  if (!('routes' in meta)) return null
  const routes = meta.routes
  if (!routes || typeof routes.forward !== 'number') return null
  return { forward: routes.forward, reversed: typeof routes.reversed === 'number' ? routes.reversed : 0 }
}

/** "3 ways · 1 reversed"; null when an older meta.json predates the routes field. */
function routesLabel(meta: TrainingMeta): string | null {
  const routes = metaRoutes(meta)
  return routes ? `${routes.forward} ways · ${routes.reversed} reversed` : null
}

/** The training-maze set: the ten maze worlds, forward + reversed route tiles, "way" wording. */
export const MAZE_TRAINING_SET: TrainingSet = {
  key: 'maze',
  title: 'Training Mazes',
  tab: 'Mazes',
  testid: 'maze',
  worlds: MAZE_TRAINING_WORLDS.map((spec) => ({ id: spec.id, name: spec.name, info: `seed ${spec.seed}` })),
  carId: mazeCarId,
  watch: { score: 'maze.score', seg: 'maze.seg' },
  tileCount: (meta) => (isMazeMeta(meta) ? (meta.routes?.forward ?? 0) + (meta.routes?.reversed ?? 0) : 0),
  tileText: (meta, i) => {
    const reversed = isMazeMeta(meta) && i >= (meta.routes?.forward ?? 0)
    return { name: `Way ${i + 1}`, short: reversed ? '(rev)' : '(fwd)', long: reversed ? 'reversed' : 'forward' }
  },
  badge: (meta) => (isMazeMeta(meta) ? routesLabel(meta) : null),
  noun: 'way',
  focus: focusMazeRoute,
  loadLogLabel: 'Load training maze into builder',
}

/** The training-crux set: the 25 crux band worlds, base + jittered chain tiles, "chain" wording. */
export const CRUX_TRAINING_SET: TrainingSet = {
  key: 'crux',
  title: 'Training Crux',
  tab: 'Crux',
  testid: 'crux',
  worlds: CRUX_TRAINING_WORLDS.map((spec) => ({ id: spec.id, name: spec.name, info: cruxTrainingInfo(spec) })),
  carId: cruxCarId,
  watch: { score: 'crux.score', seg: 'crux.seg' },
  tileCount: (meta) => (isCruxMeta(meta) ? (meta.chains?.base ?? 0) + (meta.chains?.jittered ?? 0) : 0),
  tileText: (_meta, i) =>
    i === 0
      ? { name: `Chain ${i + 1}`, short: '(base)', long: 'base path' }
      : { name: `Chain ${i + 1}`, short: '(jitter)', long: 'jittered variant' },
  badge: (meta) => (isCruxMeta(meta) && meta.chains ? `${meta.chains.base + meta.chains.jittered} chains` : null),
  noun: 'chain',
  focus: focusCruxChain,
  loadLogLabel: 'Load training crux into builder',
}

/**
 * The widen-freeze candidate worlds set: the holdout setups of the eval band (wf_<kind>_<n>, the R40 recovery
 * ship baked in), one tile per chain; the candidate chips (candidates.json: R40 / WF32 / WF24 / later stretches) swap the
 * driving net at load time. Car ids + world loading go through the same paths as the maze set; the worlds carry no
 * score stage (live score stays "-", the headless tile scores come from meta.json).
 */
export const WF_TRAINING_SET: TrainingSet = {
  key: 'wf',
  title: 'Widen-freeze Worlds',
  tab: 'Widen-freeze',
  testid: 'wf',
  worlds: wfTrainingWorldViews(),
  carId: wfCarId,
  watch: { score: 'wf.score', seg: 'wf.seg' },
  tileCount: (meta) => (isWfMeta(meta) ? meta.chains : 0),
  tileText: (_meta, i) => ({ name: `Chain ${i + 1}`, short: '(v3)', long: 'v3 chain of this holdout setup' }),
  badge: (meta) => (isWfMeta(meta) ? `${meta.chains} chains · ${meta.setupKey}` : null),
  noun: 'chain',
  focus: focusWfWorldRoute,
  loadLogLabel: 'Load widen-freeze world into builder',
}

/**
 * The schlau training set: the twenty schlau worlds (all `goal_box` arena mazes and the `goal_wall` gate runs since
 * 2026-10-23, plus the `goal_turn` dead-end shunt rotation tier of handoff 2026-10-23 Task 1 — the empty open
 * ground teaches nothing beyond driving at the goal), ONE task per world (start → goal, the geodesic path as the
 * single tile), "goal" wording. Its candidate dropdown reads the schlau candidates file and swaps the schlau
 * drive stage's weights (applySchlauCandidate).
 */
export const SCHLAU_TRAINING_SET: TrainingSet = {
  key: 'schlau',
  title: 'Training Schlau',
  tab: 'Schlau',
  testid: 'schlau',
  worlds: SCHLAU_TRAINING_WORLDS.map((spec) => ({
    id: spec.id,
    name: spec.name,
    info: `${spec.kind === 'goal_wall' ? 'wall' : spec.kind === 'goal_turn' ? 'turn' : 'box'} · seed ${spec.seed}`,
  })),
  carId: schlauCarId,
  watch: { score: 'schlau.score', seg: 'schlau.seg' },
  tileCount: () => 1,
  tileText: () => ({ name: 'Goal', short: '(start → goal)', long: 'shortest vector path to the goal' }),
  badge: (meta) => ('kind' in meta && meta.kind !== 'goal_open' ? meta.kind.slice('goal_'.length) : null),
  noun: 'goal',
  focus: focusSchlauGoal,
  loadLogLabel: 'Load schlau training world into builder',
  candidates: { fetch: fetchSchlauCandidates, apply: (world, candidate) => applySchlauCandidate(world, candidate.genome) },
}

/**
 * The schlau maze set: the ten maze-bridge worlds (`schlau_maze_1..10` — the SAME maze geometry + routes as the
 * v3 maze worlds, one schlau car per route copy driving its chain through the waypoint-sequential goal feed),
 * forward + reversed route tiles, "way" wording like the maze set. ANY schlau model drives ANY maze task: the
 * candidate dropdown reads the SAME schlau candidates file as the schlau set and `applySchlauCandidate` swaps
 * EVERY `schlau_drive_*` stage of the loaded world (one per route copy) to the picked genome.
 */
export const SCHLAU_MAZE_TRAINING_SET: TrainingSet = {
  key: 'schlauMaze',
  title: 'Schlau Mazes',
  tab: 'Schlau Mazes',
  testid: 'schlauMaze',
  worlds: SCHLAU_MAZE_WORLDS.map((spec) => ({ id: spec.id, name: spec.name, info: `seed ${spec.seed}` })),
  carId: schlauMazeCarId,
  watch: { score: 'schlau.score', seg: 'schlau.seg' },
  tileCount: (meta) => {
    const routes = metaRoutes(meta)
    return routes ? routes.forward + routes.reversed : 0
  },
  tileText: (meta, i) => {
    const routes = metaRoutes(meta)
    const reversed = routes != null && i >= routes.forward
    return { name: `Way ${i + 1}`, short: reversed ? '(rev)' : '(fwd)', long: reversed ? 'reversed' : 'forward' }
  },
  badge: (meta) => routesLabel(meta),
  noun: 'way',
  focus: focusSchlauMazeRoute,
  loadLogLabel: 'Load schlau maze world into builder',
  candidates: { fetch: fetchSchlauCandidates, apply: (world, candidate) => applySchlauCandidate(world, candidate.genome) },
}

/**
 * All training sets of the merged training dialog (File → "Training…"), in tab-bar order: Mazes / Crux /
 * Widen-freeze (the renn car) and Schlau / Schlau Mazes (the schlau car). The Builder mounts ONE dialog; the
 * car's tab bar switches the active set via `trainingSetByKey`.
 */
export const TRAINING_SETS: TrainingSet[] = [
  MAZE_TRAINING_SET,
  CRUX_TRAINING_SET,
  WF_TRAINING_SET,
  SCHLAU_TRAINING_SET,
  SCHLAU_MAZE_TRAINING_SET,
]

/** The training set of a tab key (the merged dialog's active tab; unknown keys fall back to the mazes). */
export function trainingSetByKey(key: TrainingSet['key']): TrainingSet {
  return TRAINING_SETS.find((set) => set.key === key) ?? MAZE_TRAINING_SET
}

/**
 * The training set a world id belongs to (world-id prefix: `crux_*` → crux, `wf_*` → widen-freeze, `schlau_maze_*` →
 * schlau mazes, `schlau_*` → schlau, everything else → the mazes, like the pre-seam Builder cascade). ONE place for
 * the discrimination so the Builder's load path never re-spells it.
 */
export function trainingSetOfWorldId(worldId: string): TrainingSet {
  if (worldId.startsWith('crux_')) return CRUX_TRAINING_SET
  if (worldId.startsWith('wf_')) return WF_TRAINING_SET
  if (worldId.startsWith('schlau_maze_')) return SCHLAU_MAZE_TRAINING_SET
  if (worldId.startsWith('schlau_')) return SCHLAU_TRAINING_SET
  return MAZE_TRAINING_SET
}

/** The cars of the training dialog's car switch: `renn` (the v3/WF policy sets) and `schlau` (the schlau sets). */
export type TrainingCar = 'renn' | 'schlau'

/** The car switch's two positions (the dialog header renders one button per car). */
export const TRAINING_CARS: readonly { key: TrainingCar; label: string }[] = [
  { key: 'renn', label: 'Renn' },
  { key: 'schlau', label: 'Schlau' },
]

/**
 * The car a training set belongs to (the schlau sets — "Schlau" and "Schlau Mazes" — are the schlau car; everything
 * else is the renn car).
 */
export function trainingCarOfSet(key: TrainingSet['key']): TrainingCar {
  return key === 'schlau' || key === 'schlauMaze' ? 'schlau' : 'renn'
}

/**
 * The training sets of one car (that car's tab bar; a car with a single set renders it without tabs).
 */
export function trainingSetsOfCar(car: TrainingCar): TrainingSet[] {
  return TRAINING_SETS.filter((set) => trainingCarOfSet(set.key) === car)
}

/**
 * EVERY world id the training dialog's sets own — the SINGLE SOURCE of the File → "Example Worlds" menu exclusion:
 * the BuilderHeader hides these ids from BOTH menu sources (the build glob AND the dev agent-list merge; the two
 * feed one id list), while the worlds STAY on disk and load through the same example-world path the dialog uses.
 * Derived from `TRAINING_SETS` so a new set's worlds can never drift into the menu.
 */
export const TRAINING_SET_EXAMPLE_WORLD_IDS: ReadonlySet<string> = new Set(
  TRAINING_SETS.flatMap((set) => set.worlds.map((world) => world.id)),
)
