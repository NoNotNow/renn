/**
 * Dev-only: load allowlisted agent bundle or fixture from Vite middleware when URL query is set.
 */

import { useEffect, useRef } from 'react'
import type { RennWorld } from '@/types/world'
import {
  agentDevFixtureApiPath,
  agentDevProjectBundleApiPath,
  parseAgentDevBootstrapTarget,
} from '@/agent/agentDevBootstrapParams'
import { loadExampleWorldFromPublicBase } from '@/utils/loadExampleWorldFromPublicBase'

export type UseAgentDevProjectBundleBootstrapArgs = {
  enabled: boolean
  loadDevWorld: (world: RennWorld, label: string, assets?: Map<string, Blob>) => void
}

export async function fetchAgentDevProjectPayload(
  target: NonNullable<ReturnType<typeof parseAgentDevBootstrapTarget>>,
): Promise<{ world: RennWorld; label: string; assets?: Map<string, Blob> }> {
  if (target.kind === 'exampleWorld') {
    const baseUrl = import.meta.env.BASE_URL || '/'
    const { world, assets, exampleWorldId } = await loadExampleWorldFromPublicBase(
      baseUrl,
      target.exampleWorldId,
    )
    return { world, label: exampleWorldId, assets }
  }

  const path =
    target.kind === 'bundle'
      ? agentDevProjectBundleApiPath(target.bundleId)
      : agentDevFixtureApiPath(target.fixtureId)
  const res = await fetch(path)
  const body = (await res.json()) as { world?: RennWorld; error?: string; id?: string }
  if (!res.ok || !body.world) {
    throw new Error(body.error ?? `Failed to load dev project (${res.status})`)
  }
  const label =
    target.kind === 'bundle'
      ? `agent:${body.id ?? target.bundleId}`
      : `fixture:${body.id ?? target.fixtureId}`
  return { world: body.world, label }
}

export function useAgentDevProjectBundleBootstrap({
  enabled,
  loadDevWorld,
}: UseAgentDevProjectBundleBootstrapArgs): void {
  const loadDevWorldRef = useRef(loadDevWorld)
  loadDevWorldRef.current = loadDevWorld
  const loadedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) return

    let target: ReturnType<typeof parseAgentDevBootstrapTarget>
    try {
      target = parseAgentDevBootstrapTarget(new URLSearchParams(window.location.search))
    } catch (err) {
      console.error('[renn] agent dev bootstrap:', err instanceof Error ? err.message : err)
      return
    }
    if (!target) return

    const key =
      target.kind === 'bundle'
        ? `bundle:${target.bundleId}`
        : target.kind === 'fixture'
          ? `fixture:${target.fixtureId}`
          : `example:${target.exampleWorldId}`
    if (loadedKeyRef.current === key) return

    let cancelled = false
    void fetchAgentDevProjectPayload(target)
      .then(({ world, label, assets }) => {
        if (cancelled) return
        loadedKeyRef.current = key
        loadDevWorldRef.current(world, label, assets)
      })
      .catch((err) => {
        console.error('[renn] agent dev bootstrap:', err instanceof Error ? err.message : err)
      })

    return () => {
      cancelled = true
    }
  }, [enabled])
}
