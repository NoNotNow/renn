import type { RennWorld, Vec3 } from '@/types/world'
import { DEFAULT_GRAVITY } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import NumberInput from '../form/NumberInput'
import { sectionStyle, sectionTitleStyle } from '../sharedStyles'
import type { WorldPanelEdits } from './useWorldPanelEdits'

export interface WorldGravitySectionProps {
  world: RennWorld
  edits: WorldPanelEdits
}

export default function WorldGravitySection({ world, edits }: WorldGravitySectionProps) {
  const { pushUndo, updateWorldSettings } = edits
  const gravity: Vec3 = world.world.gravity ?? DEFAULT_GRAVITY
  const gravityValue = Math.abs(gravity[1])

  const updateGravity = (value: number) => {
    const newGravity: Vec3 = [0, -Math.abs(value), 0]
    uiLogger.change('WorldPanel', 'Change gravity', { oldValue: gravity, newValue: newGravity })
    updateWorldSettings({ gravity: newGravity })
  }

  return (
    <div style={sectionStyle}>
      <div style={sectionTitleStyle}>Gravity</div>
      <NumberInput
        onBeforeCommit={pushUndo}
        id="world-gravity"
        label="Strength"
        labelTitle="Magnitude of downward gravity along −Y (scene units per second squared). Uses the absolute value you enter."
        value={gravityValue}
        onChange={updateGravity}
        min={0}
        step={0.1}
        defaultValue={9.81}
        logComponent="WorldPanel"
      />
    </div>
  )
}
