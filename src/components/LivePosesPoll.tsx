import { useEffect, useState, type MutableRefObject, type ReactElement, type ReactNode } from 'react'
import type { Rotation, Vec3 } from '@/types/world'

/** Poses from `SceneView.getAllPoses` for inspector display only. */
export type LivePosesMap = Map<string, { position: Vec3; rotation: Rotation; scale: Vec3 }>

/**
 * Polls scene poses on an interval and re-renders **only** this subtree (not full `Builder`).
 * `getPosesRef.current` should be updated each render so the interval always reads the latest scene handle.
 */
export function LivePosesPoll({
  getPosesRef,
  intervalMs = 100,
  children,
}: {
  getPosesRef: MutableRefObject<() => LivePosesMap | null>
  intervalMs?: number
  children: (livePoses: LivePosesMap | null) => ReactNode
}): ReactElement {
  const [livePoses, setLivePoses] = useState<LivePosesMap | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => {
      const poses = getPosesRef.current()
      if (poses && poses.size > 0) {
        setLivePoses(poses)
      }
    }, intervalMs)
    return () => clearInterval(id)
  }, [getPosesRef, intervalMs])

  return <>{children(livePoses)}</>
}
