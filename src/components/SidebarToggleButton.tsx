import { uiLogger } from '@/utils/uiLogger'

interface SidebarToggleButtonProps {
  isOpen: boolean
  onToggle: () => void
  side: 'left' | 'right'
  logContext: string
}

export function SidebarToggleButton({ isOpen, onToggle, side, logContext }: SidebarToggleButtonProps) {
  const isLeft = side === 'left'
  
  const handleClick = () => {
    uiLogger.click('Builder', logContext, { isOpen })
    onToggle()
  }

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = '#232836'
    e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.55)'
  }

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = '#1b1f2a'
    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.45)'
  }

  const getArrowIcon = () => {
    if (isLeft) {
      return isOpen ? '◀' : '▶'
    } else {
      return isOpen ? '▶' : '◀'
    }
  }

  const getAriaLabel = () => {
    const sideText = isLeft ? 'left' : 'right'
    return isOpen ? `Collapse ${sideText} sidebar` : `Expand ${sideText} sidebar`
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={getAriaLabel()}
      style={{
        position: 'absolute',
        ...(isLeft ? { right: -16 } : { left: -16 }),
        top: '50%',
        transform: 'translateY(-50%)',
        width: 20,
        height: 60,
        background: '#1b1f2a',
        border: '1px solid #2f3545',
        ...(isLeft
          ? { borderLeft: isOpen ? '1px solid #2f3545' : 'none' }
          : { borderRight: isOpen ? '1px solid #2f3545' : 'none' }),
        borderRadius: isLeft
          ? isOpen ? '0 4px 4px 0' : '4px 0 0 4px'
          : isOpen ? '4px 0 0 4px' : '0 4px 4px 0',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        zIndex: 1001,
        transition: 'all 0.2s ease',
        boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
        color: '#e6e9f2',
        pointerEvents: 'auto',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {getArrowIcon()}
    </button>
  )
}
