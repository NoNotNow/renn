import type { CSSProperties } from 'react'
import { EntityPanelIcons } from '@/components/EntityPanelIcons'
import { theme } from '@/config/theme'

export interface PipeInlineControlsProps {
  compact?: boolean
  toolsExpanded: boolean
  onToolsExpandedChange: (expanded: boolean) => void
  enabled: boolean
  onToggleEnabled?: () => void
  linkCount: number
  onDecouple?: () => void
  decoupleDisabledReason?: string
  configOpen: boolean
  onConfigToggle?: () => void
}

/** Toolbar controls shared by pipe cards and tree rows (mirrors transformer card chrome, minus code). */
export default function PipeInlineControls({
  compact = false,
  toolsExpanded,
  onToolsExpandedChange,
  enabled,
  onToggleEnabled,
  linkCount,
  onDecouple,
  decoupleDisabledReason,
  configOpen,
  onConfigToggle,
}: PipeInlineControlsProps) {
  const showShare = linkCount > 1

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 2 : 4,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => onToolsExpandedChange(!toolsExpanded)}
        title={toolsExpanded ? 'Collapse tools' : 'Expand tools'}
        data-testid="pipe-controls-expand"
        style={iconBtnStyle}
      >
        <span
          style={{
            display: 'flex',
            transition: 'transform 0.2s ease',
            transform: toolsExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            color: theme.text.muted,
          }}
        >
          {EntityPanelIcons.chevronDown}
        </span>
      </button>

      {toolsExpanded ?
        <>
          {showShare ?
            <button
              type="button"
              disabled={!onDecouple}
              data-testid="pipe-controls-share"
              onClick={() => onDecouple?.()}
              title={
                onDecouple ?
                  `${linkCount} entities share this pipe — click to copy for this entity only`
                : (decoupleDisabledReason ??
                  `${linkCount} entities use this pipe. Changes affect all linked entities.`)
              }
              style={shareBtnStyle(Boolean(onDecouple))}
            >
              👤 x{linkCount}
            </button>
          : null}

          <button
            type="button"
            onClick={() => onToggleEnabled?.()}
            disabled={!onToggleEnabled}
            title={enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
            data-testid="pipe-controls-enabled"
            style={iconBtnStyle}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: enabled ? theme.status.enabled : theme.status.disabled,
              }}
            />
          </button>

          <button
            type="button"
            onClick={() => onConfigToggle?.()}
            disabled={!onConfigToggle}
            title="Edit pipe configuration"
            data-testid="pipe-controls-config"
            style={{
              ...iconBtnStyle,
              opacity: configOpen ? 1 : 0.6,
            }}
          >
            <span style={{ color: theme.text.muted, display: 'flex' }}>{EntityPanelIcons.settings}</span>
          </button>
        </>
      : null}
    </div>
  )
}

const iconBtnStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 2px',
}

function shareBtnStyle(active: boolean): CSSProperties {
  return {
    fontSize: 9,
    color: theme.text.accentBlue,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    padding: '1px 4px',
    margin: 0,
    border: `1px solid ${active ? 'rgba(74, 158, 255, 0.35)' : theme.border.default}`,
    borderRadius: 3,
    background: active ? 'rgba(74, 158, 255, 0.1)' : 'transparent',
    cursor: active ? 'pointer' : 'not-allowed',
    opacity: active ? 1 : 0.5,
  }
}
