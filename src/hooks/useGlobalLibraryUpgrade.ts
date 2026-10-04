import { useEffect, useRef, useState } from 'react'
import type { GlobalBehaviorLibrary } from '@/types/globalBehaviorLibrary'
import type { RennWorld } from '@/types/world'
import type { ApplyWorldWrite } from '@/editor/applyWorldEdit'
import { loadMergedGlobalLibrary } from '@/globalPipeline/loadMergedGlobalLibrary'
import { updateWorldFromGlobalLibrary } from '@/globalPipeline/globalOrigin'
import { avCodeDrift, formatAvVersion, avStackVersion, setRunningAvVersion } from '@/globalPipeline/avStackVersion'

/**
 * Keeps project copies of global-library stages / pipes current: when a project is opened (and whenever its stage
 * registry changes) unmodified copies receive the library's fixes. Edited copies are left alone.
 */
export function useGlobalLibraryUpgrade(opts: {
  projectId: string | null | undefined
  initialLoadPending: boolean
  world: RennWorld
  applyWorldWrite: ApplyWorldWrite
}): void {
  const { projectId, initialLoadPending, world, applyWorldWrite } = opts
  const libraryRef = useRef<GlobalBehaviorLibrary | null>(null)
  const [libraryEpoch, setLibraryEpoch] = useState(0)

  useEffect(() => {
    if (initialLoadPending) return
    let cancelled = false
    loadMergedGlobalLibrary()
      .then((lib) => {
        if (cancelled) return
        libraryRef.current = lib
        setLibraryEpoch((n) => n + 1)
      })
      .catch(() => {
        /* no library available: nothing to upgrade from */
      })
    return () => {
      cancelled = true
    }
  }, [projectId, initialLoadPending])

  useEffect(() => {
    const lib = libraryRef.current
    if (!lib) return
    const { world: next, report } = updateWorldFromGlobalLibrary(world, lib)
    const drift = avCodeDrift(next, lib)
    setRunningAvVersion(avStackVersion(next))
    console.info(`[renn] build ${typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : '?'} · ${formatAvVersion(next)}`)
    if (drift.diverged.length) console.warn('[renn] AV stage code in this project differs from the shipped library (edited locally, never upgraded):', drift.diverged)
    if (next === world) return
    const changed = report.updatedStages.length + report.updatedPipes.length > 0
    if (changed) console.info('[global library] updated project copies', report)
    // the scene only needs a rebuild when stage code / structure actually changed (adopting origins is metadata)
    applyWorldWrite({ undo: 'skip', scene: changed ? 'rebuild' : 'none' }, () => next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world.transformers, world.transformerPipes, libraryEpoch])
}
