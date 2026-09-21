/**
 * Dev-only Builder bootstrap via URL search params (browser-safe).
 */

export const RENN_AGENT_BUNDLE_QUERY = 'rennAgentBundle'
export const RENN_AGENT_FIXTURE_QUERY = 'rennAgentFixture'
export const RENN_AGENT_EXAMPLE_WORLD_QUERY = 'rennAgentExampleWorld'

export type AgentDevBootstrapTarget =
  | { kind: 'bundle'; bundleId: string }
  | { kind: 'fixture'; fixtureId: string }
  | { kind: 'exampleWorld'; exampleWorldId: string }

function countBootstrapQueryKinds(
  bundleId: string | undefined,
  fixtureId: string | undefined,
  exampleWorldId: string | undefined,
): number {
  return [bundleId, fixtureId, exampleWorldId].filter(Boolean).length
}

export function parseAgentDevBootstrapTarget(
  searchParams: URLSearchParams,
): AgentDevBootstrapTarget | null {
  const bundleId = searchParams.get(RENN_AGENT_BUNDLE_QUERY)?.trim() || undefined
  const fixtureId = searchParams.get(RENN_AGENT_FIXTURE_QUERY)?.trim() || undefined
  const exampleWorldId = searchParams.get(RENN_AGENT_EXAMPLE_WORLD_QUERY)?.trim() || undefined
  const kindCount = countBootstrapQueryKinds(bundleId, fixtureId, exampleWorldId)
  if (kindCount > 1) {
    throw new Error(
      `Use only one of ${RENN_AGENT_BUNDLE_QUERY}, ${RENN_AGENT_FIXTURE_QUERY}, or ${RENN_AGENT_EXAMPLE_WORLD_QUERY}`,
    )
  }
  if (bundleId) return { kind: 'bundle', bundleId }
  if (fixtureId) return { kind: 'fixture', fixtureId }
  if (exampleWorldId) return { kind: 'exampleWorld', exampleWorldId }
  return null
}

export function appendAgentDevBootstrapToUrl(
  builderUrl: string,
  target: AgentDevBootstrapTarget,
): string {
  const url = new URL(builderUrl)
  if (target.kind === 'bundle') {
    url.searchParams.set(RENN_AGENT_BUNDLE_QUERY, target.bundleId)
  } else if (target.kind === 'fixture') {
    url.searchParams.set(RENN_AGENT_FIXTURE_QUERY, target.fixtureId)
  } else {
    url.searchParams.set(RENN_AGENT_EXAMPLE_WORLD_QUERY, target.exampleWorldId)
  }
  return url.toString()
}

/** Dev middleware paths (Vite root, not under `base`). */
export function agentDevProjectBundleApiPath(bundleId: string): string {
  return `/__renn-agent/dev/project-bundle/${encodeURIComponent(bundleId)}`
}

export function agentDevFixtureApiPath(fixtureId: string): string {
  return `/__renn-agent/dev/fixture/${encodeURIComponent(fixtureId)}`
}

export function agentDevExampleWorldApiPath(exampleWorldId: string): string {
  return `/__renn-agent/dev/example-world/${encodeURIComponent(exampleWorldId)}`
}

export function agentDevExampleWorldImportApiPath(exampleWorldId: string): string {
  return `/__renn-agent/dev/example-world/${encodeURIComponent(exampleWorldId)}/import`
}

export function agentDevExampleWorldsListApiPath(): string {
  return '/__renn-agent/dev/example-worlds'
}
