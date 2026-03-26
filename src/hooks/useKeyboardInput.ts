import { useEffect, useRef } from 'react'
import type { FreeFlyKeys } from '@/types/camera'

export const DEFAULT_FREE_FLY_KEYS: FreeFlyKeys = {
  w: false,
  a: false,
  s: false,
  d: false,
  shift: false,
  alt: false,
  arrowLeft: false,
  arrowRight: false,
  arrowUp: false,
  arrowDown: false,
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
        case 'AltLeft':
        case 'AltRight': keys.alt = true; break
        case 'ArrowLeft': keys.arrowLeft = true; break
        case 'ArrowRight': keys.arrowRight = true; break
        case 'ArrowUp': keys.arrowUp = true; break
        case 'ArrowDown': keys.arrowDown = true; break
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
        case 'AltLeft':
        case 'AltRight': keys.alt = false; break
        case 'ArrowLeft': keys.arrowLeft = false; break
        case 'ArrowRight': keys.arrowRight = false; break
        case 'ArrowUp': keys.arrowUp = false; break
        case 'ArrowDown': keys.arrowDown = false; break
        default: return
      }
    }

    const onBlur = (): void => {
      keys.w = false
      keys.a = false
      keys.s = false
      keys.d = false
      keys.shift = false
      keys.alt = false
      keys.arrowLeft = false
      keys.arrowRight = false
      keys.arrowUp = false
      keys.arrowDown = false
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
