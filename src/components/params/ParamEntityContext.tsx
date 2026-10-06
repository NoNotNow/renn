import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Entity } from '@/types/world'

export interface ParamEntityContextValue {
  entities: readonly Entity[]
  entityWorkHistory: readonly string[]
}

const ParamEntityContext = createContext<ParamEntityContextValue | null>(null)

/** Gives `entityId` params the world's entities for the shared entity search; without it they stay plain text. */
export function ParamEntityProvider({
  entities,
  entityWorkHistory = [],
  children,
}: {
  entities: readonly Entity[]
  entityWorkHistory?: readonly string[]
  children: ReactNode
}) {
  const value = useMemo(() => ({ entities, entityWorkHistory }), [entities, entityWorkHistory])
  return <ParamEntityContext.Provider value={value}>{children}</ParamEntityContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useParamEntities(): ParamEntityContextValue | null {
  return useContext(ParamEntityContext)
}
