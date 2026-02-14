export interface TabConfig<TTab extends string> {
  id: TTab
  icon: React.ReactNode
  label: string
}

export interface SidebarTabsProps<TTab extends string> {
  tabConfig: readonly TabConfig<TTab>[]
  activeTab: TTab
  onTabChange: (tab: TTab) => void
}

export default function SidebarTabs<TTab extends string>({
  tabConfig,
  activeTab,
  onTabChange,
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
        gap: 6,
        padding: 6,
        borderBottom: '1px solid #2f3545',
        background: 'rgba(17, 20, 28, 0.9)',
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
  )
}
