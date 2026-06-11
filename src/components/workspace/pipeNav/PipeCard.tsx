import { useCallback, useRef, useState, type RefObject } from 'react'
import type { TransformerPipe, TransformerPipeBinding } from '@/types/transformer'
import type { PipeNavPathSegment } from '@/types/pipeNav'
import { theme } from '@/config/theme'
import { countEntitiesLinkingPipe } from '@/utils/commitTransformerConfigsToWorld'
import type { RennWorld } from '@/types/world'
import { normalizePipeMembers } from '@/utils/transformerPipeResolve'
import PipeConfigDrawer from './PipeConfigDrawer'
import PipeInlineControls from './PipeInlineControls'
import { pipeNavCardStyle } from './pipeNavStyles'

export interface PipeCardProps {
  pipe: TransformerPipe
  binding?: TransformerPipeBinding
  scopePath?: PipeNavPathSegment[]
  world: RennWorld
  depth: number
  isSelected: boolean
  enabled?: boolean
  stackIndex?: number
  drawerPortalTarget?: RefObject<HTMLDivElement | null>
  onSelect: () => void
  onDrillIn: () => void
  onToggleEnabled?: () => void
  onParamChange?: (key: string, value: unknown) => void
  onParamsReplace?: (params: Record<string, unknown>) => void
  onDecoupleBinding?: () => void
  decoupleDisabledReason?: string
}

export default function PipeCard({
  pipe,
  binding,
  scopePath,
  world,
  depth,
  isSelected,
  enabled = true,
  stackIndex,
  drawerPortalTarget,
  onSelect,
  onDrillIn,
  onToggleEnabled,
  onParamChange,
  onParamsReplace,
  onDecoupleBinding,
  decoupleDisabledReason,
}: PipeCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [toolsExpanded, setToolsExpanded] = useState(true)
  const [configOpen, setConfigOpen] = useState(false)

  const members = normalizePipeMembers(pipe)
  const stageCount = members.filter((m) => m.kind === 'stage').length
  const childPipeCount = members.filter((m) => m.kind === 'pipe').length
  const linkCount = countEntitiesLinkingPipe(world, pipe.id)
  const canDecouple =
    stackIndex !== undefined && binding?.mode !== 'copy' && linkCount > 1 && Boolean(onDecoupleBinding)
  const closeConfig = useCallback(() => setConfigOpen(false), [])

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      data-testid={`pipe-card-${pipe.id}`}
      onClick={onSelect}
      onDoubleClick={onDrillIn}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDrillIn()
      }}
      style={{
        ...pipeNavCardStyle(depth, isSelected),
        position: 'relative',
        minWidth: 160,
        maxWidth: 220,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        opacity: enabled ? 1 : 0.45,
        overflow: 'visible',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: theme.bg.thumbnailHeader,
          borderBottom: `1px solid ${theme.pipeNav.accentMuted}`,
          padding: '2px 6px',
          minHeight: 22,
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <PipeInlineControls
          toolsExpanded={toolsExpanded}
          onToolsExpandedChange={setToolsExpanded}
          enabled={enabled}
          onToggleEnabled={onToggleEnabled}
          linkCount={linkCount}
          onDecouple={canDecouple ? onDecoupleBinding : undefined}
          decoupleDisabledReason={decoupleDisabledReason}
          configOpen={configOpen}
          onConfigToggle={() => setConfigOpen((o) => !o)}
        />
      </div>

      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 12,
            color: theme.text.primary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {pipe.name}
        </div>
        <div style={{ fontSize: 10, color: theme.text.muted }}>
          {stageCount} stage{stageCount !== 1 ? 's' : ''}
          {childPipeCount > 0 ? ` · ${childPipeCount} nested` : ''}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDrillIn()
          }}
          title="Open pipe"
          style={{
            alignSelf: 'flex-end',
            padding: '2px 8px',
            fontSize: 10,
            fontWeight: 600,
            border: `1px solid ${theme.pipeNav.accentBorder}`,
            borderRadius: 4,
            background: 'transparent',
            color: theme.pipeNav.accent,
            cursor: 'pointer',
          }}
        >
          Open →
        </button>
      </div>

      {configOpen && drawerPortalTarget?.current ?
        <PipeConfigDrawer
          pipe={pipe}
          binding={binding}
          scopePath={scopePath}
          portalTarget={drawerPortalTarget.current}
          anchorRef={cardRef}
          onClose={closeConfig}
          onParamChange={onParamChange}
          onParamsReplace={onParamsReplace}
        />
      : null}
    </div>
  )
}
