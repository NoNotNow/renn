import type { CameraController } from '@/camera/cameraController'
import type { AvatarFocusSnapshot, CameraConfig, Entity } from '@/types/world'
import {
  buildAvatarFocusSnapshotFromPreferred,
  entityIsPlayableAvatar,
  getAvatarRosterEntityIds,
  pickInitialAvatarEntityId,
} from '@/utils/avatarUtils'

export interface AvatarSessionOptions {
  entities: Entity[]
  worldCamera: CameraConfig | undefined
  getCameraController: () => CameraController | null
  controlledEntityIdRef: { current: string | null }
  onCurrentAvatarChange?: (entityId: string | null) => void
}

/**
 * Play-mode avatar roster, session camera memory per entity, and input target ref.
 */
export class AvatarSession {
  private readonly lastFocusByEntityId = new Map<string, AvatarFocusSnapshot>()
  private entities: Entity[]
  private worldCamera: CameraConfig | undefined
  private readonly getCameraController: () => CameraController | null
  readonly controlledEntityIdRef: { current: string | null }
  private readonly onCurrentAvatarChange?: (entityId: string | null) => void

  constructor(options: AvatarSessionOptions) {
    this.entities = options.entities
    this.worldCamera = options.worldCamera
    this.getCameraController = options.getCameraController
    this.controlledEntityIdRef = options.controlledEntityIdRef
    this.onCurrentAvatarChange = options.onCurrentAvatarChange

    const initial = pickInitialAvatarEntityId(this.entities, this.worldCamera?.target ?? '')
    if (!initial) {
      this.controlledEntityIdRef.current = null
      this.onCurrentAvatarChange?.(null)
      return
    }
    this.controlledEntityIdRef.current = initial
    this.applyFocusForEntity(initial, false)
    this.onCurrentAvatarChange?.(initial)
  }

  getRosterEntityIds(): string[] {
    return getAvatarRosterEntityIds(this.entities)
  }

  getCurrentAvatarId(): string | null {
    return this.controlledEntityIdRef.current
  }

  /** Returns false if id is missing or not an avatar roster member. */
  setCurrentAvatar(entityId: string): boolean {
    const ent = this.entities.find((e) => e.id === entityId)
    if (!ent || !entityIsPlayableAvatar(ent)) return false
    const roster = this.getRosterEntityIds()
    if (!roster.includes(entityId)) return false

    const prev = this.controlledEntityIdRef.current
    if (prev === entityId) return true

    this.blurCurrent(prev)
    this.controlledEntityIdRef.current = entityId
    this.applyFocusForEntity(entityId, true)
    this.onCurrentAvatarChange?.(entityId)
    return true
  }

  cycleAvatar(delta: 1 | -1): void {
    const roster = this.getRosterEntityIds()
    if (roster.length < 2) return
    const current = this.controlledEntityIdRef.current
    let idx = current ? roster.indexOf(current) : 0
    if (idx < 0) idx = 0
    const nextIdx = (idx + delta + roster.length) % roster.length
    const nextId = roster[nextIdx]!
    this.setCurrentAvatar(nextId)
  }

  private blurCurrent(prevId: string | null): void {
    if (!prevId) return
    const cam = this.getCameraController()
    if (!cam) return
    const snap = cam.captureAvatarFocusState()
    snap.target = prevId
    this.lastFocusByEntityId.set(prevId, snap)
  }

  /**
   * @param fromSwitch - when true, we may restore session snapshot; initial load uses preferred/defaults only for that entity
   */
  private applyFocusForEntity(entityId: string, fromSwitch: boolean): void {
    const cam = this.getCameraController()
    if (!cam) return

    const saved = fromSwitch ? this.lastFocusByEntityId.get(entityId) : undefined
    if (saved) {
      const snap: AvatarFocusSnapshot = { ...saved, target: entityId }
      cam.applyAvatarFocusState(snap)
      return
    }

    const entity = this.entities.find((e) => e.id === entityId)
    const snap = buildAvatarFocusSnapshotFromPreferred(
      this.worldCamera,
      entity?.avatar?.preferredCamera,
      entityId,
    )
    cam.applyAvatarFocusState(snap)
  }
}
