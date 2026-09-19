/**
 * Shared browser-side WebSocket RPC loop for logic verification attach.
 */

import {
  parseLogicVerificationBridgeMessage,
  serializeLogicVerificationBridgeMessage,
  type LogicVerificationBridgeRpc,
} from '@/agent/logicVerificationBrowserProtocol'

export type LogicVerificationRpcDispatch = (
  method: string,
  params: unknown,
) => Promise<unknown>

export type LogicVerificationBrowserRpcSend = (payload: string) => void

/**
 * Handle one inbound bridge message: run `dispatchRpc` for RPC requests and send result/error.
 */
export async function handleLogicVerificationBrowserRpcMessage(
  raw: string,
  dispatchRpc: LogicVerificationRpcDispatch,
  send: LogicVerificationBrowserRpcSend,
): Promise<void> {
  const msg = parseLogicVerificationBridgeMessage(raw)
  if (msg.type !== 'rpc') return
  const rpc = msg as LogicVerificationBridgeRpc
  try {
    const result = await dispatchRpc(rpc.method, rpc.params)
    send(
      serializeLogicVerificationBridgeMessage({
        type: 'rpc_result',
        id: rpc.id,
        ok: true,
        result,
      }),
    )
  } catch (err) {
    send(
      serializeLogicVerificationBridgeMessage({
        type: 'rpc_error',
        id: rpc.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
  }
}
