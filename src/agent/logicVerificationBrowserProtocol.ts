/**
 * JSON messages for dev-only Builder ↔ MCP WebSocket bridge (localhost).
 */

export const DEFAULT_LOGIC_VERIFICATION_BROWSER_PORT = 9234

export type LogicVerificationBridgeRole = 'browser' | 'mcp'

export type LogicVerificationBridgeHello = {
  type: 'hello'
  role: LogicVerificationBridgeRole
  devToken: string
}

export type LogicVerificationBridgeHelloAck = {
  type: 'hello_ack'
  ok: boolean
  error?: string
}

export type LogicVerificationBridgeRpc = {
  type: 'rpc'
  id: string
  method: string
  params?: unknown
}

export type LogicVerificationBridgeRpcResult = {
  type: 'rpc_result'
  id: string
  ok: true
  result: unknown
}

export type LogicVerificationBridgeRpcError = {
  type: 'rpc_error'
  id: string
  ok: false
  error: string
}

export type LogicVerificationBridgeMessage =
  | LogicVerificationBridgeHello
  | LogicVerificationBridgeHelloAck
  | LogicVerificationBridgeRpc
  | LogicVerificationBridgeRpcResult
  | LogicVerificationBridgeRpcError

export function parseLogicVerificationBridgeMessage(raw: string): LogicVerificationBridgeMessage {
  const parsed = JSON.parse(raw) as LogicVerificationBridgeMessage
  if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
    throw new Error('Invalid bridge message')
  }
  return parsed
}

export function serializeLogicVerificationBridgeMessage(msg: LogicVerificationBridgeMessage): string {
  return JSON.stringify(msg)
}

/** RPC method names the browser host implements (mirror MCP session surface). */
export const LOGIC_VERIFICATION_BROWSER_RPC_METHODS = [
  'get_status',
  'register_probes',
  'start_verification_run',
  'stop_observation_run',
  'run_steps',
  'run_for_sim_time',
  'get_observation',
  'apply_world_patch',
  'validate_stage_code',
  'load_example_world',
  'load_saved_project',
  'save_project_as',
  'save_project',
  'patch_entity_material_color',
  'get_saved_entity_material_color',
] as const

export type LogicVerificationBrowserRpcMethod =
  (typeof LOGIC_VERIFICATION_BROWSER_RPC_METHODS)[number]
