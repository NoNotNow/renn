import type { RennWorld, SimulationSettings } from '@/types/world'
import {
  clampVideoTextureMaxAnisotropy,
  DEFAULT_SIMULATION,
  DEFAULT_VIDEO_TEXTURE_MAX_ANISOTROPY,
} from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import NumberInput from '../form/NumberInput'
import { sidebarRowStyle, sidebarLabelStyle, sectionStyle, sectionTitleStyle } from '../sharedStyles'
import { theme } from '@/config/theme'
import type { WorldPanelEdits } from './useWorldPanelEdits'

export interface WorldSimulationSectionProps {
  world: RennWorld
  edits: WorldPanelEdits
}

export default function WorldSimulationSection({ world, edits }: WorldSimulationSectionProps) {
  const { pushUndo, updateWorldSettings } = edits

  const simulation: SimulationSettings = world.world.simulation ?? {}
  const physicsHz = Math.round(1 / (simulation.fixedDt ?? DEFAULT_SIMULATION.fixedDt))
  const maxCatchUpSteps = simulation.maxStepsPerFrame ?? DEFAULT_SIMULATION.maxStepsPerFrame
  const timeScale = simulation.timeScale ?? DEFAULT_SIMULATION.timeScale

  const updateSimulation = (patch: Partial<SimulationSettings>): void => {
    updateWorldSettings({
      simulation: {
        ...world.world.simulation,
        fixedDt: world.world.simulation?.fixedDt ?? DEFAULT_SIMULATION.fixedDt,
        maxStepsPerFrame:
          world.world.simulation?.maxStepsPerFrame ?? DEFAULT_SIMULATION.maxStepsPerFrame,
        timeScale: world.world.simulation?.timeScale ?? DEFAULT_SIMULATION.timeScale,
        ...patch,
      },
    })
  }

  const updatePhysicsHz = (hz: number): void => {
    const clamped = Math.min(240, Math.max(15, Math.round(hz)))
    const nextFixed = 1 / clamped
    uiLogger.change('WorldPanel', 'Change physics rate (Hz)', { hz: clamped, fixedDt: nextFixed })
    updateSimulation({ fixedDt: nextFixed })
  }

  const updateMaxCatchUpSteps = (n: number): void => {
    const clamped = Math.min(10, Math.max(1, Math.round(n)))
    uiLogger.change('WorldPanel', 'Change max catch-up steps', { maxStepsPerFrame: clamped })
    updateSimulation({ maxStepsPerFrame: clamped })
  }

  const updateTimeScale = (v: number): void => {
    const clamped = Math.min(5, Math.max(0.1, v))
    uiLogger.change('WorldPanel', 'Change time scale', { timeScale: clamped })
    updateSimulation({ timeScale: clamped })
  }

  return (
    <div style={sectionStyle}>
      <div style={sectionTitleStyle}>Simulation</div>
      <p style={{ fontSize: 11, color: theme.text.muted, margin: '0 0 8px' }}>
        Fixed physics timestep with catch-up: simulation stays near real time when the display drops frames.
        Max catch-up steps caps work per frame to avoid a spiral of death on very slow hardware.
      </p>
      <NumberInput
        onBeforeCommit={pushUndo}
        id="world-physics-hz"
        label="Physics rate (Hz)"
        labelTitle="Fixed timestep for Rapier: simulation uses fixedDt = 1 / Hz. Higher values react faster and cost more CPU per second of sim time."
        value={physicsHz}
        onChange={updatePhysicsHz}
        min={15}
        max={240}
        step={1}
        defaultValue={60}
        logComponent="WorldPanel"
      />
      <NumberInput
        onBeforeCommit={pushUndo}
        id="world-max-catchup-steps"
        label="Max catch-up steps / frame"
        labelTitle="When a display frame takes longer than one physics step, the engine may run several steps in one frame to catch up. This caps how many, so a slow frame cannot trigger unbounded work (spiral of death)."
        value={maxCatchUpSteps}
        onChange={updateMaxCatchUpSteps}
        min={1}
        max={10}
        step={1}
        defaultValue={DEFAULT_SIMULATION.maxStepsPerFrame}
        logComponent="WorldPanel"
      />
      <NumberInput
        onBeforeCommit={pushUndo}
        id="world-time-scale"
        label="Time scale"
        labelTitle="Multiplies real wall-clock elapsed time before it feeds the physics accumulator. 1 = real time, below 1 = slow motion, above 1 = faster simulation."
        value={timeScale}
        onChange={updateTimeScale}
        min={0.1}
        max={5}
        step={0.1}
        defaultValue={DEFAULT_SIMULATION.timeScale}
        logComponent="WorldPanel"
      />
      <div style={{ ...sidebarRowStyle, marginTop: 8 }}>
        <label
          htmlFor="world-show-frame-stats"
          style={{ ...sidebarLabelStyle, cursor: 'help' }}
          title="Overlays FPS and last-frame milliseconds (physics, scripts, render, etc.) on the scene canvas. Useful for spotting bottlenecks."
        >
          Show frame stats overlay
        </label>
        <input
          id="world-show-frame-stats"
          type="checkbox"
          checked={world.world.showFrameStats === true}
          onChange={(e) => updateWorldSettings({ showFrameStats: e.target.checked })}
          style={{ cursor: 'pointer' }}
        />
      </div>
      <div style={{ ...sidebarRowStyle, marginTop: 8 }}>
        <label
          htmlFor="world-log-depth"
          style={{ ...sidebarLabelStyle, cursor: 'help' }}
          title="Improves depth precision over large near–far ranges so coplanar or intersecting opaque meshes flicker less at a distance. Uses a bit more GPU; turn off if you add custom post-processing that assumes linear depth."
        >
          Logarithmic depth buffer
        </label>
        <input
          id="world-log-depth"
          type="checkbox"
          checked={world.world.logarithmicDepthBuffer !== false}
          onChange={(e) =>
            updateWorldSettings({ logarithmicDepthBuffer: e.target.checked ? true : false })
          }
          style={{ cursor: 'pointer' }}
        />
      </div>
      <NumberInput
        onBeforeCommit={pushUndo}
        id="world-video-anisotropy"
        label="Video texture anisotropy (1–16)"
        labelTitle="Controls anisotropic filtering on material video maps. Higher values keep video detail cleaner at shallow viewing angles; 1 is the cheapest. The GPU may clamp the effective value."
        value={clampVideoTextureMaxAnisotropy(world.world.videoTextureMaxAnisotropy)}
        onChange={(v) => updateWorldSettings({ videoTextureMaxAnisotropy: clampVideoTextureMaxAnisotropy(v) })}
        min={1}
        max={16}
        step={1}
        defaultValue={DEFAULT_VIDEO_TEXTURE_MAX_ANISOTROPY}
        logComponent="WorldPanel"
      />
    </div>
  )
}
