#!/usr/bin/env node
/**
 * Dev-only: open visible Builder on default dev (5173) with a persistent Playwright Chrome profile,
 * load an IndexedDB project by name, keep browser + dev alive for MCP collaboration.
 *
 * Usage:
 *   npm run agent:work-on-project -- "<projectName>"
 *   npm run agent:work-on-project -- --no-open-project
 *   npm run agent:work-on-project -- --dev-url http://localhost:5174/renn/ "<projectName>"
 *
 * Env: RENN_AGENT_PROJECT_NAME, RENN_AGENT_DEV_URL
 */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium, type BrowserContext } from 'playwright'
import { REPO_ROOT, resolveReachableBuilderDevUrl } from './agentDevAttachEnv.ts'
import { ensureDevServer, stopDevServer } from './agentDevServer.ts'

const AGENT_BROWSER_PROFILE_DIR = path.join(REPO_ROOT, '.renn-agent-browser-profile')

type WorkOnProjectOptions = {
  projectName: string | null
  skipOpenProject: boolean
  devUrlOverride: string | null
}

function parseWorkOnProjectArgv(argv: string[]): WorkOnProjectOptions {
  let skipOpenProject = false
  let devUrlOverride: string | null = null
  const positional: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--no-open-project') {
      skipOpenProject = true
    } else if (arg === '--dev-url' && argv[i + 1]) {
      devUrlOverride = argv[++i]!.trim()
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}`)
    } else {
      positional.push(arg)
    }
  }

  const fromEnv = process.env.RENN_AGENT_PROJECT_NAME?.trim()
  const fromArg = positional.join(' ').trim()
  const projectName = fromArg || fromEnv || null

  if (!skipOpenProject && !projectName) {
    throw new Error(
      'Usage: npm run agent:work-on-project -- "<projectName>" (or --no-open-project, or set RENN_AGENT_PROJECT_NAME)',
    )
  }

  if (devUrlOverride) {
    process.env.RENN_AGENT_DEV_URL = devUrlOverride.endsWith('/')
      ? devUrlOverride
      : `${devUrlOverride}/`
  }

  return { projectName, skipOpenProject, devUrlOverride }
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

  const { projectName, skipOpenProject } = parseWorkOnProjectArgv(process.argv.slice(2))
  mkdirSync(AGENT_BROWSER_PROFILE_DIR, { recursive: true })

  const { started, child } = await ensureDevServer()
  let context: BrowserContext | null = null

  try {
    context = await chromium.launchPersistentContext(AGENT_BROWSER_PROFILE_DIR, {
      channel: 'chrome',
      headless: false,
    })
    const page = context.pages()[0] ?? (await context.newPage())
    page.on('dialog', (dialog) => {
      void dialog.accept()
    })

    const devUrl = await resolveReachableBuilderDevUrl(60_000)
    await page.goto(devUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.getByRole('button', { name: 'File' }).waitFor({ state: 'visible', timeout: 60_000 })

    let projectOpened: boolean | null = null
    if (!skipOpenProject && projectName) {
      projectOpened = true
      try {
        await openProjectInBuilder(page, projectName)
      } catch (err) {
        projectOpened = false
        console.warn(
          `Could not open "${projectName}" from IndexedDB in this agent profile — import or File → Open manually in this window.`,
        )
        console.warn(err instanceof Error ? err.message : err)
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          projectName,
          projectOpened,
          skipOpenProject,
          devUrl,
          profileDir: AGENT_BROWSER_PROFILE_DIR,
          nextSteps: [
            ...(projectOpened === false && projectName
              ? [`File → Open or Import "${projectName}" in this Chrome window (agent profile IndexedDB)`]
              : []),
            'Enable renn-logic-verification MCP in Cursor',
            'Call attach_browser then get_entity_authoring_summary / apply_world_patch',
            'Press Ctrl+C in this terminal when done (avoid Cursor Stop on this task)',
          ],
        },
        null,
        2,
      ),
    )

    await waitForInterrupt()
  } finally {
    if (context) {
      await context.close()
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
