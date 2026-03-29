/**
 * Utility to clear the IndexedDB cache and reload.
 * Useful for development when project configurations change.
 */

import { DB_CONFIG } from '@/config/constants'

declare global {
  interface Window {
    /** Dev helper: clear IndexedDB and reload (see `setupClearCacheCommand`). */
    __clearCache?: () => Promise<void>
  }
}

export async function clearIndexedDBCache(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_CONFIG.name)
    request.onsuccess = () => {
      console.log('[Cache] IndexedDB cleared successfully')
      // Reload the page to start fresh
      window.location.reload()
      resolve()
    }
    request.onerror = () => {
      console.error('[Cache] Failed to clear IndexedDB:', request.error)
      reject(request.error)
    }
  })
}

export function setupClearCacheCommand(): void {
  window.__clearCache = clearIndexedDBCache
  console.log('[Cache] Use window.__clearCache() in console to clear IndexedDB and reload')
}
