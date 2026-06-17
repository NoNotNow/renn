import { useRef, useState, type RefObject } from 'react'
import type { TransformerPipe, TransformerPipeBinding } from '@/types/transformer'
import type { PipeNavPathSegment } from '@/types/pipeNav'
import type { RennWorld } from '@/types/world'
import { countEntitiesLinkingPipe } from '@/utils/commitTransformerConfigsToWorld'
import PipeConfigDrawer from './PipeConfigDrawer'
import PipeInlineControls from './PipeInlineControls'

export interface PipeTreePipeControlsProps {
  pipe: TransformerPipe
  world: RennWorld
  binding?: TransformerPipeBinding
  scopePath?: PipeNavPathSegment[]
  enabled: boolean
  configOpen: boolean
  onConfigOpenChange: (open: boolean) => void
  stackIndex?: number
  memberParentPipeId?: string
  memberIndex?: number
  drawerPortalTarget?: RefObject<HTMLDivElement | null>
  /** Horizontal scroll offset of the parent container for proper drawer positioning. */
  scrollLeft?: number
  onToggleEnabled?: () => void
  onParamChange?: (key: string, value: unknown) => void
  onParamsReplace?: (params: Record<string, unknown>) => void
  onDecoupleBinding?: () => void
}

export default function PipeTreePipeControls({
  pipe,
  world,
  binding,
  scopePath,
  enabled,
  configOpen,
  onConfigOpenChange,
  stackIndex,
  drawerPortalTarget,
  scrollLeft = 0,
  onToggleEnabled,
  onParamChange,
  onParamsReplace,
  onDecoupleBinding,
}: PipeTreePipeControlsProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [toolsExpanded, setToolsExpanded] = useState(true)
  const linkCount = countEntitiesLinkingPipe(world, pipe.id)
  const canDecouple =
    stackIndex !== undefined && binding?.mode !== 'copy' && linkCount > 1 && Boolean(onDecoupleBinding)

  return (
    <span ref={anchorRef} style={{ display: 'inline-flex', flexShrink: 0 }}>
      <PipeInlineControls
        compact
        toolsExpanded={toolsExpanded}
        onToolsExpandedChange={setToolsExpanded}
        enabled={enabled}
        onToggleEnabled={onToggleEnabled}
        linkCount={linkCount}
        onDecouple={canDecouple ? onDecoupleBinding : undefined}
        configOpen={configOpen}
        onConfigToggle={() => onConfigOpenChange(!configOpen)}
      />
      {configOpen && drawerPortalTarget?.current ?
        <PipeConfigDrawer
          pipe={pipe}
          binding={binding}
          scopePath={scopePath}
          portalTarget={drawerPortalTarget.current}
          anchorRef={anchorRef}
          scrollLeft={scrollLeft}
          onClose={() => onConfigOpenChange(false)}
          onParamChange={onParamChange}
          onParamsReplace={onParamsReplace}
        />
      : null}
    </span>
  )
}
