/**
 * MCP process side: WebSocket client to dev bridge (forwards RPC to Builder tab).
 */

import WebSocket from 'ws'
import {
  parseLogicVerificationBridgeMessage,
  serializeLogicVerificationBridgeMessage,
  DEFAULT_LOGIC_VERIFICATION_BROWSER_PORT,
  type LogicVerificationBridgeRpc,
} from '@/agent/logicVerificationBrowserProtocol'

export type LogicVerificationBrowserMcpClientOptions = {
  port?: number
  host?: string
  devToken: string
  connectTimeoutMs?: number
}

type Pending = {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class LogicVerificationBrowserMcpClient {
  private socket: WebSocket | null = null
  private pending = new Map<string, Pending>()
  private readonly url: string
  private readonly devToken: string
  private readonly connectTimeoutMs: number
  private readonly rpcTimeoutMs = 30_000

  constructor(options: LogicVerificationBrowserMcpClientOptions) {
    const host = options.host ?? '127.0.0.1'
    const port = options.port ?? DEFAULT_LOGIC_VERIFICATION_BROWSER_PORT
    this.url = `ws://${host}:${port}`
    this.devToken = options.devToken
    this.connectTimeoutMs = options.connectTimeoutMs ?? 5_000
  }

  get isConnected(): boolean {
    return this.socket != null && this.socket.readyState === WebSocket.OPEN
  }

  async connect(): Promise<void> {
    if (this.isConnected) return
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timed out connecting to logic verification browser bridge'))
      }, this.connectTimeoutMs)
      const socket = new WebSocket(this.url)
      socket.on('open', () => {
        socket.send(
          serializeLogicVerificationBridgeMessage({
            type: 'hello',
            role: 'mcp',
            devToken: this.devToken,
          }),
        )
      })
      socket.on('message', (data) => {
        try {
          const msg = parseLogicVerificationBridgeMessage(data.toString())
          if (msg.type === 'hello_ack') {
            clearTimeout(timer)
            if (!msg.ok) {
              reject(new Error(msg.error ?? 'hello rejected'))
              socket.close()
              return
            }
            this.socket = socket
            resolve()
            return
          }
          if (msg.type === 'rpc_result') {
            const pending = this.pending.get(msg.id)
            if (!pending) return
            clearTimeout(pending.timer)
            this.pending.delete(msg.id)
            pending.resolve(msg.result)
            return
          }
          if (msg.type === 'rpc_error') {
            const pending = this.pending.get(msg.id)
            if (!pending) return
            clearTimeout(pending.timer)
            this.pending.delete(msg.id)
            pending.reject(new Error(msg.error))
          }
        } catch (err) {
          clearTimeout(timer)
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      })
      socket.on('error', (err) => {
        clearTimeout(timer)
        reject(err instanceof Error ? err : new Error(String(err)))
      })
      socket.on('close', () => {
        if (this.socket === socket) {
          this.socket = null
        }
        for (const p of this.pending.values()) {
          clearTimeout(p.timer)
          p.reject(new Error('Browser bridge disconnected'))
        }
        this.pending.clear()
      })
    })
  }

  async invoke(method: string, params?: unknown): Promise<unknown> {
    if (!this.isConnected) {
      throw new Error('Not connected to browser bridge')
    }
    const id = `mcp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const rpc: LogicVerificationBridgeRpc = { type: 'rpc', id, method, params }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Browser RPC ${method} timed out`))
      }, this.rpcTimeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.socket!.send(serializeLogicVerificationBridgeMessage(rpc))
    })
  }

  dispose(): void {
    this.socket?.close()
    this.socket = null
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(new Error('Client disposed'))
    }
    this.pending.clear()
  }
}
