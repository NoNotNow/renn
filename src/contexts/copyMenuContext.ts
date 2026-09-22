import { createContext, type MouseEvent as ReactMouseEvent } from 'react'

export interface CopyContextValue {
  openMenu: (e: ReactMouseEvent, getPayload: () => object | string) => void
}

export const CopyContext = createContext<CopyContextValue | null>(null)
