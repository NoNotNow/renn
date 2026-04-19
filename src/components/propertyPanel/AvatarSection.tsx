import type { RennWorld, Entity, CameraMode } from '@/types/world'
import { CAMERA_MODE_CYCLE_ORDER, CAMERA_MODE_LABELS } from '@/types/world'
import { uiLogger } from '@/utils/uiLogger'
import { theme } from '@/config/theme'
import Switch from '../Switch'
import { fieldLabelStyle, sidebarTextInputStyle } from '../sharedStyles'

type MergedAvatar = Entity['avatar'] | null

export interface AvatarSectionProps {
  ids: string[]
  primaryEntity: Entity
  isMulti: boolean
  mergedAvatar: MergedAvatar
  anyLocked: boolean
  world: RennWorld
  onUndoBeforeEdit?: () => void
  updateAll: (patch: Partial<Entity>) => void
}

export default function AvatarSection({
  ids,
  primaryEntity,
  isMulti,
  mergedAvatar,
  anyLocked,
  world,
  onUndoBeforeEdit,
  updateAll,
}: AvatarSectionProps) {
  const switchChecked =
    mergedAvatar !== undefined && mergedAvatar !== null && mergedAvatar.enabled !== false
  const showDetails =
    !isMulti && mergedAvatar && mergedAvatar !== null && mergedAvatar.enabled !== false
  return (
    <>
      <Switch
        labelTitle="Playable character for the runtime: uses avatar scripts, optional preferred camera, and +/- bindings when the game HUD is visible."
        checked={switchChecked}
        disabled={anyLocked || mergedAvatar === null}
        onChange={(checked) => {
          onUndoBeforeEdit?.()
          uiLogger.change('PropertyPanel', 'Toggle entity avatar', { entityIds: ids, value: checked })
          updateAll(checked ? { avatar: { enabled: true } } : { avatar: undefined })
        }}
        label="Playable avatar (+/− when Game HUD on, scripts)"
      />
      {mergedAvatar === null ? (
        <div style={{ fontSize: 11, color: theme.text.mixedValues, marginTop: 6 }}>
          Mixed avatar settings
        </div>
      ) : null}
      {showDetails ? (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label
            style={{ ...fieldLabelStyle, cursor: 'help' }}
            title="Camera behavior when following this avatar in play mode (overrides world default when set)."
          >
            Preferred camera mode
          </label>
          <select
            value={primaryEntity.avatar?.preferredCamera?.mode ?? world.world.camera?.mode ?? 'follow'}
            onChange={(e) => {
              const mode = e.target.value as CameraMode
              onUndoBeforeEdit?.()
              uiLogger.change('PropertyPanel', 'Avatar preferred camera mode', { entityIds: ids, mode })
              const a = primaryEntity.avatar ?? { enabled: true as const }
              updateAll({
                avatar: {
                  ...a,
                  enabled: a.enabled !== false,
                  preferredCamera: { ...(a.preferredCamera ?? {}), mode },
                },
              })
            }}
            disabled={anyLocked}
            style={{ ...sidebarTextInputStyle, padding: '6px 8px' }}
          >
            {CAMERA_MODE_CYCLE_ORDER.map((m) => (
              <option key={m} value={m}>
                {CAMERA_MODE_LABELS[m]}
              </option>
            ))}
          </select>
          <label
            style={{ ...fieldLabelStyle, cursor: 'help' }}
            title="Follow/third-person distance from the avatar; leave empty to use the world camera default."
          >
            Preferred distance
          </label>
          <input
            type="number"
            step={0.5}
            min={0}
            value={primaryEntity.avatar?.preferredCamera?.distance ?? ''}
            placeholder="World default"
            onChange={(e) => {
              const raw = e.target.value
              onUndoBeforeEdit?.()
              const a = primaryEntity.avatar ?? { enabled: true as const }
              const nextPref = { ...(a.preferredCamera ?? {}) }
              if (raw === '') delete nextPref.distance
              else nextPref.distance = Number(raw)
              uiLogger.change('PropertyPanel', 'Avatar preferred distance', { entityIds: ids, raw })
              updateAll({
                avatar: {
                  ...a,
                  enabled: a.enabled !== false,
                  preferredCamera: nextPref,
                },
              })
            }}
            disabled={anyLocked}
            style={sidebarTextInputStyle}
          />
        </div>
      ) : null}
    </>
  )
}
