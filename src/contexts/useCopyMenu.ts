import { useContext } from 'react'
import { CopyContext, type CopyContextValue } from './copyMenuContext'

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
