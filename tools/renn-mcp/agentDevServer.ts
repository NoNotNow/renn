import { spawn, type ChildProcess } from 'node:child_process'
import { DEFAULT_MCP_DEV_TOKEN } from '../../src/agent/logicVerificationMcpAuth.ts'
import { REPO_ROOT, resolveReachableBuilderDevUrl } from './agentDevAttachEnv.ts'

export type EnsureDevServerOptions = {
  /** When set, spawn Vite on this port (--strictPort) for isolated agent smoke runs. */
  spawnPort?: number
}

function devServerSpawnEnv(): NodeJS.ProcessEnv {
  const token = process.env.RENN_MCP_DEV_TOKEN?.trim() || DEFAULT_MCP_DEV_TOKEN
  return {
    ...process.env,
    RENN_MCP_DEV_TOKEN: token,
    VITE_RENN_MCP_DEV_TOKEN: process.env.VITE_RENN_MCP_DEV_TOKEN?.trim() || token,
    ...(process.env.RENN_MCP_BROWSER_PORT
      ? { RENN_MCP_BROWSER_PORT: process.env.RENN_MCP_BROWSER_PORT }
      : {}),
    ...(process.env.VITE_RENN_MCP_BROWSER_PORT
      ? { VITE_RENN_MCP_BROWSER_PORT: process.env.VITE_RENN_MCP_BROWSER_PORT }
      : {}),
  }
}

export async function ensureDevServer(
  options: EnsureDevServerOptions = {},
): Promise<{ started: boolean; child: ChildProcess | null }> {
  try {
    await resolveReachableBuilderDevUrl(2_000)
    return { started: false, child: null }
  } catch {
    // start vite
  }

  const npmArgs = ['run', 'dev']
  if (options.spawnPort != null) {
    npmArgs.push('--', '--port', String(options.spawnPort), '--strictPort')
  }

  const child = spawn('npm', npmArgs, {
    cwd: REPO_ROOT,
    stdio: 'ignore',
    detached: process.platform !== 'win32',
    env: devServerSpawnEnv(),
  })
  child.unref?.()
  await resolveReachableBuilderDevUrl(60_000)
  return { started: true, child }
}

export async function stopDevServer(child: ChildProcess | null): Promise<void> {
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
