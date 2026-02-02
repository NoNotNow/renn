import type { ReactNode } from 'react'

export interface MenuBarProps {
  children: ReactNode
}

export default function MenuBar({ children }: MenuBarProps) {
  return (
    <div
      role="menubar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0',
        background: '#171a22',
        borderBottom: '1px solid #2f3545',
      }}
    >
      {children}
    </div>
  )
}
