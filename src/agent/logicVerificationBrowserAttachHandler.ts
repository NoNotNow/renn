/**
 * In-browser RPC handler: delegates to a live LogicVerificationHost (adopted scene).
 */

import { LogicVerificationHost, type LogicVerificationLiveSceneConfig } from '@/agent/logicVerificationHost'
import type { AgentObservationProbe } from '@/agent/agentObservationSession'
import type { LogicVerificationWorldPatch } from '@/agent/applyLogicVerificationWorldPatch'
import {
  enterLogicVerificationExclusiveStepping,
  exitLogicVerificationExclusiveStepping,
} from '@/agent/logicVerificationExclusiveStepping'
import {
  createInProcessLogicVerificationRunBackend,
  LogicVerificationRunController,
} from '@/agent/logicVerificationRunController'

export type LogicVerificationBrowserAttachHandlerState = {
  host: LogicVerificationHost | null
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
    runActive: false,
  }

  let controller: LogicVerificationRunController | null = null

  const ensureController = (): LogicVerificationRunController => {
    if (!controller) {
      const backend = createInProcessLogicVerificationRunBackend(
        () => {
          if (!state.host) {
            throw new Error('Builder scene not ready for logic verification attach')
          }
          return state.host
        },
        () => state.host?.getDt() ?? 1 / 60,
        {
          beforeStep: enterLogicVerificationExclusiveStepping,
          afterStep: exitLogicVerificationExclusiveStepping,
        },
      )
      controller = new LogicVerificationRunController(backend)
    }
    return controller
  }

  const adoptScene = (config: LogicVerificationLiveSceneConfig): void => {
    state.host?.dispose()
    state.host = LogicVerificationHost.adoptLiveScene(config)
  }

  const disposeHost = (): void => {
    state.host?.dispose()
    state.host = null
    controller?.resetRunState()
    state.runActive = false
  }

  const dispatchRpc = async (method: string, params: unknown): Promise<unknown> => {
    const run = ensureController()
    switch (method) {
      case 'get_status': {
        const host = state.host
        return {
          ready: host != null,
          runActive: run.isRunActive,
          simTime: host?.getSimTime() ?? 0,
          stepCount: host?.getStepCount() ?? 0,
        }
      }
      case 'validate_stage_code': {
        const { code, configKey } = params as { code: string; configKey?: string }
        return run.validateStageCode(code, configKey ?? 'stage')
      }
      case 'register_probes': {
        const { probes } = params as { probes: AgentObservationProbe[] }
        return run.registerProbes(probes)
      }
      case 'start_verification_run': {
        const result = await run.startVerificationRun(
          params as Parameters<LogicVerificationRunController['startVerificationRun']>[0],
        )
        state.runActive = true
        return result
      }
      case 'stop_observation_run': {
        const result = await run.stopRun()
        state.runActive = false
        return result
      }
      case 'run_steps': {
        const { count } = params as { count: number }
        return run.runSteps(count)
      }
      case 'run_for_sim_time': {
        const { seconds } = params as { seconds: number }
        return run.runForSimTime(seconds)
      }
      case 'get_observation': {
        const obs = await run.getObservation()
        return {
          timeline: obs.timeline,
          snapshot: obs.snapshot,
          compileErrors: obs.compileErrors,
          runtimeErrors: obs.runtimeErrorList,
        }
      }
      case 'apply_world_patch': {
        const patch = params as LogicVerificationWorldPatch
        return run.applyWorldPatch(patch)
      }
      default:
        throw new Error(`Unknown browser RPC method: ${method}`)
    }
  }

  return { state, adoptScene, disposeHost, dispatchRpc }
}
