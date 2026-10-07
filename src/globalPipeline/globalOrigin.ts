import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import type { GlobalOrigin, TransformerConfig, TransformerPipe } from '@/types/transformer'
import type { RennWorld } from '@/types/world'
import { applyEntityTransformerSync, dropStagesLeftBehind } from '@/utils/pipeNavResolve'
import { normalizePipeMembers } from '@/utils/transformerPipeResolve'

/**
 * Library fixes reach projects that copied a library stage / pipe.
 *
 * A copy remembers where it came from (`origin`: library id + a fingerprint of the version it was copied from).
 * `updateWorldFromGlobalLibrary` compares that with the current library:
 *   - copy unchanged since it was taken, library moved on  → the project copy is updated (params / enabled stay yours)
 *   - copy edited locally, library moved on                 → left alone and reported as `diverged`
 * Custom stages are fingerprinted by their code; pipes by their member tree and param definitions.
 */

/** Small deterministic string hash (FNV-1a, base36) — no crypto needed for change detection. */
export function hashText(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

export function stageFingerprint(cfg: Pick<TransformerConfig, 'type' | 'code'>): string {
  return hashText(`${cfg.type}\n${cfg.code ?? ''}`)
}

export function pipeFingerprint(pipe: TransformerPipe): string {
  const members = normalizePipeMembers(pipe).map((m) => (m.kind === 'stage' ? `s:${m.stageId}` : `p:${m.pipeId}`))
  return hashText(JSON.stringify({ members, paramDefs: pipe.paramDefs ?? [] }))
}

export function originForStage(globalId: string, cfg: TransformerConfig): GlobalOrigin {
  return { globalId, hash: stageFingerprint(cfg) }
}

export function originForPipe(globalId: string, pipe: TransformerPipe): GlobalOrigin {
  return { globalId, hash: pipeFingerprint(pipe) }
}

export interface GlobalLibraryUpdateReport {
  updatedStages: string[]
  updatedPipes: string[]
  /** Project copies edited locally while the library moved on (left untouched). */
  divergedStages: string[]
  divergedPipes: string[]
}

const deepClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** Apply library changes to every project copy that is still unmodified. Returns the same world when nothing changed. */
export function updateWorldFromGlobalLibrary(
  world: RennWorld,
  library: GlobalBehaviorLibrary,
): { world: RennWorld; report: GlobalLibraryUpdateReport } {
  const report: GlobalLibraryUpdateReport = { updatedStages: [], updatedPipes: [], divergedStages: [], divergedPipes: [] }
  let transformers = world.transformers ?? {}
  let pipes = world.transformerPipes ?? {}
  let adopted = false

  // Adopt: copies made before origins existed (same id and code as a library entry) join the update stream.
  // registry entries can be undefined in projects saved by an old stage-delete bug: skip them everywhere below
  for (const [id, cfg] of Object.entries(transformers)) {
    if (!cfg) continue
    const lib = library.transformers?.[id]
    if (cfg.origin || !lib || lib.type !== cfg.type || stageFingerprint(lib) !== stageFingerprint(cfg)) continue
    if (transformers === world.transformers) transformers = { ...transformers }
    transformers[id] = { ...cfg, origin: originForStage(id, lib) }
    adopted = true
  }
  for (const [id, pipe] of Object.entries(pipes)) {
    if (!pipe) continue
    const lib = library.transformerPipes?.[id]
    if (pipe.origin || !lib || pipeFingerprint(lib) !== pipeFingerprint(pipe)) continue
    if (pipes === world.transformerPipes) pipes = { ...pipes }
    pipes[id] = { ...pipe, origin: originForPipe(id, lib) }
    adopted = true
  }

  for (const [id, cfg] of Object.entries(transformers)) {
    if (!cfg) continue
    const origin = cfg.origin
    const lib = origin ? library.transformers?.[origin.globalId] : undefined
    if (!origin || !lib || lib.type !== cfg.type) continue
    const libHash = stageFingerprint(lib)
    if (libHash === origin.hash) continue
    if (stageFingerprint(cfg) !== origin.hash) {
      report.divergedStages.push(id)
      continue
    }
    if (transformers === world.transformers) transformers = { ...transformers }
    transformers[id] = { ...cfg, code: lib.code, name: lib.name ?? cfg.name, origin: { globalId: origin.globalId, hash: libHash } }
    report.updatedStages.push(id)
  }

  const touchedPipeIds: string[] = []
  for (const [id, pipe] of Object.entries(pipes)) {
    if (!pipe) continue
    const origin = pipe.origin
    const lib = origin ? library.transformerPipes?.[origin.globalId] : undefined
    if (!origin || !lib) continue
    const libHash = pipeFingerprint(lib)
    if (libHash === origin.hash) continue
    if (pipeFingerprint(pipe) !== origin.hash) {
      report.divergedPipes.push(id)
      continue
    }
    if (pipes === world.transformerPipes) pipes = { ...pipes }
    pipes[id] = {
      ...pipe,
      name: lib.name,
      members: deepClone(lib.members ?? normalizePipeMembers(lib)),
      stageIds: [...lib.stageIds],
      ...(lib.paramDefs ? { paramDefs: deepClone(lib.paramDefs) } : {}),
      origin: { globalId: origin.globalId, hash: libHash },
    }
    report.updatedPipes.push(id)
    touchedPipeIds.push(id)
  }

  if (report.updatedStages.length === 0 && report.updatedPipes.length === 0) {
    return { world: adopted ? { ...world, transformers, transformerPipes: pipes } : world, report }
  }

  // stages / child pipes the new library structure needs but the project does not have yet
  const copyMissing = (pipeId: string, seen = new Set<string>()) => {
    if (seen.has(pipeId)) return
    seen.add(pipeId)
    const local = pipes[pipeId]
    if (!local) return
    for (const m of normalizePipeMembers(local)) {
      if (m.kind === 'stage') {
        if (!transformers[m.stageId] && library.transformers?.[m.stageId]) {
          if (transformers === world.transformers) transformers = { ...transformers }
          const def = deepClone(library.transformers[m.stageId]!)
          transformers[m.stageId] = { ...def, origin: originForStage(m.stageId, def) }
        }
      } else if (!pipes[m.pipeId] && library.transformerPipes?.[m.pipeId]) {
        if (pipes === world.transformerPipes) pipes = { ...pipes }
        const child = deepClone(library.transformerPipes[m.pipeId]!)
        pipes[m.pipeId] = { ...child, origin: originForPipe(m.pipeId, child) }
        copyMissing(m.pipeId, seen)
      }
    }
  }
  for (const id of touchedPipeIds) copyMissing(id)

  let next: RennWorld = { ...world, transformers, transformerPipes: pipes }
  if (touchedPipeIds.length > 0) {
    // entities using a restructured pipe get the new stage list; stages the pipe dropped must not linger on them
    for (const e of next.entities) {
      if ((e.transformerPipeStack ?? []).length > 0) next = applyEntityTransformerSync(next, e.id)
    }
    next = dropStagesLeftBehind(world, next)
  }
  return { world: next, report }
}
