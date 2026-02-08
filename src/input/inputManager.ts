/**
 * Input Manager: combines raw keyboard and trackpad input,
 * applies mapping, and produces TransformInput-ready actions.
 *
 * This is the main entry point for getting user input actions
 * that transformers can consume.
 */

import { useEffect, useRef } from 'react'
import { useRawKeyboardInput, useRawWheelInput, getRawInputSnapshot } from './rawInput'
import { applyInputMapping } from './inputMapping'
import { CHARACTER_PRESET } from './inputPresets'
import type { InputMapping, RawInput } from '@/types/transformer'

/**
 * React hook that provides current input actions.
 * 
 * @param mapping Input mapping to use (defaults to CHARACTER_PRESET)
 * @returns Ref containing current actions map
 */
export function useInputManager(
  mapping: InputMapping = CHARACTER_PRESET,
): React.RefObject<Record<string, number>> {
  const keyboardRef = useRawKeyboardInput()
  const wheelRef = useRawWheelInput()
  const actionsRef = useRef<Record<string, number>>({})

  // Update actions each frame
  useEffect(() => {
    const updateActions = () => {
      const rawInput = getRawInputSnapshot(keyboardRef, wheelRef)
      const actions = applyInputMapping(rawInput, mapping)
      actionsRef.current = actions
      requestAnimationFrame(updateActions)
    }
    const frameId = requestAnimationFrame(updateActions)
    return () => cancelAnimationFrame(frameId)
  }, [mapping])

  return actionsRef
}

/**
 * Get current input actions synchronously.
 * Useful for non-React contexts or one-time reads.
 */
export function getCurrentInputActions(
  keyboardRef: React.RefObject<import('./rawInput').RawKeyboardState>,
  wheelRef: React.RefObject<import('./rawInput').RawWheelState>,
  mapping: InputMapping = CHARACTER_PRESET,
): Record<string, number> {
  const rawInput = getRawInputSnapshot(keyboardRef, wheelRef)
  return applyInputMapping(rawInput, mapping)
}
