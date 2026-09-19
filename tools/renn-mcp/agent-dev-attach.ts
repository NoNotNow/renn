#!/usr/bin/env node
/**
 * Start (or reuse) Vite dev, open Builder with an allowlisted bundle/fixture, attach_browser, run verify loop.
 *
 * Env: RENN_MCP_DEV_TOKEN (must match Vite / browser bridge), optional RENN_AGENT_DEV_URL.
 * Playwright uses locally installed Chrome (`channel: 'chrome'`), same as e2e.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { chromium, type Browser } from 'playwright'
import {
  agentDevFixtureApiPath,
  agentDevProjectBundleApiPath,
  type AgentDevBootstrapTarget,
} from '../../src/agent/agentDevBootstrapParams.ts'
import {
  assertDevBundleMiddlewareReady,
  builderUrlForAttachTarget,
  REPO_ROOT,
  resolveBuilderDevUrl,
  waitForHttpOk,
} from './agentDevAttachEnv.ts'
import { parseAgentDevAttachArgv, runAgentDevAttachRecipe } from './agentDevAttachRecipe.ts'

function attachTargetFromOpts(opts: ReturnType<typeof parseAgentDevAttachArgv>): AgentDevBootstrapTarget {
  if (opts.fixture) return { kind: 'fixture', fixtureId: opts.fixture }
  return { kind: 'bundle', bundleId: opts.bundle! }
}

async function ensureDevServer(): Promise<{ started: boolean; child: ChildProcess | null }> {
  const url = resolveBuilderDevUrl()
  try {
    await waitForHttpOk(url, 2_000)
    return { started: false, child: null }
  } catch {
    // start vite
  }

  const child = spawn('npm', ['run', 'dev'], {
    cwd: REPO_ROOT,
    stdio: 'ignore',
    detached: process.platform !== 'win32',
    env: { ...process.env },
  })
  child.unref?.()
  await waitForHttpOk(url, 60_000)
  return { started: true, child }
}

async function stopDevServer(child: ChildProcess | null): Promise<void> {
  if (!child?.pid) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    try {
      child.kill('SIGTERM')
    } catch {
      // ignore
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 500))
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('agent:dev-attach is dev-only')
  }

  const opts = parseAgentDevAttachArgv(process.argv.slice(2))
  const target = attachTargetFromOpts(opts)
  const builderUrl = builderUrlForAttachTarget(target)

  const { started, child } = await ensureDevServer()
  await assertDevBundleMiddlewareReady(target)

  let browser: Browser | null = null
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const page = await browser.newPage()
    const devApiPath =
      target.kind === 'bundle'
        ? agentDevProjectBundleApiPath(target.bundleId)
        : agentDevFixtureApiPath(target.fixtureId)
    const devPayloadReady = page.waitForResponse((res) => res.url().includes(devApiPath), {
      timeout: 60_000,
    })
    await page.goto(builderUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    const devPayloadResponse = await devPayloadReady
    if (!devPayloadResponse.ok()) {
      throw new Error(
        `Builder failed to load dev project payload (${devPayloadResponse.status()})`,
      )
    }

    const result = await runAgentDevAttachRecipe(opts)
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await browser?.close()
    if (started) {
      await stopDevServer(child)
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
