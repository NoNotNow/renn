/**
 * Dev-only WebSocket relay: one Builder tab (browser) + one MCP client.
 * Node / Vite dev server only — not bundled for production.
 */

import { WebSocketServer, type WebSocket } from 'ws'
import {
  parseLogicVerificationBridgeMessage,
  serializeLogicVerificationBridgeMessage,
  type LogicVerificationBridgeMessage,
  type LogicVerificationBridgeRpc,
} from './logicVerificationBrowserProtocol'
import { verifyMcpDevToken } from './logicVerificationMcpAuth'

type PendingRpc = {
  resolve: (result: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export type LogicVerificationBrowserBridgeServerOptions = {
  port: number
  host?: string
  devToken: string
  rpcTimeoutMs?: number
}

export class LogicVerificationBrowserBridgeServer {
  private wss: WebSocketServer | null = null
  private browserSocket: WebSocket | null = null
  private mcpSocket: WebSocket | null = null
  private pendingRpc = new Map<string, PendingRpc>()
  private readonly devToken: string
  private readonly rpcTimeoutMs: number

  constructor(private readonly options: LogicVerificationBrowserBridgeServerOptions) {
    this.devToken = options.devToken
    this.rpcTimeoutMs = options.rpcTimeoutMs ?? 30_000
  }

  get isListening(): boolean {
    return this.wss != null
  }

  get hasBrowser(): boolean {
    return this.browserSocket != null && this.browserSocket.readyState === this.browserSocket.OPEN
  }

  async start(): Promise<void> {
    if (this.wss) return
    const host = this.options.host ?? '127.0.0.1'
    await new Promise<void>((resolve, reject) => {
      const wss = new WebSocketServer({ host, port: this.options.port }, () => {
        this.wss = wss
        resolve()
      })
      wss.on('error', reject)
      wss.on('connection', (socket) => this.onConnection(socket))
    })
  }

  async stop(): Promise<void> {
    for (const pending of this.pendingRpc.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Bridge server stopped'))
    }
    this.pendingRpc.clear()
    this.browserSocket?.close()
    this.mcpSocket?.close()
    this.browserSocket = null
    this.mcpSocket = null
    if (!this.wss) return
    await new Promise<void>((resolve) => {
      this.wss!.close(() => resolve())
    })
    this.wss = null
  }

  waitForBrowser(timeoutMs: number): Promise<void> {
    if (this.hasBrowser) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs
      const tick = (): void => {
        if (this.hasBrowser) {
          resolve()
          return
        }
        if (Date.now() >= deadline) {
          reject(new Error('Timed out waiting for Builder browser attach'))
          return
        }
        setTimeout(tick, 50)
      }
      tick()
    })
  }

  /** MCP-side: forward RPC to the connected Builder tab. */
  invokeBrowserRpc(method: string, params?: unknown): Promise<unknown> {
    if (!this.mcpSocket || this.mcpSocket.readyState !== this.mcpSocket.OPEN) {
      return Promise.reject(new Error('MCP not connected to bridge'))
    }
    if (!this.hasBrowser) {
      return Promise.reject(new Error('No Builder tab attached'))
    }
    const id = `rpc-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const msg: LogicVerificationBridgeRpc = { type: 'rpc', id, method, params }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRpc.delete(id)
        reject(new Error(`RPC ${method} timed out`))
      }, this.rpcTimeoutMs)
      this.pendingRpc.set(id, { resolve, reject, timer })
      this.mcpSocket!.send(serializeLogicVerificationBridgeMessage(msg))
    })
  }

  private onConnection(socket: WebSocket): void {
    socket.on('message', (data) => {
      try {
        const text = typeof data === 'string' ? data : data.toString()
        const msg = parseLogicVerificationBridgeMessage(text)
        this.handleMessage(socket, msg)
      } catch (err) {
        socket.send(
          serializeLogicVerificationBridgeMessage({
            type: 'hello_ack',
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          }),
        )
      }
    })
    socket.on('close', () => {
      if (socket === this.browserSocket) this.browserSocket = null
      if (socket === this.mcpSocket) this.mcpSocket = null
    })
  }

  private handleMessage(socket: WebSocket, msg: LogicVerificationBridgeMessage): void {
    if (msg.type === 'hello') {
      try {
        verifyMcpDevToken(msg.devToken, this.devToken)
      } catch (err) {
        socket.send(
          serializeLogicVerificationBridgeMessage({
            type: 'hello_ack',
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          }),
        )
        socket.close()
        return
      }
      if (msg.role === 'browser') {
        if (this.browserSocket && this.browserSocket !== socket) {
          this.browserSocket.close()
        }
        this.browserSocket = socket
      } else if (msg.role === 'mcp') {
        if (this.mcpSocket && this.mcpSocket !== socket) {
          this.mcpSocket.close()
        }
        this.mcpSocket = socket
      }
      socket.send(serializeLogicVerificationBridgeMessage({ type: 'hello_ack', ok: true }))
      return
    }

    if (msg.type === 'rpc_result' || msg.type === 'rpc_error') {
      const pending = this.pendingRpc.get(msg.id)
      if (pending) {
        clearTimeout(pending.timer)
        this.pendingRpc.delete(msg.id)
        if (msg.type === 'rpc_result') {
          pending.resolve(msg.result)
        } else {
          pending.reject(new Error(msg.error))
        }
        return
      }
      const mcp = this.mcpSocket
      if (socket === this.browserSocket && mcp && mcp.readyState === mcp.OPEN) {
        mcp.send(serializeLogicVerificationBridgeMessage(msg))
      }
      return
    }

    if (msg.type === 'rpc') {
      if (socket !== this.mcpSocket) {
        socket.send(
          serializeLogicVerificationBridgeMessage({
            type: 'rpc_error',
            id: msg.id,
            ok: false,
            error: 'Only MCP role may invoke RPC',
          }),
        )
        return
      }
      if (!this.browserSocket || this.browserSocket.readyState !== this.browserSocket.OPEN) {
        socket.send(
          serializeLogicVerificationBridgeMessage({
            type: 'rpc_error',
            id: msg.id,
            ok: false,
            error: 'No Builder tab attached',
          }),
        )
        return
      }
      this.browserSocket.send(serializeLogicVerificationBridgeMessage(msg))
      return
    }

    if (msg.type === 'hello_ack') {
      return
    }
  }
}

/** Singleton started by Vite dev plugin; MCP attach uses the same port. */
let sharedBridge: LogicVerificationBrowserBridgeServer | null = null

export function getSharedLogicVerificationBrowserBridge(): LogicVerificationBrowserBridgeServer | null {
  return sharedBridge
}

export function setSharedLogicVerificationBrowserBridge(
  server: LogicVerificationBrowserBridgeServer | null,
): void {
  sharedBridge = server
}

export async function ensureSharedLogicVerificationBrowserBridge(
  options: LogicVerificationBrowserBridgeServerOptions,
): Promise<LogicVerificationBrowserBridgeServer> {
  if (sharedBridge?.isListening) return sharedBridge
  const server = new LogicVerificationBrowserBridgeServer(options)
  await server.start()
  setSharedLogicVerificationBrowserBridge(server)
  return server
}
