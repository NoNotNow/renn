import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import type { Rotation, Vec3 } from '@/types/world'

/** Poses from `SceneView.getAllPoses` for inspector display only. */
export type LivePosesMap = Map<string, { position: Vec3; rotation: Rotation; scale: Vec3 }>

/**
 * Polls scene poses on an interval and re-renders **only** this subtree (not full `Builder`).
 * See `agent-context/performance-work.md` §11 Tier 3 item 11.
 */
export function InspectorLivePoseBridge({
  getPoses,
  intervalMs = 220,
  children,
}: {
  getPoses: () => LivePosesMap | null
  /** Default 220 ms — aligns with prior Builder poll (`performance-work.md` §8). */
  intervalMs?: number
  children: (livePoses: LivePosesMap | null) => ReactNode
}): ReactElement {
  const [livePoses, setLivePoses] = useState<LivePosesMap | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => {
      const poses = getPoses()
      if (poses && poses.size > 0) {
        setLivePoses(poses)
      }
    }, intervalMs)
    return () => clearInterval(id)
  }, [getPoses, intervalMs])

  return <>{children(livePoses)}</>
}
