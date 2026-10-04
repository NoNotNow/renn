import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import type { RennWorld } from '@/types/world'
import { hashText, stageFingerprint, updateWorldFromGlobalLibrary } from '@/globalPipeline/globalOrigin'

/**
 * Code versioning for the AV stack: a short hash of the exact stage code a world executes (after library resolution),
 * so "which code did the lab test" and "which code runs in the browser" can be compared at a glance.
 */
const AV_STAGE_PREFIX = 'global_av_'

/** stage id -> content hash of its code, for every AV-stack stage present in the world. */
export function avStageHashes(world: RennWorld): Record<string, string> {
  const out: Record<string, string> = {}
  for (const id of Object.keys(world.transformers ?? {}).sort()) {
    if (!id.startsWith(AV_STAGE_PREFIX)) continue
    out[id] = stageFingerprint(world.transformers![id]!)
  }
  return out
}

/** One hash over all AV stage hashes ('none' when the world has no AV stage). */
export function avStackVersion(world: RennWorld): string {
  const h = avStageHashes(world)
  const ids = Object.keys(h)
  return ids.length ? hashText(ids.map((id) => `${id}:${h[id]}`).join('|')) : 'none'
}

export interface AvCodeDrift {
  /** Stages whose embedded code is older than the library but still unmodified: the Builder upgrades them when the project opens. */
  stale: string[]
  /** Stages whose embedded code differs from the library AND was edited locally: the Builder never upgrades them. */
  diverged: string[]
}

/** Compare the stage code embedded in a world with the (shipped) library. Lab: raw world.json; app: the open project. */
export function avCodeDrift(world: RennWorld, library: GlobalBehaviorLibrary): AvCodeDrift {
  const { report } = updateWorldFromGlobalLibrary(world, library)
  const only = (ids: string[]) => ids.filter((id) => id.startsWith(AV_STAGE_PREFIX) || (world.transformers?.[id]?.origin?.globalId ?? '').startsWith(AV_STAGE_PREFIX))
  const stale = only(report.updatedStages)
  const diverged = only(report.divergedStages)
  // stages without an origin that simply differ from the library are neither updatable nor diverged by origin: report them as diverged
  for (const [id, cfg] of Object.entries(world.transformers ?? {})) {
    const lib = library.transformers?.[id]
    if (id.startsWith(AV_STAGE_PREFIX) && lib && !cfg.origin && stageFingerprint(lib) !== stageFingerprint(cfg) && !diverged.includes(id)) diverged.push(id)
  }
  return { stale, diverged }
}

export function formatAvVersion(world: RennWorld): string {
  const h = avStageHashes(world)
  return `av stack ${avStackVersion(world)} [${Object.entries(h).map(([id, x]) => `${id.slice(AV_STAGE_PREFIX.length)}:${x}`).join(' ')}]`
}

// tiny external store so the header can show the version the app is actually running
let current = ''
const listeners = new Set<() => void>()
export function setRunningAvVersion(v: string): void {
  if (v === current) return
  current = v
  ;(globalThis as { __rennAvVersion?: string }).__rennAvVersion = v
  listeners.forEach((l) => l())
}
export const subscribeAvVersion = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))
export const getRunningAvVersion = () => current
