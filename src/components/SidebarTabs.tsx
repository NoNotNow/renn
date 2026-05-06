export interface TabConfig<TTab extends string> {
  id: TTab
  icon: React.ReactNode
  label: string
}

export interface SidebarTabsProps<TTab extends string> {
  tabConfig: readonly TabConfig<TTab>[]
  activeTab: TTab
  onTabChange: (tab: TTab) => void
  /** Extra controls rendered at the end of the tab row (e.g. right sidebar actions). */
  trailing?: React.ReactNode
}

export default function SidebarTabs<TTab extends string>({
  tabConfig,
  activeTab,
  onTabChange,
  trailing,
}: SidebarTabsProps<TTab>) {
  const tabButtonStyle = (isActive: boolean) => ({
    padding: 6,
    background: isActive ? '#2b3550' : 'transparent',
    border: '1px solid transparent',
    borderRadius: 6,
    cursor: 'pointer',
    color: '#e6e9f2',
    transition: 'background 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  })

  const handleTabMouseEnter = (e: React.MouseEvent<HTMLButtonElement>, isActive: boolean) => {
    if (!isActive) {
      e.currentTarget.style.background = '#20263a'
      e.currentTarget.style.border = '1px solid #2f3545'
    }
  }

  const handleTabMouseLeave = (e: React.MouseEvent<HTMLButtonElement>, isActive: boolean) => {
    if (!isActive) {
      e.currentTarget.style.background = 'transparent'
      e.currentTarget.style.border = '1px solid transparent'
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: '1px solid #2f3545',
        background: 'rgba(17, 20, 28, 0.9)',
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          gap: 6,
          padding: 6,
          minWidth: 0,
          alignItems: 'center',
        }}
      >
        {tabConfig.map(({ id, icon, label }) => {
          const isActive = activeTab === id
          return (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={label}
              style={tabButtonStyle(isActive)}
              onClick={() => onTabChange(id)}
              onMouseEnter={(e) => handleTabMouseEnter(e, isActive)}
              onMouseLeave={(e) => handleTabMouseLeave(e, isActive)}
            >
              {icon}
            </button>
          )
        })}
      </div>
      {trailing != null ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '6px 8px 6px 6px',
            flexShrink: 0,
            borderLeft: '1px solid #2f3545',
          }}
        >
          {trailing}
        </div>
      ) : null}
    </div>
  )
}
