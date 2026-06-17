import { useCallback, useLayoutEffect, useState } from 'react'
import type { TransformerPipe, TransformerPipeBinding } from '@/types/transformer'
import type { PipeNavPathSegment } from '@/types/pipeNav'
import WorkspaceFloatingDrawer from '@/components/workspace/WorkspaceFloatingDrawer'
import { clampDrawerPosition, drawerPositionRelativeToHost } from '@/components/workspace/floatingDrawerLayout'
import PipeParamsJsonEditor from './PipeParamsJsonEditor'
import PipeParamsStrip from './PipeParamsStrip'
import { theme } from '@/config/theme'

export interface PipeConfigDrawerProps {
  pipe: TransformerPipe
  binding?: TransformerPipeBinding
  scopePath?: PipeNavPathSegment[]
  portalTarget: HTMLElement
  anchorRef: React.RefObject<HTMLElement | null>
  onClose: () => void
  onParamChange?: (key: string, value: unknown) => void
  onParamsReplace?: (params: Record<string, unknown>) => void
  /** Horizontal scroll offset of the container, used to adjust drawer positioning. */
  scrollLeft?: number
}

export default function PipeConfigDrawer({
  pipe,
  binding,
  scopePath,
  portalTarget,
  anchorRef,
  onClose,
  onParamChange,
  onParamsReplace,
  scrollLeft = 0,
}: PipeConfigDrawerProps) {
  const [drawerAnchor, setDrawerAnchor] = useState({ x: 0, y: 0 })
  const hasParamDefs = (pipe.paramDefs?.length ?? 0) > 0

  const updateDrawerAnchor = useCallback(() => {
    const host = portalTarget
    const el = anchorRef.current
    if (!host || !el) return
    const { x, y } = drawerPositionRelativeToHost(el, host)
    const drawerWidth = 360
    const clamped = clampDrawerPosition(
      { x, y },
      { width: drawerWidth, height: hasParamDefs ? 300 : 220 },
      { width: host.clientWidth, height: host.clientHeight },
    )
    setDrawerAnchor(clamped)
  }, [portalTarget, anchorRef, hasParamDefs])

  // Re-calculate position when drawer opens or scroll changes
  useLayoutEffect(() => {
    updateDrawerAnchor()
  }, [updateDrawerAnchor, scrollLeft])

  return (
    <WorkspaceFloatingDrawer
      testId="pipe-config-drawer"
      title={`Pipe params: ${pipe.name}`}
      onClose={onClose}
      initialLeft={drawerAnchor.x}
      initialTop={drawerAnchor.y + 28}
      portalTarget={portalTarget}
      initialHeight={hasParamDefs ? 300 : 220}
      resizable
      minWidth={280}
      minHeight={160}
      bodyOverflow="auto"
    >
      <p style={{ margin: '0 0 8px', fontSize: 11, color: theme.text.muted, lineHeight: 1.4 }}>
        This entity&apos;s pipe params — changes apply only to this entity.
      </p>
      {hasParamDefs ?
        <PipeParamsStrip pipe={pipe} binding={binding} onParamChange={onParamChange} />
      : <PipeParamsJsonEditor
          pipe={pipe}
          binding={binding}
          scopePath={scopePath}
          onParamsReplace={onParamsReplace}
        />
      }
    </WorkspaceFloatingDrawer>
  )
}
