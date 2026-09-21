/**
 * Dev-only: connect open Builder scene to localhost logic verification bridge.
 */

import { useEffect, useRef } from 'react'
import type { LoadedEntity } from '@/loader/loadWorld'
import type { PhysicsWorld } from '@/physics/rapierPhysics'
import type { AvatarSession } from '@/runtime/avatarSession'
import type { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import type { RennWorld } from '@/types/world'
import { DEFAULT_LOGIC_VERIFICATION_DT } from '@/agent/logicVerificationHost'

export type UseLogicVerificationBrowserAttachArgs = {
  enabled: boolean
  registryRef: React.RefObject<RenderItemRegistry | null>
  physicsRef: React.RefObject<PhysicsWorld | null>
  worldRef: React.RefObject<RennWorld>
  entitiesRef: React.RefObject<LoadedEntity[]>
  avatarSessionRef?: React.RefObject<AvatarSession | null>
}

export function useLogicVerificationBrowserAttach({
  enabled,
  registryRef,
  physicsRef,
  worldRef,
  entitiesRef,
  avatarSessionRef,
}: UseLogicVerificationBrowserAttachArgs): void {
  const sessionRef = useRef<{ dispose: () => void } | null>(null)

  useEffect(() => {
    if (!enabled) {
      sessionRef.current?.dispose()
      sessionRef.current = null
      return
    }

    let cancelled = false
    void import('@/agent/logicVerificationBrowserAttachClient').then(({ startLogicVerificationBrowserAttach }) => {
      if (cancelled) return
      sessionRef.current?.dispose()
      sessionRef.current = startLogicVerificationBrowserAttach({
        getLiveSceneConfig: () => {
          const registry = registryRef.current
          const physicsWorld = physicsRef.current
          const world = worldRef.current
          const entities = entitiesRef.current
          if (!registry || !physicsWorld || !world) {
            return null
          }
          return {
            world,
            registry,
            physicsWorld,
            entities: entities ?? [],
            dt: DEFAULT_LOGIC_VERIFICATION_DT,
            controlledEntityIdRef: avatarSessionRef?.current?.controlledEntityIdRef,
          }
        },
      })
    })

    return () => {
      cancelled = true
      sessionRef.current?.dispose()
      sessionRef.current = null
    }
  }, [enabled, registryRef, physicsRef, worldRef, entitiesRef, avatarSessionRef])
}
