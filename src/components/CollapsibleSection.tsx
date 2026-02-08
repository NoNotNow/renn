import { useState } from 'react'
import { sectionStyle, sectionTitleStyle } from './sharedStyles'

export interface CollapsibleSectionProps {
  title: string
  defaultCollapsed?: boolean
  children: React.ReactNode
}

export default function CollapsibleSection({
  title,
  defaultCollapsed = true,
  children,
}: CollapsibleSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  return (
    <div style={sectionStyle}>
      <div
        style={{
          ...sectionTitleStyle,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          userSelect: 'none',
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span style={{ fontSize: '0.7em' }}>{collapsed ? '▶' : '▼'}</span>
        <span>{title}</span>
      </div>
      {!collapsed && <div style={{ marginTop: 4 }}>{children}</div>}
    </div>
  )
}
