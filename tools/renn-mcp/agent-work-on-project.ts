#!/usr/bin/env node
/**
 * Dev-only: open visible Builder on default dev (5173) with a persistent Playwright Chrome profile,
 * load an IndexedDB project by name, keep browser + dev alive for MCP collaboration.
 *
 * Usage: npm run agent:work-on-project -- "<projectName>"
 * Env: RENN_AGENT_PROJECT_NAME (alternative to argv)
 */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Browser } from 'playwright'
import { REPO_ROOT, resolveBuilderDevUrl, resolveReachableBuilderDevUrl } from './agentDevAttachEnv.ts'
import { ensureDevServer, stopDevServer } from './agentDevServer.ts'

const AGENT_BROWSER_PROFILE_DIR = path.join(REPO_ROOT, '.renn-agent-browser-profile')

function resolveProjectName(argv: string[]): string {
  const fromEnv = process.env.RENN_AGENT_PROJECT_NAME?.trim()
  const fromArg = argv.join(' ').trim()
  const name = fromArg || fromEnv
  if (!name) {
    throw new Error('Usage: npm run agent:work-on-project -- "<projectName>" (or set RENN_AGENT_PROJECT_NAME)')
  }
  return name
}

async function openProjectInBuilder(page: import('playwright').Page, projectName: string): Promise<void> {
  await page.getByRole('button', { name: 'File' }).click()
  await page.getByRole('menuitem', { name: 'Open...' }).click()
  await page.getByRole('heading', { name: 'Open Project' }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByRole('button', { name: projectName, exact: true }).click()
  await page.getByRole('button', { name: 'File' }).waitFor({ state: 'visible', timeout: 60_000 })
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

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('agent:work-on-project is dev-only')
  }

  const projectName = resolveProjectName(process.argv.slice(2))
  mkdirSync(AGENT_BROWSER_PROFILE_DIR, { recursive: true })

  const { started, child } = await ensureDevServer()
  let browser: Browser | null = null

  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: false,
      userDataDir: AGENT_BROWSER_PROFILE_DIR,
    })
    const page = await browser.newPage()
    page.on('dialog', (dialog) => {
      void dialog.accept()
    })

    const devUrl = await resolveReachableBuilderDevUrl(60_000)
    await page.goto(devUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.getByRole('button', { name: 'File' }).waitFor({ state: 'visible', timeout: 60_000 })
    await openProjectInBuilder(page, projectName)

    console.log(
      JSON.stringify(
        {
          ok: true,
          projectName,
          devUrl,
          profileDir: AGENT_BROWSER_PROFILE_DIR,
          nextSteps: [
            'Enable renn-logic-verification MCP in Cursor',
            'Call attach_browser (same dev URL / bridge)',
            'Use load_saved_project, patch_entity_material_color, save_project, etc.',
            'Press Ctrl+C in this terminal when done',
          ],
        },
        null,
        2,
      ),
    )

    await waitForInterrupt()
  } finally {
    if (browser) {
      await browser.close()
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
