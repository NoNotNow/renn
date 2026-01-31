import { useEffect, useRef } from 'react'

export interface FreeFlyKeys {
  w: boolean
  a: boolean
  s: boolean
  d: boolean
  shift: boolean
}

export const DEFAULT_FREE_FLY_KEYS: FreeFlyKeys = {
  w: false,
  a: false,
  s: false,
  d: false,
  shift: false,
}

function isEditableElement(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable
}

export function useKeyboardInput(): React.RefObject<FreeFlyKeys> {
  const keysRef = useRef<FreeFlyKeys>({ ...DEFAULT_FREE_FLY_KEYS })

  useEffect(() => {
    const keys = keysRef.current

    const onKeyDown = (e: KeyboardEvent): void => {
      if (isEditableElement()) return
      switch (e.code) {
        case 'KeyW': keys.w = true; break
        case 'KeyA': keys.a = true; break
        case 'KeyS': keys.s = true; break
        case 'KeyD': keys.d = true; break
        case 'ShiftLeft':
        case 'ShiftRight': keys.shift = true; break
        default: return
      }
    }

    const onKeyUp = (e: KeyboardEvent): void => {
      if (isEditableElement()) return
      switch (e.code) {
        case 'KeyW': keys.w = false; break
        case 'KeyA': keys.a = false; break
        case 'KeyS': keys.s = false; break
        case 'KeyD': keys.d = false; break
        case 'ShiftLeft':
        case 'ShiftRight': keys.shift = false; break
        default: return
      }
    }

    const onBlur = (): void => {
      keys.w = false
      keys.a = false
      keys.s = false
      keys.d = false
      keys.shift = false
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return keysRef
}
