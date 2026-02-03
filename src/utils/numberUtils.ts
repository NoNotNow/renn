/**
 * Safely parse a number input value with a fallback default.
 * Handles empty strings, invalid values, and normalizes behavior.
 * 
 * @param value - The string value from an input field
 * @param defaultValue - The fallback value if parsing fails
 * @returns The parsed number or the default value
 */
export function parseNumberInput(value: string, defaultValue: number): number {
  if (value === '' || value === null || value === undefined) {
    return defaultValue
  }
  
  const parsed = parseFloat(value)
  
  if (isNaN(parsed) || !isFinite(parsed)) {
    return defaultValue
  }
  
  return parsed
}

/**
 * Clamp a number between min and max values (inclusive).
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Clamp a number to the unit interval [0, 1].
 */
export function clampUnit(value: number): number {
  return clamp(value, 0, 1)
}
