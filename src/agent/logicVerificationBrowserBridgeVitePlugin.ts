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
        console.warn('[renn] logic verification browser bridge failed to start:', err)
      })
      server.httpServer?.once('close', () => {
        void getSharedLogicVerificationBrowserBridge()?.stop()
        setSharedLogicVerificationBrowserBridge(null)
      })
    },
  }
}
