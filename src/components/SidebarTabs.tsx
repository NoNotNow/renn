export interface SidebarTabsProps<TTab extends string> {
  tabs: readonly TTab[]
  activeTab: TTab
  onTabChange: (tab: TTab) => void
}

export default function SidebarTabs<TTab extends string>({
  tabs,
  activeTab,
  onTabChange,
}: SidebarTabsProps<TTab>) {
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
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          style={{
            padding: '6px 10px',
            background: activeTab === tab ? '#2b3550' : 'transparent',
            border: '1px solid transparent',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
            color: '#e6e9f2',
            textTransform: 'capitalize',
            transition: 'background 0.2s ease',
          }}
          onClick={() => onTabChange(tab)}
          onMouseEnter={(e) => {
            if (activeTab !== tab) {
              e.currentTarget.style.background = '#20263a'
              e.currentTarget.style.border = '1px solid #2f3545'
            }
          }}
          onMouseLeave={(e) => {
            if (activeTab !== tab) {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.border = '1px solid transparent'
            }
          }}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}
