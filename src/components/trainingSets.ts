/**
 * Training-set descriptors of the shared training dialog (`MazeTrainingDialog`): the tabs "Mazes", "Crux" and
 * "Widen-freeze" of ONE merged panel (File → "Training…") are the SAME parameterized view — the descriptor
 * carries everything per-set (worlds list, car ids, watch labels, tile / badge texts) so the component file
 * exports only the component (react-refresh) and the sets cannot drift apart. Shared contract with the world
 * builders: `src/policyEvolution/mazeTraining.ts` + `cruxTraining.ts` + `wfCandidates.ts` (the wf worlds:
 * `wfCandidateWorlds.ts`).
 */
import { MAZE_TRAINING_WORLDS, mazeCarId, type MazeTrainingMeta } from '@/policyEvolution/mazeTraining'
import { CRUX_TRAINING_WORLDS, cruxCarId, cruxTrainingInfo, type CruxTrainingMeta } from '@/policyEvolution/cruxTraining'
import {
  wfCarId,
  wfTrainingWorldViews,
  type WfTrainingMeta,
} from '@/policyEvolution/wfCandidates'

/** Meta.json of any training set (the shared dialog reads the common fields; the per-set helpers narrow the rest). */
export type TrainingMeta = MazeTrainingMeta | CruxTrainingMeta | WfTrainingMeta

/** One world row of a training set (the parameterized view of a spec: id, name and the secondary info chip). */
export interface TrainingWorldView {
  id: string
  name: string
  /** secondary info on the row (maze: "seed 2001"; crux: "NC1 fast corner · occluded · west") */
  info: string
}

/**
 * One training set the shared panel serves ("Training Mazes" / "Training Crux"): the worlds list, the per-copy car ids,
 * the in-world score stage's watch labels and the per-set tile / badge texts. Everything else (panel chrome, drag /
 * resize, candidate chips, live overlay, totals) is shared. `key` prefixes the localStorage slots (positions of the two
 * panels are independent), `testid` prefixes every data-testid (`${testid}-training-...`).
 */
export interface TrainingSet {
  key: 'maze' | 'crux' | 'wf'
  /** panel title and aria label ("Training Mazes" / "Training Crux") */
  title: string
  /** tab label of the merged training dialog's tab bar ("Mazes" / "Crux" / "Widen-freeze") */
  tab: string
  testid: 'maze' | 'crux' | 'wf'
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
}

const isMazeMeta = (meta: TrainingMeta): meta is MazeTrainingMeta => 'seed' in meta
const isCruxMeta = (meta: TrainingMeta): meta is CruxTrainingMeta => 'setupKey' in meta && !('kind' in meta)
const isWfMeta = (meta: TrainingMeta): meta is WfTrainingMeta => 'kind' in meta

/** "3 ways · 1 reversed"; null when an older meta.json predates the routes field. */
function routesLabel(meta: MazeTrainingMeta): string | null {
  const routes = meta.routes
  if (!routes || typeof routes.forward !== 'number') return null
  const reversed = typeof routes.reversed === 'number' ? routes.reversed : 0
  return `${routes.forward} ways · ${reversed} reversed`
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
}

/**
 * The widen-freeze candidate worlds set: the holdout setups of the eval band (wf_<kind>_<n>, the pipeline-A final
 * H=32 baked in), one tile per chain; the candidate chips (candidates.json: WF32 / WF24 / later stretches) swap the
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
}

/**
 * All training sets of the merged training dialog (File → "Training…"), in tab-bar order: Mazes / Crux /
 * Widen-freeze. The Builder mounts ONE dialog; its tab bar switches the active set via `trainingSetByKey`.
 */
export const TRAINING_SETS: TrainingSet[] = [MAZE_TRAINING_SET, CRUX_TRAINING_SET, WF_TRAINING_SET]

/** The training set of a tab key (the merged dialog's active tab; unknown keys fall back to the mazes). */
export function trainingSetByKey(key: TrainingSet['key']): TrainingSet {
  return TRAINING_SETS.find((set) => set.key === key) ?? MAZE_TRAINING_SET
}
