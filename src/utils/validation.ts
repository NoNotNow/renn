/**
 * Runtime type validation utilities to replace unsafe type assertions.
 */

/**
 * Type guard to check if a value is a valid Blob
 */
export function isBlob(value: unknown): value is Blob {
  return value instanceof Blob
}

/**
 * Type guard to check if a value is a non-empty array
 */
export function isNonEmptyArray<T>(value: unknown): value is T[] {
  return Array.isArray(value) && value.length > 0
}

/**
 * Type guard to check if a value is a valid object (not null, not array)
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Safely cast a value to a specific type with validation
 * @param value - The value to cast
 * @param validator - Function to validate the type
 * @param errorMessage - Error message if validation fails
 * @returns The value cast to type T
 * @throws Error if validation fails
 */
export function safeCast<T>(
  value: unknown,
  validator: (v: unknown) => v is T,
  errorMessage: string
): T {
  if (!validator(value)) {
    throw new Error(errorMessage)
  }
  return value
}

/**
 * Safely cast a value with a fallback
 * @param value - The value to cast
 * @param validator - Function to validate the type
 * @param fallback - Fallback value if validation fails
 * @returns The value cast to type T, or the fallback
 */
export function safeCastWithFallback<T>(
  value: unknown,
  validator: (v: unknown) => v is T,
  fallback: T
): T {
  return validator(value) ? value : fallback
}

/**
 * Check if a value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/**
 * Check if a value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value)
}

/**
 * Check if a value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}
