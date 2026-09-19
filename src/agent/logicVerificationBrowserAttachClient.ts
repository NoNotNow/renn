/**
 * Builder tab side: connect to dev bridge and serve RPC from live scene.
 * Dev-only — callers must guard with import.meta.env.DEV.
 */

import {
  parseLogicVerificationBridgeMessage,
  serializeLogicVerificationBridgeMessage,
  DEFAULT_LOGIC_VERIFICATION_BROWSER_PORT,
  type LogicVerificationBridgeRpc,
} from '@/agent/logicVerificationBrowserProtocol'
import { DEFAULT_MCP_DEV_TOKEN } from '@/agent/logicVerificationMcpAuth'
import { createLogicVerificationBrowserAttachHandler } from '@/agent/logicVerificationBrowserAttachHandler'
import type { LogicVerificationLiveSceneConfig } from '@/agent/logicVerificationHost'

export type LogicVerificationBrowserAttachDeps = {
  getLiveSceneConfig: () => LogicVerificationLiveSceneConfig | null
  port?: number
  devToken?: string
}

export type LogicVerificationBrowserAttachSession = {
  dispose: () => void
  handler: ReturnType<typeof createLogicVerificationBrowserAttachHandler>
}

function resolveBrowserAttachPort(explicit?: number): number {
  if (explicit != null) return explicit
  const fromEnv = import.meta.env.VITE_RENN_MCP_BROWSER_PORT
  if (fromEnv && String(fromEnv).length > 0) {
    const n = Number(fromEnv)
    if (Number.isFinite(n) && n > 0) return n
  }
  return DEFAULT_LOGIC_VERIFICATION_BROWSER_PORT
}

function resolveBrowserDevToken(explicit?: string): string {
  if (explicit) return explicit
  const fromEnv = import.meta.env.VITE_RENN_MCP_DEV_TOKEN
  if (fromEnv && String(fromEnv).length > 0) return String(fromEnv)
  return DEFAULT_MCP_DEV_TOKEN
}

export function startLogicVerificationBrowserAttach(
  deps: LogicVerificationBrowserAttachDeps,
): LogicVerificationBrowserAttachSession {
  const handler = createLogicVerificationBrowserAttachHandler()
  const port = resolveBrowserAttachPort(deps.port)
  const devToken = resolveBrowserDevToken(deps.devToken)
  const url = `ws://127.0.0.1:${port}`
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const syncLiveHost = (): void => {
    const config = deps.getLiveSceneConfig()
    if (!config) {
      handler.disposeHost()
      return
    }
    handler.adoptScene(config)
  }

  const connect = (): void => {
    if (disposed) return
    syncLiveHost()
    socket = new WebSocket(url)
    socket.addEventListener('open', () => {
      socket?.send(
        serializeLogicVerificationBridgeMessage({
          type: 'hello',
          role: 'browser',
          devToken,
        }),
      )
    })
    socket.addEventListener('message', async (ev) => {
      try {
        const msg = parseLogicVerificationBridgeMessage(String(ev.data))
        if (msg.type !== 'rpc') return
        const rpc = msg as LogicVerificationBridgeRpc
        try {
          const result = await handler.dispatchRpc(rpc.method, rpc.params)
          socket?.send(
            serializeLogicVerificationBridgeMessage({
              type: 'rpc_result',
              id: rpc.id,
              ok: true,
              result,
            }),
          )
        } catch (err) {
          socket?.send(
            serializeLogicVerificationBridgeMessage({
              type: 'rpc_error',
              id: rpc.id,
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            }),
          )
        }
      } catch {
        // ignore malformed
      }
    })
    socket.addEventListener('close', () => {
      socket = null
      if (!disposed) {
        reconnectTimer = setTimeout(connect, 2000)
      }
    })
  }

  connect()

  return {
    handler,
    dispose: () => {
      disposed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      socket?.close()
      socket = null
      handler.disposeHost()
    },
  }
}
