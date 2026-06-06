import { useRef, useState, type RefObject } from 'react'
import type { TransformerPipe, TransformerPipeBinding } from '@/types/transformer'
import type { RennWorld } from '@/types/world'
import { countEntitiesLinkingPipe } from '@/utils/commitTransformerConfigsToWorld'
import PipeConfigDrawer from './PipeConfigDrawer'
import PipeInlineControls from './PipeInlineControls'

export interface PipeTreePipeControlsProps {
  pipe: TransformerPipe
  world: RennWorld
  binding?: TransformerPipeBinding
  enabled: boolean
  stackIndex?: number
  memberParentPipeId?: string
  memberIndex?: number
  drawerPortalTarget?: RefObject<HTMLDivElement | null>
  onToggleEnabled?: () => void
  onParamChange?: (key: string, value: unknown) => void
  onDecoupleBinding?: () => void
  useSharedDefaults?: boolean
}

export default function PipeTreePipeControls({
  pipe,
  world,
  binding,
  enabled,
  stackIndex,
  memberParentPipeId,
  memberIndex,
  drawerPortalTarget,
  onToggleEnabled,
  onParamChange,
  onDecoupleBinding,
  useSharedDefaults = false,
}: PipeTreePipeControlsProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [toolsExpanded, setToolsExpanded] = useState(true)
  const [configOpen, setConfigOpen] = useState(false)
  const linkCount = countEntitiesLinkingPipe(world, pipe.id)
  const canDecouple =
    stackIndex !== undefined && binding?.mode !== 'copy' && linkCount > 1 && Boolean(onDecoupleBinding)
  const hasParamDefs = (pipe.paramDefs?.length ?? 0) > 0

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
        onConfigToggle={hasParamDefs ? () => setConfigOpen((o) => !o) : undefined}
        hasConfig={hasParamDefs}
      />
      {configOpen && drawerPortalTarget?.current ?
        <PipeConfigDrawer
          pipe={pipe}
          binding={binding}
          portalTarget={drawerPortalTarget.current}
          anchorRef={anchorRef}
          onClose={() => setConfigOpen(false)}
          onParamChange={onParamChange}
          sharedDefaults={useSharedDefaults}
        />
      : null}
    </span>
  )
}
