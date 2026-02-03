import { SidebarToggleButton } from '../SidebarToggleButton'
import SidebarTabs from '../SidebarTabs'

export interface SidebarProps {
  side: 'left' | 'right'
  isOpen: boolean
  onToggle: () => void
  tabs: readonly string[]
  activeTab: string
  onTabChange: (tab: string) => void
  children: React.ReactNode
  width?: number
  toggleLogContext: string
}

export default function Sidebar({
  side,
  isOpen,
  onToggle,
  tabs,
  activeTab,
  onTabChange,
  children,
  width = 240,
  toggleLogContext,
}: SidebarProps) {
  const isLeft = side === 'left'
  
  return (
    <div
      style={{
        position: 'absolute',
        [side]: 0,
        top: 0,
        bottom: 0,
        display: 'flex',
        height: '100%',
        zIndex: 100,
        pointerEvents: isOpen ? 'auto' : 'none',
        flexDirection: isLeft ? 'row' : 'row-reverse',
      }}
    >
      <aside
        style={{
          width: isOpen ? width : 0,
          [isLeft ? 'borderRight' : 'borderLeft']: '1px solid #2f3545',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: isOpen ? 'auto' : 'hidden',
          transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), padding 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          backgroundColor: 'rgba(27, 31, 42, 0.7)',
          boxShadow: isOpen ? `${isLeft ? '2' : '-2'}px 0 12px rgba(0,0,0,0.45)` : 'none',
          color: '#e6e9f2',
        }}
      >
        {isOpen && (
          <>
            <SidebarTabs
              tabs={tabs}
              activeTab={activeTab}
              onTabChange={onTabChange}
            />
            {children}
          </>
        )}
      </aside>

      <SidebarToggleButton
        isOpen={isOpen}
        onToggle={onToggle}
        side={side}
        logContext={toggleLogContext}
      />
    </div>
  )
}
