import { useState } from 'react'
import { sectionStyle, sectionTitleStyle } from './sharedStyles'
import { useCopyMenuOptional } from '@/contexts/CopyContext'

export interface CollapsibleSectionProps {
  title: string
  defaultCollapsed?: boolean
  /** Rendered on the same line as the title (e.g. lock button). Clicks do not toggle collapse. */
  trailing?: React.ReactNode
  /** When set, right-click on the section header opens "Copy to clipboard" with this payload (JSON). */
  copyPayload?: object | (() => object)
  children: React.ReactNode
}

export default function CollapsibleSection({
  title,
  // Default to expanded to match test expectations
  defaultCollapsed = false,
  trailing,
  copyPayload,
  children,
}: CollapsibleSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const copyMenu = useCopyMenuOptional()

  const handleContextMenu =
    copyPayload != null && copyMenu
      ? (e: React.MouseEvent) => {
          e.preventDefault()
          const getPayload = () =>
            typeof copyPayload === 'function' ? (copyPayload as () => object)() : copyPayload
          copyMenu.openMenu(e, getPayload)
        }
      : undefined

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
        onContextMenu={handleContextMenu}
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
