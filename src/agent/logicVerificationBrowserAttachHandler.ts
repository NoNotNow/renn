/**
 * In-browser RPC handler: delegates to a live LogicVerificationHost (adopted scene).
 */

import {
  buildScriptedRawInput,
  LogicVerificationHost,
  type LogicVerificationInputScript,
} from '@/agent/logicVerificationHost'
import type { AgentObservationProbe } from '@/agent/agentObservationSession'
import type { LogicVerificationWorldPatch } from '@/agent/applyLogicVerificationWorldPatch'
import { validateCustomTransformerSource } from '@/transformers/customCodeTransformer'
import {
  enterLogicVerificationExclusiveStepping,
  exitLogicVerificationExclusiveStepping,
} from '@/agent/logicVerificationExclusiveStepping'
import type { LogicVerificationLiveSceneConfig } from '@/agent/logicVerificationHost'

export type LogicVerificationBrowserAttachHandlerState = {
  host: LogicVerificationHost | null
  inputScript: LogicVerificationInputScript | undefined
  runActive: boolean
}

export function createLogicVerificationBrowserAttachHandler(): {
  state: LogicVerificationBrowserAttachHandlerState
  adoptScene: (config: LogicVerificationLiveSceneConfig) => void
  disposeHost: () => void
  dispatchRpc: (method: string, params: unknown) => Promise<unknown>
} {
  const state: LogicVerificationBrowserAttachHandlerState = {
    host: null,
    inputScript: undefined,
    runActive: false,
  }

  const adoptScene = (config: LogicVerificationLiveSceneConfig): void => {
    state.host?.dispose()
    state.host = LogicVerificationHost.adoptLiveScene(config)
    // Keep inputScript / runActive — MCP may call run_for_sim_time on the next RPC.
  }

  const disposeHost = (): void => {
    state.host?.dispose()
    state.host = null
    state.runActive = false
    state.inputScript = undefined
  }

  const requireHost = (): LogicVerificationHost => {
    if (!state.host) {
      throw new Error('Builder scene not ready for logic verification attach')
    }
    return state.host
  }

  const dispatchRpc = async (method: string, params: unknown): Promise<unknown> => {
    switch (method) {
      case 'get_status': {
        const host = state.host
        return {
          ready: host != null,
          runActive: state.runActive,
          simTime: host?.getSimTime() ?? 0,
          stepCount: host?.getStepCount() ?? 0,
        }
      }
      case 'validate_stage_code': {
        const { code, configKey } = params as { code: string; configKey?: string }
        const message = validateCustomTransformerSource(code, configKey ?? 'stage')
        if (message) return { ok: false, message }
        return { ok: true }
      }
      case 'register_probes': {
        const { probes } = params as { probes: AgentObservationProbe[] }
        requireHost().registerObservationProbes(probes)
        return { registered: probes.length }
      }
      case 'start_verification_run': {
        const input = params as {
          carryOverTimeline?: boolean
          inputKeys?: Partial<Record<'w' | 'a' | 's' | 'd' | 'space' | 'shift', boolean>>
        }
        const host = requireHost()
        if (input?.inputKeys) {
          const keys = input.inputKeys
          state.inputScript = () => buildScriptedRawInput(keys)
        } else {
          state.inputScript = undefined
        }
        host.startObservationRun({ carryOverTimeline: input?.carryOverTimeline })
        state.runActive = true
        return { started: true }
      }
      case 'stop_observation_run': {
        if (state.host) {
          state.host.stopObservationRun()
        }
        state.runActive = false
        state.inputScript = undefined
        return { stopped: true }
      }
      case 'run_steps': {
        const { count } = params as { count: number }
        enterLogicVerificationExclusiveStepping()
        try {
          return requireHost().runSteps(count, state.inputScript)
        } finally {
          exitLogicVerificationExclusiveStepping()
        }
      }
      case 'run_for_sim_time': {
        const { seconds } = params as { seconds: number }
        const host = requireHost()
        const stepCount = Math.max(0, Math.ceil(seconds / host.getDt()))
        enterLogicVerificationExclusiveStepping()
        try {
          return host.runSteps(stepCount, state.inputScript)
        } finally {
          exitLogicVerificationExclusiveStepping()
        }
      }
      case 'get_observation': {
        const host = requireHost()
        const session = host.getObservationSession()
        return {
          timeline: host.getObservationTimeline(),
          snapshot: host.snapshot(),
          compileErrors: session.getCompileErrors(),
          runtimeErrors: [...session.getRuntimeErrors().values()],
        }
      }
      case 'apply_world_patch': {
        const patch = params as LogicVerificationWorldPatch
        return requireHost().applyWorldPatch(patch)
      }
      default:
        throw new Error(`Unknown browser RPC method: ${method}`)
    }
  }

  return { state, adoptScene, disposeHost, dispatchRpc }
}
