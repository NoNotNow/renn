/**
 * Node-only: serve allowlisted agent bundles / fixtures for dev Builder bootstrap.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadAgentProjectBundle } from './loadAgentProjectBundle'
import { loadLogicVerificationFixture } from './logicVerificationFixtures'
import { assertAgentDevExampleWorldId } from './agentDevExampleWorlds'
import type { RennWorld } from '@/types/world'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(MODULE_DIR, '../..')

export type AgentDevProjectPayload = {
  kind: 'bundle' | 'fixture' | 'exampleWorld'
  id: string
  world: RennWorld
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export async function loadAgentDevProjectBundlePayload(
  bundleId: string,
): Promise<AgentDevProjectPayload> {
  const bundle = await loadAgentProjectBundle(bundleId)
  return { kind: 'bundle', id: bundle.bundleId, world: bundle.world }
}

export async function loadAgentDevFixturePayload(fixtureId: string): Promise<AgentDevProjectPayload> {
  const world = loadLogicVerificationFixture(fixtureId)
  return { kind: 'fixture', id: fixtureId, world }
}

export async function loadAgentDevExampleWorldPayload(
  exampleWorldId: string,
): Promise<AgentDevProjectPayload> {
  await assertAgentDevExampleWorldId(exampleWorldId)
  const worldPath = path.join(REPO_ROOT, 'public', 'exampleWorlds', exampleWorldId, 'world.json')
  const raw = await fs.readFile(worldPath, 'utf8')
  const world = JSON.parse(raw) as RennWorld
  return { kind: 'exampleWorld', id: exampleWorldId, world }
}

const BUNDLE_PATH_RE = /^\/__renn-agent\/dev\/project-bundle\/([^/]+)\/?$/
const FIXTURE_PATH_RE = /^\/__renn-agent\/dev\/fixture\/([^/]+)\/?$/
const EXAMPLE_WORLD_PATH_RE = /^\/__renn-agent\/dev\/example-world\/([^/]+)\/?$/

/** Vite dev middleware handler; no-op outside dev (caller should gate). */
export async function handleAgentDevProjectMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): Promise<void> {
  if (req.method !== 'GET' || !req.url) {
    next()
    return
  }

  const path = req.url.split('?')[0] ?? ''
  const bundleMatch = path.match(BUNDLE_PATH_RE)
  if (bundleMatch) {
    const bundleId = decodeURIComponent(bundleMatch[1])
    try {
      const payload = await loadAgentDevProjectBundlePayload(bundleId)
      sendJson(res, 200, payload)
    } catch (err) {
      sendJson(res, 400, {
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return
  }

  const fixtureMatch = path.match(FIXTURE_PATH_RE)
  if (fixtureMatch) {
    const fixtureId = decodeURIComponent(fixtureMatch[1])
    try {
      const payload = await loadAgentDevFixturePayload(fixtureId)
      sendJson(res, 200, payload)
    } catch (err) {
      sendJson(res, 400, {
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return
  }

  const exampleMatch = path.match(EXAMPLE_WORLD_PATH_RE)
  if (exampleMatch) {
    const exampleWorldId = decodeURIComponent(exampleMatch[1])
    try {
      const payload = await loadAgentDevExampleWorldPayload(exampleWorldId)
      sendJson(res, 200, payload)
    } catch (err) {
      sendJson(res, 400, {
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return
  }

  next()
}
