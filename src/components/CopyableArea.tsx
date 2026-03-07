import type { ReactNode, MouseEvent as ReactMouseEvent } from 'react'
import { useCopyMenu } from '@/contexts/CopyContext'

export interface CopyableAreaProps {
  copyPayload: object | (() => object)
  children: ReactNode
  /** Optional style for the wrapper div. Default: block display, no extra layout. */
  style?: React.CSSProperties
}

export default function CopyableArea({ copyPayload, children, style }: CopyableAreaProps) {
  const { openMenu } = useCopyMenu()

  const handleContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault()
    const getPayload = () =>
      typeof copyPayload === 'function' ? (copyPayload as () => object)() : copyPayload
    openMenu(e, getPayload)
  }

  return (
    <div style={{ display: 'block', ...style }} onContextMenu={handleContextMenu}>
      {children}
    </div>
  )
}
