/**
 * Dev-only Builder bootstrap via URL search params (browser-safe).
 */

export const RENN_AGENT_BUNDLE_QUERY = 'rennAgentBundle'
export const RENN_AGENT_FIXTURE_QUERY = 'rennAgentFixture'

export type AgentDevBootstrapTarget =
  | { kind: 'bundle'; bundleId: string }
  | { kind: 'fixture'; fixtureId: string }

export function parseAgentDevBootstrapTarget(
  searchParams: URLSearchParams,
): AgentDevBootstrapTarget | null {
  const bundleId = searchParams.get(RENN_AGENT_BUNDLE_QUERY)?.trim()
  const fixtureId = searchParams.get(RENN_AGENT_FIXTURE_QUERY)?.trim()
  if (bundleId && fixtureId) {
    throw new Error(`Use only one of ${RENN_AGENT_BUNDLE_QUERY} or ${RENN_AGENT_FIXTURE_QUERY}`)
  }
  if (bundleId) return { kind: 'bundle', bundleId }
  if (fixtureId) return { kind: 'fixture', fixtureId }
  return null
}

export function appendAgentDevBootstrapToUrl(
  builderUrl: string,
  target: AgentDevBootstrapTarget,
): string {
  const url = new URL(builderUrl)
  if (target.kind === 'bundle') {
    url.searchParams.set(RENN_AGENT_BUNDLE_QUERY, target.bundleId)
  } else {
    url.searchParams.set(RENN_AGENT_FIXTURE_QUERY, target.fixtureId)
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
