import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execSync } from 'node:child_process'
import { logicVerificationBrowserBridgeVitePlugin } from './src/agent/logicVerificationBrowserBridgeVitePlugin'

function agentDevProjectBundlePlugin(): Plugin {
  return {
    name: 'renn-agent-dev-project-bundle',
    apply: 'serve',
    configureServer(server) {
      if (process.env.NODE_ENV === 'production' || process.env.VITEST) return
      server.middlewares.use((req, res, next) => {
        void server
          .ssrLoadModule('/src/agent/agentDevProjectBundleServer.ts')
          .then(({ handleAgentDevProjectMiddleware }) =>
            handleAgentDevProjectMiddleware(req, res, next),
          )
          .catch((err) => {
            console.warn('[renn] agent dev project middleware failed:', err)
            next()
          })
      })
    },
  }
}

function buildSha(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() ? '+dirty' : ''
    return sha + dirty
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  define: { __BUILD_SHA__: JSON.stringify(buildSha()) },
  base: '/renn/',
  plugins: [react(), logicVerificationBrowserBridgeVitePlugin(), agentDevProjectBundlePlugin()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'tools/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    execArgv: ['--expose-gc'],
  },
})
