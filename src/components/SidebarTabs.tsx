import { useState, useRef, useEffect } from 'react'

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
  const containerRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [visibleTabs, setVisibleTabs] = useState<TTab[]>([...tabs])
  const [overflowTabs, setOverflowTabs] = useState<TTab[]>([])
  const [isOverflowOpen, setIsOverflowOpen] = useState(false)
  const [tabWidths, setTabWidths] = useState<Map<TTab, number>>(new Map())
  const overflowRef = useRef<HTMLDivElement>(null)

  // Measure tab widths on mount and when tabs change
  useEffect(() => {
    if (!measureRef.current) return

    const widths = new Map<TTab, number>()
    const buttons = measureRef.current.querySelectorAll('button')
    
    buttons.forEach((button, index) => {
      const tab = tabs[index]
      if (tab) {
        widths.set(tab, button.offsetWidth)
      }
    })
    
    setTabWidths(widths)
  }, [tabs])

  // Calculate visible and overflow tabs based on container width
  useEffect(() => {
    const calculateLayout = () => {
      if (!containerRef.current || tabWidths.size === 0) return

      const containerWidth = containerRef.current.offsetWidth
      const padding = 12 // 6px on each side
      const gap = 6
      const overflowButtonWidth = 50 // Width of "..." button
      const safetyMargin = 10
      
      const availableWidth = containerWidth - padding - safetyMargin

      let usedWidth = 0
      const visible: TTab[] = []
      
      for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i]
        const tabWidth = tabWidths.get(tab) || 0
        const gapWidth = visible.length > 0 ? gap : 0
        const needsOverflowButton = i < tabs.length - 1
        const overflowWidth = needsOverflowButton ? overflowButtonWidth + gap : 0
        
        if (usedWidth + gapWidth + tabWidth + overflowWidth <= availableWidth) {
          visible.push(tab)
          usedWidth += gapWidth + tabWidth
        } else {
          break
        }
      }

      // If we couldn't fit all tabs, calculate overflow
      if (visible.length < tabs.length) {
        const overflow = tabs.filter(tab => !visible.includes(tab))
        setVisibleTabs(visible)
        setOverflowTabs(overflow)
      } else {
        setVisibleTabs([...tabs])
        setOverflowTabs([])
      }
    }

    calculateLayout()

    // Add ResizeObserver to handle dynamic resizing
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      calculateLayout()
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [tabs, tabWidths])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOverflowOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setIsOverflowOpen(false)
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOverflowOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOverflowOpen])

  const tabButtonStyle = (tab: TTab) => ({
    padding: '6px 10px',
    background: activeTab === tab ? '#2b3550' : 'transparent',
    border: '1px solid transparent',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    color: '#e6e9f2',
    textTransform: 'capitalize' as const,
    transition: 'background 0.2s ease',
    whiteSpace: 'nowrap' as const,
  })

  const handleTabMouseEnter = (e: React.MouseEvent<HTMLButtonElement>, tab: TTab) => {
    if (activeTab !== tab) {
      e.currentTarget.style.background = '#20263a'
      e.currentTarget.style.border = '1px solid #2f3545'
    }
  }

  const handleTabMouseLeave = (e: React.MouseEvent<HTMLButtonElement>, tab: TTab) => {
    if (activeTab !== tab) {
      e.currentTarget.style.background = 'transparent'
      e.currentTarget.style.border = '1px solid transparent'
    }
  }

  return (
    <>
      {/* Hidden measurement container */}
      <div
        ref={measureRef}
        style={{
          position: 'absolute',
          visibility: 'hidden',
          pointerEvents: 'none',
          display: 'flex',
          gap: 6,
        }}
        aria-hidden="true"
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            style={tabButtonStyle(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Visible tabs container */}
      <div
        ref={containerRef}
        style={{
          display: 'flex',
          gap: 6,
          padding: 6,
          borderBottom: '1px solid #2f3545',
          background: 'rgba(17, 20, 28, 0.9)',
          position: 'relative',
        }}
      >
        {visibleTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            style={tabButtonStyle(tab)}
            onClick={() => onTabChange(tab)}
            onMouseEnter={(e) => handleTabMouseEnter(e, tab)}
            onMouseLeave={(e) => handleTabMouseLeave(e, tab)}
          >
            {tab}
          </button>
        ))}

        {/* Overflow dropdown */}
        {overflowTabs.length > 0 && (
          <div ref={overflowRef} style={{ position: 'relative' }}>
            <button
              type="button"
              style={{
                ...tabButtonStyle(overflowTabs.includes(activeTab) ? activeTab : ('' as TTab)),
                minWidth: 40,
              }}
              onClick={() => setIsOverflowOpen(!isOverflowOpen)}
              onMouseEnter={(e) => {
                if (!overflowTabs.includes(activeTab)) {
                  e.currentTarget.style.background = '#20263a'
                  e.currentTarget.style.border = '1px solid #2f3545'
                }
              }}
              onMouseLeave={(e) => {
                if (!overflowTabs.includes(activeTab)) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.border = '1px solid transparent'
                }
              }}
            >
              ...
            </button>

            {isOverflowOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 4,
                  minWidth: 120,
                  background: '#1b1f2a',
                  border: '1px solid #2f3545',
                  borderRadius: 6,
                  boxShadow: '0 2px 12px rgba(0,0,0,0.55)',
                  zIndex: 1000,
                  padding: '4px 0',
                }}
              >
                {overflowTabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      onTabChange(tab)
                      setIsOverflowOpen(false)
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 16px',
                      background: activeTab === tab ? '#2b3550' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 12,
                      color: '#e6e9f2',
                      textTransform: 'capitalize',
                      textAlign: 'left',
                      transition: 'background 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (activeTab !== tab) {
                        e.currentTarget.style.background = '#20263a'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (activeTab !== tab) {
                        e.currentTarget.style.background = 'transparent'
                      }
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
