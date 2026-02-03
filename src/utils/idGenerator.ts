/**
 * Generate a unique ID with a prefix.
 * Uses timestamp and random string for uniqueness.
 * 
 * @param prefix - Prefix for the ID (e.g., 'proj', 'entity')
 * @returns A unique ID string
 */
export function generateId(prefix: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 9)
  return `${prefix}_${timestamp}_${random}`
}

/**
 * Generate a project ID.
 */
export function generateProjectId(): string {
  return generateId('proj')
}

/**
 * Generate an entity ID.
 */
export function generateEntityId(): string {
  return generateId('entity')
}
