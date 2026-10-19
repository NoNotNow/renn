/**
 * Widen-freeze candidate example worlds: the manifest's BAKED candidate (public/policy-evolution/
 * wf-candidates.json, `bakeWorlds: true` — currently the R40 recovery ship, H=40) driving the HOLDOUT setups of the kinds
 * where the candidates differ most, one world per kind x setup (`wf_<kind>_<n>`, n = 1..3 = the kind's first
 * accepted holdout seeds — the first 3 of the decision-grade eval band (eval-candidate.ts --holdout-per-kind 8) /
 * holdoutV3Episodes). Every chain of the setup drives in its own copy of the course (one car per chain, chain
 * markers above, reverse legs purple) — the same shape as the policy_v3_* worlds (buildPolicyChainsExampleWorld),
 * so what the user watches matches the reported per-kind numbers.
 *
 * The OTHER candidates (warm baseline, later stretches, every cycle candidate) drive the SAME worlds through
 * the training dialogs' model dropdown (export-maze-candidates.ts merges the manifest into candidates.json; the
 * Builder swaps params.w at load time, any hidden size). The worlds are reachable through the Widen-freeze Worlds dialog
 * only — the generic Example Worlds menu excludes them (wfCandidates.isWfCandidateWorldId).
 *
 * Node side only (reads the manifest + genome files from disk; the app-side naming/meta types live in
 * wfCandidates.ts). Exporter: tools/renn-mcp/export-wf-candidate-example-worlds.ts (world.json + meta.json +
 * route_<i>.svg tiles); disk==exporter gate: wfCandidateWorlds.test.ts.
 */
import { readFileSync } from 'node:fs'
import type { RennWorld } from '@/types/world'
import { acceptedSetupKeys, chainsForSetup, type Chain } from './chains'
import { buildSetupCourse, type Course, type CourseKind } from './courses'
import { buildPolicyChainsExampleWorld, ensureV3Inputs } from './exampleWorld'
import { hiddenOfLength, N_IN_V3 } from './policy'
import {
  WF_CANDIDATE_KINDS,
  WF_HOLDOUTS_PER_KIND,
  wfWorldId,
  type WfCandidateManifestEntry,
  type WfCandidatesManifest,
  type WfTrainingMeta,
} from './wfCandidates'

/** Manifest path (repo root relative; tests and tools run from the repo root). */
export const WF_CANDIDATES_MANIFEST_PATH = 'public/policy-evolution/wf-candidates.json'

/** One manifest entry with its resolved genome (skipped entries never reach this type; `genome` = the weights, not the file path). */
export interface WfCandidate extends Omit<WfCandidateManifestEntry, 'genome'> {
  /** Genome in the v3 26-input layout (legacy 24-input genomes zero-padded via ensureV3Inputs). */
  genome: number[]
}

/** Reads the manifest; entries whose genome file does not exist yet (a stretch still training) are skipped, not fatal. */
export function readWfCandidates(): WfCandidate[] {
  const manifest = JSON.parse(readFileSync(WF_CANDIDATES_MANIFEST_PATH, 'utf8')) as WfCandidatesManifest
  const out: WfCandidate[] = []
  for (const entry of manifest.candidates ?? []) {
    let genome: number[] | undefined
    try {
      const parsed = JSON.parse(readFileSync(entry.genome, 'utf8')) as { genome?: number[]; best?: { genome?: number[] }; epochBest?: { genome?: number[] } }
      genome = parsed.genome ?? parsed.epochBest?.genome ?? parsed.best?.genome
    } catch {
      genome = undefined // file not written yet (stretch still training) — skip silently
    }
    if (!genome || genome.length === 0) continue
    const padded = ensureV3Inputs(genome)
    const hidden = hiddenOfLength(padded.length, N_IN_V3)
    if (!hidden) throw new Error(`wf candidate ${entry.id}: genome of ${padded.length} numbers is not v3-shaped (29 H + 2)`)
    if (entry.hidden != null && entry.hidden !== hidden) throw new Error(`wf candidate ${entry.id}: genome is H=${hidden}, manifest says H=${entry.hidden}`)
    out.push({ ...entry, genome: padded })
  }
  return out
}

/** The candidate baked into the wf_* worlds (manifest `bakeWorlds: true`; defaults to the first resolvable entry). */
export function bakedWfCandidate(): WfCandidate {
  const candidates = readWfCandidates()
  const baked = candidates.find((c) => c.bakeWorlds)
  if (!baked) throw new Error(`${WF_CANDIDATES_MANIFEST_PATH}: no resolvable candidate with bakeWorlds: true`)
  return baked
}

/** The kind's exported holdout setup keys (first WF_HOLDOUTS_PER_KIND accepted seeds from 1001, variant 1 — the eval band). */
export function wfKindSetupKeys(kind: string): string[] {
  return acceptedSetupKeys(WF_HOLDOUTS_PER_KIND, [kind as CourseKind], 1001, 1)
}

/** Kinds of the exported worlds (manifest override per baked candidate is not supported — one shared list). */
export const wfWorldKinds = (): CourseKind[] => WF_CANDIDATE_KINDS as CourseKind[]

/** One exported world: kind x holdout setup, driven by the baked candidate. */
export interface WfCandidateWorldSpec {
  /** Example-world folder id: `wf_<kind>_<n>`. */
  id: string
  kind: CourseKind
  /** 1-based holdout setup index (matches the `_n` id suffix). */
  setupIndex: number
  setupKey: string
  /** the candidate baked into the world (the dialog's chips swap the others in at load time). */
  candidate: WfCandidate
}

/** Every world the manifest produces (the baked candidate x all kinds x the holdout band). */
export function wfCandidateWorldSpecs(): WfCandidateWorldSpec[] {
  const candidate = bakedWfCandidate()
  const specs: WfCandidateWorldSpec[] = []
  for (const kind of wfWorldKinds()) {
    wfKindSetupKeys(kind).forEach((setupKey, i) => {
      specs.push({ id: wfWorldId(kind, i + 1), kind, setupIndex: i + 1, setupKey, candidate })
    })
  }
  return specs
}

/** x half extent of the course + its chains (the copies sit next to each other on x). */
function worldSpacing(course: Course, chains: Chain[]): number {
  let maxAbsX = 10
  const acc = (x: number, half: number) => {
    maxAbsX = Math.max(maxAbsX, Math.abs(x) + half)
  }
  for (const b of course.boxes) {
    const rad = (b.yawDeg * Math.PI) / 180
    acc(b.at[0], (Math.abs(Math.cos(rad)) * b.size[0] + Math.abs(Math.sin(rad)) * b.size[1]) / 2)
  }
  for (const c of chains) for (const p of c.points) acc(p[0], 0)
  const start = course.startAt ?? [0, 0]
  acc(start[0], 0)
  return Math.ceil((2 * maxAbsX + 20) / 10) * 10
}

/** Third-person camera per kind (follows the first car; maze steep like policy_drive_maze, crux like the crux training worlds). */
const WF_KIND_CAMERA: Partial<Record<CourseKind, { distance: number; height: number }>> = {
  maze: { distance: 40, height: 60 },
  crux: { distance: 28, height: 16 },
  crowd: { distance: 30, height: 14 },
  free: { distance: 45, height: 40 },
}
const wfKindCamera = (kind: CourseKind): { distance: number; height: number } => WF_KIND_CAMERA[kind] ?? { distance: 40, height: 45 }

/** Copy spacing between the chain copies of one world (m) — also the tile frames' x offsets. */
export function wfWorldSpacing(spec: WfCandidateWorldSpec): number {
  return worldSpacing(buildSetupCourse(spec.setupKey), chainsForSetup(spec.setupKey))
}

/** Builds one candidate world: every chain of the holdout setup in its own copy, one car each, markers above. */
export function buildWfCandidateWorld(spec: WfCandidateWorldSpec): RennWorld {
  const course = buildSetupCourse(spec.setupKey)
  const chains = chainsForSetup(spec.setupKey)
  const spacing = worldSpacing(course, chains)
  const world = buildPolicyChainsExampleWorld(
    { id: spec.id, setupKey: spec.setupKey, spacing, camera: wfKindCamera(spec.kind), v3: true },
    spec.candidate.genome,
  )
  // worlds carry no description field: a floating note names the candidate + setup (same pattern as the v3 placeholder note)
  const entities = world.entities as unknown[]
  entities.push({
    id: 'candidate_note',
    name: `${spec.candidate.label}${spec.candidate.gen != null ? ` (gen ${spec.candidate.gen})` : ''} · ${spec.setupKey} · holdout ${spec.setupIndex} of ${WF_HOLDOUTS_PER_KIND} · ${chains.length} chains`,
    bodyType: 'static',
    shape: { type: 'box', width: 1, height: 0.2, depth: 1 },
    position: [0, 14, 0],
    rotation: [0, 0, 0],
    material: { color: [0.5, 0.5, 0.5], opacity: 0.3 },
  })
  return world
}

/** meta.json of a wf world (dialog rows + tiles; `scores` = per-chain headless progress of the baked candidate, null until measured). */
export function wfTrainingMeta(spec: WfCandidateWorldSpec, scores: Array<number | null>): WfTrainingMeta {
  return {
    id: spec.id,
    kind: spec.kind,
    setupKey: spec.setupKey,
    setupIndex: spec.setupIndex,
    name: `WF ${spec.kind} ${spec.setupIndex}`,
    candidate: { label: `${spec.candidate.label}${spec.candidate.gen != null ? ` (gen ${spec.candidate.gen})` : ''}`, gen: spec.candidate.gen },
    bestScore: scores.length > 0 ? Math.max(...scores.map((s) => s ?? 0)) : null,
    chains: chainsForSetup(spec.setupKey).length,
  }
}
