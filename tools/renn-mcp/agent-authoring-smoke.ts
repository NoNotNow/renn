#!/usr/bin/env node
/**
 * Dev-only: MCP attach authoring smoke (example world → save as → tint → save → IDB readback).
 *
 * Required env:
 *   RENN_AGENT_SMOKE_EXAMPLE_WORLD_ID
 *   RENN_AGENT_SMOKE_PROJECT_NAME
 * Optional:
 *   RENN_AGENT_SMOKE_ENTITY_ID (default: ground)
 *   RENN_AGENT_SMOKE_COLOR (default: #00ff00)
 *   RENN_AGENT_SMOKE_HEADED=1 — visible Chrome, keep browser + dev server until Ctrl+C
 *   --headed — same as RENN_AGENT_SMOKE_HEADED=1
 *
 * Illustration (docs only): hunt → hunt2 → green ground — see feature-agent-authoring-setup.md
 */
import { chromium, type Browser } from 'playwright'
import { parseAgentMaterialColorInput } from '../../src/agent/agentMaterialColorParse.ts'
import { DEFAULT_MCP_DEV_TOKEN, resolveMcpDevToken } from '../../src/agent/logicVerificationMcpAuth.ts'
import { LogicVerificationMcpSession } from '../../src/agent/logicVerificationMcpSession.ts'
import { assertAgentDevExampleWorldId } from '../../src/agent/agentDevExampleWorlds.ts'
import { resolveBuilderDevUrl } from './agentDevAttachEnv.ts'
import { ensureDevServer, stopDevServer } from './agentDevServer.ts'

const SMOKE_DEV_PORT = 5199
const SMOKE_BRIDGE_PORT = 9235

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required env ${name}`)
  }
  return value
}

function isHeadedAuthoringSmoke(): boolean {
  if (process.argv.includes('--headed')) return true
  const v = process.env.RENN_AGENT_SMOKE_HEADED?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

function colorClose(a: number[], b: number[], epsilon = 0.05): boolean {
  if (a.length < 3 || b.length < 3) return false
  return (
    Math.abs(a[0]! - b[0]!) <= epsilon &&
    Math.abs(a[1]! - b[1]!) <= epsilon &&
    Math.abs(a[2]! - b[2]!) <= epsilon
  )
}

async function openBuilderTab(headed: boolean): Promise<{ browser: Browser; dispose: () => Promise<void> }> {
  const browser = await chromium.launch({ channel: 'chrome', headless: !headed })
  const page = await browser.newPage()
  page.on('dialog', (dialog) => {
    void dialog.accept()
  })
  await page.goto(resolveBuilderDevUrl(), { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.getByRole('button', { name: 'File' }).waitFor({ state: 'visible', timeout: 60_000 })
  return {
    browser,
    dispose: async () => {
      if (!headed) {
        await browser.close()
      }
    },
  }
}

function waitForInterrupt(): Promise<void> {
  return new Promise((resolve) => {
    const onSignal = () => {
      process.off('SIGINT', onSignal)
      process.off('SIGTERM', onSignal)
      resolve()
    }
    process.on('SIGINT', onSignal)
    process.on('SIGTERM', onSignal)
  })
}

async function runAuthoringSmoke(options: {
  headed: boolean
}): Promise<{ result: Record<string, unknown>; browser: Browser }> {
  const exampleWorldId = requireEnv('RENN_AGENT_SMOKE_EXAMPLE_WORLD_ID')
  const projectName = requireEnv('RENN_AGENT_SMOKE_PROJECT_NAME')
  const entityId = process.env.RENN_AGENT_SMOKE_ENTITY_ID?.trim() || 'ground'
  const colorInput = process.env.RENN_AGENT_SMOKE_COLOR?.trim() || '#00ff00'
  const targetRgba = parseAgentMaterialColorInput(colorInput)

  await assertAgentDevExampleWorldId(exampleWorldId)

  const { browser, dispose } = await openBuilderTab(options.headed)
  const session = new LogicVerificationMcpSession()
  try {
    await session.attachBrowser({
      devToken: resolveMcpDevToken(),
      waitForBrowserMs: 60_000,
      port: SMOKE_BRIDGE_PORT,
      rpcTimeoutMs: 120_000,
    })

    const loaded = await session.loadExampleWorld({ exampleWorldId })
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    const savedAs = await session.saveProjectAs({ projectName })
    await session.patchEntityMaterialColor({ entityId, color: colorInput })
    const saved = await session.saveProject()
    const readback = await session.getSavedEntityMaterialColor({ projectName, entityId })

    const savedRgb = readback.color?.slice(0, 3) ?? null
    if (!savedRgb || !colorClose(savedRgb, targetRgba)) {
      throw new Error(
        `Saved material mismatch for ${entityId}: got ${JSON.stringify(savedRgb)}, expected ~${JSON.stringify(targetRgba.slice(0, 3))}`,
      )
    }

    return {
      result: {
        ok: true,
        recipe: 'authoring-smoke',
        headed: options.headed,
        exampleWorldId,
        projectName,
        entityId,
        loaded,
        savedAs,
        saved,
        readback,
      },
      browser,
    }
  } finally {
    await session.dispose()
    await dispose()
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('agent:authoring-smoke is dev-only')
  }

  const headed = isHeadedAuthoringSmoke()

  if (!process.env.RENN_MCP_DEV_TOKEN?.trim()) {
    process.env.RENN_MCP_DEV_TOKEN = DEFAULT_MCP_DEV_TOKEN
  }
  if (!process.env.VITE_RENN_MCP_DEV_TOKEN?.trim()) {
    process.env.VITE_RENN_MCP_DEV_TOKEN = process.env.RENN_MCP_DEV_TOKEN
  }
  process.env.RENN_AGENT_DEV_URL = `http://localhost:${SMOKE_DEV_PORT}/renn/`
  process.env.RENN_MCP_BROWSER_PORT = String(SMOKE_BRIDGE_PORT)
  process.env.VITE_RENN_MCP_BROWSER_PORT = String(SMOKE_BRIDGE_PORT)
  process.env.RENN_MCP_BROWSER_RPC_TIMEOUT_MS = process.env.RENN_MCP_BROWSER_RPC_TIMEOUT_MS ?? '120000'

  const { started, child } = await ensureDevServer({ spawnPort: SMOKE_DEV_PORT })
  let browser: Browser | null = null
  try {
    const { result, browser: smokeBrowser } = await runAuthoringSmoke({ headed })
    browser = smokeBrowser
    console.log(JSON.stringify(result, null, 2))

    if (headed) {
      const projectName = requireEnv('RENN_AGENT_SMOKE_PROJECT_NAME')
      const builderUrl = resolveBuilderDevUrl()
      console.log('')
      console.log('Authoring smoke succeeded — browser left open for MCP attach.')
      console.log(`Builder URL: ${builderUrl}`)
      console.log(`In that window: File → Open → "${projectName}"`)
      console.log(`Bridge port: ${SMOKE_BRIDGE_PORT} (match VITE_RENN_MCP_BROWSER_PORT in MCP session if needed).`)
      console.log(`Dev server port: ${SMOKE_DEV_PORT}. Press Ctrl+C here to stop the server and close Playwright Chrome.`)
      console.log('')
      await waitForInterrupt()
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {})
    }
    if (started) {
      await stopDevServer(child)
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
