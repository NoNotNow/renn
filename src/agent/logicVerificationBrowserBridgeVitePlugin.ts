/**
 * Vite dev plugin: localhost WebSocket bridge for Builder browser attach.
 */

import type { Plugin } from 'vite'
import { DEFAULT_LOGIC_VERIFICATION_BROWSER_PORT } from './logicVerificationBrowserProtocol'
import { resolveMcpDevToken } from './logicVerificationMcpAuth'
import {
  ensureSharedLogicVerificationBrowserBridge,
  getSharedLogicVerificationBrowserBridge,
  setSharedLogicVerificationBrowserBridge,
} from './logicVerificationBrowserBridgeServer'

export function logicVerificationBrowserBridgeVitePlugin(): Plugin {
  return {
    name: 'renn-logic-verification-browser-bridge',
    apply: 'serve',
    configureServer(server) {
      if (process.env.NODE_ENV === 'production' || process.env.VITEST) return
      const port = Number(process.env.RENN_MCP_BROWSER_PORT ?? DEFAULT_LOGIC_VERIFICATION_BROWSER_PORT)
      const devToken = resolveMcpDevToken(process.env.RENN_MCP_DEV_TOKEN)
      void ensureSharedLogicVerificationBrowserBridge({ port, devToken }).catch((err) => {
        const code =
          typeof err === 'object' && err != null && 'code' in err
            ? (err as { code?: string }).code
            : undefined
        const vitePort = server.config.server.port ?? 5173
        if (code === 'EADDRINUSE') {
          console.warn(
            `[renn] logic verification browser bridge could not bind ${port} (already in use). ` +
              `MCP attach_browser works on the dev server that owns port ${port} (often the first Vite on 5173). ` +
              `This instance is http://localhost:${vitePort}/renn/ — stop extra dev servers or align RENN_MCP_BROWSER_PORT / VITE_RENN_MCP_BROWSER_PORT.`,
          )
        } else {
          console.warn('[renn] logic verification browser bridge failed to start:', err)
        }
      })
      server.httpServer?.once('close', () => {
        void getSharedLogicVerificationBrowserBridge()?.stop()
        setSharedLogicVerificationBrowserBridge(null)
      })
    },
  }
}
