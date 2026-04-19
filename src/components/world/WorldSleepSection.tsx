import type { RennWorld, WorldSleepingSettings } from '@/types/world'
import { RECOMMENDED_SLEEPING_SETTINGS } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import NumberInput from '../form/NumberInput'
import { sectionStyle, sectionTitleStyle } from '../sharedStyles'
import { theme } from '@/config/theme'
import type { WorldPanelEdits } from './useWorldPanelEdits'

export interface WorldSleepSectionProps {
  world: RennWorld
  edits: WorldPanelEdits
}

export default function WorldSleepSection({ world, edits }: WorldSleepSectionProps) {
  const { pushUndo, updateWorldSettings } = edits

  const sleepingDisplay: WorldSleepingSettings =
    world.world.sleeping ?? RECOMMENDED_SLEEPING_SETTINGS

  const updateSleeping = (patch: Partial<WorldSleepingSettings>) => {
    const base = world.world.sleeping ?? RECOMMENDED_SLEEPING_SETTINGS
    const next: WorldSleepingSettings = { ...base, ...patch }
    uiLogger.change('WorldPanel', 'Change world sleeping', {
      oldValue: world.world.sleeping,
      newValue: next,
    })
    updateWorldSettings({ sleeping: next })
  }

  const setRecommendedSleeping = () => {
    pushUndo()
    uiLogger.change('WorldPanel', 'Set recommended sleeping', {
      oldValue: world.world.sleeping,
      newValue: RECOMMENDED_SLEEPING_SETTINGS,
    })
    updateWorldSettings({ sleeping: { ...RECOMMENDED_SLEEPING_SETTINGS } })
  }

  return (
    <div style={{ ...sectionStyle, marginTop: 12 }}>
      <div style={sectionTitleStyle}>Sleep</div>
      <p style={{ fontSize: 11, color: theme.text.muted, margin: '0 0 8px' }}>
        Custom sleep timer: velocities must stay below thresholds for the duration. Negative linear or angular
        threshold disables that check.
      </p>
      <NumberInput
        onBeforeCommit={pushUndo}
        id="world-sleep-linear"
        label="Linear threshold"
        labelTitle="Speed below which linear motion counts as “still” for the sleep timer. Negative disables the linear-speed check."
        value={sleepingDisplay.linearThreshold}
        onChange={(v) => updateSleeping({ linearThreshold: v })}
        step={0.05}
        defaultValue={RECOMMENDED_SLEEPING_SETTINGS.linearThreshold}
        logComponent="WorldPanel"
      />
      <NumberInput
        onBeforeCommit={pushUndo}
        id="world-sleep-angular"
        label="Angular threshold (rad/s)"
        labelTitle="Spin rate below which rotation counts as “still”. Negative disables the angular-speed check."
        value={sleepingDisplay.angularThreshold}
        onChange={(v) => updateSleeping({ angularThreshold: v })}
        step={0.05}
        defaultValue={RECOMMENDED_SLEEPING_SETTINGS.angularThreshold}
        logComponent="WorldPanel"
      />
      <NumberInput
        onBeforeCommit={pushUndo}
        id="world-sleep-time"
        label="Time until sleep (s)"
        labelTitle="Bodies must stay under both enabled thresholds for this long before Rapier may put them to sleep (stop integrating until woken)."
        value={sleepingDisplay.timeUntilSleep}
        onChange={(v) => updateSleeping({ timeUntilSleep: v })}
        min={0}
        step={0.1}
        defaultValue={RECOMMENDED_SLEEPING_SETTINGS.timeUntilSleep}
        logComponent="WorldPanel"
      />
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          onClick={setRecommendedSleeping}
          style={{
            fontSize: 12,
            padding: '6px 10px',
            borderRadius: 4,
            border: `1px solid ${theme.border.default}`,
            background: theme.bg.panel,
            color: theme.text.primary,
            cursor: 'pointer',
          }}
        >
          Set recommended
        </button>
      </div>
    </div>
  )
}
