import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  agentDevFixtureApiPath,
  agentDevProjectBundleApiPath,
  appendAgentDevBootstrapToUrl,
  type AgentDevBootstrapTarget,
} from '../../src/agent/agentDevBootstrapParams.ts'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(MODULE_DIR, '../..')

export const DEFAULT_BUILDER_DEV_URL = 'http://127.0.0.1:5173/renn/'

export function resolveBuilderDevUrl(): string {
  const raw = process.env.RENN_AGENT_DEV_URL?.trim()
  if (!raw) return DEFAULT_BUILDER_DEV_URL
  return raw.endsWith('/') ? raw : `${raw}/`
}

export function builderUrlForAttachTarget(target: AgentDevBootstrapTarget): string {
  return appendAgentDevBootstrapToUrl(resolveBuilderDevUrl(), target)
}

export async function assertDevBundleMiddlewareReady(
  target: AgentDevBootstrapTarget,
): Promise<void> {
  const path =
    target.kind === 'bundle'
      ? agentDevProjectBundleApiPath(target.bundleId)
      : agentDevFixtureApiPath(target.fixtureId)
  const origin = new URL(resolveBuilderDevUrl()).origin
  const res = await fetch(`${origin}${path}`)
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(
      body.error ??
        `Dev bundle middleware not ready (${res.status}). Restart \`npm run dev\` after pulling agent:dev-attach changes.`,
    )
  }
}

export async function waitForHttpOk(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: 'follow' })
      if (res.ok) return
      lastError = new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastError = err
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(
    `Timed out waiting for dev server at ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  )
}
