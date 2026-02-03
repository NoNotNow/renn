import { useState, useEffect, useCallback } from 'react'

/**
 * Check if localStorage is available
 */
function isLocalStorageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && 
           typeof window.localStorage !== 'undefined' &&
           typeof window.localStorage.getItem === 'function'
  } catch {
    return false
  }
}

/**
 * Custom hook for persisting state to localStorage.
 * Automatically syncs state changes to localStorage and handles errors gracefully.
 * Gracefully degrades to regular useState in environments without localStorage (e.g., tests).
 * 
 * @param key - The localStorage key
 * @param defaultValue - The default value if nothing is stored
 * @returns A tuple of [value, setValue] similar to useState
 */
export function useLocalStorageState<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  // Initialize state from localStorage or default value
  const [value, setInternalValue] = useState<T>(() => {
    if (!isLocalStorageAvailable()) {
      return defaultValue
    }
    
    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : defaultValue
    } catch (error) {
      console.warn(`Failed to read from localStorage key "${key}":`, error)
      return defaultValue
    }
  })

  // Wrapped setter that also updates localStorage
  const setValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setInternalValue((prev) => {
      const valueToStore = newValue instanceof Function ? newValue(prev) : newValue
      
      if (isLocalStorageAvailable()) {
        try {
          localStorage.setItem(key, JSON.stringify(valueToStore))
        } catch (error) {
          console.warn(`Failed to write to localStorage key "${key}":`, error)
          // Continue with state update even if localStorage fails
        }
      }
      
      return valueToStore
    })
  }, [key])

  return [value, setValue]
}
