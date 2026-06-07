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
  /** When true, edits apply to pipe.defaultParams (shared template). */
  sharedDefaults?: boolean
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
  sharedDefaults = false,
}: PipeConfigDrawerProps) {
  const [anchor, setAnchor] = useState({ x: 0, y: 0 })
  const hasParamDefs = (pipe.paramDefs?.length ?? 0) > 0

  const updateAnchor = useCallback(() => {
    const host = portalTarget
    const el = anchorRef.current
    if (!host || !el) return
    const { x, y } = drawerPositionRelativeToHost(el, host)
    const next = clampDrawerPosition(
      { x, y: y + 28 },
      host.getBoundingClientRect(),
      { width: 360, height: 280 },
    )
    setAnchor(next)
  }, [portalTarget, anchorRef])

  useLayoutEffect(() => {
    updateAnchor()
  }, [updateAnchor])

  return (
    <WorkspaceFloatingDrawer
      testId="pipe-config-drawer"
      title={`Pipe config: ${pipe.name}`}
      onClose={onClose}
      initialLeft={anchor.x}
      initialTop={anchor.y}
      portalTarget={portalTarget}
      initialHeight={hasParamDefs ? 300 : 220}
      resizable
      minWidth={280}
      minHeight={160}
      bodyOverflow="auto"
    >
      {sharedDefaults ?
        <p style={{ margin: '0 0 8px', fontSize: 11, color: theme.text.muted, lineHeight: 1.4 }}>
          Shared pipe defaults — affects all entities using this pipe definition.
        </p>
      : null}
      {hasParamDefs ?
        <PipeParamsStrip pipe={pipe} binding={binding} onParamChange={onParamChange} />
      : <PipeParamsJsonEditor
          pipe={pipe}
          binding={binding}
          scopePath={scopePath}
          sharedDefaults={sharedDefaults}
          onParamsReplace={onParamsReplace}
        />
      }
    </WorkspaceFloatingDrawer>
  )
}
