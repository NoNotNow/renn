import { useState } from 'react'
import { sectionStyle, sectionTitleStyle } from './sharedStyles'

export interface CollapsibleSectionProps {
  title: string
  defaultCollapsed?: boolean
  /** Rendered on the same line as the title (e.g. lock button). Clicks do not toggle collapse. */
  trailing?: React.ReactNode
  children: React.ReactNode
}

export default function CollapsibleSection({
  title,
  // Default to expanded to match test expectations
  defaultCollapsed = false,
  trailing,
  children,
}: CollapsibleSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  return (
    <div style={sectionStyle}>
      <div
        style={{
          ...sectionTitleStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          userSelect: 'none',
        }}
      >
        <div
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          onClick={() => setCollapsed(!collapsed)}
        >
          <span style={{ fontSize: '0.7em' }}>{collapsed ? '▶' : '▼'}</span>
          <span>{title}</span>
        </div>
        {trailing && (
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center' }}>
            {trailing}
          </div>
        )}
      </div>
      {!collapsed && <div style={{ marginTop: 4 }}>{children}</div>}
    </div>
  )
}
