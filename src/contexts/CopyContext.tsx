import {
  createContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useContext,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from 'react'

interface CopyMenuState {
  x: number
  y: number
  getPayload: () => object
}

interface CopyContextValue {
  openMenu: (e: ReactMouseEvent, getPayload: () => object) => void
}

const CopyContext = createContext<CopyContextValue | null>(null)

function ContextMenu({
  state,
  onClose,
}: {
  state: CopyMenuState
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  const handleCopy = useCallback(() => {
    try {
      const payload = state.getPayload()
      const text = JSON.stringify(payload, null, 2)
      navigator.clipboard.writeText(text).catch(() => {
        alert('Failed to copy to clipboard')
      })
    } finally {
      onClose()
    }
  }, [state, onClose])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    // Defer so the click that opened the menu does not immediately close it
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    return () => {
      document.removeEventListener('keydown', handleEscape)
      clearTimeout(t)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed',
        left: state.x,
        top: state.y,
        zIndex: 10000,
        background: '#1b1f2a',
        border: '1px solid #2f3545',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        padding: 4,
        minWidth: 160,
      }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={handleCopy}
        style={{
          display: 'block',
          width: '100%',
          padding: '8px 12px',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          color: '#e6e9f2',
          cursor: 'pointer',
          fontSize: 13,
          borderRadius: 4,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#2b3550'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        Copy to clipboard
      </button>
    </div>
  )
}

export function CopyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CopyMenuState | null>(null)
  const openMenu = useCallback((e: ReactMouseEvent, getPayload: () => object) => {
    e.preventDefault()
    setState({ x: e.clientX, y: e.clientY, getPayload })
  }, [])
  const closeMenu = useCallback(() => setState(null), [])

  return (
    <CopyContext.Provider value={{ openMenu }}>
      {children}
      {state != null && (
        <ContextMenu state={state} onClose={closeMenu} />
      )}
    </CopyContext.Provider>
  )
}

export function useCopyMenu(): CopyContextValue {
  const value = useContext(CopyContext)
  if (value == null) {
    throw new Error('useCopyMenu must be used within CopyProvider')
  }
  return value
}

/** Returns null when outside CopyProvider. Use when copy is optional (e.g. CollapsibleSection). */
export function useCopyMenuOptional(): CopyContextValue | null {
  return useContext(CopyContext)
}
