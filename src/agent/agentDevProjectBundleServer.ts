/**
 * Node-only: serve allowlisted agent bundles / fixtures for dev Builder bootstrap.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadAgentProjectBundle } from './loadAgentProjectBundle'
import { loadLogicVerificationFixture } from './logicVerificationFixtures'
import {
  invalidateAgentDevExampleWorldIdCache,
  listAgentDevExampleWorldIds,
} from './agentDevExampleWorlds'
import { loadAgentExampleWorldFromDisk } from './loadAgentExampleWorldFromDisk'
import { writeAgentExampleWorldFromExportZip } from './writeAgentExampleWorldFromExportZip'
import { resolveMcpDevToken, verifyMcpDevToken } from './logicVerificationMcpAuth'
import type { RennWorld } from '@/types/world'

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
): Promise<AgentDevProjectPayload & { assetCount: number }> {
  const loaded = await loadAgentExampleWorldFromDisk(exampleWorldId)
  return {
    kind: 'exampleWorld',
    id: loaded.exampleWorldId,
    world: loaded.world,
    assetCount: loaded.assets.size,
  }
}

const BUNDLE_PATH_RE = /^\/__renn-agent\/dev\/project-bundle\/([^/]+)\/?$/
const FIXTURE_PATH_RE = /^\/__renn-agent\/dev\/fixture\/([^/]+)\/?$/
const EXAMPLE_WORLD_PATH_RE = /^\/__renn-agent\/dev\/example-world\/([^/]+)\/?$/
const EXAMPLE_WORLDS_LIST_PATH_RE = /^\/__renn-agent\/dev\/example-worlds\/?$/
const EXAMPLE_WORLD_IMPORT_PATH_RE =
  /^\/__renn-agent\/dev\/example-world\/([^/]+)\/import\/?$/

const MAX_EXAMPLE_WORLD_IMPORT_BYTES = 512 * 1024 * 1024

async function readRequestBodyBuffer(
  req: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.length
    if (total > maxBytes) {
      throw new Error(`Request body exceeds ${maxBytes} bytes`)
    }
    chunks.push(buf)
  }
  return Buffer.concat(chunks)
}

/** Vite dev middleware handler; no-op outside dev (caller should gate). */
export async function handleAgentDevProjectMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): Promise<void> {
  if (!req.url) {
    next()
    return
  }

  const path = req.url.split('?')[0] ?? ''

  if (req.method === 'POST') {
    const importMatch = path.match(EXAMPLE_WORLD_IMPORT_PATH_RE)
    if (importMatch) {
      const exampleWorldId = decodeURIComponent(importMatch[1])
      const tokenHeader = req.headers['x-renn-mcp-dev-token']
      const providedToken = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader
      try {
        verifyMcpDevToken(providedToken, resolveMcpDevToken())
        const body = await readRequestBodyBuffer(req, MAX_EXAMPLE_WORLD_IMPORT_BYTES)
        const result = await writeAgentExampleWorldFromExportZip(exampleWorldId, body)
        sendJson(res, 200, result)
      } catch (err) {
        sendJson(res, 400, {
          error: err instanceof Error ? err.message : String(err),
        })
      }
      return
    }
    next()
    return
  }

  if (req.method !== 'GET') {
    next()
    return
  }

  if (path.match(EXAMPLE_WORLDS_LIST_PATH_RE)) {
    try {
      invalidateAgentDevExampleWorldIdCache()
      const ids = await listAgentDevExampleWorldIds()
      sendJson(res, 200, { ids })
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return
  }

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
