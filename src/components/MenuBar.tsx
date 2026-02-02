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
        background: '#f5f5f5',
        borderBottom: '1px solid #d0d0d0',
      }}
    >
      {children}
    </div>
  )
}
