import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  agentDevExampleWorldApiPath,
  agentDevFixtureApiPath,
  agentDevProjectBundleApiPath,
  appendAgentDevBootstrapToUrl,
  type AgentDevBootstrapTarget,
} from '../../src/agent/agentDevBootstrapParams.ts'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(MODULE_DIR, '../..')

export const DEFAULT_BUILDER_DEV_URL = 'http://localhost:5173/renn/'

export function resolveBuilderDevUrl(): string {
  const raw = process.env.RENN_AGENT_DEV_URL?.trim()
  if (!raw) return DEFAULT_BUILDER_DEV_URL
  return raw.endsWith('/') ? raw : `${raw}/`
}

/** When Vite picks another port (5173 busy), probe local /renn/ URLs. Prefer localhost (IPv6) before 127.0.0.1. */
export function builderDevUrlCandidates(): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  const add = (url: string) => {
    const normalized = url.endsWith('/') ? url : `${url}/`
    if (!seen.has(normalized)) {
      seen.add(normalized)
      ordered.push(normalized)
    }
  }
  add(resolveBuilderDevUrl())
  for (let port = 5173; port <= 5180; port++) {
    add(`http://localhost:${port}/renn/`)
    add(`http://127.0.0.1:${port}/renn/`)
  }
  return ordered
}

export async function resolveReachableBuilderDevUrl(timeoutMs: number): Promise<string> {
  if (process.env.RENN_AGENT_DEV_URL?.trim()) {
    const url = resolveBuilderDevUrl()
    await waitForHttpOk(url, timeoutMs)
    return url
  }
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    for (const url of builderDevUrlCandidates()) {
      try {
        await waitForHttpOk(url, Math.min(2_000, deadline - Date.now()))
        process.env.RENN_AGENT_DEV_URL = url
        return url
      } catch (err) {
        lastError = err
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(
    `Timed out waiting for Builder dev server: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  )
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
      : target.kind === 'fixture'
        ? agentDevFixtureApiPath(target.fixtureId)
        : agentDevExampleWorldApiPath(target.exampleWorldId)
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
