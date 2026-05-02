import type {
  AvatarFocusSnapshot,
  CameraConfig,
  CameraControl,
  CameraMode,
  Entity,
  EntityPreferredCamera,
} from '@/types/world'
import { DEFAULT_PERSPECTIVE_FOV_DEGREES } from '@/camera/cameraController'

/** First letter for avatar roster chips (name or id). Uses `charAt` for a stable hot path (fewer JIT bailouts on key handlers). */
export function avatarEntityIconLetter(entity: Entity): string {
  const name = entity.name?.trim()
  if (name !== undefined && name.length > 0) {
    return name.charAt(0).toUpperCase()
  }
  const id = entity.id
  return id.length > 0 ? id.charAt(0).toUpperCase() : '?'
}

/** True if entity participates in the avatar roster (when `avatar` is set and not disabled). */
export function entityIsPlayableAvatar(entity: Entity): boolean {
  if (entity.avatar === undefined) return false
  return entity.avatar.enabled !== false
}

/** Entity ids in roster order (same order as `entities` array). */
export function getAvatarRosterEntityIds(entities: Entity[]): string[] {
  const out: string[] = []
  for (const e of entities) {
    if (entityIsPlayableAvatar(e)) out.push(e.id)
  }
  return out
}

/**
 * Initial avatar: camera target if it is in the roster, otherwise first roster entry.
 */
export function pickInitialAvatarEntityId(
  entities: Entity[],
  cameraTarget: string,
): string | null {
  const roster = getAvatarRosterEntityIds(entities)
  if (roster.length === 0) return null
  if (cameraTarget && roster.includes(cameraTarget)) return cameraTarget
  return roster[0]!
}

const DEFAULT_MODE: CameraMode = 'follow'
const DEFAULT_CONTROL: CameraControl = 'follow'

/**
 * Build a focus snapshot for first-time focus (no session memory), merging world camera and entity preferred settings.
 */
export function buildAvatarFocusSnapshotFromPreferred(
  worldCamera: CameraConfig | undefined,
  preferred: EntityPreferredCamera | undefined,
  targetId: string,
): AvatarFocusSnapshot {
  const w = worldCamera
  const p = preferred ?? {}
  const distance = p.distance ?? w?.distance ?? 10
  const height = p.height ?? w?.height ?? 2
  const mode = p.mode ?? w?.mode ?? DEFAULT_MODE
  const control = p.control ?? w?.control ?? DEFAULT_CONTROL
  const fovConfig = p.fov ?? w?.fov
  const effectiveFov =
    mode === 'firstPerson'
      ? (fovConfig ?? DEFAULT_PERSPECTIVE_FOV_DEGREES)
      : DEFAULT_PERSPECTIVE_FOV_DEGREES

  const orbitYaw = typeof p.orbitYaw === 'number' ? p.orbitYaw : 0
  const orbitPitch = typeof p.orbitPitch === 'number' ? p.orbitPitch : 0
  const orbitDistance = typeof p.orbitDistance === 'number' ? p.orbitDistance : distance

  const rawVertical =
    typeof p.targetVerticalAngle === 'number'
      ? p.targetVerticalAngle
      : typeof w?.targetVerticalAngle === 'number'
        ? w.targetVerticalAngle
        : 0
  const targetVerticalAngle = Math.min(45, Math.max(-45, rawVertical))

  return {
    control,
    mode,
    target: targetId,
    distance,
    height,
    fov: fovConfig,
    orbitYaw,
    orbitPitch,
    orbitDistance,
    effectiveFovDegrees: effectiveFov,
    targetVerticalAngle,
  }
}
