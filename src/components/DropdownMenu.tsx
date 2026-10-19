import { useState, useRef, useEffect, useMemo, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { theme } from '@/config/theme'

export interface MenuItemConfig {
  type: 'item' | 'separator' | 'submenu'
  label?: string
  onClick?: () => void
  disabled?: boolean
  shortcut?: string
  /** When true, shows a checkmark (toggle menu items). */
  checked?: boolean
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
  /** Fixed position of the open menu panel, derived from the toggle button (portaled to body). */
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  /** The portaled open menu panel (NOT a DOM child of `menuRef` — checked separately for outside clicks). */
  const menuPanelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const submenuRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const submenuCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const menuItems = useMemo(
    () => items.filter((item) => item.type === 'item' || item.type === 'submenu'),
    [items],
  )

  useEffect(() => {
    if (isOpen) return
    setFocusedIndex((prev) => (prev === -1 ? prev : -1))
    setOpenSubmenuIndex((prev) => (prev === null ? prev : null))
    if (submenuCloseTimeoutRef.current) {
      clearTimeout(submenuCloseTimeoutRef.current)
      submenuCloseTimeoutRef.current = null
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      const insideWrapper = menuRef.current && menuRef.current.contains(target)
      const insidePanel = menuPanelRef.current && menuPanelRef.current.contains(target)
      if (!insideWrapper && !insidePanel) {
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
      if (submenuCloseTimeoutRef.current) {
        clearTimeout(submenuCloseTimeoutRef.current)
        submenuCloseTimeoutRef.current = null
      }
    }
  }, [isOpen, focusedIndex, menuItems, onOpenChange, openSubmenuIndex])

  // Portaled panel position: anchored below the toggle button and recomputed on resize/scroll. The
  // panel is portaled to document.body so it escapes the header's stacking context and can layer
  // ABOVE open dialogs (menus stay usable while a dialog is in front of the top menu).
  useEffect(() => {
    if (!isOpen) return
    const update = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (rect) setMenuPos({ top: rect.bottom, left: rect.left })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [isOpen])

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

      {isOpen && menuPos && createPortal(
        <div
          ref={menuPanelRef}
          role="menu"
          data-testid={`${label.toLowerCase()}-menu-panel`}
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            minWidth: '200px',
            background: '#1b1f2a',
            border: '1px solid #2f3545',
            boxShadow: '0 2px 12px rgba(0,0,0,0.55)',
            zIndex: theme.zIndex.menu,
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
                onPointerEnter={(e: ReactPointerEvent<HTMLDivElement>) => {
                  // Hover-open is mouse-only: touch browsers synthesize hover around a tap,
                  // which would open the submenu and make the tap's toggle close it again.
                  if (e.pointerType !== 'mouse') return
                  if (submenuCloseTimeoutRef.current) {
                    clearTimeout(submenuCloseTimeoutRef.current)
                    submenuCloseTimeoutRef.current = null
                  }
                  setFocusedIndex(currentItemIndex)
                  if (isSubmenu) {
                    setOpenSubmenuIndex(currentItemIndex)
                  }
                }}
                onPointerLeave={(e: ReactPointerEvent<HTMLDivElement>) => {
                  if (e.pointerType !== 'mouse') return
                  if (isSubmenu) {
                    if (submenuCloseTimeoutRef.current) clearTimeout(submenuCloseTimeoutRef.current)
                    submenuCloseTimeoutRef.current = setTimeout(() => {
                      setOpenSubmenuIndex(null)
                      submenuCloseTimeoutRef.current = null
                    }, 200)
                  }
                }}
              >
                <div
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={item.disabled}
                  aria-checked={item.checked === undefined ? undefined : item.checked}
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
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span
                      style={{
                        width: '14px',
                        flexShrink: 0,
                        color: '#7dd3a0',
                        fontSize: '12px',
                        textAlign: 'center',
                      }}
                      aria-hidden
                    >
                      {item.checked ? '✓' : ''}
                    </span>
                    <span>{item.label}</span>
                  </span>
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
                    onMouseEnter={() => {
                      if (submenuCloseTimeoutRef.current) {
                        clearTimeout(submenuCloseTimeoutRef.current)
                        submenuCloseTimeoutRef.current = null
                      }
                    }}
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
                      marginLeft: 0,
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
        </div>,
        document.body,
      )}
    </div>
  )
}
