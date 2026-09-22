import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { useCopyMenu } from '@/contexts/useCopyMenu'

export interface CopyableAreaProps {
  copyPayload: object | string | (() => object | string)
  children: ReactNode
  /** Optional style for the wrapper div. Default: block display, no extra layout. */
  style?: CSSProperties
}

export default function CopyableArea({ copyPayload, children, style }: CopyableAreaProps) {
  const { openMenu } = useCopyMenu()

  const handleContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault()
    const getPayload = () =>
      typeof copyPayload === 'function'
        ? (copyPayload as () => object | string)()
        : copyPayload
    openMenu(e, getPayload)
  }

  return (
    <div style={{ display: 'block', ...style }} onContextMenu={handleContextMenu}>
      {children}
    </div>
  )
}
