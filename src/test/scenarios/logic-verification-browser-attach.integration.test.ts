/**
 * Builder browser attach: WebSocket bridge + MCP session proxy (simulated Builder tab).
 */

import { describe, it, expect, afterEach } from 'vitest'
import WebSocket from 'ws'
import {
  LogicVerificationBrowserBridgeServer,
  setSharedLogicVerificationBrowserBridge,
} from '@/agent/logicVerificationBrowserBridgeServer'
import { LogicVerificationMcpSession } from '@/agent/logicVerificationMcpSession'
import { createLogicVerificationBrowserAttachHandler } from '@/agent/logicVerificationBrowserAttachHandler'
import { serializeLogicVerificationBridgeMessage } from '@/agent/logicVerificationBrowserProtocol'
import { handleLogicVerificationBrowserRpcMessage } from '@/agent/logicVerificationBrowserRpcLoop'
import { createLogicVerificationHost } from '@/agent/logicVerificationHost'
import {
  AGENT_VERIFICATION_CAR_WARMUP_STEPS,
  loadAgentVerificationCarWorld,
} from '@/agent/fixtures/agentVerificationCarWorld'
import { resetLogicVerificationExclusiveSteppingForTests } from '@/agent/logicVerificationExclusiveStepping'
import { resetTransformerWatchBridgeForTests } from '@/runtime/transformerWatchBridge'
import { resetTransformerTraceBridgeForTests } from '@/runtime/transformerTraceBridge'

const DEV_TOKEN = 'vitest-browser-attach-token'

async function startSimulatedBuilderTab(port: number): Promise<() => void> {
  const host = await createLogicVerificationHost({
    world: loadAgentVerificationCarWorld(),
    warmupSteps: AGENT_VERIFICATION_CAR_WARMUP_STEPS,
  })
  const handler = createLogicVerificationBrowserAttachHandler()
  handler.adoptScene(host.getLiveSceneConfig())

  const socket = new WebSocket(`ws://127.0.0.1:${port}`)
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve())
    socket.once('error', reject)
  })
  socket.send(
    serializeLogicVerificationBridgeMessage({
      type: 'hello',
      role: 'browser',
      devToken: DEV_TOKEN,
    }),
  )

  socket.on('message', (data) => {
    void handleLogicVerificationBrowserRpcMessage(
      data.toString(),
      handler.dispatchRpc,
      (payload) => socket.send(payload),
    )
  })

  return () => {
    socket.close()
    handler.disposeHost()
    host.dispose()
  }
}

describe('Logic verification browser attach (integration)', () => {
  let bridge: LogicVerificationBrowserBridgeServer | null = null
  let stopBrowser: (() => void) | null = null

  afterEach(async () => {
    stopBrowser?.()
    stopBrowser = null
    await bridge?.stop()
    setSharedLogicVerificationBrowserBridge(null)
    bridge = null
    resetTransformerWatchBridgeForTests()
    resetTransformerTraceBridgeForTests()
    resetLogicVerificationExclusiveSteppingForTests()
  })

  it('MCP attach_browser drives observation on simulated Builder tab', async () => {
    const port = 19234 + Math.floor(Math.random() * 1000)
    bridge = new LogicVerificationBrowserBridgeServer({ port, devToken: DEV_TOKEN })
    await bridge.start()
    setSharedLogicVerificationBrowserBridge(bridge)
    stopBrowser = await startSimulatedBuilderTab(port)

    const session = new LogicVerificationMcpSession()
    await session.attachBrowser({ devToken: DEV_TOKEN, port, waitForBrowserMs: 5_000 })

    await session.registerProbesAsync([
      { id: 'carPose', kind: 'entityPose', entityId: 'car', intervalMs: 50 },
    ])
    await session.startVerificationRunAsync({ inputKeys: { w: true, d: true } })
    const stepped = await session.runForSimTimeAsync(2)
    expect(stepped.poses.car?.position[2]).not.toBe(0)

    const obs = await session.getObservationAsync()
    expect(obs.timeline.length).toBeGreaterThan(0)
    await session.dispose()
  })

  it('re-adopt between start and run keeps scripted input (browser bridge RPC pattern)', async () => {
    const port = 19234 + Math.floor(Math.random() * 1000)
    bridge = new LogicVerificationBrowserBridgeServer({ port, devToken: DEV_TOKEN })
    await bridge.start()
    setSharedLogicVerificationBrowserBridge(bridge)
    stopBrowser = await startSimulatedBuilderTab(port)

    const handler = createLogicVerificationBrowserAttachHandler()
    const host = await createLogicVerificationHost({
      world: loadAgentVerificationCarWorld(),
      warmupSteps: AGENT_VERIFICATION_CAR_WARMUP_STEPS,
    })
    handler.adoptScene(host.getLiveSceneConfig())

    await handler.dispatchRpc('start_verification_run', { inputKeys: { w: true, d: true } })
    handler.adoptScene(host.getLiveSceneConfig())
    const stepped = (await handler.dispatchRpc('run_for_sim_time', { seconds: 2 })) as {
      poses: { car?: { position: [number, number, number] } }
    }
    expect(stepped.poses.car?.position[2]).not.toBe(0)
    host.dispose()
  })
})
