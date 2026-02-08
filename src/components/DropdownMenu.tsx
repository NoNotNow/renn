import { useState, useRef, useEffect, type ReactNode } from 'react'

export interface MenuItemConfig {
  type: 'item' | 'separator' | 'submenu'
  label?: string
  onClick?: () => void
  disabled?: boolean
  shortcut?: string
  items?: MenuItemConfig[]
}

export interface DropdownMenuProps {
  label: string
  items: MenuItemConfig[]
  onOpenChange?: (isOpen: boolean) => void
}

export default function DropdownMenu({ label, items, onOpenChange }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [openSubmenuIndex, setOpenSubmenuIndex] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const submenuRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const menuItems = items.filter(item => item.type === 'item' || item.type === 'submenu')

  useEffect(() => {
    if (!isOpen) {
      setFocusedIndex(-1)
      return
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        onOpenChange?.(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        onOpenChange?.(false)
        buttonRef.current?.focus()
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex(prev => {
          let next = prev + 1
          while (next < menuItems.length && menuItems[next].disabled) {
            next++
          }
          return next < menuItems.length ? next : prev
        })
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex(prev => {
          let next = prev - 1
          while (next >= 0 && menuItems[next].disabled) {
            next--
          }
          return next >= 0 ? next : prev
        })
      }

      if (e.key === 'Enter' && focusedIndex >= 0) {
        e.preventDefault()
        const item = menuItems[focusedIndex]
        if (item && !item.disabled) {
          if (item.type === 'submenu') {
            setOpenSubmenuIndex(focusedIndex)
          } else if (item.onClick) {
            item.onClick()
            setIsOpen(false)
            onOpenChange?.(false)
          }
        }
      }

      if (e.key === 'ArrowRight' && focusedIndex >= 0) {
        e.preventDefault()
        const item = menuItems[focusedIndex]
        if (item && item.type === 'submenu' && !item.disabled) {
          setOpenSubmenuIndex(focusedIndex)
        }
      }

      if (e.key === 'ArrowLeft' && openSubmenuIndex !== null) {
        e.preventDefault()
        setOpenSubmenuIndex(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, focusedIndex, menuItems, onOpenChange, openSubmenuIndex])

  const handleToggle = () => {
    const newIsOpen = !isOpen
    setIsOpen(newIsOpen)
    onOpenChange?.(newIsOpen)
  }

  const handleItemClick = (item: MenuItemConfig, index: number) => {
    if (item.disabled) return
    if (item.type === 'submenu') {
      setOpenSubmenuIndex(openSubmenuIndex === index ? null : index)
    } else {
      item.onClick?.()
      setIsOpen(false)
      onOpenChange?.(false)
      setOpenSubmenuIndex(null)
    }
  }

  let itemIndex = -1

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        aria-haspopup="true"
        aria-expanded={isOpen}
        style={{
          padding: '6px 12px',
          background: isOpen ? '#232836' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: '14px',
          fontFamily: 'inherit',
          color: '#e6e9f2',
        }}
      >
        {label}
      </button>

      {isOpen && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            minWidth: '200px',
            background: '#1b1f2a',
            border: '1px solid #2f3545',
            boxShadow: '0 2px 12px rgba(0,0,0,0.55)',
            zIndex: 1000,
            padding: '4px 0',
          }}
        >
          {items.map((item, index) => {
            if (item.type === 'separator') {
              return (
                <div
                  key={`sep-${index}`}
                  style={{
                    height: '1px',
                    background: '#2f3545',
                    margin: '4px 0',
                  }}
                />
              )
            }

            itemIndex++
            const currentItemIndex = itemIndex
            const isFocused = focusedIndex === currentItemIndex
            const isSubmenuOpen = openSubmenuIndex === currentItemIndex
            const isSubmenu = item.type === 'submenu'

            return (
              <div
                key={index}
                style={{ position: 'relative' }}
                onMouseEnter={() => {
                  setFocusedIndex(currentItemIndex)
                  if (isSubmenu) {
                    setOpenSubmenuIndex(currentItemIndex)
                  }
                }}
                onMouseLeave={() => {
                  if (isSubmenu) {
                    setOpenSubmenuIndex(null)
                  }
                }}
              >
                <div
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={item.disabled}
                  aria-haspopup={isSubmenu ? 'true' : undefined}
                  aria-expanded={isSubmenu ? isSubmenuOpen : undefined}
                  onClick={() => handleItemClick(item, currentItemIndex)}
                  style={{
                    padding: '8px 16px',
                    cursor: item.disabled ? 'not-allowed' : 'pointer',
                    background: isFocused && !item.disabled ? '#2b3550' : 'transparent',
                    color: item.disabled ? '#6b7280' : '#e6e9f2',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '24px',
                    fontSize: '14px',
                  }}
                >
                  <span>{item.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {item.shortcut && (
                      <span style={{ color: '#9aa4b2', fontSize: '12px' }}>
                        {item.shortcut}
                      </span>
                    )}
                    {isSubmenu && (
                      <span style={{ color: '#9aa4b2', fontSize: '12px' }}>▶</span>
                    )}
                  </div>
                </div>
                {isSubmenu && isSubmenuOpen && item.items && (
                  <div
                    ref={(el) => {
                      if (el) submenuRefs.current.set(currentItemIndex, el)
                      else submenuRefs.current.delete(currentItemIndex)
                    }}
                    role="menu"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: '100%',
                      minWidth: '200px',
                      background: '#1b1f2a',
                      border: '1px solid #2f3545',
                      boxShadow: '0 2px 12px rgba(0,0,0,0.55)',
                      zIndex: 1001,
                      padding: '4px 0',
                      marginLeft: '4px',
                    }}
                  >
                    {item.items.map((subItem, subIndex) => {
                      if (subItem.type === 'separator') {
                        return (
                          <div
                            key={`sub-sep-${subIndex}`}
                            style={{
                              height: '1px',
                              background: '#2f3545',
                              margin: '4px 0',
                            }}
                          />
                        )
                      }

                      return (
                        <div
                          key={subIndex}
                          role="menuitem"
                          tabIndex={-1}
                          aria-disabled={subItem.disabled}
                          onClick={() => {
                            if (subItem.disabled) return
                            subItem.onClick?.()
                            setIsOpen(false)
                            onOpenChange?.(false)
                            setOpenSubmenuIndex(null)
                          }}
                          style={{
                            padding: '8px 16px',
                            cursor: subItem.disabled ? 'not-allowed' : 'pointer',
                            background: 'transparent',
                            color: subItem.disabled ? '#6b7280' : '#e6e9f2',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '24px',
                            fontSize: '14px',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = subItem.disabled ? 'transparent' : '#2b3550'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                          }}
                        >
                          <span>{subItem.label}</span>
                          {subItem.shortcut && (
                            <span style={{ color: '#9aa4b2', fontSize: '12px' }}>
                              {subItem.shortcut}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
